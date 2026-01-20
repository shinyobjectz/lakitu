/**
 * Lakitu Cloudflare Integration
 *
 * Utilities for R2 storage, workers, and deployment.
 *
 * @example
 * ```typescript
 * import { R2Storage, createFramesWorker } from '@lakitu/sdk/cloudflare';
 *
 * // Use R2 for frame storage
 * const storage = new R2Storage(env.FRAMES_BUCKET);
 * await storage.putFrame('my-site', 'index.html', content);
 * ```
 *
 * @packageDocumentation
 */

export * from "./r2";
export * from "./types";
