/**
 * KSA Behaviors - Per-KSA Hooks for Local DB Integration
 *
 * Defines before/after hooks that the proxy layer calls automatically.
 * These hooks enable file tracking, caching, session persistence, etc.
 * without requiring changes to individual KSA implementations.
 *
 * Hook Types:
 * - before: Called before function execution, can return cached result
 * - after: Called after function execution, for tracking/caching
 * - transform: Transform result before returning (optional)
 */

import { localDb, getSessionId, getThreadId, cacheKey, simpleHash } from "./localDb";
import type { FrameworkConfig } from "./configSchemas";

// ============================================================================
// Types
// ============================================================================

export interface BeforeHookResult {
  /** If true, skip function execution and return cachedResult */
  skipExecution?: boolean;
  /** Cached result to return if skipExecution is true */
  cachedResult?: unknown;
}

export interface HookContext {
  ksaName: string;
  funcName: string;
  args: unknown[];
  config: FrameworkConfig;
  startTime: number;
}

export type BeforeHook = (
  ctx: HookContext
) => Promise<BeforeHookResult | void> | BeforeHookResult | void;

export type AfterHook = (
  ctx: HookContext,
  result: unknown,
  error?: Error
) => Promise<void> | void;

export interface KSABehavior {
  /** Hooks for specific functions */
  functions?: Record<string, {
    before?: BeforeHook;
    after?: AfterHook;
  }>;
  /** Default hooks for all functions in this KSA */
  default?: {
    before?: BeforeHook;
    after?: AfterHook;
  };
}

// ============================================================================
// Cache Helpers
// ============================================================================

/**
 * Check cache for a function result.
 */
async function checkCache(
  ctx: HookContext
): Promise<BeforeHookResult | void> {
  if (!ctx.config.cacheResults) return;

  const key = cacheKey(ctx.ksaName, ctx.funcName, ctx.args);
  const taskHash = simpleHash(key);

  try {
    const cached = await localDb.query<{
      context: { result: unknown; timestamp: number };
    } | null>("context/session.getCachedContext", {
      sessionId: getSessionId(),
      taskHash,
    });

    if (cached?.context) {
      const age = Date.now() - cached.context.timestamp;
      if (age < ctx.config.cacheTTLMs) {
        return {
          skipExecution: true,
          cachedResult: cached.context.result,
        };
      }
    }
  } catch {
    // Cache miss or error - continue with execution
  }
}

/**
 * Store result in cache.
 */
function storeInCache(ctx: HookContext, result: unknown): void {
  if (!ctx.config.cacheResults) return;

  const key = cacheKey(ctx.ksaName, ctx.funcName, ctx.args);
  const taskHash = simpleHash(key);

  localDb.fire("context/session.cacheContext", {
    sessionId: getSessionId(),
    taskHash,
    context: {
      relevantFiles: [],
      toolsNeeded: [ctx.ksaName],
      tokenBudget: 0,
      // Store our custom fields
      result,
      timestamp: Date.now(),
      ksaName: ctx.ksaName,
      funcName: ctx.funcName,
    },
    ttlMs: ctx.config.cacheTTLMs,
  });
}

/**
 * Log a KSA function call for tracking.
 */
function logCall(
  ctx: HookContext,
  result: unknown,
  error?: Error
): void {
  if (!ctx.config.trackCalls) return;

  const threadId = getThreadId();
  if (!threadId) return;

  localDb.fire("agentDecisions.create", {
    threadId,
    task: `${ctx.ksaName}.${ctx.funcName}`,
    decisionType: "tool_selection",
    selectedTools: [ctx.ksaName],
    reasoning: `Called ${ctx.funcName} with ${ctx.args.length} args`,
    expectedOutcome: error ? "failure" : "success",
    metadata: {
      ksaName: ctx.ksaName,
      funcName: ctx.funcName,
      durationMs: Date.now() - ctx.startTime,
      success: !error,
      error: error?.message,
    },
    timestamp: Date.now(),
  });
}

// ============================================================================
// File KSA Behaviors
// ============================================================================

const fileBehaviors: KSABehavior = {
  functions: {
    read: {
      after: (ctx, result) => {
        if (!ctx.config.trackFileState) return;

        const [path] = ctx.args as [string];
        const content = result as string;

        localDb.fire("state/files.trackFileAccess", {
          path,
          operation: "read",
          size: content?.length,
          contentHash: content ? simpleHash(content) : undefined,
          threadId: getThreadId(),
        });
      },
    },
    write: {
      after: (ctx) => {
        if (!ctx.config.trackFileState) return;

        const [path, content] = ctx.args as [string, string];

        localDb.fire("state/files.trackFileAccess", {
          path,
          operation: "write",
          size: content?.length,
          contentHash: content ? simpleHash(content) : undefined,
          threadId: getThreadId(),
        });
      },
    },
    edit: {
      after: (ctx) => {
        if (!ctx.config.trackFileState) return;

        const [path, oldText, newText] = ctx.args as [string, string, string];

        // Generate a simple diff representation
        const diff = `- ${oldText.slice(0, 100)}...\n+ ${newText.slice(0, 100)}...`;

        localDb.fire("state/files.recordEdit", {
          path,
          oldContent: oldText,
          newContent: newText,
          diff,
          verified: false,
          threadId: getThreadId(),
        });
      },
    },
    glob: {
      // Cache glob results for 1 minute
      before: checkCache,
      after: (ctx, result) => {
        storeInCache(ctx, result);
      },
    },
    grep: {
      // Cache grep results for 1 minute
      before: checkCache,
      after: (ctx, result) => {
        storeInCache(ctx, result);
      },
    },
  },
};

// ============================================================================
// Web KSA Behaviors
// ============================================================================

const webBehaviors: KSABehavior = {
  functions: {
    search: {
      before: checkCache,
      after: (ctx, result) => {
        storeInCache(ctx, result);
      },
    },
    scrape: {
      before: checkCache,
      after: (ctx, result) => {
        storeInCache(ctx, result);
      },
    },
    news: {
      before: checkCache,
      after: (ctx, result) => {
        storeInCache(ctx, result);
      },
    },
  },
};

// ============================================================================
// Social KSA Behaviors
// ============================================================================

const socialBehaviors: KSABehavior = {
  default: {
    // Cache all social API results
    before: checkCache,
    after: (ctx, result) => {
      storeInCache(ctx, result);
    },
  },
};

// ============================================================================
// Companies KSA Behaviors
// ============================================================================

const companiesBehaviors: KSABehavior = {
  default: {
    // Cache all company enrichment results
    before: checkCache,
    after: (ctx, result) => {
      storeInCache(ctx, result);
    },
  },
};

// ============================================================================
// News KSA Behaviors
// ============================================================================

const newsBehaviors: KSABehavior = {
  default: {
    before: checkCache,
    after: (ctx, result) => {
      storeInCache(ctx, result);
    },
  },
};

// ============================================================================
// Beads KSA Behaviors
// ============================================================================

const beadsBehaviors: KSABehavior = {
  // Beads already uses local DB directly, no additional behaviors needed
  // But we track calls for observability
  default: {
    after: (ctx, result, error) => {
      logCall(ctx, result, error);
    },
  },
};

// ============================================================================
// Artifacts KSA Behaviors
// ============================================================================

const artifactsBehaviors: KSABehavior = {
  functions: {
    listArtifacts: {
      before: checkCache,
      after: (ctx, result) => {
        storeInCache(ctx, result);
      },
    },
  },
};

// ============================================================================
// Browser KSA Behaviors
// ============================================================================

const browserBehaviors: KSABehavior = {
  functions: {
    screenshot: {
      // Don't cache screenshots
      after: (ctx, _result, error) => {
        logCall(ctx, "[screenshot]", error);
      },
    },
  },
  default: {
    // Log all browser actions
    after: (ctx, result, error) => {
      logCall(ctx, result, error);
    },
  },
};

// ============================================================================
// Default Behaviors (for any KSA without specific behaviors)
// ============================================================================

const defaultBehaviors: KSABehavior = {
  default: {
    before: checkCache,
    after: (ctx, result, error) => {
      if (!error) {
        storeInCache(ctx, result);
      }
      logCall(ctx, result, error);
    },
  },
};

// ============================================================================
// Registry
// ============================================================================

/**
 * KSA behavior registry.
 * Maps KSA names to their behavior definitions.
 */
export const KSA_BEHAVIORS: Record<string, KSABehavior> = {
  file: fileBehaviors,
  web: webBehaviors,
  social: socialBehaviors,
  companies: companiesBehaviors,
  news: newsBehaviors,
  beads: beadsBehaviors,
  artifacts: artifactsBehaviors,
  browser: browserBehaviors,
};

/**
 * Get behavior for a specific KSA function.
 * Falls back to default behaviors if no specific behavior is defined.
 */
export function getBehavior(
  ksaName: string,
  funcName: string
): { before?: BeforeHook; after?: AfterHook } {
  const ksaBehavior = KSA_BEHAVIORS[ksaName];

  if (ksaBehavior) {
    // Check for function-specific behavior
    const funcBehavior = ksaBehavior.functions?.[funcName];
    if (funcBehavior) {
      return funcBehavior;
    }

    // Fall back to KSA default behavior
    if (ksaBehavior.default) {
      return ksaBehavior.default;
    }
  }

  // Fall back to global default behavior
  return defaultBehaviors.default || {};
}

/**
 * Check if a KSA has any custom behaviors defined.
 */
export function hasCustomBehaviors(ksaName: string): boolean {
  return ksaName in KSA_BEHAVIORS;
}
