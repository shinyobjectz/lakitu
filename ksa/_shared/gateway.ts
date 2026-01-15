/**
 * Shared Gateway Module
 *
 * Common utilities for calling the cloud gateway from KSAs.
 * All KSAs should use this module instead of implementing their own fetch logic.
 */

// Gateway config from environment (set by sandbox runtime)
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3210";
const JWT = process.env.SANDBOX_JWT || "";

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
  args: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}/agent/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify({ path, args }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error (${response.status}): ${text}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Service error: ${result.error || JSON.stringify(result)}`);
  }

  return result.data as T;
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
