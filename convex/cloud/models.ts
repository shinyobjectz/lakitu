/**
 * Centralized Model Configuration
 *
 * All LLM model selection flows through this module.
 * Implementations can override presets via config.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Model preset names.
 */
export type ModelPreset = "fast" | "balanced" | "capable" | "vision";

/**
 * Default model presets.
 * Fast models for quick tasks, capable models for complex reasoning.
 */
export const MODEL_PRESETS: Record<ModelPreset, string> = {
  fast: "groq/llama-3.1-70b-versatile",
  balanced: "anthropic/claude-sonnet-4",
  capable: "anthropic/claude-sonnet-4",
  vision: "anthropic/claude-sonnet-4",
} as const;

/**
 * Resolve a model preset or direct model name to the actual model ID.
 *
 * @param modelOrPreset - Either a preset name ("fast", "balanced") or direct model ID
 * @param customPresets - Optional custom preset overrides
 * @returns Resolved model ID
 */
export function resolveModel(
  modelOrPreset: string | ModelPreset,
  customPresets?: Partial<Record<ModelPreset, string>>
): string {
  const presets = { ...MODEL_PRESETS, ...customPresets };
  
  // Check if it's a preset name
  if (modelOrPreset in presets) {
    return presets[modelOrPreset as ModelPreset];
  }
  
  // Otherwise, treat as direct model ID
  return modelOrPreset;
}

/**
 * Get model for a specific use case.
 *
 * @param useCase - Use case description
 * @returns Recommended preset
 */
export function getModelForUseCase(useCase: 
  | "intent_analysis"
  | "code_execution"
  | "research"
  | "creative"
  | "vision"
): ModelPreset {
  switch (useCase) {
    case "intent_analysis":
      return "fast";
    case "code_execution":
      return "balanced";
    case "research":
      return "capable";
    case "creative":
      return "capable";
    case "vision":
      return "vision";
    default:
      return "balanced";
  }
}

/**
 * Model configuration stored in the database.
 */
export interface ModelConfig {
  /** Default model preset */
  defaultPreset: ModelPreset;
  /** Custom preset overrides */
  presets?: Partial<Record<ModelPreset, string>>;
  /** Per-use-case overrides */
  useCaseOverrides?: Record<string, string>;
}

/**
 * Default model configuration.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  defaultPreset: "balanced",
  presets: {},
  useCaseOverrides: {},
};

// ============================================================================
// Convex Functions
// ============================================================================

/**
 * Get model configuration from database or return defaults.
 */
export const getConfig = query({
  args: {},
  handler: async (ctx): Promise<ModelConfig> => {
    const config = await ctx.db
      .query("modelConfig")
      .first();
    
    if (!config) {
      return DEFAULT_MODEL_CONFIG;
    }
    
    return {
      defaultPreset: (config.defaultPreset as ModelPreset) || "balanced",
      presets: config.presets as Partial<Record<ModelPreset, string>> || {},
      useCaseOverrides: config.useCaseOverrides as Record<string, string> || {},
    };
  },
});

/**
 * Update model configuration.
 */
export const updateConfig = mutation({
  args: {
    defaultPreset: v.optional(v.string()),
    presets: v.optional(v.any()),
    useCaseOverrides: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("modelConfig")
      .first();
    
    const updates: Record<string, unknown> = {};
    if (args.defaultPreset) updates.defaultPreset = args.defaultPreset;
    if (args.presets) updates.presets = args.presets;
    if (args.useCaseOverrides) updates.useCaseOverrides = args.useCaseOverrides;
    
    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      return await ctx.db.insert("modelConfig", {
        defaultPreset: args.defaultPreset || "balanced",
        presets: args.presets || {},
        useCaseOverrides: args.useCaseOverrides || {},
      });
    }
  },
});

/**
 * Resolve model for a given context.
 */
export const resolveForContext = query({
  args: {
    preset: v.optional(v.string()),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const config = await ctx.db
      .query("modelConfig")
      .first();
    
    const presets = config?.presets as Partial<Record<ModelPreset, string>> || {};
    const useCaseOverrides = config?.useCaseOverrides as Record<string, string> || {};
    
    // Check use case override first
    if (args.useCase && useCaseOverrides[args.useCase]) {
      return useCaseOverrides[args.useCase];
    }
    
    // Then check preset
    if (args.preset) {
      return resolveModel(args.preset, presets);
    }
    
    // Fall back to default
    const defaultPreset = (config?.defaultPreset as ModelPreset) || "balanced";
    return resolveModel(defaultPreset, presets);
  },
});
