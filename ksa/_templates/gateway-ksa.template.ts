/**
 * Gateway KSA Template
 *
 * Use this template when creating a KSA that calls a Convex service via the cloud gateway.
 *
 * USAGE:
 * 1. Copy this file to ksa/<name>.ts
 * 2. Replace SERVICENAME with your service name
 * 3. Update types based on convex/services/SERVICENAME/types.ts
 * 4. Implement wrapper functions
 * 5. Add to ksa/index.ts registry
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

// Copy types from convex/services/SERVICENAME/types.ts
// Simplify for agent use - expose only what's needed

export interface ExampleResult {
  id: string;
  name: string;
  // ... add fields
}

export interface ExampleOptions {
  query: string;
  limit?: number;
  // ... add options
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Example function that calls the service.
 *
 * @param options - Function options
 * @returns Result from service
 *
 * @example
 * const result = await exampleFunction({ query: 'test' });
 * console.log(result);
 */
export async function exampleFunction(options: ExampleOptions): Promise<ExampleResult[]> {
  // Build params for the service
  const params: Record<string, any> = {
    query: options.query,
    limit: options.limit || 10,
  };

  // Call the gateway - path format: services.ServiceName.internal.methodName
  const data = await callGateway<any>("services.SERVICENAME.internal.call", {
    endpoint: "/v1/example",
    params,
  });

  // Map response to our simplified types
  return (data.results || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    // ... map fields
  }));
}

/**
 * Another example function.
 *
 * @param id - Item ID
 * @returns Single result
 *
 * @example
 * const item = await getById('abc123');
 */
export async function getById(id: string): Promise<ExampleResult | null> {
  try {
    const data = await callGateway<any>("services.SERVICENAME.internal.call", {
      endpoint: `/v1/items/${id}`,
    });
    return {
      id: data.id,
      name: data.name,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// DON'T FORGET: Add to ksa/index.ts
// ============================================================================

/*
Add to KSA_REGISTRY in ksa/index.ts:

{
  name: "example",
  description: "Brief description of what this KSA does",
  category: "research", // or "data", "create", "system", "ai"
  functions: ["exampleFunction", "getById"],
  importPath: "./ksa/example",
},

And add export:

export * as example from "./example";
*/
