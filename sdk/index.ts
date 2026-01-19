/**
 * Lakitu KSA SDK
 *
 * Type-safe SDK for defining KSAs (Knowledge, Skills, and Abilities).
 * KSAs are capability modules that AI agents can use via code execution.
 *
 * @example
 * ```typescript
 * import { defineKSA, fn, service } from '@lakitu/sdk';
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
