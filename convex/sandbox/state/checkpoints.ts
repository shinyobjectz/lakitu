/**
 * Checkpoints - State Persistence for Chained Agent Runs
 *
 * Save and restore agent state for long-running tasks that
 * exceed sandbox timeout limits.
 */

import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Types
// ============================================

const fileSnapshotValidator = v.object({
  path: v.string(),
  contentHash: v.string(),
  size: v.number(),
  lastModified: v.number(),
});

const beadSnapshotValidator = v.object({
  id: v.string(),
  title: v.string(),
  status: v.string(),
  type: v.string(),
  priority: v.number(),
});

const messageValidator = v.object({
  role: v.string(),
  content: v.string(),
  timestamp: v.optional(v.number()),
});

// ============================================
// Mutations
// ============================================

/**
 * Create a checkpoint
 */
export const create = mutation({
  args: {
    sessionId: v.string(),
    threadId: v.string(),
    iteration: v.number(),
    // Compressed conversation history
    messageHistory: v.array(messageValidator),
    // Files touched so far
    fileState: v.array(fileSnapshotValidator),
    // Task tracking state
    beadsState: v.array(beadSnapshotValidator),
    // Artifacts saved (references)
    artifactsProduced: v.array(v.string()),
    // What to do next
    nextTask: v.string(),
    // Why we're checkpointing
    reason: v.union(
      v.literal("timeout"),
      v.literal("token_limit"),
      v.literal("manual"),
      v.literal("error_recovery")
    ),
    // Additional context
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Mark previous checkpoints as superseded
    const previous = await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    for (const checkpoint of previous) {
      await ctx.db.patch(checkpoint._id, { status: "superseded" });
    }

    // Create new checkpoint
    return await ctx.db.insert("checkpoints", {
      sessionId: args.sessionId,
      threadId: args.threadId,
      iteration: args.iteration,
      messageHistory: args.messageHistory,
      fileState: args.fileState,
      beadsState: args.beadsState,
      artifactsProduced: args.artifactsProduced,
      nextTask: args.nextTask,
      reason: args.reason,
      status: "active",
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

/**
 * Mark checkpoint as restored (used)
 */
export const markRestored = internalMutation({
  args: {
    id: v.id("checkpoints"),
    newThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "restored",
      restoredAt: Date.now(),
      restoredToThread: args.newThreadId,
    });
  },
});

/**
 * Mark checkpoint as completed (task finished)
 */
export const markCompleted = mutation({
  args: {
    sessionId: v.string(),
    finalResult: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.patch(checkpoint._id, {
        status: "completed",
        completedAt: Date.now(),
        finalResult: args.finalResult,
      });
    }

    return { updated: checkpoints.length };
  },
});

/**
 * Mark checkpoint as failed
 */
export const markFailed = mutation({
  args: {
    id: v.id("checkpoints"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      failedAt: Date.now(),
      error: args.error,
    });
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get the latest active checkpoint for a session
 */
export const getLatest = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .order("desc")
      .first();
  },
});

/**
 * Get checkpoint by ID
 */
export const get = query({
  args: { id: v.id("checkpoints") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Internal: Get checkpoint by ID (for internal actions)
 */
export const internalGet = internalQuery({
  args: { id: v.id("checkpoints") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get all checkpoints for a session (history)
 */
export const getHistory = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

/**
 * Get checkpoint stats
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("checkpoints").collect();

    const byStatus = {
      active: 0,
      restored: 0,
      completed: 0,
      failed: 0,
      superseded: 0,
    };

    const byReason = {
      timeout: 0,
      token_limit: 0,
      manual: 0,
      error_recovery: 0,
    };

    for (const cp of all) {
      byStatus[cp.status as keyof typeof byStatus]++;
      byReason[cp.reason as keyof typeof byReason]++;
    }

    return {
      total: all.length,
      byStatus,
      byReason,
      averageIteration:
        all.length > 0
          ? all.reduce((sum, cp) => sum + cp.iteration, 0) / all.length
          : 0,
    };
  },
});

// ============================================
// Internal Mutations
// ============================================

/**
 * Create checkpoint from current state
 * Called internally during timeout handling
 */
export const createFromCurrentState = internalMutation({
  args: {
    threadId: v.string(),
    nextTask: v.string(),
    iteration: v.number(),
  },
  handler: async (ctx, args) => {
    // Get current file state
    const fileStates = await ctx.db.query("fileState").collect();
    const fileState = fileStates.map((f) => ({
      path: f.path,
      contentHash: f.contentHash || "",
      size: f.size || 0,
      lastModified: f.lastAccessAt,
    }));

    // Get current beads state
    const beads = await ctx.db.query("beads").collect();
    const beadsState = beads.map((b) => ({
      id: b._id,
      title: b.title,
      status: b.status,
      type: b.type,
      priority: b.priority,
    }));

    // Get artifacts produced
    const artifacts = await ctx.db.query("artifacts").collect();
    const artifactsProduced = artifacts.map((a) => a.name);

    // Create session ID based on thread
    const sessionId = `session_${args.threadId}`;

    // Create checkpoint
    return await ctx.db.insert("checkpoints", {
      sessionId,
      threadId: args.threadId,
      iteration: args.iteration,
      messageHistory: [], // Will be populated by agent SDK
      fileState,
      beadsState,
      artifactsProduced,
      nextTask: args.nextTask,
      reason: "timeout",
      status: "active",
      createdAt: Date.now(),
    });
  },
});

// ============================================
// Cleanup
// ============================================

/**
 * Clean up old checkpoints
 */
export const cleanup = mutation({
  args: {
    olderThanMs: v.optional(v.number()),
    keepCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanMs ?? 7 * 24 * 3600000); // 7 days default

    const old = await ctx.db
      .query("checkpoints")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();

    let deleted = 0;
    for (const checkpoint of old) {
      // Skip completed if requested
      if (args.keepCompleted && checkpoint.status === "completed") {
        continue;
      }
      await ctx.db.delete(checkpoint._id);
      deleted++;
    }

    return { deleted };
  },
});
