/**
 * KSA Proxy - Framework-Level Instrumentation
 *
 * This is the core of the local DB integration framework.
 * Wraps KSA modules with a Proxy that automatically applies behaviors
 * like caching, file tracking, and call logging.
 *
 * Usage:
 * ```typescript
 * import * as fileRaw from "./file";
 * import { createKSAProxy } from "./_shared/ksaProxy";
 *
 * export const file = createKSAProxy("file", fileRaw);
 * ```
 *
 * The proxy is transparent to agents - they import and use KSAs normally,
 * and the framework automatically applies behaviors based on config.
 */

import { getBehavior, type HookContext, type BeforeHookResult } from "./ksaBehaviors";
import { getFrameworkConfigForKSA } from "./configReader";
import type { FrameworkConfig } from "./configSchemas";

// ============================================================================
// Types
// ============================================================================

/** Any object that can be proxied (KSA module) */
type ProxiableModule = Record<string, unknown>;

/** Options for creating a KSA proxy */
export interface ProxyOptions {
  /** Override framework config (for testing) */
  config?: Partial<FrameworkConfig>;
  /** Disable all behaviors (passthrough mode) */
  disabled?: boolean;
}

// ============================================================================
// Proxy Factory
// ============================================================================

/**
 * Create a proxied version of a KSA module.
 *
 * The proxy wraps all exported functions and automatically applies
 * before/after hooks based on the KSA's behavior configuration.
 *
 * @param ksaName - Name of the KSA (e.g., "file", "web")
 * @param ksaModule - The raw KSA module
 * @param options - Optional configuration overrides
 * @returns Proxied module with automatic behaviors
 *
 * @example
 * // In ksa/index.ts
 * import * as fileRaw from "./file";
 * export const file = createKSAProxy("file", fileRaw);
 *
 * // Agent code (unchanged)
 * import { file } from "./ksa";
 * const content = await file.read("/path/to/file.txt");
 * // Automatically tracked in local DB!
 */
export function createKSAProxy<T extends ProxiableModule>(
  ksaName: string,
  ksaModule: T,
  options?: ProxyOptions
): T {
  // In passthrough mode, return the raw module
  if (options?.disabled) {
    return ksaModule;
  }

  // Get framework config for this KSA
  const config = {
    ...getFrameworkConfigForKSA(ksaName),
    ...options?.config,
  };

  return new Proxy(ksaModule, {
    get(target, prop: string | symbol) {
      const original = target[prop as keyof T];

      // Only wrap functions
      if (typeof original !== "function") {
        return original;
      }

      // Don't wrap internal properties
      if (typeof prop === "symbol" || prop.startsWith("_")) {
        return original;
      }

      // Return wrapped function
      return createWrappedFunction(ksaName, prop, original as Function, config);
    },
  });
}

/**
 * Create a wrapped version of a KSA function with automatic behaviors.
 */
function createWrappedFunction(
  ksaName: string,
  funcName: string,
  original: Function,
  config: FrameworkConfig
): (...args: unknown[]) => Promise<unknown> {
  return async function wrappedFunction(...args: unknown[]): Promise<unknown> {
    const startTime = Date.now();

    // Build hook context
    const ctx: HookContext = {
      ksaName,
      funcName,
      args,
      config,
      startTime,
    };

    // Get behaviors for this function
    const { before, after } = getBehavior(ksaName, funcName);

    // Execute before hook (may return cached result)
    if (before) {
      try {
        const beforeResult = await before(ctx);
        if (beforeResult && beforeResult.skipExecution) {
          // Return cached result
          return beforeResult.cachedResult;
        }
      } catch (e) {
        // Before hook failed, continue with execution
        console.warn(`[KSA Proxy] Before hook failed for ${ksaName}.${funcName}:`, e);
      }
    }

    // Execute original function
    let result: unknown;
    let error: Error | undefined;

    try {
      result = await original.apply(null, args);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      throw error;
    } finally {
      // Execute after hook (fire-and-forget for performance)
      if (after) {
        try {
          // Don't await - fire and forget
          Promise.resolve(after(ctx, result, error)).catch((e) => {
            console.warn(`[KSA Proxy] After hook failed for ${ksaName}.${funcName}:`, e);
          });
        } catch (e) {
          console.warn(`[KSA Proxy] After hook failed for ${ksaName}.${funcName}:`, e);
        }
      }
    }

    return result;
  };
}

// ============================================================================
// Bulk Proxy Creation
// ============================================================================

/**
 * Create proxies for multiple KSA modules at once.
 *
 * @param modules - Map of KSA name to raw module
 * @param options - Optional configuration overrides
 * @returns Map of KSA name to proxied module
 *
 * @example
 * import * as file from "./file";
 * import * as web from "./web";
 *
 * const proxied = createKSAProxies({ file, web });
 * export const { file: fileProxy, web: webProxy } = proxied;
 */
export function createKSAProxies<T extends Record<string, ProxiableModule>>(
  modules: T,
  options?: ProxyOptions
): T {
  const result = {} as T;

  for (const [name, module] of Object.entries(modules)) {
    result[name as keyof T] = createKSAProxy(name, module, options) as T[keyof T];
  }

  return result;
}

// ============================================================================
// Passthrough Mode
// ============================================================================

/**
 * Check if proxy behaviors should be disabled.
 *
 * Behaviors are disabled when:
 * - LAKITU_PROXY_DISABLED=true environment variable is set
 * - Running in test mode (NODE_ENV=test)
 */
export function isProxyDisabled(): boolean {
  return (
    process.env.LAKITU_PROXY_DISABLED === "true" ||
    process.env.NODE_ENV === "test"
  );
}

/**
 * Create a KSA proxy with automatic passthrough detection.
 * Uses isProxyDisabled() to determine if behaviors should be applied.
 */
export function createKSAProxyAuto<T extends ProxiableModule>(
  ksaName: string,
  ksaModule: T,
  options?: Omit<ProxyOptions, "disabled">
): T {
  return createKSAProxy(ksaName, ksaModule, {
    ...options,
    disabled: isProxyDisabled(),
  });
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Get debug info about the proxy configuration for a KSA.
 */
export function getProxyDebugInfo(ksaName: string): {
  config: FrameworkConfig;
  isDisabled: boolean;
  hasBehaviors: boolean;
} {
  const config = getFrameworkConfigForKSA(ksaName);

  return {
    config,
    isDisabled: isProxyDisabled(),
    hasBehaviors: true, // All KSAs have at least default behaviors
  };
}
