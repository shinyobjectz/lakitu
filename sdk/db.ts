/**
 * Local Database Module - Sandbox Convex Access
 *
 * Clean re-export of local Convex utilities for sandbox operations.
 *
 * @example
 * ```typescript
 * import { localDb, getSessionId } from '@lakitu/sdk/db';
 *
 * const files = await localDb.query('state/files:getByPath', { path: '/workspace' });
 * localDb.fire('state/files:trackAccess', { path: '/workspace' }); // Non-blocking
 * ```
 *
 * @packageDocumentation
 */

export {
  // Core client
  localDb,
  // Session helpers
  getSessionId,
  getThreadId,
  getCardId,
  isLocalDbAvailable,
  getLocalDbConfig,
  // Cache helpers
  cacheKey,
  simpleHash,
  // Context identifiers
  SESSION_ID,
  THREAD_ID,
  CARD_ID,
} from "../ksa/_shared/localDb";
