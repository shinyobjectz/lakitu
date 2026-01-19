/**
 * KSA SDK Type Definitions
 *
 * Core types for the type-safe KSA builder system.
 */

// ============================================================================
// Parameter Types
// ============================================================================

export type ParamType = "string" | "number" | "boolean" | "array" | "object";

export interface ParamDef<T = unknown> {
  type: ParamType;
  required?: boolean;
  default?: T;
  description?: string;
  enum?: string[];
}

export type InferParamType<P extends ParamDef> = P["type"] extends "string"
  ? string
  : P["type"] extends "number"
    ? number
    : P["type"] extends "boolean"
      ? boolean
      : P["type"] extends "array"
        ? unknown[]
        : P["type"] extends "object"
          ? Record<string, unknown>
          : unknown;

// ============================================================================
// Implementation Types
// ============================================================================

/** Service implementation - calls cloud Convex via gateway */
export interface ServiceImpl<TArgs = unknown, TResult = unknown> {
  type: "service";
  path: string;
  mapArgs?: (args: TArgs) => Record<string, unknown>;
  mapResult?: (result: unknown) => TResult;
  /** Convex function type: query, mutation, or action */
  callType?: "query" | "mutation" | "action";
}

/** Primitive implementation - uses local capabilities */
export interface PrimitiveImpl {
  type: "primitive";
  name: string;
}

/** Composite step for chaining operations */
export interface CompositeStep {
  call?: string;
  args?: Record<string, unknown> | ((ctx: StepContext) => Record<string, unknown>);
  as?: string;
  return?: unknown | ((ctx: StepContext) => unknown);
}

export interface StepContext {
  vars: Record<string, unknown>;
  args: Record<string, unknown>;
}

/** Composite implementation - chains multiple operations */
export interface CompositeImpl {
  type: "composite";
  steps: CompositeStep[];
}

export type Implementation = ServiceImpl | PrimitiveImpl | CompositeImpl;

// ============================================================================
// Function Definition
// ============================================================================

export interface FunctionDef<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  params: Record<string, ParamDef>;
  impl: Implementation;
  returns?: {
    type: string;
    description?: string;
  };
  _argsType?: TArgs;
  _resultType?: TResult;
}

// ============================================================================
// KSA Definition
// ============================================================================

export type KSACategory = "core" | "skills" | "deliverables";

export interface KSADef {
  name: string;
  description: string;
  category: KSACategory;
  group?: string;
  icon?: string;
  functions: FunctionDef[];
}

// ============================================================================
// Config Types (for UI/admin)
// ============================================================================

export interface ConfigFieldOption {
  value: string | number | boolean;
  label: string;
}

export interface ConfigField {
  type: "string" | "number" | "boolean" | "select" | "multiselect" | "textarea" | "array";
  label: string;
  description?: string;
  placeholder?: string;
  options?: ConfigFieldOption[];
  min?: number;
  max?: number;
  default: unknown;
}

export interface KSAConfig {
  configSchema?: Record<string, ConfigField>;
  defaults?: Record<string, unknown>;
}

// ============================================================================
// Full KSA Definition (with metadata for DB storage)
// ============================================================================

export interface KSADefinition extends KSADef, KSAConfig {
  isBuiltIn: boolean;
  userId?: string;
  orgId?: string;
  version?: number;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionContext {
  threadId?: string;
  cardId?: string;
  workspaceId?: string;
  config?: Record<string, unknown>;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

// ============================================================================
// Registry Types
// ============================================================================

export interface KSARegistry {
  ksas: Map<string, KSADef>;
  getKSA(name: string): KSADef | undefined;
  getFunction(ksaName: string, fnName: string): FunctionDef | undefined;
  listKSAs(category?: KSACategory): KSADef[];
}
