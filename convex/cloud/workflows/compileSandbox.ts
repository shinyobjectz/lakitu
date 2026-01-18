/**
 * Sandbox Compiler
 * 
 * Manages compilation manifest for sandbox definitions.
 */

import { v } from "convex/values";
import { query, internalMutation } from "../_generated/server";

// ============================================
// Manifest Management
// ============================================

/** Save compilation manifest */
export const saveManifest = internalMutation({
  args: {
    version: v.string(),
    manifest: v.array(v.object({
      type: v.string(),
      name: v.string(),
      path: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Clear old entries for this version
    const existing = await ctx.db
      .query("compiledSandbox")
      .withIndex("by_version", (q) => q.eq("version", args.version))
      .collect();
    
    for (const entry of existing) {
      await ctx.db.delete(entry._id);
    }
    
    // Insert new entries
    for (const item of args.manifest) {
      await ctx.db.insert("compiledSandbox", {
        version: args.version,
        type: item.type as "tool" | "skill" | "agent" | "service",
        name: item.name,
        r2Key: item.path,
        contentHash: "",
        createdAt: Date.now(),
      });
    }
    
    return { saved: args.manifest.length };
  },
});

/** Get the latest compiled manifest */
export const getManifest = query({
  args: {
    version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.version) {
      return await ctx.db
        .query("compiledSandbox")
        .withIndex("by_version", (q) => q.eq("version", args.version!))
        .collect();
    }
    
    // Get latest version
    const latest = await ctx.db
      .query("compiledSandbox")
      .order("desc")
      .first();
    
    if (!latest) return [];
    
    return await ctx.db
      .query("compiledSandbox")
      .withIndex("by_version", (q) => q.eq("version", latest.version))
      .collect();
  },
});

/** Get manifest version info */
export const getLatestVersion = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("compiledSandbox")
      .order("desc")
      .first();
    
    return latest?.version ?? null;
  },
});

// ============================================
// Custom Tools Queries
// ============================================

/** List custom tools (for compilation) */
export const listCustomTools = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("customTools")
      .filter((q) => q.eq(q.field("enabled"), true))
      .collect();
  },
});

/** Get tool implementation for a custom tool */
export const getToolImplementation = query({
  args: { toolId: v.string() },
  handler: async (ctx, args) => {
    const tool = await ctx.db
      .query("customTools")
      .withIndex("by_toolId", (q) => q.eq("toolId", args.toolId))
      .first();
    
    return tool?.implementation || null;
  },
});

// ============================================
// Built-in Metadata Queries (deprecated - metadata now in Lakitu)
// ============================================

/** Get all built-in tool metadata */
export const getBuiltInTools = query({
  args: {},
  handler: async () => [],
});

/** Get all built-in skill metadata */
export const getBuiltInSkills = query({
  args: {},
  handler: async () => [],
});

/** Get all built-in deliverable metadata */
export const getBuiltInDeliverables = query({
  args: {},
  handler: async () => [],
});

/** Get all agent definitions */
export const getAgents = query({
  args: {},
  handler: async () => [],
});
