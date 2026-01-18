/**
 * Sync - Cloud ↔ Sandbox Synchronization
 *
 * Queue items for sync to cloud Convex.
 * Handle artifact uploads, state snapshots, and result reporting.
 */

import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

/**
 * Queue an item for sync to cloud
 */
export const queueSync = mutation({
  args: {
    type: v.union(
      v.literal("artifact"),
      v.literal("bead"),
      v.literal("decision"),
      v.literal("checkpoint"),
      v.literal("result")
    ),
    itemId: v.string(),
    priority: v.optional(v.number()), // 0 = highest
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncQueue", {
      type: args.type,
      itemId: args.itemId,
      status: "pending",
      priority: args.priority ?? 5,
      metadata: args.metadata,
      createdAt: Date.now(),
      attempts: 0,
    });
  },
});

/**
 * Mark sync item as in progress
 */
export const markInProgress = internalMutation({
  args: { id: v.id("syncQueue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "in_progress",
      startedAt: Date.now(),
    });
  },
});

/**
 * Mark sync item as completed
 */
export const markCompleted = internalMutation({
  args: {
    id: v.id("syncQueue"),
    cloudId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "completed",
      completedAt: Date.now(),
      cloudId: args.cloudId,
    });
  },
});

/**
 * Mark sync item as failed
 */
export const markFailed = internalMutation({
  args: {
    id: v.id("syncQueue"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) return;

    await ctx.db.patch(args.id, {
      status: item.attempts >= 3 ? "failed" : "pending",
      lastError: args.error,
      lastAttemptAt: Date.now(),
      attempts: item.attempts + 1,
    });
  },
});

/**
 * Clear completed sync items
 */
export const clearCompleted = mutation({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanMs ?? 3600000); // 1 hour default

    const completed = await ctx.db
      .query("syncQueue")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    let deleted = 0;
    for (const item of completed) {
      if (item.completedAt && item.completedAt < cutoff) {
        await ctx.db.delete(item._id);
        deleted++;
      }
    }

    return { deleted };
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get pending sync items
 */
export const getPending = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("syncQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(args.limit ?? 50);

    // Sort by priority (ascending)
    return items.sort((a, b) => a.priority - b.priority);
  },
});

/**
 * Get sync queue status
 */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("syncQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const inProgress = await ctx.db
      .query("syncQueue")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    const failed = await ctx.db
      .query("syncQueue")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    return {
      pending: pending.length,
      inProgress: inProgress.length,
      failed: failed.length,
      oldestPending: pending[0]?.createdAt,
    };
  },
});

/**
 * Get failed sync items for retry
 */
export const getFailed = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("syncQueue")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();
  },
});

/**
 * Get sync history for an item
 */
export const getByItemId = query({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syncQueue")
      .filter((q) => q.eq(q.field("itemId"), args.itemId))
      .collect();
  },
});
