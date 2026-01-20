/**
 * Lakitu KSA SDK
 *
 * Type-safe SDK for defining KSAs (Knowledge, Skills, and Abilities).
 * KSAs are capability modules that AI agents can use via code execution.
 *
 * ## Quick Import Reference
 *
 * ```typescript
 * // Main SDK - KSA builders and primitives
 * import { defineKSA, fn, service, callGateway, localDb } from '@lakitu/sdk';
 *
 * // Tree-shakeable imports
 * import { callGateway, THREAD_ID } from '@lakitu/sdk/gateway';
 * import { localDb, getSessionId } from '@lakitu/sdk/db';
 * import { defineKSA, fn, service } from '@lakitu/sdk/builders';
 * ```
 *
 * @example
 * ```typescript
 * import { defineKSA, fn, service, callGateway } from '@lakitu/sdk';
 *
 * // Define a KSA
 * export const myKSA = defineKSA('myKsa')
 *   .description('My custom KSA')
 *   .category('skills')
 *   .fn('doSomething', fn()
 *     .description('Does something')
 *     .param('input', { type: 'string', required: true })
 *     .impl(service('services.MyService.internal.action')
 *       .mapArgs(({ input }) => ({ data: input }))
 *     )
 *   )
 *   .build();
 *
 * // Use gateway in KSA implementation
 * const result = await callGateway('features.myFeature.getData', { id: '123' });
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Core types
  ParamType,
  ParamDef,
  KSACategory,
  KSADef,
  KSADefinition,
  FunctionDef,

  // Implementation types
  Implementation,
  ServiceImpl,
  PrimitiveImpl,
  CompositeImpl,
  CompositeStep,
  StepContext,

  // Config types
  ConfigField,
  ConfigFieldOption,
  KSAConfig,

  // Execution types
  ExecutionContext,
  ExecutionResult,

  // Registry types
  KSARegistry,
} from "./types";

// ============================================================================
// Builders
// ============================================================================

export {
  // KSA builder
  defineKSA,
  KSABuilder,

  // Function builder
  fn,
  FunctionBuilder,

  // Implementation builders
  service,
  ServiceBuilder,
  primitive,
  composite,
  CompositeBuilder,

  // Registry utilities
  createRegistry,
  getFunction,
} from "./builders";

// ============================================================================
// Primitives (local sandbox operations)
// ============================================================================

export {
  file,
  shell,
  browser,
  getPrimitive,
  hasPrimitive,
  PRIMITIVES,
} from "./primitives";

// ============================================================================
// Gateway (cloud Convex access from sandbox)
// ============================================================================

export {
  callGateway,
  callGatewayBatch,
  fireAndForget,
  getGatewayConfig,
  THREAD_ID,
  CARD_ID,
  WORKSPACE_ID,
} from "./gateway";

export type { BatchCall, BatchResult } from "./gateway";

// ============================================================================
// Local DB (sandbox Convex access)
// ============================================================================

export {
  localDb,
  getSessionId,
  getThreadId,
  getCardId,
  isLocalDbAvailable,
  getLocalDbConfig,
  cacheKey,
  simpleHash,
  SESSION_ID,
} from "./db";
