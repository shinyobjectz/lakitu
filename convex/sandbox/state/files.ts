/**
 * State - File State Tracking
 *
 * Explicit state management with diff-driven architecture.
 * Tracks file changes, generates diffs, and supports rollback.
 */

import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

/**
 * Track a file access (read or write)
 */
export const trackFileAccess = mutation({
  args: {
    path: v.string(),
    operation: v.union(v.literal("read"), v.literal("write"), v.literal("edit")),
    contentHash: v.optional(v.string()),
    size: v.optional(v.number()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get existing file state
    const existing = await ctx.db
      .query("fileState")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        lastOperation: args.operation,
        lastAccessAt: Date.now(),
        contentHash: args.contentHash ?? existing.contentHash,
        size: args.size ?? existing.size,
        accessCount: existing.accessCount + 1,
      });
      return existing._id;
    }

    // Create new file state entry
    return await ctx.db.insert("fileState", {
      path: args.path,
      lastOperation: args.operation,
      lastAccessAt: Date.now(),
      contentHash: args.contentHash,
      size: args.size,
      threadId: args.threadId,
      accessCount: 1,
      createdAt: Date.now(),
    });
  },
});

/**
 * Record a file edit with diff
 */
export const recordEdit = mutation({
  args: {
    path: v.string(),
    oldContent: v.string(),
    newContent: v.string(),
    diff: v.string(),
    verified: v.boolean(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get file state
    const fileState = await ctx.db
      .query("fileState")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();

    // Insert edit history
    const editId = await ctx.db.insert("editHistory", {
      path: args.path,
      fileStateId: fileState?._id,
      oldContentHash: simpleHash(args.oldContent),
      newContentHash: simpleHash(args.newContent),
      diff: args.diff,
      verified: args.verified,
      threadId: args.threadId,
      createdAt: Date.now(),
    });

    // Update file state
    if (fileState) {
      await ctx.db.patch(fileState._id, {
        lastOperation: "edit",
        lastAccessAt: Date.now(),
        contentHash: simpleHash(args.newContent),
        size: args.newContent.length,
        lastEditId: editId,
      });
    }

    return editId;
  },
});

/**
 * Mark a file as rolled back
 */
export const rollback = mutation({
  args: {
    editId: v.id("editHistory"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const edit = await ctx.db.get(args.editId);
    if (!edit) {
      throw new Error("Edit not found");
    }

    await ctx.db.patch(args.editId, {
      rolledBack: true,
      rollbackReason: args.reason,
      rolledBackAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get file state by path
 */
export const getByPath = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileState")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
  },
});

/**
 * Get all files accessed in a thread
 */
export const getByThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileState")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

/**
 * Get edit history for a file
 */
export const getEditHistory = query({
  args: {
    path: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("editHistory")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

/**
 * Get recent edits across all files
 */
export const getRecentEdits = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("editHistory")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Check if a file has changed since a given hash
 */
export const hasChanged = query({
  args: {
    path: v.string(),
    expectedHash: v.string(),
  },
  handler: async (ctx, args) => {
    const fileState = await ctx.db
      .query("fileState")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();

    if (!fileState) {
      return { changed: true, reason: "File not tracked" };
    }

    if (fileState.contentHash !== args.expectedHash) {
      return {
        changed: true,
        reason: "Content hash mismatch",
        currentHash: fileState.contentHash,
      };
    }

    return { changed: false };
  },
});

// ============================================
// Internal Mutations
// ============================================

/**
 * Restore file state from a checkpoint
 */
export const restoreFromCheckpoint = internalMutation({
  args: {
    checkpointId: v.id("checkpoints"),
  },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${args.checkpointId} not found`);
    }

    // Clear existing file state
    const existingStates = await ctx.db.query("fileState").collect();
    for (const state of existingStates) {
      await ctx.db.delete(state._id);
    }

    // Restore file states from checkpoint
    for (const file of checkpoint.fileState) {
      await ctx.db.insert("fileState", {
        path: file.path,
        lastOperation: "read",
        lastAccessAt: file.lastModified,
        contentHash: file.contentHash,
        size: file.size,
        accessCount: 1,
        createdAt: Date.now(),
      });
    }

    // Restore beads state
    // Note: This creates new beads, doesn't update existing ones
    // In a real implementation, you'd want to sync with existing beads
    for (const bead of checkpoint.beadsState) {
      const existing = await ctx.db
        .query("beads")
        .filter((q) => q.eq(q.field("title"), bead.title))
        .first();

      if (!existing) {
        await ctx.db.insert("beads", {
          title: bead.title,
          type: bead.type as any,
          status: bead.status as any,
          priority: bead.priority,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    return { restored: true, checkpointId: args.checkpointId };
  },
});

// ============================================
// Internal Mutation Wrappers (for tools)
// ============================================

/**
 * Internal version of trackFileAccess for tool use
 */
export const internalTrackFileAccess = internalMutation({
  args: {
    path: v.string(),
    operation: v.union(v.literal("read"), v.literal("write"), v.literal("edit")),
    contentHash: v.optional(v.string()),
    size: v.optional(v.number()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fileState")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastOperation: args.operation,
        lastAccessAt: Date.now(),
        contentHash: args.contentHash ?? existing.contentHash,
        size: args.size ?? existing.size,
        accessCount: existing.accessCount + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("fileState", {
      path: args.path,
      lastOperation: args.operation,
      lastAccessAt: Date.now(),
      contentHash: args.contentHash,
      size: args.size,
      threadId: args.threadId,
      accessCount: 1,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal version of recordEdit for tool use
 */
export const internalRecordEdit = internalMutation({
  args: {
    path: v.string(),
    oldContent: v.string(),
    newContent: v.string(),
    diff: v.string(),
    verified: v.boolean(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fileState = await ctx.db
      .query("fileState")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();

    const editId = await ctx.db.insert("editHistory", {
      path: args.path,
      fileStateId: fileState?._id,
      oldContentHash: simpleHash(args.oldContent),
      newContentHash: simpleHash(args.newContent),
      diff: args.diff,
      verified: args.verified,
      threadId: args.threadId,
      createdAt: Date.now(),
    });

    if (fileState) {
      await ctx.db.patch(fileState._id, {
        lastOperation: "edit",
        lastAccessAt: Date.now(),
        contentHash: simpleHash(args.newContent),
        size: args.newContent.length,
        lastEditId: editId,
      });
    }

    return editId;
  },
});

// ============================================
// Helpers
// ============================================

/**
 * Simple hash function for content comparison
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
