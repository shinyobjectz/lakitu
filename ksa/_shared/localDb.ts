/**
 * Local DB Client - Sandbox Convex Integration
 *
 * Shared client for calling the local Convex backend running in the E2B sandbox.
 * This is the foundation for automatic state tracking, caching, and session persistence.
 *
 * Key differences from gateway.ts:
 * - Calls LOCAL Convex at http://localhost:3210 (not cloud)
 * - No JWT required (sandbox is trusted)
 * - Designed for high-frequency, low-latency operations
 *
 * @deprecated Import from '@lakitu/sdk' or '@lakitu/sdk/db' instead of '@lakitu/sdk/ksa/localDb'
 *
 * @example
 * import { localDb, getSessionId } from '@lakitu/sdk/db';
 *
 * // Blocking query
 * const files = await localDb.query('state/files:getByThread', { threadId });
 *
 * // Blocking mutation
 * const id = await localDb.mutate('planning/beads:create', { title: 'Task' });
 *
 * // Fire-and-forget (non-blocking)
 * localDb.fire('state/files:trackFileAccess', { path, operation: 'read' });
 */

import { readFileSync, existsSync } from "fs";

// ============================================================================
// Environment Loading
// ============================================================================

function loadEnvFile(): Record<string, string> {
  const envPath = "/home/user/.env";
  if (!existsSync(envPath)) return {};

  try {
    const content = readFileSync(envPath, "utf-8");
    const envVars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^export\s+(\w+)="([^"]*)"/);
      if (match) {
        envVars[match[1]] = match[2];
      }
    }
    return envVars;
  } catch {
    return {};
  }
}

const envFile = loadEnvFile();

// Local Convex URL (sandbox backend, NOT cloud gateway)
// Use LOCAL_CONVEX_URL first since CONVEX_URL may point to cloud gateway
const LOCAL_CONVEX_URL = process.env.LOCAL_CONVEX_URL || envFile.LOCAL_CONVEX_URL || "http://localhost:3210";

// Session identifiers
export const SESSION_ID = process.env.SESSION_ID || envFile.SESSION_ID || `session_${Date.now()}`;
export const THREAD_ID = process.env.THREAD_ID || envFile.THREAD_ID;
export const CARD_ID = process.env.CARD_ID || envFile.CARD_ID;

// ============================================================================
// Path Conversion
// ============================================================================

/**
 * Convert dot-notation path to Convex HTTP API format.
 * "planning.beads.create" -> "planning/beads:create"
 */
function toConvexPath(dotPath: string): string {
  const parts = dotPath.split(".");
  const funcName = parts.pop()!;
  const modulePath = parts.join("/");
  return `${modulePath}:${funcName}`;
}

// ============================================================================
// Core Client Functions
// ============================================================================

/**
 * Execute a query on local Convex (blocking).
 *
 * @param path - Dot-notation path (e.g., 'state/files.getByPath')
 * @param args - Query arguments
 * @returns Query result
 */
async function query<T = unknown>(
  path: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const convexPath = toConvexPath(path);

  const response = await fetch(`${LOCAL_CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: convexPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local Convex query error (${response.status}): ${text}`);
  }

  const result = await response.json() as { value: T };
  return result.value;
}

/**
 * Execute a mutation on local Convex (blocking).
 *
 * @param path - Dot-notation path (e.g., 'state/files.trackFileAccess')
 * @param args - Mutation arguments
 * @returns Mutation result
 */
async function mutate<T = unknown>(
  path: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const convexPath = toConvexPath(path);

  const response = await fetch(`${LOCAL_CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: convexPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local Convex mutation error (${response.status}): ${text}`);
  }

  const result = await response.json() as { value: T };
  return result.value;
}

/**
 * Execute an action on local Convex (blocking).
 *
 * @param path - Dot-notation path
 * @param args - Action arguments
 * @returns Action result
 */
async function action<T = unknown>(
  path: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const convexPath = toConvexPath(path);

  const response = await fetch(`${LOCAL_CONVEX_URL}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: convexPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local Convex action error (${response.status}): ${text}`);
  }

  const result = await response.json() as { value: T };
  return result.value;
}

/**
 * Fire-and-forget mutation (non-blocking).
 * Use for non-critical tracking operations where latency matters.
 *
 * @param path - Dot-notation path
 * @param args - Mutation arguments
 */
function fire(
  path: string,
  args: Record<string, unknown> = {}
): void {
  const convexPath = toConvexPath(path);

  fetch(`${LOCAL_CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: convexPath, args, format: "json" }),
  }).catch(() => {
    // Intentionally ignore errors - fire and forget
  });
}

/**
 * Fire-and-forget query (non-blocking).
 * Rarely needed, but available for completeness.
 */
function fireQuery(
  path: string,
  args: Record<string, unknown> = {}
): void {
  const convexPath = toConvexPath(path);

  fetch(`${LOCAL_CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: convexPath, args, format: "json" }),
  }).catch(() => {
    // Intentionally ignore errors
  });
}

// ============================================================================
// Exported Client
// ============================================================================

/**
 * Local Convex database client for sandbox operations.
 *
 * Use this for all local DB operations in the KSA framework.
 * The fire() method is optimized for high-frequency tracking calls.
 */
export const localDb = {
  query,
  mutate,
  action,
  fire,
  fireQuery,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the current session ID.
 * Used for session-scoped caching and memory.
 */
export function getSessionId(): string {
  return SESSION_ID;
}

/**
 * Get the current thread ID (if available).
 * Used for thread-scoped operations.
 */
export function getThreadId(): string | undefined {
  return THREAD_ID;
}

/**
 * Get the current card ID (if available).
 * Used for kanban card-scoped operations.
 */
export function getCardId(): string | undefined {
  return CARD_ID;
}

/**
 * Check if local Convex is available.
 * Useful for graceful degradation.
 */
export async function isLocalDbAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_CONVEX_URL}/version`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get local Convex connection info.
 * Useful for debugging.
 */
export function getLocalDbConfig() {
  return {
    url: LOCAL_CONVEX_URL,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    cardId: CARD_ID,
  };
}

// ============================================================================
// Cache Helpers
// ============================================================================

/**
 * Generate a cache key from function name and arguments.
 */
export function cacheKey(ksaName: string, funcName: string, args: unknown[]): string {
  const argsHash = JSON.stringify(args);
  return `${ksaName}.${funcName}:${argsHash}`;
}

/**
 * Simple hash function for cache keys.
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
