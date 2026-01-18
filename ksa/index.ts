/**
 * KSA Index - Knowledge, Skills, and Abilities
 *
 * This module re-exports from the Lakitu SDK and definitions.
 *
 * ## Architecture
 *
 * KSAs are now defined in `convex/lakitu/definitions/` using the TypeScript SDK
 * from `packages/lakitu/sdk/`. This file provides backward compatibility.
 *
 * ## Usage
 *
 * ```typescript
 * // Import the SDK for defining custom KSAs
 * import { defineKSA, fn, service, primitive } from '@lakitu/sdk';
 *
 * // Import KSA definitions
 * import { fileKSA, webKSA } from 'convex/lakitu/definitions';
 *
 * // Execute KSA functions
 * import { executeFunction, createKSAProxy } from '@lakitu/sdk';
 * ```
 */

// ============================================================================
// Re-export SDK
// ============================================================================

export {
  // Types
  type KSADef,
  type KSADefinition,
  type FunctionDef,
  type ParamDef,
  type ParamType,
  type Implementation,
  type ServiceImpl,
  type PrimitiveImpl,
  type CompositeImpl,
  type ExecutionContext,
  type ExecutionResult,

  // Builders
  defineKSA,
  fn,
  service,
  primitive,
  composite,

  // Runtime
  executeFunction,
  createKSAProxy,
  createKSAProxies,

  // Primitives
  file,
  shell,
  browser,
  getPrimitive,
  hasPrimitive,
  PRIMITIVES,

  // Gateway
  callGateway,
  callGatewayBatch,
  fireAndForget,
} from "../sdk";

// ============================================================================
// Re-export Gateway (for backward compatibility)
// ============================================================================

export {
  callGateway as callGatewayLegacy,
  callGatewayBatch as callGatewayBatchLegacy,
  fireAndForget as fireAndForgetLegacy,
  THREAD_ID,
  CARD_ID,
  WORKSPACE_ID,
  getGatewayConfig,
} from "./_shared/gateway";

// ============================================================================
// Re-export from Generated Registry (for backward compatibility)
// ============================================================================

export type { KSAInfo, KSACategory, KSAGroup } from "./_generated/registry";

export {
  KSA_REGISTRY,
  CORE_KSAS as CORE_KSA_NAMES,
  getAllKSAs,
  getKSA as getKSALegacy,
  getKSAsByCategory as getKSAsByCategoryLegacy,
  getKSAsByNames,
  searchKSAs,
  getServicePathsForKSAs,
  isServicePathAllowed,
} from "./_generated/registry";

// ============================================================================
// Re-export Config Schemas (for backward compatibility)
// ============================================================================

export type { ConfigField, PresetDefinition } from "./_shared/configSchemas";

export {
  CONFIG_SCHEMAS,
  CONFIG_DEFAULTS,
  KSA_PRESETS,
  getConfigSchema,
  getConfigDefaults,
  getPreset,
  getPresetsForKSA,
  resolvePreset,
  FRAMEWORK_CONFIG_SCHEMA,
  FRAMEWORK_DEFAULTS,
  getFrameworkConfig,
} from "./_shared/configSchemas";

export type { FrameworkConfig } from "./_shared/configSchemas";

// ============================================================================
// Re-export Local DB (for backward compatibility)
// ============================================================================

export {
  localDb,
  getSessionId,
  getThreadId,
  getCardId,
  isLocalDbAvailable,
  getLocalDbConfig,
} from "./_shared/localDb";
