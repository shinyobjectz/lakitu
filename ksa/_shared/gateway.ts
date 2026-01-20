/**
 * Shared Gateway Module
 *
 * Common utilities for calling the cloud gateway from KSAs.
 * All KSAs should use this module instead of implementing their own fetch logic.
 *
 * Optimizations:
 * - callGateway: Standard blocking call (await response)
 * - callGatewayBatch: Multiple calls in single HTTP request (parallel execution)
 * - fireAndForget: Non-blocking call (don't wait for response)
 *
 * @deprecated Import from '@lakitu/sdk' or '@lakitu/sdk/gateway' instead of '@lakitu/sdk/ksa/gateway'
 */

import { readFileSync, existsSync } from "fs";

// Load env vars from /home/user/.env if present (set by pool claim)
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

// Gateway config from environment (set by sandbox runtime)
// Check both process.env and .env file (for pooled sandboxes)
const GATEWAY_URL = process.env.GATEWAY_URL || envFile.GATEWAY_URL || "http://localhost:3210";
const JWT = process.env.SANDBOX_JWT || envFile.SANDBOX_JWT || "";

// Export THREAD_ID, CARD_ID, and WORKSPACE_ID for other KSAs to use
export const THREAD_ID = process.env.THREAD_ID || envFile.THREAD_ID;
export const CARD_ID = process.env.CARD_ID || envFile.CARD_ID;
export const WORKSPACE_ID = process.env.WORKSPACE_ID || envFile.WORKSPACE_ID;

/**
 * Call the cloud gateway to invoke a Convex service.
 *
 * @param path - Service path (e.g., 'services.Valyu.internal.search')
 * @param args - Arguments to pass to the service
 * @returns Service response data
 *
 * @example
 * const data = await callGateway('services.SendGrid.internal.send', {
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   text: 'World'
 * });
 */
export async function callGateway<T = unknown>(
  path: string,
  args: Record<string, unknown>,
  type?: "query" | "mutation" | "action"
): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}/agent/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify({ path, args, type }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error (${response.status}): ${text}`);
  }

  const result = await response.json() as { ok: boolean; data?: T; error?: string };
  if (!result.ok) {
    throw new Error(`Service error: ${result.error || JSON.stringify(result)}`);
  }

  return result.data as T;
}

export interface BatchCall {
  path: string;
  args?: Record<string, unknown>;
  type?: "query" | "mutation" | "action";
}

export interface BatchResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Execute multiple gateway calls in a single HTTP request.
 * All calls execute in parallel on the server.
 *
 * @param calls - Array of calls to execute
 * @returns Array of results (same order as calls)
 *
 * @example
 * const [users, posts] = await callGatewayBatch([
 *   { path: 'services.Users.internal.list', args: { limit: 10 } },
 *   { path: 'services.Posts.internal.recent', args: {} }
 * ]);
 */
export async function callGatewayBatch<T extends unknown[] = unknown[]>(
  calls: BatchCall[]
): Promise<BatchResult<T[number]>[]> {
  const response = await fetch(`${GATEWAY_URL}/agent/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify({ calls }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway batch error (${response.status}): ${text}`);
  }

  const result = await response.json() as { ok: boolean; results: BatchResult<T[number]>[]; error?: string };
  if (!result.ok) {
    throw new Error(`Batch error: ${result.error || JSON.stringify(result)}`);
  }

  return result.results;
}

/**
 * Fire-and-forget gateway call - doesn't wait for response.
 * Use for non-critical operations like logging, analytics, beads updates.
 *
 * @param path - Service path
 * @param args - Arguments to pass
 *
 * @example
 * // Log something without blocking
 * fireAndForget('components.lakitu.workflows.sandboxConvex.appendLogs', { sessionId, logs });
 */
export function fireAndForget(
  path: string,
  args: Record<string, unknown>,
  type?: "query" | "mutation" | "action"
): void {
  fetch(`${GATEWAY_URL}/agent/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify({ path, args, type }),
  }).catch(() => {
    // Intentionally ignore errors - fire and forget
  });
}

/**
 * Get the gateway configuration.
 * Useful for debugging or checking connectivity.
 */
export function getGatewayConfig() {
  return {
    url: GATEWAY_URL,
    hasJwt: !!JWT,
  };
}
