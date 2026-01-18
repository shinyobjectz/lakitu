/**
 * Verification - Queries and Mutations
 *
 * Store and retrieve verification results.
 * Actions that run actual verification are in verification.actions.ts
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations (store verification results)
// ============================================

/**
 * Store verification result for an edit
 */
export const storeResult = mutation({
  args: {
    editId: v.optional(v.id("editHistory")),
    path: v.string(),
    success: v.boolean(),
    checks: v.array(
      v.object({
        name: v.string(),
        success: v.boolean(),
        output: v.optional(v.string()),
        durationMs: v.optional(v.number()),
      })
    ),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("verificationResults", {
      editId: args.editId,
      path: args.path,
      success: args.success,
      checks: args.checks,
      threadId: args.threadId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Store test suite baseline
 */
export const storeBaseline = mutation({
  args: {
    threadId: v.string(),
    result: v.any(), // TestSuiteResult
  },
  handler: async (ctx, args) => {
    // Remove old baselines for this thread
    const existing = await ctx.db
      .query("testBaselines")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const baseline of existing) {
      await ctx.db.delete(baseline._id);
    }

    return await ctx.db.insert("testBaselines", {
      threadId: args.threadId,
      result: args.result,
      createdAt: Date.now(),
    });
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get verification results for a file
 */
export const getResultsForFile = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("verificationResults")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .order("desc")
      .take(10);
  },
});

/**
 * Get test baseline for thread
 */
export const getBaseline = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testBaselines")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .first();
  },
});
