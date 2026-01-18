/**
 * Context - Context Window Orchestration
 *
 * OpenCode-inspired context management:
 * - Session persistence across commands
 * - Dependency graph for surgical context injection
 * - Lazy tool loading (only inject tools needed)
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

/**
 * Store session memory entry
 */
export const setMemory = mutation({
  args: {
    sessionId: v.string(),
    key: v.string(),
    value: v.any(),
    ttlMs: v.optional(v.number()), // Time to live
  },
  handler: async (ctx, args) => {
    // Check for existing entry
    const existing = await ctx.db
      .query("sessionMemory")
      .withIndex("by_session_key", (q) =>
        q.eq("sessionId", args.sessionId).eq("key", args.key)
      )
      .first();

    const expiresAt = args.ttlMs ? Date.now() + args.ttlMs : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
        expiresAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("sessionMemory", {
      sessionId: args.sessionId,
      key: args.key,
      value: args.value,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt,
    });
  },
});

/**
 * Delete session memory entry
 */
export const deleteMemory = mutation({
  args: {
    sessionId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessionMemory")
      .withIndex("by_session_key", (q) =>
        q.eq("sessionId", args.sessionId).eq("key", args.key)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});

/**
 * Cache context for reuse
 */
export const cacheContext = mutation({
  args: {
    sessionId: v.string(),
    taskHash: v.string(),
    context: v.object({
      relevantFiles: v.array(
        v.object({
          path: v.string(),
          snippet: v.optional(v.string()),
          importance: v.number(),
        })
      ),
      toolsNeeded: v.array(v.string()),
      tokenBudget: v.number(),
    }),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check for existing cache
    const existing = await ctx.db
      .query("contextCache")
      .withIndex("by_session_task", (q) =>
        q.eq("sessionId", args.sessionId).eq("taskHash", args.taskHash)
      )
      .first();

    const expiresAt = args.ttlMs
      ? Date.now() + args.ttlMs
      : Date.now() + 3600000; // 1 hour default

    if (existing) {
      await ctx.db.patch(existing._id, {
        context: args.context,
        updatedAt: Date.now(),
        expiresAt,
        hitCount: existing.hitCount + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("contextCache", {
      sessionId: args.sessionId,
      taskHash: args.taskHash,
      context: args.context,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt,
      hitCount: 0,
    });
  },
});

/**
 * Track file dependency
 */
export const trackDependency = mutation({
  args: {
    sessionId: v.string(),
    fromPath: v.string(),
    toPath: v.string(),
    type: v.union(
      v.literal("import"),
      v.literal("reference"),
      v.literal("test"),
      v.literal("config")
    ),
  },
  handler: async (ctx, args) => {
    // Check for existing dependency
    const existing = await ctx.db
      .query("dependencyGraph")
      .filter((q) =>
        q.and(
          q.eq(q.field("sessionId"), args.sessionId),
          q.eq(q.field("fromPath"), args.fromPath),
          q.eq(q.field("toPath"), args.toPath)
        )
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type,
        lastSeen: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("dependencyGraph", {
      sessionId: args.sessionId,
      fromPath: args.fromPath,
      toPath: args.toPath,
      type: args.type,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    });
  },
});

/**
 * Clear expired cache entries
 */
export const clearExpired = mutation({
  args: { sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let deleted = 0;
    const { sessionId } = args;

    // Clear expired session memory
    const memory = sessionId
      ? await ctx.db
          .query("sessionMemory")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect()
      : await ctx.db.query("sessionMemory").collect();

    for (const entry of memory) {
      if (entry.expiresAt && entry.expiresAt < now) {
        await ctx.db.delete(entry._id);
        deleted++;
      }
    }

    // Clear expired context cache
    const cache = sessionId
      ? await ctx.db
          .query("contextCache")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect()
      : await ctx.db.query("contextCache").collect();

    for (const entry of cache) {
      if (entry.expiresAt && entry.expiresAt < now) {
        await ctx.db.delete(entry._id);
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
 * Get session memory value
 */
export const getMemory = query({
  args: {
    sessionId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("sessionMemory")
      .withIndex("by_session_key", (q) =>
        q.eq("sessionId", args.sessionId).eq("key", args.key)
      )
      .first();

    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return null;
    }

    return entry.value;
  },
});

/**
 * Get all session memory
 */
export const getAllMemory = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("sessionMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const now = Date.now();
    const result: Record<string, any> = {};

    for (const entry of entries) {
      if (!entry.expiresAt || entry.expiresAt >= now) {
        result[entry.key] = entry.value;
      }
    }

    return result;
  },
});

/**
 * Get cached context
 */
export const getCachedContext = query({
  args: {
    sessionId: v.string(),
    taskHash: v.string(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("contextCache")
      .withIndex("by_session_task", (q) =>
        q.eq("sessionId", args.sessionId).eq("taskHash", args.taskHash)
      )
      .first();

    if (!cached) return null;

    // Check expiration
    if (cached.expiresAt && cached.expiresAt < Date.now()) {
      return null;
    }

    return cached.context;
  },
});

/**
 * Get dependencies for a file
 */
export const getDependencies = query({
  args: {
    sessionId: v.string(),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    // Files this file depends on
    const dependsOn = await ctx.db
      .query("dependencyGraph")
      .filter((q) =>
        q.and(
          q.eq(q.field("sessionId"), args.sessionId),
          q.eq(q.field("fromPath"), args.path)
        )
      )
      .collect();

    // Files that depend on this file
    const dependedBy = await ctx.db
      .query("dependencyGraph")
      .filter((q) =>
        q.and(
          q.eq(q.field("sessionId"), args.sessionId),
          q.eq(q.field("toPath"), args.path)
        )
      )
      .collect();

    return {
      dependsOn: dependsOn.map((d) => ({ path: d.toPath, type: d.type })),
      dependedBy: dependedBy.map((d) => ({ path: d.fromPath, type: d.type })),
    };
  },
});

/**
 * Query dependency graph for relevant files
 */
export const queryRelevantFiles = query({
  args: {
    sessionId: v.string(),
    paths: v.array(v.string()),
    depth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxDepth = args.depth ?? 2;
    const visited = new Set<string>(args.paths);
    const result: Array<{ path: string; depth: number; type: string }> = [];

    // BFS to find related files
    let currentLevel = args.paths;
    for (let depth = 0; depth < maxDepth && currentLevel.length > 0; depth++) {
      const nextLevel: string[] = [];

      for (const path of currentLevel) {
        // Get all dependencies
        const deps = await ctx.db
          .query("dependencyGraph")
          .filter((q) =>
            q.and(
              q.eq(q.field("sessionId"), args.sessionId),
              q.or(
                q.eq(q.field("fromPath"), path),
                q.eq(q.field("toPath"), path)
              )
            )
          )
          .collect();

        for (const dep of deps) {
          const relatedPath =
            dep.fromPath === path ? dep.toPath : dep.fromPath;
          if (!visited.has(relatedPath)) {
            visited.add(relatedPath);
            nextLevel.push(relatedPath);
            result.push({
              path: relatedPath,
              depth: depth + 1,
              type: dep.type,
            });
          }
        }
      }

      currentLevel = nextLevel;
    }

    return result;
  },
});
