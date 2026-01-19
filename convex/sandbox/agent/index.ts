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
import type { ChainOfThoughtStep, StepStatus } from "../../../shared/chain-of-thought";
import { createStepId, getStepTypeForTool } from "../../../shared/chain-of-thought";
import { bootstrapFromIntentSchema } from "../planning/bootstrap";
// Note: Zod 4 has native toJSONSchema() - don't need zod-to-json-schema

// Default model - used as fallback if no model passed via context
// The model should be passed from unified settings (convex/features/settings/models.ts)
// This fallback matches the "default" context in settings
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const FALLBACK_MODELS = [
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.0-flash",
];

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

// Module-level chain-of-thought steps for real-time UI (in-memory per sandbox session)
const chainOfThoughtSteps: Map<string, ChainOfThoughtStep[]> = new Map();

/** Emit a structured chain-of-thought step */
function emitStep(threadId: string, step: Omit<ChainOfThoughtStep, "id" | "timestamp">) {
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

/** Update an existing step's status */
function updateStepStatus(threadId: string, stepId: string, status: StepStatus) {
  const steps = chainOfThoughtSteps.get(threadId);
  if (steps) {
    const step = steps.find(s => s.id === stepId);
    if (step) step.status = status;
  }
}

/** Create a rich step from tool call and result */
function createToolStep(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  status: StepStatus
): Omit<ChainOfThoughtStep, "id" | "timestamp"> {
  const stepType = getStepTypeForTool(toolName);
  
  switch (stepType) {
    case "search": {
      // Extract URLs from search results
      const res = result as any;
      const urls: Array<{ url: string; title?: string }> = [];
      if (res?.results) {
        for (const r of res.results.slice(0, 5)) {
          if (r.url) urls.push({ url: r.url, title: r.title });
        }
      }
      return {
        type: "search",
        status,
        label: `Searching for ${(args as any).query || (args as any).username || "information"}`,
        results: urls.length > 0 ? urls : undefined,
      };
    }
    
    case "browser": {
      const action = toolName.replace("browser_", "") as any;
      return {
        type: "browser",
        status,
        action: action === "open" ? "navigate" : action,
        label: toolName === "browser_open" 
          ? `Navigating to ${(args as any).url}`
          : toolName === "browser_screenshot"
          ? "Taking screenshot"
          : `Browser ${action}`,
        url: (args as any).url,
        screenshot: toolName === "browser_screenshot" ? (result as any)?.screenshot : undefined,
      };
    }
    
    case "file": {
      const operation = toolName.includes("read") ? "read" 
        : toolName.includes("edit") ? "edit"
        : toolName.includes("pdf") ? "save"
        : "write";
      const path = (args as any).path || (args as any).filename || "file";
      return {
        type: "file",
        status,
        operation,
        path,
        label: operation === "read" ? `Reading ${path}`
          : operation === "edit" ? `Editing ${path}`
          : `Saving ${path}`,
      };
    }
    
    default:
      return {
        type: "tool",
        status,
        toolName,
        label: `Running ${toolName}`,
        input: args,
        output: result,
      };
  }
}

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

  // Debug: Log tools being sent
  if (openAITools) {
    console.log(`[lakitu LLM] Sending ${openAITools.length} tools to LLM`);
    const bashTool = openAITools.find(t => t.function.name === 'bash');
    if (bashTool) {
      console.log(`[lakitu LLM] bash tool: ${JSON.stringify(bashTool)}`);
    }
  }

  // No provider preference - let OpenRouter choose fastest

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

  // Debug: Log raw LLM response
  console.log(`[lakitu LLM DEBUG] finish_reason: ${choice?.finish_reason}`);
  console.log(`[lakitu LLM DEBUG] message keys: ${choice?.message ? Object.keys(choice.message).join(', ') : 'no message'}`);
  console.log(`[lakitu LLM DEBUG] tool_calls present: ${!!choice?.message?.tool_calls}`);
  if (choice?.message?.tool_calls) {
    console.log(`[lakitu LLM DEBUG] tool_calls count: ${choice.message.tool_calls.length}`);
    console.log(`[lakitu LLM DEBUG] tool_calls: ${JSON.stringify(choice.message.tool_calls).slice(0, 500)}`);
  }
  if (choice?.message?.content) {
    console.log(`[lakitu LLM DEBUG] content (first 300 chars): ${choice.message.content.slice(0, 300)}`);
  }

  // Extract tool calls if present
  const toolCalls = choice?.message?.tool_calls?.map((tc: any) => {
    let args = {};
    const rawArgs = tc.function?.arguments || tc.arguments;
    if (typeof rawArgs === "string" && rawArgs.length > 0) {
      try {
        args = JSON.parse(rawArgs);
      } catch (e) {
        console.error(`[lakitu] Failed to parse tool args for ${tc.function?.name}: ${rawArgs}`);
        args = {};
      }
    } else if (typeof rawArgs === "object" && rawArgs !== null) {
      args = rawArgs;
    }
    return {
      toolName: tc.function?.name || tc.name,
      args,
    };
  });

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
// Legacy Tool Execution Loop (DEPRECATED)
// ============================================

/**
 * @deprecated Use startCodeExecThread instead. Legacy JSON tool calling is no longer supported.
 */
async function runAgentLoop(
  _ctx: any,
  _systemPrompt: string,
  _userPrompt: string,
  _maxSteps: number = 10,
  _threadId?: string
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  throw new Error(
    "Legacy tool calling mode is deprecated. Use startCodeExecThread instead, " +
    "which uses the new KSA (Knowledge, Skills, Abilities) architecture with code execution."
  );
}

// ============================================
// Agent Actions
// ============================================

/**
 * Start a new agent thread
 * @deprecated Use startCodeExecThread instead. Legacy JSON tool calling is no longer supported.
 */
export const startThread = action({
  args: {
    prompt: v.string(),
    context: v.optional(v.any()),
  },
  handler: async (_ctx, _args): Promise<AgentResult> => {
    throw new Error(
      "startThread is deprecated. Use startCodeExecThread instead, " +
      "which uses the new KSA (Knowledge, Skills, Abilities) architecture with code execution."
    );
  },
});

/**
 * Continue an existing thread
 * @deprecated Use startCodeExecThread instead. Legacy JSON tool calling is no longer supported.
 */
export const continueThread = action({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  handler: async (_ctx, _args): Promise<AgentResult> => {
    throw new Error(
      "continueThread is deprecated. Use startCodeExecThread instead, " +
      "which uses the new KSA (Knowledge, Skills, Abilities) architecture with code execution."
    );
  },
});

/**
 * Run agent with timeout for chained execution
 * @deprecated Use startCodeExecThread instead. Legacy JSON tool calling is no longer supported.
 */
export const runWithTimeout = internalAction({
  args: {
    prompt: v.string(),
    context: v.optional(v.any()),
    timeoutMs: v.number(),
    checkpointId: v.optional(v.id("checkpoints")),
  },
  handler: async (_ctx, _args) => {
    throw new Error(
      "runWithTimeout is deprecated. Use startCodeExecThread instead, " +
      "which uses the new KSA (Knowledge, Skills, Abilities) architecture with code execution."
    );
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
  handler: async (_ctx, args): Promise<ChainOfThoughtStep[]> => {
    const steps = chainOfThoughtSteps.get(args.threadId) || [];
    const since = args.since || 0;
    return steps.filter((s) => s.timestamp > since);
  },
});

/** Get all chain-of-thought steps for a thread */
export const getChainOfThoughtSteps = query({
  args: { threadId: v.string() },
  handler: async (_ctx, args): Promise<ChainOfThoughtStep[]> => {
    return chainOfThoughtSteps.get(args.threadId) || [];
  },
});

// ============================================
// Code Execution Mode (NEW ARCHITECTURE)
// ============================================

import { runCodeExecLoop, getSteps } from "./codeExecLoop";
import { getCodeExecSystemPrompt, generateKSAInstructions } from "../prompts/codeExec";

/**
 * Start a thread using code execution mode.
 *
 * This is the NEW architecture:
 * - LLM generates TypeScript code
 * - Code imports from skills/ and executes
 * - No JSON tool calls
 *
 * Use this instead of startThread for the new code execution model.
 */
export const startCodeExecThread = action({
  args: {
    prompt: v.string(),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const threadId = `codeexec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Extract gateway config, model, sessionId, allowedKSAs, skillConfigs, and intentSchema from context
    const ctxObj = args.context as {
      gatewayConfig?: { convexUrl: string; jwt: string };
      cardId?: string;
      cloudThreadId?: string; // Cloud thread ID for artifact uploads (different from sandbox-local threadId)
      // Model config from unified settings
      model?: string;
      fallbackModels?: string[];
      maxTokens?: number;
      temperature?: number;
      sessionId?: string; // For real-time log forwarding
      allowedKSAs?: string[]; // KSAs allowed for this task
      skillConfigs?: Record<string, Record<string, unknown>>; // Per-KSA configuration
      intentSchema?: {
        intent: { summary: string; objective: string; context: string[]; domain?: string };
        ksas: { priority: string[]; secondary: string[]; notNeeded: string[]; reasoning: string };
        plan: {
          goals: Array<{ id: string; text: string; importance: string }>;
          deliverables: Array<{ id: string; type: string; name: string; description: string }>;
          steps: string[];
        };
        policy: { enabledKSAs: string[]; disabledKSAs: string[]; allowExternalCalls: boolean; requireApprovalFor?: string[] };
        meta: { model: string; generatedAt: number; confidence: string; latencyMs?: number };
      }; // Pre-analyzed intent schema for structured guidance
    } | undefined;

    if (!ctxObj?.gatewayConfig) {
      throw new Error("gatewayConfig required for code execution mode");
    }

    // Log start
    await ctx.runMutation(api.agent.decisions.log, {
      threadId,
      task: args.prompt,
      decisionType: "tool_selection",
      selectedTools: ["code_execution"],
      reasoning: "Using code execution mode - agent will write and execute TypeScript",
      expectedOutcome: "Agent will generate code that imports from skills/",
    });

    // Bootstrap beads from intent schema if present (creates task list from goals)
    let bootstrappedTasks: { epicId: string; taskIds: string[] } | null = null;
    if (ctxObj.intentSchema?.plan?.goals?.length > 0) {
      try {
        bootstrappedTasks = await bootstrapFromIntentSchema(
          ctx,
          ctxObj.intentSchema,
          threadId
        );
        console.log(
          `[startCodeExecThread] Bootstrapped ${bootstrappedTasks.taskIds.length} tasks from intent schema`
        );
      } catch (e) {
        console.warn(`[startCodeExecThread] Failed to bootstrap beads: ${e}`);
        // Continue without bootstrapped tasks - agent can still work
      }
    }

    // Generate KSA instructions from skill configs (if any)
    const ksaInstructions = ctxObj.skillConfigs
      ? generateKSAInstructions(ctxObj.skillConfigs)
      : "";

    // Log if intent schema is present
    if (ctxObj.intentSchema) {
      console.log(
        `[startCodeExecThread] Intent schema received: "${ctxObj.intentSchema.intent.summary}" (${ctxObj.intentSchema.meta.confidence} confidence)`
      );
    }

    // Run the code execution loop with dynamic KSA documentation and intent schema
    const systemPrompt = getCodeExecSystemPrompt({
      allowedKSAs: ctxObj.allowedKSAs,
      additions: ksaInstructions || undefined,
      intentSchema: ctxObj.intentSchema as any, // Type is compatible
    });
    const result = await runCodeExecLoop(ctx, systemPrompt, args.prompt, ctxObj.gatewayConfig, {
      threadId,
      maxSteps: 10,
      cardId: ctxObj.cardId,
      cloudThreadId: ctxObj.cloudThreadId, // Cloud thread ID for artifact uploads
      // Model config from unified settings (passed via context from cloud workflow)
      model: ctxObj.model,
      maxTokens: ctxObj.maxTokens,
      temperature: ctxObj.temperature,
      sessionId: ctxObj.sessionId, // Pass for real-time cloud log forwarding
    });

    return {
      threadId,
      text: result.text,
      codeExecutions: result.codeExecutions,
      chainOfThought: getSteps(threadId),
    };
  },
});
