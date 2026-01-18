/**
 * Skills CRUD - Agent skill definitions
 * 
 * Skills bundle tools with prompts and configuration.
 * Custom skills per user/org stored in database.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";

// Skill definition validator
const skillValidator = v.object({
  skillId: v.string(),
  name: v.string(),
  description: v.string(),
  icon: v.string(),
  category: v.string(),
  toolIds: v.array(v.string()),
  prompt: v.optional(v.string()),
  configSchema: v.optional(v.any()),
  defaults: v.optional(v.any()),
});

// ============================================
// Queries
// ============================================

/** List all available skills (built-in + custom for user/org) */
export const list = query({
  args: {
    category: v.optional(v.string()),
    userId: v.optional(v.string()),
    orgId: v.optional(v.string()),
    includeBuiltIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const includeBuiltIn = args.includeBuiltIn !== false;
    const results: any[] = [];

    if (includeBuiltIn) {
      const builtInSkills = await ctx.db
        .query("skills")
        .withIndex("by_builtin", (q) => q.eq("isBuiltIn", true))
        .collect();
      results.push(...builtInSkills);
    }

    if (args.userId) {
      const userSkills = await ctx.db
        .query("skills")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      results.push(...userSkills);
    }

    if (args.orgId) {
      const orgSkills = await ctx.db
        .query("skills")
        .filter((q) => q.eq(q.field("orgId"), args.orgId))
        .collect();
      for (const skill of orgSkills) {
        if (!results.find((r) => r.skillId === skill.skillId)) {
          results.push(skill);
        }
      }
    }

    if (args.category) {
      return results.filter((s) => s.category === args.category);
    }

    return results;
  },
});

/** Get a single skill by skillId */
export const get = query({
  args: { skillId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q) => q.eq("skillId", args.skillId))
      .first();
  },
});

/** Get skills by IDs */
export const getByIds = query({
  args: { skillIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const skills = [];
    for (const id of args.skillIds) {
      const dbSkill = await ctx.db
        .query("skills")
        .withIndex("by_skillId", (q) => q.eq("skillId", id))
        .first();
      if (dbSkill) skills.push(dbSkill);
    }
    return skills;
  },
});

/** List skill categories */
export const listCategories = query({
  handler: async (ctx) => {
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_builtin", (q) => q.eq("isBuiltIn", true))
      .collect();

    const categories = new Set(skills.map((s) => s.category));
    return Array.from(categories).sort();
  },
});

// ============================================
// Mutations
// ============================================

/** Create a custom skill */
export const create = mutation({
  args: {
    skill: skillValidator,
    userId: v.optional(v.string()),
    orgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q) => q.eq("skillId", args.skill.skillId))
      .first();

    if (existing) {
      throw new Error(`Skill with ID "${args.skill.skillId}" already exists`);
    }

    return await ctx.db.insert("skills", {
      ...args.skill,
      isBuiltIn: false,
      userId: args.userId,
      orgId: args.orgId,
      createdAt: Date.now(),
    });
  },
});

/** Update a custom skill (cannot update built-in skills) */
export const update = mutation({
  args: {
    skillId: v.string(),
    updates: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      icon: v.optional(v.string()),
      category: v.optional(v.string()),
      toolIds: v.optional(v.array(v.string())),
      prompt: v.optional(v.string()),
      configSchema: v.optional(v.any()),
      defaults: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q) => q.eq("skillId", args.skillId))
      .first();

    if (!skill) throw new Error(`Skill "${args.skillId}" not found`);
    if (skill.isBuiltIn) throw new Error("Cannot modify built-in skills");

    await ctx.db.patch(skill._id, args.updates);
    return { success: true };
  },
});

/** Delete a custom skill (cannot delete built-in skills) */
export const remove = mutation({
  args: { skillId: v.string() },
  handler: async (ctx, args) => {
    const skill = await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q) => q.eq("skillId", args.skillId))
      .first();

    if (!skill) throw new Error(`Skill "${args.skillId}" not found`);
    if (skill.isBuiltIn) throw new Error("Cannot delete built-in skills");

    await ctx.db.delete(skill._id);
    return { success: true };
  },
});

/** Seed built-in skills (no-op - skills now managed via database only) */
export const seedBuiltIns = internalMutation({
  handler: async () => {
    return { seeded: 0, skipped: true };
  },
});

/** Resync built-in skills (no-op - skills now managed via database only) */
export const resyncBuiltIns = mutation({
  handler: async () => {
    return { updated: 0 };
  },
});
