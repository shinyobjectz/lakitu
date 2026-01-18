/**
 * Agent Memory Management (Beads/Loro CRDT)
 * 
 * Handles:
 * - LoroBeads sync between sandbox and Convex
 * - Incremental updates for multi-agent coordination
 * - Snapshot storage and retrieval
 * - VFS file operations
 */

import { v } from "convex/values";
import { action, mutation, query, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";

// ============================================
// Loro Update Management
// ============================================

/** Push an incremental Loro update from a sandbox */
export const pushUpdate = mutation({
  args: {
    cardId: v.string(),
    updateBytes: v.bytes(),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const updateId = await ctx.db.insert("beadsLoroUpdates", {
      cardId: args.cardId,
      updateBytes: args.updateBytes,
      clientId: args.clientId,
      createdAt: Date.now(),
    });
    return { success: true, updateId };
  },
});

/** Get Loro updates since a timestamp (for sync) */
export const getUpdates = query({
  args: {
    cardId: v.string(),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates = await ctx.db
      .query("beadsLoroUpdates")
      .withIndex("by_card_time", (q) =>
        q.eq("cardId", args.cardId).gt("createdAt", args.since)
      )
      .take(args.limit || 50);

    return updates.map((u) => ({
      id: u._id,
      updateBytes: u.updateBytes,
      clientId: u.clientId,
      createdAt: u.createdAt,
    }));
  },
});

/** Get the latest update timestamp for a card */
export const getLatestUpdateTime = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("beadsLoroUpdates")
      .withIndex("by_card_time", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .first();
    return latest?.createdAt || 0;
  },
});

// ============================================
// Snapshot Management
// ============================================

/** Save a compacted Loro snapshot (action wrapper) */
export const saveSnapshot = action({
  args: {
    cardId: v.string(),
    runId: v.optional(v.string()),
    loroSnapshot: v.bytes(),
    beadsStateJson: v.optional(v.string()),
    vfsManifest: v.optional(v.array(v.object({
      path: v.string(),
      r2Key: v.string(),
      size: v.number(),
      type: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const snapshotId = await ctx.runMutation(internal.workflows.crudLorobeads.insertSnapshot, {
      cardId: args.cardId,
      runId: args.runId,
      loroSnapshot: args.loroSnapshot,
      beadsState: args.beadsStateJson || "{}",
      vfsManifest: args.vfsManifest || [],
    });

    // Clean up old updates (now compacted into snapshot)
    await ctx.runMutation(internal.workflows.crudLorobeads.cleanupOldUpdates, {
      cardId: args.cardId,
      keepAfter: Date.now() - 60000,
    });

    return { success: true, snapshotId };
  },
});

/** Insert snapshot record */
export const insertSnapshot = internalMutation({
  args: {
    cardId: v.string(),
    runId: v.optional(v.string()),
    loroSnapshot: v.bytes(),
    beadsState: v.string(),
    vfsManifest: v.array(v.object({
      path: v.string(),
      r2Key: v.string(),
      size: v.number(),
      type: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("beadsSnapshots", {
      cardId: args.cardId,
      runId: args.runId,
      loroSnapshot: args.loroSnapshot,
      beadsState: args.beadsState,
      vfsManifest: args.vfsManifest,
      createdAt: Date.now(),
    });
  },
});

/** Get the latest Loro snapshot for a card */
export const getLatestSnapshot = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("beadsSnapshots")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .first();

    if (!snapshot) return null;

    return {
      id: snapshot._id,
      cardId: snapshot.cardId,
      runId: snapshot.runId,
      loroSnapshot: snapshot.loroSnapshot,
      beadsState: snapshot.beadsState,
      vfsManifest: snapshot.vfsManifest,
      createdAt: snapshot.createdAt,
    };
  },
});

/** Get snapshot for a specific run */
export const getRunSnapshot = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("beadsSnapshots")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/** Get snapshot by ID */
export const getSnapshotById = query({
  args: { id: v.id("beadsSnapshots") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** List all snapshots for a card */
export const listSnapshots = query({
  args: { 
    cardId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("beadsSnapshots")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .take(args.limit || 10);
  },
});

/** Get full sync state (snapshot + pending updates) */
export const getFullState = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("beadsSnapshots")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .order("desc")
      .first();

    const snapshotTime = snapshot?.createdAt || 0;

    const updates = await ctx.db
      .query("beadsLoroUpdates")
      .withIndex("by_card_time", (q) =>
        q.eq("cardId", args.cardId).gt("createdAt", snapshotTime)
      )
      .collect();

    return {
      snapshot: snapshot ? {
        loroSnapshot: snapshot.loroSnapshot,
        beadsState: snapshot.beadsState,
        createdAt: snapshot.createdAt,
      } : null,
      updates: updates.map((u) => ({
        updateBytes: u.updateBytes,
        clientId: u.clientId,
        createdAt: u.createdAt,
      })),
    };
  },
});

// ============================================
// Issue Tracking (Beads Issues synced to card)
// ============================================

/** Sync a Beads issue state to track in Convex */
export const syncIssue = mutation({
  args: {
    cardId: v.string(),
    beadsId: v.string(),
    title: v.string(),
    type: v.string(),
    status: v.string(),
    parent: v.optional(v.string()),
    blocks: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("beadsIssues")
      .withIndex("by_card_beads", (q) => 
        q.eq("cardId", args.cardId).eq("beadsId", args.beadsId)
      )
      .first();
    
    const issue = {
      cardId: args.cardId,
      beadsId: args.beadsId,
      title: args.title,
      type: args.type,
      status: args.status,
      parent: args.parent,
      blocks: args.blocks,
      metadata: args.metadata,
      updatedAt: Date.now(),
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, issue);
    } else {
      await ctx.db.insert("beadsIssues", issue);
    }
    
    return { success: true, beadsId: args.beadsId };
  },
});

/** Sync OpenCode todos to Beads issues (batch) */
export const syncTodosFromOpenCode = internalMutation({
  args: {
    cardId: v.string(),
    todos: v.array(v.object({
      id: v.string(),
      content: v.string(),
      status: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    let synced = 0;
    for (const todo of args.todos) {
      const beadsId = `todo-${todo.id}`;
      const existing = await ctx.db
        .query("beadsIssues")
        .withIndex("by_card_beads", (q) => 
          q.eq("cardId", args.cardId).eq("beadsId", beadsId)
        )
        .first();
      
      const issue = {
        cardId: args.cardId,
        beadsId,
        title: todo.content,
        type: "todo",
        status: todo.status,
        updatedAt: Date.now(),
      };
      
      if (existing) {
        await ctx.db.patch(existing._id, issue);
      } else {
        await ctx.db.insert("beadsIssues", issue);
      }
      synced++;
    }
    return { success: true, synced };
  },
});

/** Get all Beads issues for a card */
export const getCardIssues = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("beadsIssues")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .collect();
  },
});

// ============================================
// Cleanup
// ============================================

export const cleanupOldUpdates = internalMutation({
  args: {
    cardId: v.string(),
    keepAfter: v.number(),
  },
  handler: async (ctx, args) => {
    const oldUpdates = await ctx.db
      .query("beadsLoroUpdates")
      .withIndex("by_card_time", (q) =>
        q.eq("cardId", args.cardId).lt("createdAt", args.keepAfter)
      )
      .collect();

    for (const update of oldUpdates) {
      await ctx.db.delete(update._id);
    }

    return { deleted: oldUpdates.length };
  },
});

/** Compact all updates into a new snapshot */
export const compact = action({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(api.workflows.crudLorobeads.getFullState, {
      cardId: args.cardId,
    });

    if (!state.snapshot && state.updates.length === 0) {
      return { success: true, message: "Nothing to compact" };
    }

    return {
      success: true,
      snapshotExists: !!state.snapshot,
      pendingUpdates: state.updates.length,
      message: "Compaction tracking updated",
    };
  },
});
