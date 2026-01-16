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
import { wrapCodeForExecution, extractCodeBlocks } from "../utils/codeExecHelpers";
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
// Chain of Thought Tracking + Real-time Cloud Forwarding
// ============================================================================

const chainOfThoughtSteps: Map<string, ChainOfThoughtStep[]> = new Map();

// Cloud forwarding config (set during loop execution)
let cloudForwardingConfig: {
  gatewayConfig: GatewayConfig;
  sessionId: string;
} | null = null;

interface StructuredLog {
  type: string; // thinking, tool, search, file, text
  label: string;
  status?: string; // active, complete, error
  icon?: string;
  details?: string;
}

/**
 * Forward a structured log to the cloud for real-time UI display.
 * Fire-and-forget - doesn't block execution.
 */
async function forwardLogToCloud(log: StructuredLog): Promise<void> {
  if (!cloudForwardingConfig) return;

  const { gatewayConfig, sessionId } = cloudForwardingConfig;
  try {
    await fetch(`${gatewayConfig.convexUrl}/agent/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayConfig.jwt}`,
      },
      body: JSON.stringify({
        path: "agent.workflows.sandboxConvex.appendLogs",
        type: "mutation",
        args: {
          sessionId,
          logs: [log],
        },
      }),
    }).catch(() => {}); // Ignore errors - fire and forget
  } catch {
    // Ignore - don't block execution
  }
}

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

  // Forward structured log to cloud for real-time UI (fire-and-forget)
  const label = (fullStep as any).label || (fullStep as any).toolName || fullStep.type;
  forwardLogToCloud({
    type: fullStep.type,
    label,
    status: fullStep.status,
    icon: fullStep.type === "thinking" ? "lightbulb" :
          fullStep.type === "tool" ? "tools" :
          fullStep.type === "search" ? "magnify" :
          fullStep.type === "file" ? "file" : "text",
    details: (fullStep as any).description,
  });

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
// Cloud LLM Gateway (JSON Schema Structured Output)
// ============================================================================

interface AgentAction {
  thinking: string;
  code?: string;
  response?: string;
}

interface LLMResponse {
  text: string;
  action?: AgentAction;
  finishReason?: string;
}

// JSON Schema for structured output - forces model to return valid JSON
// This is MORE RELIABLE than tool_choice which some providers ignore
const AGENT_ACTION_SCHEMA = {
  name: "AgentAction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      thinking: {
        type: "string",
        description: "Your reasoning about what to do next. Always explain your thought process.",
      },
      code: {
        type: "string",
        description: "TypeScript code to execute. Import from ./ksa/* for capabilities (web search, file ops, PDF generation, etc.). Leave empty string if no code needed.",
      },
      response: {
        type: "string",
        description: "Final response to the user. Only provide a non-empty value when the task is FULLY COMPLETE and no more code needs to run. Leave empty string otherwise.",
      },
    },
    required: ["thinking", "code", "response"],
    additionalProperties: false,
  },
};

/**
 * Call the cloud LLM gateway with JSON schema structured output.
 * Uses response_format instead of tool calling for reliability.
 */
async function callCloudLLM(
  messages: LLMMessage[],
  gatewayConfig: GatewayConfig,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<LLMResponse> {
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
      path: "internal.services.OpenRouter.internal.chatCompletion",
      args: {
        model: options.model || "google/gemini-3-flash-preview",
        messages,
        responseFormat: {
          type: "json_schema",
          json_schema: AGENT_ACTION_SCHEMA,
        },
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

  const choice = result.data.choices?.[0];
  const content = choice?.message?.content || "";

  // Debug logging
  console.log(`[callCloudLLM] finish_reason: ${choice?.finish_reason}`);
  console.log(`[callCloudLLM] content preview: ${content.slice(0, 300)}`);

  // Parse JSON structured output
  let action: AgentAction | undefined;
  if (content) {
    try {
      action = JSON.parse(content) as AgentAction;
      console.log(`[callCloudLLM] Parsed action - thinking: ${action.thinking?.slice(0, 100)}, hasCode: ${!!action.code}, hasResponse: ${!!action.response}`);
    } catch (e) {
      console.error(`[callCloudLLM] Failed to parse JSON: ${e}`);
      // If JSON parse fails, try to extract from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          action = JSON.parse(jsonMatch[1].trim()) as AgentAction;
          console.log(`[callCloudLLM] Extracted JSON from code block`);
        } catch {
          console.error(`[callCloudLLM] Could not parse JSON from code block either`);
        }
      }
    }
  }

  return {
    text: content,
    action,
    finishReason: choice?.finish_reason,
  };
}

// ============================================================================
// Code Execution Agent Loop
// ============================================================================

/**
 * Run the code execution agent loop.
 *
 * Architecture:
 * - LLM has single execute_code tool
 * - LLM calls the tool with TypeScript code
 * - We execute the code and return results
 * - Loop until LLM responds without tool calls
 */
export async function runCodeExecLoop(
  ctx: any,
  systemPrompt: string,
  userPrompt: string,
  gatewayConfig: GatewayConfig,
  options: {
    maxSteps?: number;
    threadId?: string;
    cardId?: string;
    model?: string;
    sessionId?: string; // For real-time log forwarding to cloud
  } = {}
): Promise<CodeExecResult> {
  // MARKER: Version 2026-01-15-v4 - real-time log forwarding to cloud
  console.log("🔥🔥🔥 [codeExecLoop] VERSION: 2026-01-15-v4 WITH REAL-TIME LOGS 🔥🔥🔥");

  const maxSteps = options.maxSteps || 10;
  const threadId = options.threadId || `codeexec_${Date.now()}`;
  const cardId = options.cardId;
  const model = options.model;

  // Set up cloud forwarding for real-time chain of thought
  if (options.sessionId) {
    cloudForwardingConfig = {
      gatewayConfig,
      sessionId: options.sessionId,
    };
    console.log(`[codeExecLoop] Cloud forwarding enabled for session: ${options.sessionId}`);
  }
  let codeEnforcementRetries = 0;
  const MAX_CODE_ENFORCEMENT_RETRIES = 3;

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
      label: `Step ${step + 1}: Thinking...`,
    });

    // Call LLM - uses JSON schema structured output
    const response = await callCloudLLM(messages, gatewayConfig, { model });
    updateStepStatus(threadId, thinkingId, "complete");

    // Get the structured action from response
    let action = response.action;

    // Fallback: if structured output failed, try to extract code blocks
    if (!action) {
      console.error("[codeExecLoop] ERROR: No structured action returned!");
      console.error("[codeExecLoop] Response text:", response.text);

      const codeBlocks = extractCodeBlocks(response.text);
      if (codeBlocks.length > 0) {
        console.log(`[codeExecLoop] Fallback: Found ${codeBlocks.length} code blocks`);
        action = {
          thinking: "Extracted from markdown",
          code: codeBlocks.join("\n\n"),
          response: "",
        };
      } else {
        // No action and no code - treat text as final response
        finalText = response.text || "Agent completed without response.";
        emitStep(threadId, {
          type: "text",
          status: "complete",
          label: finalText.slice(0, 200),
        });
        break;
      }
    }

    // Log the agent's thinking
    if (action.thinking) {
      emitStep(threadId, {
        type: "thinking",
        status: "complete",
        label: action.thinking.slice(0, 200),
      });
      console.log(`[codeExecLoop] Thinking: ${action.thinking}`);
    }

    // If agent provided a final response (non-empty) and no code, we're done
    const hasCode = action.code && action.code.trim().length > 0;
    const hasResponse = action.response && action.response.trim().length > 0;

    if (hasResponse && !hasCode) {
      // CRITICAL: Reject responses if no code has been executed yet
      // This prevents the agent from hallucinating completion without actually executing
      if (allExecutions.length === 0) {
        codeEnforcementRetries++;
        console.warn(`[codeExecLoop] Agent tried to respond without code - retry ${codeEnforcementRetries}/${MAX_CODE_ENFORCEMENT_RETRIES} (step ${step})`);

        if (codeEnforcementRetries >= MAX_CODE_ENFORCEMENT_RETRIES) {
          console.error("[codeExecLoop] Agent failed to provide code after max retries - failing");
          emitStep(threadId, {
            type: "thinking",
            status: "error",
            label: "Agent failed to execute code after multiple attempts",
          });
          finalText = `ERROR: Agent failed to execute code. Response was: ${action.response}`;
          break;
        }

        emitStep(threadId, {
          type: "thinking",
          status: "error",
          label: `Retry ${codeEnforcementRetries}: Agent must execute code`,
        });

        // Ask the agent to try again with code
        messages.push({
          role: "assistant",
          content: `Thinking: ${action.thinking || "..."}\n\nResponse: ${action.response}`,
        });
        messages.push({
          role: "user",
          content: `ERROR: You cannot provide a response without executing code first. You MUST provide actual TypeScript code in the "code" field. Do not describe what you would do - actually write and execute code using import statements like: import { search } from './ksa/web'. Try again with code.`,
        });
        continue; // Go to next iteration
      }

      // After code has been executed, accept the response
      finalText = action.response!;
      emitStep(threadId, {
        type: "text",
        status: "complete",
        label: finalText.slice(0, 200),
      });
      break;
    }

    // If agent provided code, execute it
    if (hasCode) {
      const code = wrapCodeForExecution(action.code!);

      const execId = emitStep(threadId, {
        type: "tool",
        status: "active",
        toolName: "code_execution",
        label: "Executing code...",
        input: { code: code.slice(0, 500) },
      });

      let execResult: string;
      try {
        const result = await ctx.runAction(internal.nodeActions.codeExec.execute, {
          code,
          timeoutMs: 60_000,
          env: {
            // KSAs use both CONVEX_URL and GATEWAY_URL - provide both for compatibility
            CONVEX_URL: gatewayConfig.convexUrl,
            GATEWAY_URL: gatewayConfig.convexUrl,
            SANDBOX_JWT: gatewayConfig.jwt,
            ...(cardId && { CARD_ID: cardId }),
          },
        });

        allExecutions.push({
          code,
          output: result.output,
          success: result.success,
        });

        if (result.success) {
          execResult = `[Execution successful]\n${result.output}`;
          updateStepStatus(threadId, execId, "complete");
        } else {
          execResult = `[Execution failed]\nError: ${result.error}\nOutput: ${result.output}`;
          updateStepStatus(threadId, execId, "error");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        execResult = `[Execution error]\n${msg}`;
        allExecutions.push({
          code,
          output: msg,
          success: false,
        });
        updateStepStatus(threadId, execId, "error");
      }

      // Add assistant's action to messages
      messages.push({
        role: "assistant",
        content: `Thinking: ${action.thinking || "..."}\n\nExecuting code:\n\`\`\`typescript\n${action.code}\n\`\`\``,
      });

      // Emit console output as chain-of-thought steps for real-time UI visibility
      // Parse output for meaningful logs (beads, deliverables, web, etc.)
      const outputLines = (allExecutions[allExecutions.length - 1]?.output || "").split("\n");
      for (const line of outputLines) {
        if (!line.trim()) continue;

        // Categorize log lines for better UI display
        let stepType: "tool" | "text" | "search" | "file" = "text";
        let label = line.slice(0, 150);

        if (line.includes("[beads]")) {
          stepType = "tool";
          label = line.replace("[beads]", "📋").trim();
        } else if (line.includes("[deliverables]") || line.includes("[pdf]")) {
          stepType = "file";
          label = line.replace("[deliverables]", "💾").replace("[pdf]", "📄").trim();
        } else if (line.includes("[web]") || line.includes("Searching") || line.includes("search")) {
          stepType = "search";
          label = line.replace("[web]", "🔍").trim();
        } else if (line.includes("Found") || line.includes("Created") || line.includes("Saved")) {
          // Keep as text but show it
        } else if (line.startsWith("[") || line.includes("DEBUG")) {
          // Skip debug/internal logs
          continue;
        }

        emitStep(threadId, {
          type: stepType,
          status: "complete",
          label,
          ...(stepType === "tool" && { toolName: "console", output: line }),
        });
      }

      // Add execution result
      messages.push({
        role: "user",
        content: `${execResult}\n\nContinue with the task. Respond with JSON containing "thinking", "code", and "response" fields.`,
      });
    } else {
      // No code and no response - shouldn't happen but handle gracefully
      console.warn("[codeExecLoop] Action has neither code nor response");
      finalText = action.thinking || "Task completed.";
      break;
    }
  }

  return {
    text: finalText,
    codeExecutions: allExecutions,
  };
}
