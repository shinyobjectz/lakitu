/**
 * Thread-Based Agent Chat
 *
 * Interactive chat with agents outside of board workflows:
 * - Standalone chat threads
 * - Multi-turn conversations
 * - Skill-based responses
 * - Intent Schema pre-analysis (runs parallel to sandbox warm-up)
 */

import { v } from "convex/values";
import { action, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { type IntentSchema, createDefaultIntentSchema } from "../intentSchema/types";
import { CORE_KSAS, getKSANames } from "../ksaPolicy";

// ============================================
// Chat Operations
// ============================================

/** Send a message to a thread and get agent response */
export const sendMessage = action({
  args: {
    threadId: v.id("threads"),
    userId: v.string(),
    content: v.string(),
    skillIds: v.optional(v.array(v.string())),
    // Sandbox config from main app (has env var access)
    sandboxConfig: v.optional(v.object({
      sandboxJwt: v.string(),
      gatewayUrl: v.string(),
      preCreatedSandbox: v.object({
        sandboxId: v.string(),
        sandboxUrl: v.string(),
        timings: v.any(),
        fromPool: v.boolean(),
        deletedKSAs: v.array(v.string()),
      }),
    })),
  },
  handler: async (ctx, args) => {
    // Get thread to verify access and get context
    const threads = await ctx.runQuery(api.workflows.crudThreads.listThreads, {
      userId: args.userId,
    });
    const thisThread = threads.find((t: Doc<"threads">) => t._id === args.threadId);
    if (!thisThread) throw new Error("Thread not found or unauthorized");

    // Save user message
    await ctx.runMutation(api.workflows.crudThreads.sendThreadMessage, {
      threadId: args.threadId,
      userId: args.userId,
      content: args.content,
      role: "user",
    });

    // Get message history for context
    const messages = await ctx.runQuery(api.workflows.crudThreads.getThreadMessages, {
      threadId: args.threadId,
      userId: args.userId,
    });

    // Build context from history
    const historyContext = messages
      .slice(-10) // Last 10 messages for context
      .map((m: Doc<"threadMessages">) => `${m.role}: ${m.content}`)
      .join('\n\n');

    // Build system prompt based on skills
    let systemPrompt = "You are a helpful AI assistant.";
    let tools: string[] = ["vfs"];

    if (args.skillIds?.length) {
      const skills = await ctx.runQuery(api.workflows.crudSkills.getByIds, {
        skillIds: args.skillIds,
      });
      
      interface SkillDoc { prompt?: string; toolIds?: string[] }
      const skillPrompts = skills.filter((s: SkillDoc) => s.prompt).map((s: SkillDoc) => s.prompt);
      if (skillPrompts.length) {
        systemPrompt += `\n\n## Skills\n${skillPrompts.join('\n\n')}`;
      }
      
      tools = [...tools, ...skills.flatMap((s: SkillDoc) => s.toolIds || [])];
    }

    // Build full prompt with history
    const prompt = historyContext
      ? `Previous conversation:\n${historyContext}\n\nUser: ${args.content}`
      : args.content;

    try {
      // Combine system prompt and user prompt for Lakitu agent
      const fullPrompt = `${systemPrompt}\n\n---\n\n${prompt}`;

      // ============================================
      // INTENT SCHEMA: Generate in parallel with sandbox startup
      // This provides structured guidance to the agent about:
      // - Which KSAs to prioritize
      // - Goals and deliverables
      // - User policy constraints
      // ============================================
      let intentSchema: IntentSchema | null = null;

      try {
        // Generate intent schema with timeout (don't block if slow)
        intentSchema = await ctx.runAction(
          internal.intentSchema.generateIntentSchemaWithTimeout,
          {
            prompt: args.content, // Original user content (not full prompt)
            threadContext: historyContext || undefined,
            skillIds: args.skillIds,
            timeoutMs: 3000, // 3 second timeout
          }
        );

        if (intentSchema) {
          console.log(
            `[agentThread] Intent schema generated: ${intentSchema.intent.summary} (${intentSchema.meta.confidence} confidence, ${intentSchema.meta.latencyMs}ms)`
          );
        }
      } catch (intentError) {
        console.warn(`[agentThread] Intent schema generation failed: ${intentError}`);
        // Continue without intent schema - agent will work fine without it
      }

      // Fallback to default schema if generation failed
      if (!intentSchema) {
        const enabledKSAs = args.skillIds?.length
          ? [...CORE_KSAS, ...args.skillIds]
          : getKSANames();
        intentSchema = createDefaultIntentSchema(args.content, enabledKSAs);
      }

      // Determine allowed KSAs from intent schema or UI selection
      // Priority: intent schema policy > UI skillIds > all KSAs
      const allowedKSAs = intentSchema?.policy?.enabledKSAs?.length
        ? intentSchema.policy.enabledKSAs
        : args.skillIds?.length
          ? [...CORE_KSAS, ...args.skillIds]
          : undefined; // undefined = all KSAs allowed

      // Start Lakitu sandbox session with user context and intent schema
      const result = await ctx.runAction(api.workflows.sandboxConvex.startSession, {
        projectId: `thread-${args.threadId}`,
        prompt: fullPrompt,
        config: {
          tools,
          userId: args.userId,
          orgId: thisThread.orgId,
          // Pass workspace context if thread is in a workspace
          workspaceId: thisThread.workspaceId,
          threadId: args.threadId,
          // Include intent schema for agent guidance
          intentSchema,
          // Pass allowed KSAs for policy enforcement
          allowedKSAs,
          // Pass pre-created sandbox config from main app (if provided)
          ...(args.sandboxConfig && {
            sandboxJwt: args.sandboxConfig.sandboxJwt,
            preCreatedSandbox: args.sandboxConfig.preCreatedSandbox,
          }),
        },
      });

      if (!result.success) {
        return { success: false, error: result.error || "Failed to start session" };
      }

      const sessionId = result.sessionId;

      // Wait for completion
      let session: any = null;
      for (let i = 0; i < 180; i++) { // 3 min max for chat
        await new Promise(r => setTimeout(r, 1000));
        session = await ctx.runQuery(api.workflows.sandboxConvex.getSession, { sessionId });

        if (session?.status === "completed" || session?.status === "failed") {
          break;
        }
      }

      if (!session || session.status !== "completed") {
        return { success: false, sessionId, error: "Timeout or session failed" };
      }

      const output = (session.output as any)?.response || "";

      // Get session logs for persistence
      const sessionWithLogs = await ctx.runQuery(api.workflows.sandboxConvex.getActiveSessionForThread, {
        threadId: args.threadId,
      });

      // Filter and format logs for persistence (remove raw/technical output)
      const rawPatterns = [
        /^\d+\s*\|/, // Line numbers like "42 |"
        /JSON\.stringify|JSON\.parse/, // Code snippets
        /\.(ts|js|json|svelte):\d+/, // File:line references
        /at\s+\w+\s+\(/, // Stack traces
        /Error:|Exception:|throw\s+new/, // Error traces
        /Task IDs:|task-\d+/, // Internal task IDs
        /Bun v\d+|Node v\d+/, // Runtime info
        /Local Convex (error|exception)/i, // Internal Convex errors
        /body:\s*JSON|response\.(status|text)/, // HTTP code
        /await\s+\w+|async\s+function/, // Async code
      ];

      const validTypes = ['plan', 'thinking', 'task', 'search', 'source', 'file', 'tool', 'text', 'error'];

      const persistLogs = (sessionWithLogs?.logs || [])
        .filter((log: any) => {
          if (!log.type || !log.label) return false;
          if (!validTypes.includes(log.type)) return false;
          const label = log.label;
          for (const pattern of rawPatterns) {
            if (pattern.test(label)) return false;
          }
          return true;
        })
        .map((log: any) => ({
          type: log.type,
          label: log.label,
          status: log.status || 'complete',
          details: log.details,
          data: log.data,
        }));

      // Calculate generation time
      const generationTime = session.completedAt && session.createdAt
        ? session.completedAt - session.createdAt
        : undefined;

      // Save assistant response with session logs metadata
      if (output) {
        await ctx.runMutation(api.workflows.crudThreads.sendThreadMessage, {
          threadId: args.threadId,
          userId: args.userId,
          content: output,
          role: "assistant",
          metadata: persistLogs.length > 0 || generationTime ? {
            sessionLogs: persistLogs.length > 0 ? {
              logs: persistLogs,
              status: session.status,
            } : undefined,
            generationTime,
          } : undefined,
        });
      }

      return {
        success: true,
        sessionId,
        output,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  },
});

/** Start a new thread with initial message */
export const startThread = action({
  args: {
    userId: v.string(),
    content: v.string(),
    title: v.optional(v.string()),
    skillIds: v.optional(v.array(v.string())),
    orgId: v.optional(v.string()),
    boardId: v.optional(v.string()),
    // Sandbox config from main app (has env var access)
    sandboxConfig: v.optional(v.object({
      sandboxJwt: v.string(),
      gatewayUrl: v.string(),
      preCreatedSandbox: v.object({
        sandboxId: v.string(),
        sandboxUrl: v.string(),
        timings: v.any(),
        fromPool: v.boolean(),
        deletedKSAs: v.array(v.string()),
      }),
    })),
  },
  handler: async (ctx, args) => {
    // Create thread
    const threadId = await ctx.runMutation(api.workflows.crudThreads.createThread, {
      userId: args.userId,
      title: args.title || args.content.slice(0, 50),
      orgId: args.orgId,
      boardId: args.boardId,
    });

    // Send initial message (pass sandboxConfig if provided)
    const result = await ctx.runAction(api.workflows.agentThread.sendMessage, {
      threadId,
      userId: args.userId,
      content: args.content,
      skillIds: args.skillIds,
      sandboxConfig: args.sandboxConfig,
    });

    return {
      threadId,
      ...result,
    };
  },
});

/** Continue a conversation with context */
export const continueThread = action({
  args: {
    threadId: v.id("threads"),
    userId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Get thread to find associated skills
    const threads = await ctx.runQuery(api.workflows.crudThreads.listThreads, {
      userId: args.userId,
    });
    const thread = threads.find((t: Doc<"threads">) => t._id === args.threadId);
    
    // Get skills from board if associated
    const skillIds: string[] = [];
    if (thread?.boardId) {
      // Could fetch board skills here if needed
    }

    return await ctx.runAction(api.workflows.agentThread.sendMessage, {
      threadId: args.threadId,
      userId: args.userId,
      content: args.content,
      skillIds: skillIds.length ? skillIds : undefined,
    });
  },
});

// ============================================
// Thread Queries
// ============================================

/** Get thread with messages */
export const getThreadWithMessages = query({
  args: { threadId: v.id("threads"), userId: v.string() },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .collect();
    
    const thread = threads.find(t => t._id === args.threadId);
    if (!thread) return null;

    const messages = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .collect();

    return { ...thread, messages };
  },
});

/** List user's recent threads */
export const listRecentThreads = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit || 20);
  },
});
