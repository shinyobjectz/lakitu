/**
 * Gateway Routing Utilities
 *
 * Path resolution and request handling helpers.
 */

/**
 * Resolve a path to determine if it's internal and extract parts.
 *
 * Internal paths can be:
 * - "internal.services.Foo.bar" - starts with internal
 * - "services.Foo.internal.bar" - internal in middle (service internal namespace)
 *
 * @param path - Function path
 * @returns Path analysis result
 */
export function analyzePath(path: string): {
  isInternal: boolean;
  startsWithInternal: boolean;
  pathParts: string[];
  featurePath: string;
  functionName: string;
} {
  const parts = path.split(".");
  const startsWithInternal = parts[0] === "internal";
  const hasInternalNamespace = parts.includes("internal");
  const isInternal = startsWithInternal || hasInternalNamespace;

  // Skip "internal" prefix if it's at the start
  const pathParts = startsWithInternal ? parts.slice(1) : parts;

  return {
    isInternal,
    startsWithInternal,
    pathParts,
    featurePath: parts.slice(0, -1).join("."),
    functionName: parts[parts.length - 1],
  };
}

/**
 * Resolve path to API function reference.
 *
 * @param path - Function path
 * @param api - Public API object
 * @param internal - Internal API object
 */
export function resolveApiPath(
  path: string,
  api: any,
  internal: any
): { fn: any; isInternal: boolean } {
  const { startsWithInternal, isInternal, pathParts } = analyzePath(path);

  let current: any = startsWithInternal ? internal : api;

  for (const part of pathParts) {
    if (current[part] === undefined) {
      throw new Error(`API path not found: ${path}`);
    }
    current = current[part];
  }

  return { fn: current, isInternal };
}

/**
 * Create JSON response helper.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create error response helper.
 */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Check if a path needs userId injection.
 *
 * @param path - Function path
 * @param injectionPaths - Paths that need injection
 */
export function needsUserInjection(path: string, injectionPaths: string[]): boolean {
  return injectionPaths.some(
    (p) => path.startsWith(p) || path === p.replace(/\.$/, "")
  );
}

/**
 * Enrich args with user context.
 *
 * @param args - Original arguments
 * @param context - User context to inject
 */
export function enrichArgsWithContext(
  args: Record<string, unknown>,
  context: { userId?: string; orgId?: string; workspaceId?: string }
): Record<string, unknown> {
  if (!context.userId) return args;

  const enriched: Record<string, unknown> = {
    ...args,
    userId: context.userId,
    orgId: context.orgId,
  };

  if (context.workspaceId && !args.workspaceId) {
    enriched.workspaceId = context.workspaceId;
  }

  return enriched;
}

/**
 * Determine operation type for a call.
 *
 * @param explicitType - Explicitly specified type
 * @param isInternal - Whether the path is internal
 * @returns Operation type
 */
export function determineOperationType(
  explicitType: string | undefined,
  isInternal: boolean
): "query" | "mutation" | "action" {
  if (explicitType === "query" || explicitType === "mutation" || explicitType === "action") {
    return explicitType;
  }
  // Default: query for public, action for internal
  return isInternal ? "action" : "query";
}
