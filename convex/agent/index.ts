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
import { setAutomationGatewayConfig } from "../tools/automation";
import { setPdfGatewayConfig } from "../tools/pdf";
import { setBoardGatewayConfig } from "../tools/board";
import { SYSTEM_PROMPT } from "../prompts/system";
import type { ChainOfThoughtStep, StepStatus } from "../../shared/chain-of-thought";
import { createStepId, getStepTypeForTool } from "../../shared/chain-of-thought";
// Note: Zod 4 has native toJSONSchema() - don't need zod-to-json-schema

// Model priority: Gemini 3 Flash Preview
const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODELS = [
  "anthropic/claude-haiku-4.5",
  "mistral/mistral-small-2501",
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
  maxSteps: number = 10,
  threadId?: string
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const tid = threadId || `loop_${Date.now()}`;

  // Build tool definitions for the LLM (convert Zod schemas to JSON schemas)
  const tools = createAllTools(ctx);
  console.log(`[lakitu] Available tools: ${Object.keys(tools).join(', ')}`);

  const toolDefs = Object.entries(tools).map(([name, tool]) => {
    const t = tool as any;
    let parameters: Record<string, any> = { type: "object", properties: {} };

    // Debug: Log what the tool object looks like
    if (name === 'bash') {
      console.log(`[lakitu DEBUG] bash tool object keys: ${Object.keys(t).join(', ')}`);
      console.log(`[lakitu DEBUG] bash t.parameters type: ${typeof t.parameters}`);
      if (t.parameters) {
        console.log(`[lakitu DEBUG] bash t.parameters keys: ${Object.keys(t.parameters).join(', ')}`);
        console.log(`[lakitu DEBUG] bash t.parameters.toJSONSchema exists: ${typeof t.parameters.toJSONSchema === 'function'}`);
        console.log(`[lakitu DEBUG] bash t.parameters._def exists: ${!!t.parameters._def}`);
      }
    }

    // AI SDK tools have Zod schemas in .parameters - convert to JSON schema
    // Zod 4 has native toJSONSchema() method
    if (t.parameters && typeof t.parameters.toJSONSchema === "function") {
      // Use Zod's native JSON schema conversion
      const jsonSchema = t.parameters.toJSONSchema();
      // Remove $schema metadata that OpenAI doesn't want
      const { $schema, ...cleanSchema } = jsonSchema;
      parameters = cleanSchema;
      if (name === 'bash') {
        console.log(`[lakitu DEBUG] bash JSON schema from toJSONSchema: ${JSON.stringify(parameters)}`);
      }
    } else if (t.parameters && typeof t.parameters.parse === "function") {
      // Older Zod without toJSONSchema - try to extract basic shape
      console.log(`[lakitu] WARNING: Tool ${name} has Zod schema without toJSONSchema`);
      parameters = { type: "object", properties: {} };
    } else if (t.parameters && typeof t.parameters === "object") {
      // Already a JSON schema object
      parameters = t.parameters;
      if (name === 'bash') {
        console.log(`[lakitu DEBUG] bash using raw parameters object: ${JSON.stringify(parameters)}`);
      }
    }

    return {
      name,
      description: t.description || `Tool: ${name}`,
      parameters,
    };
  });

  // Log bash tool def specifically
  const bashToolDef = toolDefs.find(t => t.name === 'bash');
  if (bashToolDef) {
    console.log(`[lakitu DEBUG] bash final tool def: ${JSON.stringify(bashToolDef)}`);
  } else {
    console.log(`[lakitu] WARNING: bash tool NOT FOUND in tool definitions!`);
  }

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const allToolCalls: ToolCall[] = [];
  let finalText = "";

  // Emit initial thinking step
  emitStep(tid, { type: "thinking", status: "complete", label: "Processing request..." });

  for (let step = 0; step < maxSteps; step++) {
    const thinkingId = emitStep(tid, { 
      type: "thinking", 
      status: "active", 
      label: `Step ${step + 1}: Analyzing...` 
    });

    // Call LLM via cloud gateway
    const response = await callCloudLLM(messages, {
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    });
    
    updateStepStatus(tid, thinkingId, "complete");

    // If no tool calls, we're done
    if (!response.toolCalls || response.toolCalls.length === 0) {
      finalText = response.text;
      if (finalText) {
        emitStep(tid, { type: "text", status: "complete", label: finalText.slice(0, 200) });
      }
      break;
    }

    // Execute tool calls
    console.log(`[lakitu] LLM requested ${response.toolCalls.length} tool calls: ${response.toolCalls.map(t => t.toolName).join(', ')}`);

    const toolResults: string[] = [];
    for (const tc of response.toolCalls) {
      allToolCalls.push(tc);
      console.log(`[lakitu] Executing tool: ${tc.toolName} with args: ${JSON.stringify(tc.args).slice(0, 200)}`);

      // Emit tool call as active step
      const toolStepId = emitStep(tid, createToolStep(tc.toolName, tc.args, null, "active"));

      try {
        const tool = tools[tc.toolName];
        if (!tool) {
          const err = `Error: Unknown tool "${tc.toolName}"`;
          console.log(`[lakitu] Tool not found: ${tc.toolName}`);
          toolResults.push(err);
          updateStepStatus(tid, toolStepId, "error");
          continue;
        }

        // Execute the tool
        console.log(`[lakitu] Calling ${tc.toolName}.execute()...`);
        const result = await (tool as any).execute(tc.args, { toolCallId: `${step}-${tc.toolName}` });
        console.log(`[lakitu] ${tc.toolName} returned: ${JSON.stringify(result).slice(0, 200)}`);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);
        toolResults.push(resultStr);

        // Update the step with result and mark complete
        const steps = chainOfThoughtSteps.get(tid);
        if (steps) {
          const idx = steps.findIndex(s => s.id === toolStepId);
          if (idx >= 0) {
            // Replace with enriched step containing result data
            steps[idx] = {
              id: toolStepId,
              timestamp: steps[idx].timestamp,
              ...createToolStep(tc.toolName, tc.args, result, "complete"),
            } as ChainOfThoughtStep;
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const err = `Error executing ${tc.toolName}: ${msg}`;
        toolResults.push(err);
        updateStepStatus(tid, toolStepId, "error");
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
      if (finalText) {
        emitStep(tid, { type: "text", status: "complete", label: finalText.slice(0, 200) });
      }
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
      // Set automation gateway config with cardId for cross-stage artifact access
      setAutomationGatewayConfig({
        ...ctxObj.gatewayConfig,
        cardId: ctxObj.cardId,
      });
      // Set PDF gateway config for auto-artifact save
      setPdfGatewayConfig({
        ...ctxObj.gatewayConfig,
        cardId: ctxObj.cardId,
      });
      // Set board gateway config for workflow management
      setBoardGatewayConfig({
        ...ctxObj.gatewayConfig,
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

    // Run the agent loop with threadId for streaming
    const result = await runAgentLoop(ctx, SYSTEM_PROMPT, args.prompt, 10, threadId);

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
      model?: string;
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
      model: ctxObj.model,
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
