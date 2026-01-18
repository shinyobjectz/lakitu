/**
 * Artifacts - Persistent Outputs
 *
 * Store and retrieve artifacts produced by the agent
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

export const save = mutation({
  args: {
    name: v.string(),
    type: v.string(),
    path: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    size: v.number(),
    threadId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check if artifact with this name already exists
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      // Update existing artifact
      await ctx.db.patch(existing._id, {
        type: args.type,
        path: args.path,
        content: args.content,
        storageId: args.storageId,
        size: args.size,
        metadata: args.metadata,
      });
      return existing._id;
    }

    // Create new artifact
    return await ctx.db.insert("artifacts", {
      name: args.name,
      type: args.type,
      path: args.path,
      content: args.content,
      storageId: args.storageId,
      size: args.size,
      threadId: args.threadId,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

// ============================================
// Queries
// ============================================

export const get = query({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getByThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});
