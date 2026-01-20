/**
 * Gateway Whitelist Configuration
 *
 * Default allowed paths + extensible configuration.
 */

/**
 * Whitelist configuration type.
 * Keys are feature paths, values are arrays of allowed function names.
 */
export type WhitelistConfig = Record<string, string[]>;

/**
 * Default whitelist for lakitu component paths.
 * These are always allowed regardless of configuration.
 */
export const LAKITU_WHITELIST: WhitelistConfig = {
  // Agent sessions
  "components.lakitu.workflows.sandboxConvex": [
    "appendLogs",
    "getSession",
    "updateSession",
  ],
  "components.lakitu.workflows.crudThreads": [
    "emitSubagentProgress",
    "emitBoardExecution",
    "emitFramePreview",
    "emitArtifact",
    "emitSessionLogs",
    "listThreadArtifacts",
    "getThreadArtifact",
    "saveThreadArtifact",
    "listThreadArtifactsInternal",
  ],
  "components.lakitu.workflows.lifecycleSandbox": [
    "appendSessionLogs",
    "completeFromForwarder",
  ],
  // Models (via lakitu component)
  "components.lakitu.models": ["chat", "getConfig"],
};

/**
 * Common service whitelist for typical implementations.
 * Implementations can extend or override this.
 */
export const COMMON_WHITELIST: WhitelistConfig = {
  // LLM services
  "internal.services.OpenRouter.internal": ["chatCompletion", "chat"],
  // Git versioning
  "services.Git": ["listChanges", "undo", "restore"],
  "internal.services.Git": ["commit", "getHistory", "getVersion"],
};

/**
 * Check if a path is in a whitelist.
 *
 * @param path - Full function path (e.g., "features.users.list")
 * @param whitelist - Whitelist configuration
 */
export function isPathWhitelisted(path: string, whitelist: WhitelistConfig): boolean {
  const parts = path.split(".");
  if (parts.length < 2) return false;

  const func = parts[parts.length - 1];
  const feature = parts.slice(0, -1).join(".");

  return whitelist[feature]?.includes(func) || false;
}

/**
 * Check if a path matches a wildcard pattern.
 * Supports trailing wildcards: "features.users.*"
 *
 * @param path - Full function path
 * @param patterns - Array of patterns (can include wildcards)
 */
export function matchesPattern(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      if (path.startsWith(prefix + ".")) return true;
    } else if (pattern === path) {
      return true;
    }
  }
  return false;
}

/**
 * Merge multiple whitelists into one.
 */
export function mergeWhitelists(...whitelists: WhitelistConfig[]): WhitelistConfig {
  const merged: WhitelistConfig = {};
  for (const wl of whitelists) {
    for (const [key, funcs] of Object.entries(wl)) {
      if (!merged[key]) {
        merged[key] = [];
      }
      merged[key] = [...new Set([...merged[key], ...funcs])];
    }
  }
  return merged;
}

/**
 * Gateway configuration type.
 */
export interface GatewayConfig {
  /**
   * Custom whitelist (merged with defaults).
   */
  whitelist?: WhitelistConfig;

  /**
   * Additional allowed path patterns (supports wildcards).
   * Example: ["features.myFeature.*", "services.MyService.action"]
   */
  allowedPaths?: string[];

  /**
   * Paths that require userId injection.
   */
  injectionPaths?: string[];
}

/**
 * Default gateway configuration.
 */
export const DEFAULT_GATEWAY_CONFIG: Required<GatewayConfig> = {
  whitelist: {},
  allowedPaths: [],
  injectionPaths: [
    "internal.features.kanban.boards.createInternal",
    "internal.features.workspaces.internal.",
    "internal.features.frames.internal.",
  ],
};

/**
 * Create a complete whitelist check function.
 */
export function createWhitelistChecker(config: GatewayConfig = {}) {
  const fullWhitelist = mergeWhitelists(
    LAKITU_WHITELIST,
    COMMON_WHITELIST,
    config.whitelist || {}
  );
  const patterns = config.allowedPaths || [];

  return (path: string): boolean => {
    return isPathWhitelisted(path, fullWhitelist) || matchesPattern(path, patterns);
  };
}
