/**
 * Lakitu Gateway Module
 *
 * Utilities for creating HTTP gateways that enable sandbox → cloud communication.
 *
 * @example
 * ```typescript
 * // convex/gateway.ts (in your implementation)
 * import { createGatewayHandlers } from "@lakitu/sdk/convex/cloud/gateway";
 *
 * const { call, batch } = createGatewayHandlers({
 *   whitelist: {
 *     "features.myFeature": ["list", "get", "create"],
 *   },
 *   allowedPaths: ["services.MyService.*"],
 * });
 *
 * export { call, batch };
 * ```
 *
 * @packageDocumentation
 */

// Re-export all utilities
export {
  type TokenPayload,
  verifyToken,
  createToken,
} from "./auth";

export {
  type WhitelistConfig,
  type GatewayConfig,
  LAKITU_WHITELIST,
  COMMON_WHITELIST,
  DEFAULT_GATEWAY_CONFIG,
  isPathWhitelisted,
  matchesPattern,
  mergeWhitelists,
  createWhitelistChecker,
} from "./whitelist";

export {
  analyzePath,
  resolveApiPath,
  jsonResponse,
  errorResponse,
  needsUserInjection,
  enrichArgsWithContext,
  determineOperationType,
} from "./routing";

/**
 * Full gateway configuration for implementations.
 */
export interface FullGatewayConfig {
  /**
   * JWT secret for token verification.
   * Defaults to process.env.SANDBOX_JWT_SECRET
   */
  jwtSecret?: string;

  /**
   * Custom whitelist configuration.
   */
  whitelist?: import("./whitelist").WhitelistConfig;

  /**
   * Additional allowed path patterns.
   */
  allowedPaths?: string[];

  /**
   * Paths that need userId injection.
   */
  injectionPaths?: string[];

  /**
   * API objects for path resolution.
   * Required for createGatewayHandlers.
   */
  api?: any;
  internal?: any;
  components?: any;
}
