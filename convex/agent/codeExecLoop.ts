/**
 * Code Execution Agent Loop
 *
 * This is the NEW agent loop that uses code execution instead of JSON tool calls.
 *
 * Architecture:
 * 1. Send prompt to LLM (NO tool schemas)
 * 2. LLM responds with TypeScript code
 * 3. Extract code blocks from response
 * 4. Execute code in E2B sandbox
 * 5. Feed output back to LLM
 * 6. Repeat until task complete
 *
 * The agent imports from /home/user/ksa/ (KSAs - Knowledge, Skills, Abilities).
 */

import { internal } from "../_generated/api";
import { extractCodeBlocks, wrapCodeForExecution } from "../utils/codeExecHelpers";
import type { ChainOfThoughtStep, StepStatus } from "../../shared/chain-of-thought";
import { createStepId } from "../../shared/chain-of-thought";

// ============================================================================
// Types
// ============================================================================

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GatewayConfig {
  convexUrl: string;
  jwt: string;
}

interface CodeExecResult {
  text: string;
  codeExecutions: Array<{
    code: string;
    output: string;
    success: boolean;
  }>;
}

// ============================================================================
// Chain of Thought Tracking
// ============================================================================

const chainOfThoughtSteps: Map<string, ChainOfThoughtStep[]> = new Map();

function emitStep(
  threadId: string,
  step: Omit<ChainOfThoughtStep, "id" | "timestamp">
): string {
  if (!chainOfThoughtSteps.has(threadId)) {
    chainOfThoughtSteps.set(threadId, []);
  }
  const fullStep = {
    id: createStepId(),
    timestamp: Date.now(),
    ...step,
  } as ChainOfThoughtStep;
  chainOfThoughtSteps.get(threadId)!.push(fullStep);
  return fullStep.id;
}

function updateStepStatus(threadId: string, stepId: string, status: StepStatus) {
  const steps = chainOfThoughtSteps.get(threadId);
  if (steps) {
    const step = steps.find((s) => s.id === stepId);
    if (step) step.status = status;
  }
}

export function getSteps(threadId: string): ChainOfThoughtStep[] {
  return chainOfThoughtSteps.get(threadId) || [];
}

// ============================================================================
// Cloud LLM Gateway (NO TOOL SCHEMAS)
// ============================================================================

/**
 * Call the cloud LLM gateway.
 *
 * IMPORTANT: This does NOT send tool schemas.
 * The LLM generates code, not JSON tool calls.
 */
async function callCloudLLM(
  messages: LLMMessage[],
  gatewayConfig: GatewayConfig,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const { convexUrl, jwt } = gatewayConfig;

  if (!convexUrl || !jwt) {
    throw new Error("Gateway not configured");
  }

  const response = await fetch(`${convexUrl}/agent/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      path: "services.OpenRouter.internal.chatCompletion",
      args: {
        model: options.model || "google/gemini-3-flash-preview",
        messages,
        // NO 'tools' property - this is intentional!
        maxTokens: options.maxTokens || 4096,
        temperature: options.temperature,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`LLM error: ${result.error || JSON.stringify(result)}`);
  }

  return result.data.choices?.[0]?.message?.content || "";
}

// ============================================================================
// Code Execution Agent Loop
// ============================================================================

/**
 * Run the code execution agent loop.
 *
 * This is the core of the new architecture:
 * - LLM generates TypeScript code
 * - We execute it in the sandbox
 * - Output feeds back into the conversation
 */
export async function runCodeExecLoop(
  ctx: any,
  systemPrompt: string,
  userPrompt: string,
  gatewayConfig: GatewayConfig,
  options: {
    maxSteps?: number;
    threadId?: string;
  } = {}
): Promise<CodeExecResult> {
  const maxSteps = options.maxSteps || 10;
  const threadId = options.threadId || `codeexec_${Date.now()}`;

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const allExecutions: CodeExecResult["codeExecutions"] = [];
  let finalText = "";

  emitStep(threadId, {
    type: "thinking",
    status: "complete",
    label: "Starting code execution loop...",
  });

  for (let step = 0; step < maxSteps; step++) {
    const thinkingId = emitStep(threadId, {
      type: "thinking",
      status: "active",
      label: `Step ${step + 1}: Generating code...`,
    });

    // Call LLM (NO tool schemas!)
    const response = await callCloudLLM(messages, gatewayConfig);
    updateStepStatus(threadId, thinkingId, "complete");

    // Extract code blocks from response
    const codeBlocks = extractCodeBlocks(response);

    // If no code blocks, this is the final response
    if (codeBlocks.length === 0) {
      finalText = response;
      emitStep(threadId, {
        type: "text",
        status: "complete",
        label: response.slice(0, 200),
      });
      break;
    }

    // Execute each code block
    const outputs: string[] = [];

    for (let i = 0; i < codeBlocks.length; i++) {
      const code = wrapCodeForExecution(codeBlocks[i]);

      const execId = emitStep(threadId, {
        type: "tool",
        status: "active",
        toolName: "code_execution",
        label: `Executing code block ${i + 1}...`,
        input: { code: code.slice(0, 500) },
      });

      try {
        // Execute the code via Convex action
        const result = await ctx.runAction(internal.actions.codeExec.execute, {
          code,
          timeoutMs: 60_000,
        });

        allExecutions.push({
          code,
          output: result.output,
          success: result.success,
        });

        if (result.success) {
          outputs.push(`[Code block ${i + 1} output]\n${result.output}`);
          updateStepStatus(threadId, execId, "complete");
        } else {
          outputs.push(`[Code block ${i + 1} error]\n${result.error}\n${result.output}`);
          updateStepStatus(threadId, execId, "error");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        outputs.push(`[Code block ${i + 1} error]\n${msg}`);
        allExecutions.push({
          code,
          output: msg,
          success: false,
        });
        updateStepStatus(threadId, execId, "error");
      }
    }

    // Add assistant message with the response
    messages.push({
      role: "assistant",
      content: response,
    });

    // Add execution results as user message
    messages.push({
      role: "user",
      content: `Code execution results:\n\n${outputs.join("\n\n")}\n\nContinue with the task. If the task is complete, provide a summary without code blocks.`,
    });
  }

  return {
    text: finalText,
    codeExecutions: allExecutions,
  };
}
