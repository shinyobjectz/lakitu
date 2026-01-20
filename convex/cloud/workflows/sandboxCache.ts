/**
 * Sandbox Caching
 *
 * Manage E2B sandbox state caching for fast startup.
 * E2B supports 30-day cache TTL for sandbox snapshots.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";

// ============================================================================
// Types
// ============================================================================

/**
 * Cached sandbox metadata.
 */
export interface SandboxCacheEntry {
  cacheId: string;
  templateId: string;
  checkpointId?: string;
  state: "creating" | "ready" | "expired";
  createdAt: number;
  expiresAt: number;
  config?: Record<string, unknown>;
}

// E2B sandbox cache TTL (30 days in ms)
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// Queries
// ============================================================================

/**
 * Get a cached sandbox by configuration hash.
 */
export const getCached = query({
  args: {
    templateId: v.string(),
    configHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SandboxCacheEntry | null> => {
    const now = Date.now();

    // Find a ready, non-expired cache entry
    const entries = await ctx.db
      .query("sandboxCache")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .filter((q) => q.eq(q.field("state"), "ready"))
      .collect();

    // Find matching entry that hasn't expired
    for (const entry of entries) {
      if (entry.expiresAt > now) {
        // If configHash provided, check it matches
        if (args.configHash && entry.configHash !== args.configHash) {
          continue;
        }
        return {
          cacheId: entry._id,
          templateId: entry.templateId,
          checkpointId: entry.checkpointId,
          state: entry.state,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          config: entry.config,
        };
      }
    }

    return null;
  },
});

/**
 * List all cached sandboxes.
 */
export const listCached = query({
  args: {
    templateId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const now = Date.now();

    const query = args.templateId
      ? ctx.db
          .query("sandboxCache")
          .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      : ctx.db.query("sandboxCache");

    const entries = await query.take(limit);

    return entries.map((entry) => ({
      cacheId: entry._id,
      templateId: entry.templateId,
      checkpointId: entry.checkpointId,
      state: entry.expiresAt > now ? entry.state : "expired",
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      config: entry.config,
    }));
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new cache entry when sandbox is checkpointed.
 */
export const createCacheEntry = mutation({
  args: {
    templateId: v.string(),
    checkpointId: v.string(),
    configHash: v.optional(v.string()),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("sandboxCache", {
      templateId: args.templateId,
      checkpointId: args.checkpointId,
      configHash: args.configHash,
      config: args.config,
      state: "ready",
      createdAt: now,
      expiresAt: now + CACHE_TTL_MS,
    });
  },
});

/**
 * Mark a cache entry as used (touch).
 * Optionally extends TTL.
 */
export const touchCacheEntry = mutation({
  args: {
    cacheId: v.id("sandboxCache"),
    extendTtl: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.cacheId);
    if (!entry) return null;

    const updates: Record<string, unknown> = {
      lastUsedAt: Date.now(),
    };

    // Optionally extend TTL
    if (args.extendTtl) {
      updates.expiresAt = Date.now() + CACHE_TTL_MS;
    }

    await ctx.db.patch(args.cacheId, updates);
    return { success: true };
  },
});

/**
 * Invalidate a cache entry.
 */
export const invalidateCacheEntry = mutation({
  args: { cacheId: v.id("sandboxCache") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cacheId, {
      state: "expired",
    });
  },
});

/**
 * Clean up expired cache entries.
 */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    const expired = await ctx.db
      .query("sandboxCache")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const entry of expired) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: expired.length };
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Check if a checkpoint is still valid in E2B.
 */
export const getCheckpointStatus = internalQuery({
  args: { checkpointId: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("sandboxCache")
      .filter((q) => q.eq(q.field("checkpointId"), args.checkpointId))
      .first();

    if (!entry) return { exists: false };

    const now = Date.now();
    return {
      exists: true,
      isValid: entry.state === "ready" && entry.expiresAt > now,
      expiresAt: entry.expiresAt,
    };
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a config hash for cache lookup.
 */
export function hashConfig(config: Record<string, unknown>): string {
  const sorted = JSON.stringify(config, Object.keys(config).sort());
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
