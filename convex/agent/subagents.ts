/**
 * Subagents - Spawn and manage child agents
 *
 * Enables parallel work and task delegation through subagent spawning.
 * Uses cloud gateway for LLM calls (same as main agent).
 */

import {
  mutation,
  query,
  internalMutation,
  internalAction,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSubagentToolset } from "../tools";

// Default model for subagents
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

// ============================================
// Progress Emission (to cloud thread)
// ============================================

interface ChainOfThoughtStep {
  id: string;
  type: "thinking" | "tool" | "search" | "file" | "complete" | "error";
  label: string;
  status: "active" | "complete" | "error";
  details?: string;
}

/**
 * Emit subagent progress to the cloud thread for UI display.
 * This calls the cloud Convex gateway to update the thread messages.
 */
async function emitProgress(
  parentThreadId: string | undefined,
  subagentId: string,
  name: string,
  task: string,
  status: "spawning" | "running" | "completed" | "failed",
  options?: {
    progress?: number;
    result?: string;
    error?: string;
    children?: ChainOfThoughtStep[];
  }
): Promise<void> {
  if (!parentThreadId) return; // No parent thread to emit to

  const convexUrl = process.env.CONVEX_URL;
  const jwt = process.env.SANDBOX_JWT;

  if (!convexUrl || !jwt) return; // Can't emit without credentials

  try {
    await fetch(`${convexUrl}/agent/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        path: "agent.workflows.crudThreads.emitSubagentProgress",
        args: {
          threadId: parentThreadId,
          subagentId,
          name,
          task,
          status,
          progress: options?.progress,
          result: options?.result,
          error: options?.error,
          children: options?.children,
        },
      }),
    });
  } catch (e) {
    // Don't fail the subagent if progress emission fails
    console.error("[subagent] Failed to emit progress:", e);
  }
}

// ============================================
// Cloud LLM Gateway (shared with main agent)
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

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * Call the cloud Convex gateway for LLM completions.
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
  const convexUrl = process.env.CONVEX_URL;
  const jwt = process.env.SANDBOX_JWT;

  if (!convexUrl || !jwt) {
    throw new Error("CONVEX_URL or SANDBOX_JWT not set");
  }

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

interface SpawnResult {
  subagentId: string;
  status: "spawned";
}

interface ExecuteResult {
  success: boolean;
  error?: string;
}

// ============================================
// Helpers
// ============================================

function createSubagentId(): string {
  return `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// Actions
// ============================================

/**
 * Spawn a new subagent
 */
export const spawn = internalAction({
  args: {
    parentThreadId: v.optional(v.string()),
    cloudThreadId: v.optional(v.string()), // Cloud thread ID for progress emission
    name: v.string(),
    task: v.string(),
    tools: v.array(v.string()),
    model: v.string(),
  },
  handler: async (ctx, args): Promise<SpawnResult> => {
    const subagentId = createSubagentId();

    // Emit spawning progress to cloud thread
    await emitProgress(
      args.cloudThreadId,
      subagentId,
      args.name,
      args.task,
      "spawning"
    );

    // Record subagent in database
    await ctx.runMutation(internal.agent.subagents.internalRecordSubagent, {
      threadId: subagentId,
      parentThreadId: args.parentThreadId || "",
      name: args.name,
      task: args.task,
      tools: args.tools,
      model: args.model,
    });

    // Execute asynchronously using scheduler
    await ctx.scheduler.runAfter(0, internal.agent.subagents.execute, {
      threadId: subagentId,
      cloudThreadId: args.cloudThreadId,
      task: args.task,
      tools: args.tools,
      model: args.model,
      name: args.name,
    });

    return { subagentId, status: "spawned" };
  },
});

/**
 * Execute subagent task with tool loop
 */
async function runSubagentLoop(
  ctx: any,
  systemPrompt: string,
  task: string,
  toolNames: string[],
  model: string,
  maxSteps: number = 5
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  // Create tools for this subagent
  const tools = createSubagentToolset(ctx, toolNames);
  const toolDefs = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: (tool as any).description || `Tool: ${name}`,
    parameters: (tool as any).parameters || { type: "object", properties: {} },
  }));

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  const allToolCalls: ToolCall[] = [];
  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    const response = await callCloudLLM(messages, {
      model,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    });

    if (!response.toolCalls || response.toolCalls.length === 0) {
      finalText = response.text;
      break;
    }

    const toolResults: string[] = [];
    for (const tc of response.toolCalls) {
      allToolCalls.push(tc);

      try {
        const tool = tools[tc.toolName];
        if (!tool) {
          toolResults.push(`Error: Unknown tool "${tc.toolName}"`);
          continue;
        }

        const result = await (tool as any).execute(tc.args, { toolCallId: `${step}-${tc.toolName}` });
        toolResults.push(typeof result === "string" ? result : JSON.stringify(result));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toolResults.push(`Error executing ${tc.toolName}: ${msg}`);
      }
    }

    messages.push({
      role: "assistant",
      content: response.text || `Called tools: ${response.toolCalls.map((t) => t.toolName).join(", ")}`,
    });

    messages.push({
      role: "user",
      content: `Tool results:\n${toolResults.join("\n\n")}`,
    });

    if (response.finishReason === "stop") {
      finalText = response.text;
      break;
    }
  }

  return { text: finalText, toolCalls: allToolCalls };
}

/**
 * Execute subagent task with tool loop and progress emission
 */
async function runSubagentLoopWithProgress(
  ctx: any,
  systemPrompt: string,
  task: string,
  toolNames: string[],
  model: string,
  maxSteps: number = 5,
  onProgress?: (step: ChainOfThoughtStep) => Promise<void>
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  // Create tools for this subagent
  const tools = createSubagentToolset(ctx, toolNames);
  const toolDefs = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: (tool as any).description || `Tool: ${name}`,
    parameters: (tool as any).parameters || { type: "object", properties: {} },
  }));

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  const allToolCalls: ToolCall[] = [];
  let finalText = "";
  let stepCounter = 0;

  for (let step = 0; step < maxSteps; step++) {
    // Emit thinking step
    if (onProgress) {
      await onProgress({
        id: `step_${stepCounter++}`,
        type: "thinking",
        label: "Analyzing task...",
        status: "active",
      });
    }

    const response = await callCloudLLM(messages, {
      model,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    });

    if (!response.toolCalls || response.toolCalls.length === 0) {
      finalText = response.text;
      break;
    }

    const toolResults: string[] = [];
    for (const tc of response.toolCalls) {
      allToolCalls.push(tc);

      // Emit tool step (active)
      const stepId = `step_${stepCounter++}`;
      const toolType = getToolType(tc.toolName);

      if (onProgress) {
        await onProgress({
          id: stepId,
          type: toolType,
          label: `Using ${tc.toolName}`,
          status: "active",
          details: JSON.stringify(tc.args).slice(0, 100),
        });
      }

      try {
        const tool = tools[tc.toolName];
        if (!tool) {
          toolResults.push(`Error: Unknown tool "${tc.toolName}"`);
          continue;
        }

        const result = await (tool as any).execute(tc.args, { toolCallId: `${step}-${tc.toolName}` });
        toolResults.push(typeof result === "string" ? result : JSON.stringify(result));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toolResults.push(`Error executing ${tc.toolName}: ${msg}`);
      }
    }

    messages.push({
      role: "assistant",
      content: response.text || `Called tools: ${response.toolCalls.map((t) => t.toolName).join(", ")}`,
    });

    messages.push({
      role: "user",
      content: `Tool results:\n${toolResults.join("\n\n")}`,
    });

    if (response.finishReason === "stop") {
      finalText = response.text;
      break;
    }
  }

  return { text: finalText, toolCalls: allToolCalls };
}

/**
 * Map tool names to step types for progress display
 */
function getToolType(toolName: string): ChainOfThoughtStep["type"] {
  const lowered = toolName.toLowerCase();
  if (lowered.includes("search") || lowered.includes("web")) return "search";
  if (lowered.includes("file") || lowered.includes("read") || lowered.includes("write")) return "file";
  return "tool";
}

/**
 * Execute subagent task
 */
export const execute = internalAction({
  args: {
    threadId: v.string(),
    cloudThreadId: v.optional(v.string()), // Cloud thread ID for progress emission
    task: v.string(),
    tools: v.array(v.string()),
    model: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args): Promise<ExecuteResult> => {
    const children: ChainOfThoughtStep[] = [];

    try {
      // Update status to running
      await ctx.runMutation(internal.agent.subagents.updateStatus, {
        threadId: args.threadId,
        status: "running",
      });

      // Emit running progress to cloud thread
      await emitProgress(
        args.cloudThreadId,
        args.threadId,
        args.name,
        args.task,
        "running",
        { children }
      );

      // Build system prompt for subagent
      const systemPrompt = `You are ${args.name}, a specialized subagent.

Your task: ${args.task}

Guidelines:
- Focus only on the assigned task
- Be concise and efficient
- Report results clearly
- If blocked, explain why`;

      // Execute using cloud gateway with progress callback
      const onProgress = async (step: ChainOfThoughtStep) => {
        children.push(step);
        await emitProgress(
          args.cloudThreadId,
          args.threadId,
          args.name,
          args.task,
          "running",
          {
            progress: Math.min(95, children.length * 15), // Approximate progress
            children
          }
        );
      };

      const result = await runSubagentLoopWithProgress(
        ctx,
        systemPrompt,
        args.task,
        args.tools,
        args.model || DEFAULT_MODEL,
        5,
        onProgress
      );

      // Update with result
      await ctx.runMutation(internal.agent.subagents.updateStatus, {
        threadId: args.threadId,
        status: "completed",
        result: {
          text: result.text,
          toolCalls: result.toolCalls,
        },
      });

      // Mark all children as complete and emit final progress
      const completedChildren = children.map((c) => ({
        ...c,
        status: "complete" as const,
      }));
      completedChildren.push({
        id: `${args.threadId}_complete`,
        type: "complete",
        label: "Task completed",
        status: "complete",
        details: result.text.slice(0, 100),
      });

      await emitProgress(
        args.cloudThreadId,
        args.threadId,
        args.name,
        args.task,
        "completed",
        { progress: 100, result: result.text, children: completedChildren }
      );

      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Update with error
      await ctx.runMutation(internal.agent.subagents.updateStatus, {
        threadId: args.threadId,
        status: "failed",
        error: errorMessage,
      });

      // Emit failed progress
      children.push({
        id: `${args.threadId}_error`,
        type: "error",
        label: "Task failed",
        status: "error",
        details: errorMessage,
      });

      await emitProgress(
        args.cloudThreadId,
        args.threadId,
        args.name,
        args.task,
        "failed",
        { error: errorMessage, children }
      );

      return { success: false, error: errorMessage };
    }
  },
});

// ============================================
// Mutations
// ============================================

/**
 * Internal: Record subagent in database
 */
export const internalRecordSubagent = internalMutation({
  args: {
    threadId: v.string(),
    parentThreadId: v.string(),
    name: v.string(),
    task: v.string(),
    tools: v.array(v.string()),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("subagents", {
      threadId: args.threadId,
      parentThreadId: args.parentThreadId,
      name: args.name,
      task: args.task,
      tools: args.tools,
      model: args.model,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal: Update subagent status
 */
export const updateStatus = internalMutation({
  args: {
    threadId: v.string(),
    status: v.string(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subagent = await ctx.db
      .query("subagents")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (!subagent) return;

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.result) {
      updates.result = args.result;
    }

    if (args.error) {
      updates.error = args.error;
    }

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(subagent._id, updates);
  },
});

/**
 * Cancel a subagent
 */
export const cancel = internalMutation({
  args: {
    subagentId: v.string(),
  },
  handler: async (ctx, args) => {
    const subagent = await ctx.db
      .query("subagents")
      .filter((q) => q.eq(q.field("threadId"), args.subagentId))
      .first();

    if (!subagent) {
      return { success: false, error: "Subagent not found" };
    }

    if (subagent.status === "completed" || subagent.status === "failed") {
      return { success: false, error: "Subagent already finished" };
    }

    await ctx.db.patch(subagent._id, {
      status: "failed",
      error: "Cancelled by parent",
      completedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get subagent status
 */
export const getStatus = query({
  args: {
    subagentId: v.string(),
  },
  handler: async (ctx, args) => {
    const subagent = await ctx.db
      .query("subagents")
      .filter((q) => q.eq(q.field("threadId"), args.subagentId))
      .first();

    if (!subagent) {
      return { found: false, status: null };
    }

    return {
      found: true,
      status: subagent.status,
      name: subagent.name,
      task: subagent.task,
      hasError: !!subagent.error,
    };
  },
});

/**
 * Get subagent result
 */
export const getResult = query({
  args: {
    subagentId: v.string(),
  },
  handler: async (ctx, args) => {
    const subagent = await ctx.db
      .query("subagents")
      .filter((q) => q.eq(q.field("threadId"), args.subagentId))
      .first();

    if (!subagent) {
      return { found: false };
    }

    if (subagent.status !== "completed" && subagent.status !== "failed") {
      return {
        found: true,
        ready: false,
        status: subagent.status,
      };
    }

    return {
      found: true,
      ready: true,
      status: subagent.status,
      result: subagent.result,
      error: subagent.error,
    };
  },
});

/**
 * List subagents
 */
export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
    parentThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("subagents");

    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }

    if (args.parentThreadId) {
      q = q.filter((q) =>
        q.eq(q.field("parentThreadId"), args.parentThreadId)
      );
    }

    const subagents = await q.order("desc").take(50);

    return subagents.map((s) => ({
      id: s.threadId,
      name: s.name,
      task: s.task,
      status: s.status,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
    }));
  },
});
