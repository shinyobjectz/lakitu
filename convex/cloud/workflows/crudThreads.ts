/**
 * Threads & Conversations CRUD
 * 
 * Threads: Chat-based interaction with agent (per user)
 * Conversations: Project-level message history (for board workflows)
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================
// Auth Helper
// ============================================

async function checkThreadAccess(ctx: QueryCtx | MutationCtx, threadId: Id<"threads">, userId: string) {
  const thread = await ctx.db.get(threadId);
  if (!thread) throw new Error("Thread not found");
  if (thread.userId !== userId) throw new Error("Unauthorized access to thread");
  return thread;
}

// ============================================
// Threads (Chat Interface)
// ============================================

/**
 * Plan item for procedural beads initialization.
 */
const planItemValidator = v.object({
  title: v.string(),
  type: v.optional(v.union(
    v.literal("task"),
    v.literal("bug"),
    v.literal("feature"),
    v.literal("chore"),
    v.literal("epic")
  )),
  priority: v.optional(v.number()),
  description: v.optional(v.string()),
  labels: v.optional(v.array(v.string())),
});

/** Create a new chat thread */
export const createThread = mutation({
  args: {
    userId: v.string(),
    boardId: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    title: v.optional(v.string()),
    orgId: v.optional(v.string()),
    /** Initial plan items to seed beads in the sandbox */
    initialPlan: v.optional(v.array(planItemValidator)),
  },
  handler: async (ctx, args) => {
    const threadId = await ctx.db.insert("threads", {
      userId: args.userId,
      orgId: args.orgId,
      boardId: args.boardId,
      workspaceId: args.workspaceId,
      title: args.title || "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Store initial plan in thread metadata if provided
    // The sandbox will read this and initialize beads
    if (args.initialPlan && args.initialPlan.length > 0) {
      // Add system message with plan
      await ctx.db.insert("threadMessages", {
        threadId,
        role: "assistant",
        content: `Plan initialized with ${args.initialPlan.length} tasks.`,
        createdAt: Date.now(),
        metadata: {
          type: "text",
          data: { initialPlan: args.initialPlan },
        },
      });
    }

    return threadId;
  },
});

/** List threads for a user */
export const listThreads = query({
  args: {
    userId: v.string(),
    orgId: v.optional(v.string()),
    boardId: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // If workspaceId is provided, use the workspace index for efficiency
    if (args.workspaceId) {
      const threads = await ctx.db
        .query("threads")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect();
      // Filter by userId for authorization
      return threads
        .filter(t => t.userId === args.userId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const threads = args.orgId
      ? await ctx.db
          .query("threads")
          .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
          .collect()
      : await ctx.db
          .query("threads")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect();

    if (args.boardId) {
      return threads.filter(t => t.boardId === args.boardId).sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return threads.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** List threads for a workspace (efficient indexed query) */
export const listWorkspaceThreads = query({
  args: {
    workspaceId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Filter by userId for authorization
    return threads
      .filter(t => t.userId === args.userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Get brand context for a thread (via workspace association) */
export const getThreadBrandContext = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread?.workspaceId) return null;

    // Note: This query runs in the component context, so we can't directly
    // access the main app's workspace/brand tables. Return what we have.
    // The main app should pass brand context via sandboxConfig.
    return {
      workspaceId: thread.workspaceId,
      // Brand context should be passed from main app - we just return workspace info
    };
  },
});

/** Get messages in a thread */
export const getThreadMessages = query({
  args: { threadId: v.id("threads"), userId: v.string() },
  handler: async (ctx, args) => {
    await checkThreadAccess(ctx, args.threadId, args.userId);
    return await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

/** Send a message to a thread */
export const sendThreadMessage = mutation({
  args: {
    threadId: v.id("threads"),
    userId: v.string(),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    metadata: v.optional(v.object({
      type: v.optional(v.union(
        v.literal("text"),
        v.literal("subagent"),
        v.literal("board_execution"),
        v.literal("frame_preview"),
        v.literal("artifact"),
        v.literal("session_logs")
      )),
      data: v.optional(v.any()),
      sessionLogs: v.optional(v.any()), // Embedded session logs for the message
      generationTime: v.optional(v.number()),
      thinking: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    await checkThreadAccess(ctx, args.threadId, args.userId);
    const messageId = await ctx.db.insert("threadMessages", {
      threadId: args.threadId,
      role: args.role,
      content: args.content,
      createdAt: Date.now(),
      metadata: args.metadata,
    });

    await ctx.db.patch(args.threadId, { updatedAt: Date.now() });
    return messageId;
  },
});

/** Delete a thread and its messages */
export const deleteThread = mutation({
  args: { threadId: v.id("threads"), userId: v.string() },
  handler: async (ctx, args) => {
    await checkThreadAccess(ctx, args.threadId, args.userId);
    
    const messages = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    await ctx.db.delete(args.threadId);
  },
});

// ============================================
// Conversations (Project-Level for Workflows)
// ============================================

/** Save a message to project conversation */
export const saveConversationMessage = mutation({
  args: {
    projectId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    let conversation = await ctx.db
      .query("agentConversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    
    if (!conversation) {
      const id = await ctx.db.insert("agentConversations", {
        projectId: args.projectId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      conversation = await ctx.db.get(id);
    }
    
    if (!conversation) throw new Error("Failed to create conversation");

    await ctx.db.patch(conversation._id, {
      messages: [...conversation.messages, {
        role: args.role,
        content: args.content,
        timestamp: Date.now(),
        metadata: args.metadata,
      }],
      updatedAt: Date.now(),
    });
  },
});

/** Get project conversation */
export const getConversation = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

/** Clear project conversation */
export const clearConversation = mutation({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("agentConversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (conversation) {
      await ctx.db.patch(conversation._id, {
        messages: [],
        updatedAt: Date.now(),
      });
    }
  },
});

// ============================================
// Internal Mutations for Subagent Progress
// (Called from sandbox via gateway)
// ============================================

/** Emit subagent progress to a thread (internal - called via gateway) */
export const emitSubagentProgress = internalMutation({
  args: {
    threadId: v.string(),
    subagentId: v.string(),
    name: v.string(),
    task: v.string(),
    status: v.union(
      v.literal("spawning"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    progress: v.optional(v.number()),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    children: v.optional(v.array(v.object({
      id: v.string(),
      type: v.union(
        v.literal("thinking"),
        v.literal("tool"),
        v.literal("search"),
        v.literal("file"),
        v.literal("complete"),
        v.literal("error")
      ),
      label: v.string(),
      status: v.union(v.literal("active"), v.literal("complete"), v.literal("error")),
      details: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    // Find or create the subagent progress message
    const existingMessage = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId as Id<"threads">))
      .filter((q) =>
        q.and(
          q.eq(q.field("metadata.type"), "subagent"),
          q.eq(q.field("metadata.data.subagentId"), args.subagentId)
        )
      )
      .first();

    const progressData = {
      subagentId: args.subagentId,
      name: args.name,
      task: args.task,
      status: args.status,
      progress: args.progress,
      result: args.result,
      error: args.error,
      children: args.children || [],
    };

    if (existingMessage) {
      // Update existing message
      await ctx.db.patch(existingMessage._id, {
        metadata: {
          type: "subagent" as const,
          data: progressData,
        },
      });
    } else {
      // Create new message
      await ctx.db.insert("threadMessages", {
        threadId: args.threadId as Id<"threads">,
        role: "assistant",
        content: `Subagent "${args.name}": ${args.task}`,
        createdAt: Date.now(),
        metadata: {
          type: "subagent" as const,
          data: progressData,
        },
      });
    }

    // Update thread timestamp
    await ctx.db.patch(args.threadId as Id<"threads">, { updatedAt: Date.now() });
  },
});

/** Emit board execution result to a thread (internal - called via gateway) */
export const emitBoardExecution = internalMutation({
  args: {
    threadId: v.string(),
    boardId: v.string(),
    cardId: v.string(),
    boardName: v.string(),
    stageName: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    artifacts: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      type: v.string(),
    }))),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find or create the board execution message
    const existingMessage = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId as Id<"threads">))
      .filter((q) =>
        q.and(
          q.eq(q.field("metadata.type"), "board_execution"),
          q.eq(q.field("metadata.data.cardId"), args.cardId)
        )
      )
      .first();

    const executionData = {
      boardId: args.boardId,
      cardId: args.cardId,
      boardName: args.boardName,
      stageName: args.stageName,
      status: args.status,
      artifacts: args.artifacts,
      summary: args.summary,
      error: args.error,
    };

    if (existingMessage) {
      await ctx.db.patch(existingMessage._id, {
        metadata: {
          type: "board_execution" as const,
          data: executionData,
        },
      });
    } else {
      await ctx.db.insert("threadMessages", {
        threadId: args.threadId as Id<"threads">,
        role: "assistant",
        content: `Running board "${args.boardName}" - ${args.stageName}`,
        createdAt: Date.now(),
        metadata: {
          type: "board_execution" as const,
          data: executionData,
        },
      });
    }

    await ctx.db.patch(args.threadId as Id<"threads">, { updatedAt: Date.now() });
  },
});

/** Emit frame preview to a thread (internal - called via gateway) */
export const emitFramePreview = internalMutation({
  args: {
    threadId: v.string(),
    frameId: v.string(),
    workspaceId: v.optional(v.string()),
    name: v.string(),
    code: v.string(),
    codeType: v.union(
      v.literal("html"),
      v.literal("svelte"),
      v.literal("htmx"),
      v.literal("tailwind")
    ),
    dimensions: v.object({
      width: v.number(),
      height: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("threadMessages", {
      threadId: args.threadId as Id<"threads">,
      role: "assistant",
      content: `Created frame: ${args.name}`,
      createdAt: Date.now(),
      metadata: {
        type: "frame_preview" as const,
        data: {
          frameId: args.frameId,
          workspaceId: args.workspaceId,
          name: args.name,
          code: args.code,
          codeType: args.codeType,
          dimensions: args.dimensions,
        },
      },
    });

    await ctx.db.patch(args.threadId as Id<"threads">, { updatedAt: Date.now() });
  },
});

/** Emit session logs (CoT) to a thread (internal - called via gateway when agent completes a response) */
export const emitSessionLogs = internalMutation({
  args: {
    threadId: v.string(),
    messageId: v.optional(v.string()), // Associate with specific assistant message
    logs: v.array(v.object({
      type: v.union(
        v.literal("plan"),
        v.literal("thinking"),
        v.literal("task"),
        v.literal("search"),
        v.literal("source"),
        v.literal("file"),
        v.literal("tool"),
        v.literal("text"),
        v.literal("error")
      ),
      label: v.string(),
      status: v.optional(v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("complete"),
        v.literal("error")
      )),
      details: v.optional(v.string()),
      data: v.optional(v.any()),
    })),
    status: v.union(
      v.literal("pending"),
      v.literal("starting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    // If messageId provided, update that message's metadata
    if (args.messageId) {
      const message = await ctx.db.get(args.messageId as Id<"threadMessages">);
      if (message) {
        const existingMetadata = message.metadata || {};
        await ctx.db.patch(message._id, {
          metadata: {
            ...existingMetadata,
            sessionLogs: {
              logs: args.logs,
              status: args.status,
            },
          },
        });
        return;
      }
    }

    // Otherwise create a new session_logs message
    await ctx.db.insert("threadMessages", {
      threadId: args.threadId as Id<"threads">,
      role: "assistant",
      content: "", // Empty content - the logs are in metadata
      createdAt: Date.now(),
      metadata: {
        type: "session_logs" as const,
        data: {
          logs: args.logs,
          status: args.status,
        },
      },
    });

    await ctx.db.patch(args.threadId as Id<"threads">, { updatedAt: Date.now() });
  },
});

/** Emit artifact to a thread (internal - called via gateway when agent saves artifact) */
export const emitArtifact = internalMutation({
  args: {
    threadId: v.string(),
    artifactId: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("markdown"),
      v.literal("pdf"),
      v.literal("code"),
      v.literal("image"),
      v.literal("json"),
      v.literal("csv"),
      v.literal("text")
    ),
    size: v.optional(v.number()),
    url: v.optional(v.string()),
    preview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("threadMessages", {
      threadId: args.threadId as Id<"threads">,
      role: "assistant",
      content: `Saved artifact: ${args.name}`,
      createdAt: Date.now(),
      metadata: {
        type: "artifact" as const,
        data: {
          artifactId: args.artifactId,
          name: args.name,
          type: args.type,
          size: args.size,
          url: args.url,
          preview: args.preview,
        },
      },
    });

    await ctx.db.patch(args.threadId as Id<"threads">, { updatedAt: Date.now() });
  },
});

// ============================================
// Thread Artifacts (for sandbox artifact storage)
// ============================================

/** Save an artifact to a thread (internal - called via gateway from sandbox) */
export const saveThreadArtifact = internalMutation({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.string()),
    artifact: v.object({
      type: v.string(),
      name: v.string(),
      content: v.string(),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const artifactId = await ctx.db.insert("threadArtifacts", {
      threadId: args.threadId as Id<"threads">,
      sessionId: args.sessionId as Id<"convexSandboxSessions"> | undefined,
      type: args.artifact.type,
      name: args.artifact.name,
      content: args.artifact.content,
      metadata: args.artifact.metadata,
      createdAt: Date.now(),
    });

    // Also emit as a thread message for visibility
    await ctx.db.insert("threadMessages", {
      threadId: args.threadId as Id<"threads">,
      role: "assistant",
      content: `Saved artifact: ${args.artifact.name}`,
      createdAt: Date.now(),
      metadata: {
        type: "artifact" as const,
        data: {
          artifactId,
          name: args.artifact.name,
          type: args.artifact.type,
        },
      },
    });

    await ctx.db.patch(args.threadId as Id<"threads">, { updatedAt: Date.now() });

    return artifactId;
  },
});

/** List artifacts for a thread */
export const listThreadArtifacts = query({
  args: {
    threadId: v.id("threads"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await checkThreadAccess(ctx, args.threadId, args.userId);

    const artifacts = await ctx.db
      .query("threadArtifacts")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .collect();

    return artifacts.map(a => ({
      id: a._id,
      name: a.name,
      type: a.type,
      createdAt: a.createdAt,
    }));
  },
});

/** Get a thread artifact by ID */
export const getThreadArtifact = query({
  args: {
    artifactId: v.id("threadArtifacts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.artifactId);
  },
});

/** List thread artifacts (internal - called via gateway from sandbox) */
export const listThreadArtifactsInternal = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db
      .query("threadArtifacts")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId as Id<"threads">))
      .collect();

    return artifacts.map(a => ({
      id: a._id,
      name: a.name,
      type: a.type,
      createdAt: a.createdAt,
    }));
  },
});

// ============================================
// Debug (Internal Only)
// ============================================

/** Debug query to inspect thread without auth - for CLI debugging only */
export const debugThread = internalMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return { error: "Thread not found" };

    const messages = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .collect();

    // Check for related sandbox sessions by projectId pattern "thread-{threadId}"
    const projectId = `thread-${args.threadId}`;
    const sessions = await ctx.db
      .query("convexSandboxSessions")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .order("desc")
      .collect();

    return {
      thread,
      messageCount: messages.length,
      messages: messages.map(m => ({
        id: m._id,
        role: m.role,
        content: m.content?.slice(0, 200) + (m.content?.length > 200 ? '...' : ''),
        type: m.metadata?.type,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
      sessions: sessions.map(s => ({
        id: s._id,
        status: s.status,
        sandboxId: s.sandboxId,
        error: s.error,
        output: s.output,
        allowedKSAs: (s.config as any)?.allowedKSAs,
        createdAt: new Date(s.createdAt).toISOString(),
      })),
    };
  },
});
