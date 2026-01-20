/**
 * Gateway Module - Cloud Convex Access
 *
 * Clean re-export of gateway utilities for calling cloud Convex from sandbox KSAs.
 *
 * @example
 * ```typescript
 * import { callGateway, THREAD_ID } from '@lakitu/sdk/gateway';
 *
 * const result = await callGateway('services.MyService.action', { arg: 'value' });
 * ```
 *
 * @packageDocumentation
 */

export {
  // Core functions
  callGateway,
  callGatewayBatch,
  fireAndForget,
  getGatewayConfig,
  // Context identifiers
  THREAD_ID,
  CARD_ID,
  WORKSPACE_ID,
} from "../ksa/_shared/gateway";

// Re-export types for TypeScript users
export type { BatchCall, BatchResult } from "../ksa/_shared/gateway";
