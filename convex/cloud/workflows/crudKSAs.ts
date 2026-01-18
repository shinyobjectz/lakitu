/**
 * KSA CRUD Operations
 *
 * Provides queries for the KSA registry to the frontend.
 * KSAs are defined in ksaPolicy.ts - this just exposes them.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import {
  KSA_REGISTRY,
  CONFIG_SCHEMAS,
  CONFIG_DEFAULTS,
  CORE_KSAS,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  GROUP_LABELS,
  GROUP_DESCRIPTIONS,
  GROUP_ICONS,
  GROUP_ORDER,
  getKSA,
  getKSAsByCategory,
  getKSAsByGroup,
  getSkillsByGroup,
  getKSAsByNames,
  getDefaultKSAs,
  getConfigSchema,
  getConfigDefaults,
  mergeWithDefaults,
  searchKSAs,
  type KSAInfo,
  type KSACategory,
  type KSAGroup,
  type ConfigField,
} from "../ksaPolicy";

/**
 * List all available KSAs.
 */
export const list = query({
  args: {
    category: v.optional(v.union(v.literal("core"), v.literal("skills"), v.literal("deliverables"))),
  },
  handler: async (_ctx, args): Promise<KSAInfo[]> => {
    if (args.category) {
      return getKSAsByCategory(args.category);
    }
    return KSA_REGISTRY;
  },
});

/**
 * Get a single KSA by name.
 */
export const get = query({
  args: { name: v.string() },
  handler: async (_ctx, args): Promise<KSAInfo | null> => {
    return getKSA(args.name) || null;
  },
});

/**
 * Get multiple KSAs by names.
 */
export const getByNames = query({
  args: { names: v.array(v.string()) },
  handler: async (_ctx, args): Promise<KSAInfo[]> => {
    return getKSAsByNames(args.names);
  },
});

/**
 * Get KSAs grouped by category.
 */
export const listGrouped = query({
  args: {},
  handler: async (): Promise<{
    core: KSAInfo[];
    skills: KSAInfo[];
    deliverables: KSAInfo[];
  }> => {
    return {
      core: getKSAsByCategory("core"),
      skills: getKSAsByCategory("skills"),
      deliverables: getKSAsByCategory("deliverables"),
    };
  },
});

/**
 * Get category metadata.
 */
export const getCategories = query({
  args: {},
  handler: async (): Promise<
    Array<{
      id: KSACategory;
      label: string;
      description: string;
      ksaCount: number;
    }>
  > => {
    const categories: KSACategory[] = ["core", "skills", "deliverables"];
    return categories.map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      description: CATEGORY_DESCRIPTIONS[id],
      ksaCount: getKSAsByCategory(id).length,
    }));
  },
});

/**
 * Get the names of core KSAs (always available).
 */
export const getCoreKSANames = query({
  args: {},
  handler: async (): Promise<string[]> => {
    return CORE_KSAS;
  },
});

/**
 * Get a default set of KSAs for a given purpose.
 */
export const getDefaultKSASet = query({
  args: {
    purpose: v.union(
      v.literal("research"),
      v.literal("content"),
      v.literal("automation"),
      v.literal("minimal"),
      v.literal("all")
    ),
  },
  handler: async (_ctx, args): Promise<string[]> => {
    return getDefaultKSAs(args.purpose);
  },
});

// ============================================================================
// Config Schema Queries
// ============================================================================

/**
 * Get config schema for a KSA.
 */
export const getKSAConfigSchema = query({
  args: { name: v.string() },
  handler: async (_ctx, args): Promise<Record<string, ConfigField> | null> => {
    return getConfigSchema(args.name) || null;
  },
});

/**
 * Get default config for a KSA.
 */
export const getKSADefaults = query({
  args: { name: v.string() },
  handler: async (_ctx, args): Promise<Record<string, unknown> | null> => {
    return getConfigDefaults(args.name) || null;
  },
});

/**
 * Get all config schemas.
 */
export const getAllConfigSchemas = query({
  args: {},
  handler: async (): Promise<Record<string, Record<string, ConfigField>>> => {
    return CONFIG_SCHEMAS;
  },
});

/**
 * Merge user config with defaults for a KSA.
 */
export const getMergedConfig = query({
  args: {
    name: v.string(),
    userConfig: v.any(),
  },
  handler: async (_ctx, args): Promise<Record<string, unknown>> => {
    return mergeWithDefaults(args.name, args.userConfig || {});
  },
});

// ============================================================================
// Search
// ============================================================================

/**
 * Search KSAs by keyword.
 */
export const search = query({
  args: { keyword: v.string() },
  handler: async (_ctx, args): Promise<KSAInfo[]> => {
    return searchKSAs(args.keyword);
  },
});

/**
 * Get KSAs grouped for the library panel.
 */
export const listForLibrary = query({
  args: {},
  handler: async (): Promise<{
    byCategory: {
      core: KSAInfo[];
      skills: KSAInfo[];
      deliverables: KSAInfo[];
    };
    skillsByGroup: Record<KSAGroup, KSAInfo[]>;
    groupOrder: KSAGroup[];
  }> => {
    return {
      byCategory: {
        core: getKSAsByCategory("core"),
        skills: getKSAsByCategory("skills"),
        deliverables: getKSAsByCategory("deliverables"),
      },
      skillsByGroup: getSkillsByGroup(),
      groupOrder: GROUP_ORDER,
    };
  },
});

/**
 * Get group metadata for skills subcategories.
 */
export const getGroups = query({
  args: {},
  handler: async (): Promise<
    Array<{
      id: KSAGroup;
      label: string;
      description: string;
      icon: string;
      ksaCount: number;
    }>
  > => {
    return GROUP_ORDER.map((id) => ({
      id,
      label: GROUP_LABELS[id],
      description: GROUP_DESCRIPTIONS[id],
      icon: GROUP_ICONS[id],
      ksaCount: getKSAsByGroup(id).length,
    }));
  },
});

/**
 * Get KSAs by group.
 */
export const listByGroup = query({
  args: {
    group: v.literal("research"),
  },
  handler: async (_ctx, args): Promise<KSAInfo[]> => {
    return getKSAsByGroup(args.group);
  },
});
