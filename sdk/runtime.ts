/**
 * KSA SDK Runtime
 *
 * Execution engine that runs KSA functions based on their implementation type.
 */

import type {
  KSADef,
  FunctionDef,
  Implementation,
  ServiceImpl,
  PrimitiveImpl,
  CompositeImpl,
  ExecutionContext,
  ExecutionResult,
  StepContext,
} from "./types";
import { getPrimitive } from "./primitives";

// ============================================================================
// Gateway (imported from shared)
// ============================================================================

// Re-export gateway functions for convenience
export { callGateway, callGatewayBatch, fireAndForget } from "../ksa/_shared/gateway";

import { callGateway } from "../ksa/_shared/gateway";

// ============================================================================
// Execution Engine
// ============================================================================

/**
 * Execute a KSA function.
 *
 * @param ksa - The KSA definition
 * @param fnName - Function name to execute
 * @param args - Arguments to pass
 * @param ctx - Execution context
 * @returns Execution result
 */
export async function executeFunction<T = unknown>(
  ksa: KSADef,
  fnName: string,
  args: Record<string, unknown>,
  ctx?: ExecutionContext
): Promise<ExecutionResult<T>> {
  const fn = ksa.functions.find((f) => f.name === fnName);
  if (!fn) {
    return {
      success: false,
      error: `Function "${fnName}" not found in KSA "${ksa.name}"`,
    };
  }

  const start = Date.now();

  try {
    // Apply defaults to args
    const processedArgs = applyDefaults(fn, args);

    // Execute based on implementation type
    const data = await executeImpl<T>(fn.impl, processedArgs, ctx);

    return {
      success: true,
      data,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Execute an implementation.
 */
async function executeImpl<T>(
  impl: Implementation,
  args: Record<string, unknown>,
  ctx?: ExecutionContext
): Promise<T> {
  switch (impl.type) {
    case "service":
      return executeService<T>(impl, args);
    case "primitive":
      return executePrimitive<T>(impl, args);
    case "composite":
      return executeComposite<T>(impl, args, ctx);
    default:
      throw new Error(`Unknown implementation type: ${(impl as Implementation).type}`);
  }
}

/**
 * Execute a service implementation (gateway call).
 */
async function executeService<T>(impl: ServiceImpl, args: Record<string, unknown>): Promise<T> {
  // Map arguments if mapper provided
  const mappedArgs = impl.mapArgs ? impl.mapArgs(args) : args;

  // Call gateway with optional type specification
  const result = await callGateway(impl.path, mappedArgs, impl.callType);

  // Map result if mapper provided
  return impl.mapResult ? (impl.mapResult(result) as T) : (result as T);
}

/**
 * Execute a primitive implementation.
 */
async function executePrimitive<T>(impl: PrimitiveImpl, args: Record<string, unknown>): Promise<T> {
  const fn = getPrimitive(impl.name);
  if (!fn) {
    throw new Error(`Unknown primitive: ${impl.name}`);
  }

  // Convert args object to positional args based on primitive signature
  const positionalArgs = argsToArray(impl.name, args);
  const result = await fn(...positionalArgs);
  return result as T;
}

/**
 * Execute a composite implementation (sequence of steps).
 */
async function executeComposite<T>(
  impl: CompositeImpl,
  args: Record<string, unknown>,
  ctx?: ExecutionContext
): Promise<T> {
  const stepCtx: StepContext = { vars: {}, args };

  for (const step of impl.steps) {
    // Return step - final value
    if (step.return !== undefined) {
      const value = typeof step.return === "function" ? step.return(stepCtx) : step.return;
      return value as T;
    }

    // Call step - invoke another function/primitive
    if (step.call) {
      const stepArgs =
        typeof step.args === "function" ? step.args(stepCtx) : step.args || {};

      // Parse call path: "ksa.function" or just "primitive.path"
      const [target, ...rest] = step.call.split(".");
      const result = await executePrimitive({ type: "primitive", name: step.call }, stepArgs);

      // Store result if 'as' is specified
      if (step.as) {
        stepCtx.vars[step.as] = result;
      }
    }
  }

  // No explicit return - return undefined
  return undefined as T;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Apply default values to arguments.
 */
function applyDefaults(fn: FunctionDef, args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...args };

  for (const [name, param] of Object.entries(fn.params)) {
    if (result[name] === undefined && param.default !== undefined) {
      result[name] = param.default;
    }
    if (param.required && result[name] === undefined) {
      throw new Error(`Missing required argument: ${name}`);
    }
  }

  return result;
}

/**
 * Convert args object to positional array for primitives.
 */
function argsToArray(primitiveName: string, args: Record<string, unknown>): unknown[] {
  // Define expected arg order for each primitive
  const argOrder: Record<string, string[]> = {
    "file.read": ["filePath"],
    "file.write": ["filePath", "content"],
    "file.edit": ["filePath", "oldText", "newText"],
    "file.glob": ["pattern", "cwd"],
    "file.grep": ["pattern", "cwd"],
    "file.ls": ["dirPath"],
    "file.exists": ["filePath"],
    "file.stat": ["filePath"],
    "shell.exec": ["command", "options"],
    "browser.open": ["url"],
    "browser.screenshot": ["name"],
    "browser.click": ["selector"],
    "browser.type": ["selector", "text"],
    "browser.getHtml": [],
    "browser.getText": [],
    "browser.close": [],
  };

  const order = argOrder[primitiveName];
  if (!order) {
    // Unknown primitive, return all values
    return Object.values(args);
  }

  return order.map((name) => args[name]);
}

// ============================================================================
// KSA Proxy Factory
// ============================================================================

type KSAProxy<T extends KSADef> = {
  [K in T["functions"][number]["name"]]: (
    args: Record<string, unknown>
  ) => Promise<ExecutionResult>;
};

/**
 * Create a callable proxy for a KSA.
 * This allows using KSAs with familiar syntax: ksa.functionName(args)
 */
export function createKSAProxy<T extends KSADef>(ksa: T): KSAProxy<T> {
  return new Proxy({} as KSAProxy<T>, {
    get(_target, prop: string) {
      return async (args: Record<string, unknown> = {}) => {
        return executeFunction(ksa, prop, args);
      };
    },
  });
}

/**
 * Create proxies for multiple KSAs.
 */
export function createKSAProxies(
  ksas: KSADef[]
): Record<string, ReturnType<typeof createKSAProxy>> {
  const proxies: Record<string, ReturnType<typeof createKSAProxy>> = {};
  for (const ksa of ksas) {
    proxies[ksa.name] = createKSAProxy(ksa);
  }
  return proxies;
}
