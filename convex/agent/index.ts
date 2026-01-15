/**
 * Sandbox Agent Definition
 *
 * Uses cloud Convex gateway for LLM calls to protect API keys.
 * The sandbox calls back to the main cloud Convex for all LLM operations.
 *
 * Flow:
 * 1. Sandbox receives prompt via HTTP
 * 2. Agent calls cloud gateway with JWT auth
 * 3. Cloud gateway calls OpenRouter with protected API key
 * 4. Response returns through the chain
 */

import { action, internalAction, query, mutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { createAllTools } from "../tools";
import { setGatewayConfig } from "../tools/web";
import { setArtifactGatewayConfig } from "../tools/artifacts";
import { SYSTEM_PROMPT } from "../prompts/system";

// Default model - using Gemini Flash for speed/cost
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

// ============================================
// Cloud LLM Gateway
// ============================================

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

interface LLMResponse {
  text: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
}

/**
 * OpenAI-format tool definition for the API
 */
interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * Gateway configuration for cloud LLM calls
 */
interface GatewayConfig {
  convexUrl: string;
  jwt: string;
}

// Module-level gateway config (set by startThread/continueThread)
let gatewayConfig: GatewayConfig | null = null;

/**
 * Call the cloud Convex gateway for LLM completions.
 * This protects API keys by routing through the main cloud.
 */
async function callCloudLLM(
  messages: LLMMessage[],
  options: {
    model?: string;
    tools?: Array<{ name: string; description: string; parameters: any }>;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<LLMResponse> {
  // Use module-level config (set by action handlers) or fall back to env
  const convexUrl = gatewayConfig?.convexUrl || process.env.CONVEX_URL;
  const jwt = gatewayConfig?.jwt || process.env.SANDBOX_JWT;

  if (!convexUrl) {
    throw new Error("Gateway not configured: convexUrl missing. Pass gatewayConfig in context.");
  }
  if (!jwt) {
    throw new Error("Gateway not configured: jwt missing. Pass gatewayConfig in context.");
  }

  // Convert simplified tool format to OpenAI format
  const openAITools: OpenAITool[] | undefined = options.tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
    },
  }));

  const response = await fetch(`${convexUrl}/agent/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      path: "services.OpenRouter.internal.chatCompletion",
      args: {
        model: options.model || DEFAULT_MODEL,
        messages,
        tools: openAITools,
        maxTokens: options.maxTokens || 4096,
        temperature: options.temperature,
        speedy: false,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloud LLM call failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Cloud LLM error: ${result.error || JSON.stringify(result)}`);
  }

  const data = result.data;
  const choice = data.choices?.[0];

  // Extract tool calls if present
  const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
    toolName: tc.function?.name || tc.name,
    args: typeof tc.function?.arguments === "string"
      ? JSON.parse(tc.function.arguments)
      : tc.function?.arguments || tc.arguments || {},
  }));

  return {
    text: choice?.message?.content || "",
    toolCalls: toolCalls?.length > 0 ? toolCalls : undefined,
    finishReason: choice?.finish_reason,
  };
}

// ============================================
// Types
// ============================================

interface AgentResult {
  threadId: string;
  text: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
}

// ============================================
// Thread Management
// ============================================

function createThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// Tool Execution Loop
// ============================================

/**
 * Execute a multi-turn agent loop with tool calling.
 * Handles the tool call -> execute -> respond cycle.
 */
async function runAgentLoop(
  ctx: any,
  systemPrompt: string,
  userPrompt: string,
  maxSteps: number = 10
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  // Build tool definitions for the LLM
  const tools = createAllTools(ctx);
  const toolDefs = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: (tool as any).description || `Tool: ${name}`,
    parameters: (tool as any).parameters || { type: "object", properties: {} },
  }));

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const allToolCalls: ToolCall[] = [];
  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    // Call LLM via cloud gateway
    const response = await callCloudLLM(messages, {
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    });

    // If no tool calls, we're done
    if (!response.toolCalls || response.toolCalls.length === 0) {
      finalText = response.text;
      break;
    }

    // Execute tool calls
    const toolResults: string[] = [];
    for (const tc of response.toolCalls) {
      allToolCalls.push(tc);

      try {
        const tool = tools[tc.toolName];
        if (!tool) {
          toolResults.push(`Error: Unknown tool "${tc.toolName}"`);
          continue;
        }

        // Execute the tool
        const result = await (tool as any).execute(tc.args, { toolCallId: `${step}-${tc.toolName}` });
        toolResults.push(
          typeof result === "string" ? result : JSON.stringify(result)
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toolResults.push(`Error executing ${tc.toolName}: ${msg}`);
      }
    }

    // Add assistant message with tool calls
    messages.push({
      role: "assistant",
      content: response.text || `Called tools: ${response.toolCalls.map((t) => t.toolName).join(", ")}`,
    });

    // Add tool results as user message
    messages.push({
      role: "user",
      content: `Tool results:\n${toolResults.join("\n\n")}`,
    });

    // Check if LLM indicated completion
    if (response.finishReason === "stop") {
      finalText = response.text;
      break;
    }
  }

  return { text: finalText, toolCalls: allToolCalls };
}

// ============================================
// Agent Actions
// ============================================

/**
 * Start a new agent thread
 */
export const startThread = action({
  args: {
    prompt: v.string(),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<AgentResult> => {
    const threadId = createThreadId();

    // Set gateway config from context if provided
    const ctxObj = args.context as { gatewayConfig?: GatewayConfig; cardId?: string } | undefined;
    console.log(`[lakitu agent] Received context: ${JSON.stringify(args.context)}`);
    console.log(`[lakitu agent] gatewayConfig present: ${!!ctxObj?.gatewayConfig}`);
    console.log(`[lakitu agent] cardId: ${ctxObj?.cardId || 'not provided'}`);
    if (ctxObj?.gatewayConfig) {
      gatewayConfig = ctxObj.gatewayConfig;
      // Also set gateway config for tools (web, artifacts, etc.)
      setGatewayConfig(ctxObj.gatewayConfig);
      // Set artifact gateway config with cardId for cloud sync
      setArtifactGatewayConfig({
        ...ctxObj.gatewayConfig,
        cardId: ctxObj.cardId,
      });
      console.log(`[lakitu agent] Set gatewayConfig: convexUrl=${gatewayConfig.convexUrl}, jwt length=${gatewayConfig.jwt?.length}`);
    }

    // Log the decision to start
    await ctx.runMutation(api.agent.decisions.log, {
      threadId,
      task: args.prompt,
      decisionType: "tool_selection",
      selectedTools: [],
      reasoning: "Starting new thread for task",
      expectedOutcome: "Agent will process the prompt and produce results",
    });

    // Run the agent loop
    const result = await runAgentLoop(ctx, SYSTEM_PROMPT, args.prompt);

    return {
      threadId,
      text: result.text,
      toolCalls: result.toolCalls.map((tc) => ({
        ...tc,
        result: undefined,
      })),
    };
  },
});

/**
 * Continue an existing thread
 */
export const continueThread = action({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args): Promise<AgentResult> => {
    const result = await runAgentLoop(ctx, SYSTEM_PROMPT, args.prompt);

    return {
      threadId: args.threadId,
      text: result.text,
      toolCalls: result.toolCalls.map((tc) => ({
        ...tc,
        result: undefined,
      })),
    };
  },
});

/**
 * Run agent with timeout for chained execution
 */
export const runWithTimeout = internalAction({
  args: {
    prompt: v.string(),
    context: v.optional(v.any()),
    timeoutMs: v.number(),
    checkpointId: v.optional(v.id("checkpoints")),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const timeout = args.timeoutMs;

    let threadId: string;

    if (args.checkpointId) {
      const checkpoint = await ctx.runQuery(
        internal.state.checkpoints.internalGet,
        { id: args.checkpointId }
      );
      if (!checkpoint) {
        throw new Error(`Checkpoint ${args.checkpointId} not found`);
      }
      threadId = checkpoint.threadId;

      await ctx.runMutation(internal.state.files.restoreFromCheckpoint, {
        checkpointId: args.checkpointId,
      });
    } else {
      threadId = createThreadId();
    }

    try {
      const result = await Promise.race([
        runAgentLoop(ctx, SYSTEM_PROMPT, args.prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), timeout)
        ),
      ]);

      return {
        status: "completed" as const,
        threadId,
        text: result.text,
        toolCalls: result.toolCalls,
        durationMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage === "TIMEOUT") {
        const checkpointId = await ctx.runMutation(
          internal.state.checkpoints.createFromCurrentState,
          {
            threadId,
            nextTask: "Continue from where we left off: " + args.prompt,
            iteration: args.checkpointId
              ? ((
                  await ctx.runQuery(internal.state.checkpoints.internalGet, {
                    id: args.checkpointId,
                  })
                )?.iteration ?? 0) + 1
              : 1,
          }
        );

        return {
          status: "incomplete" as const,
          threadId,
          checkpointId,
          durationMs: Date.now() - startTime,
        };
      }
      throw error;
    }
  },
});

// ============================================
// Queries
// ============================================

export const getThreadMessages = query({
  args: { threadId: v.string() },
  handler: async (_ctx, _args): Promise<Array<{ role: string; content: string }>> => {
    return [];
  },
});

export const getStreamDeltas = query({
  args: { threadId: v.string(), since: v.optional(v.number()) },
  handler: async (_ctx, _args): Promise<Array<{ delta: string; timestamp: number }>> => {
    return [];
  },
});
