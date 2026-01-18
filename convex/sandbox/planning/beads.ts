/**
 * Beads - Task Tracking
 *
 * CRUD operations for task tracking with CRDT support
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

export const create = mutation({
  args: {
    title: v.string(),
    type: v.union(
      v.literal("task"),
      v.literal("bug"),
      v.literal("feature"),
      v.literal("chore"),
      v.literal("epic")
    ),
    priority: v.optional(v.number()),
    description: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
    parentId: v.optional(v.id("beads")),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("beads", {
      title: args.title,
      type: args.type,
      status: "open",
      priority: args.priority ?? 2,
      description: args.description,
      labels: args.labels,
      parentId: args.parentId,
      threadId: args.threadId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("beads"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("blocked"),
        v.literal("closed")
      )
    ),
    priority: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
    blockedBy: v.optional(v.array(v.id("beads"))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(id, {
      ...filtered,
      updatedAt: Date.now(),
    });
  },
});

export const close = mutation({
  args: {
    id: v.id("beads"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "closed",
      closedAt: Date.now(),
      closeReason: args.reason,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// Queries
// ============================================

export const get = query({
  args: { id: v.id("beads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("blocked"),
        v.literal("closed")
      )
    ),
    type: v.optional(
      v.union(
        v.literal("task"),
        v.literal("bug"),
        v.literal("feature"),
        v.literal("chore"),
        v.literal("epic")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { status, type } = args;
    const limit = args.limit ?? 50;

    // Use index if status is specified, otherwise full table scan
    const items = status
      ? await ctx.db
          .query("beads")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(limit)
      : await ctx.db.query("beads").order("desc").take(limit);

    // Filter by type if specified (after index query)
    if (type) {
      return items.filter((i) => i.type === type);
    }

    return items;
  },
});

export const getReady = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Get all open tasks
    const open = await ctx.db
      .query("beads")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    // Filter out blocked tasks (those with unresolved blockedBy)
    const ready = [];
    for (const task of open) {
      if (task.blockedBy && task.blockedBy.length > 0) {
        // Check if all blockers are resolved
        const blockers = await Promise.all(
          task.blockedBy.map((id) => ctx.db.get(id))
        );
        const unresolvedBlockers = blockers.filter(
          (b) => b && b.status !== "closed"
        );
        if (unresolvedBlockers.length > 0) {
          continue; // Still blocked
        }
      }
      ready.push(task);
    }

    // Sort by priority (ascending = higher priority first)
    ready.sort((a, b) => a.priority - b.priority);

    return ready.slice(0, args.limit ?? 10);
  },
});

export const getByThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("beads")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});
