/**
 * KSA SDK Builders
 *
 * Fluent API for defining KSAs with full TypeScript type safety.
 *
 * @example
 * ```typescript
 * import { defineKSA, fn, service, primitive } from '@lakitu/sdk';
 *
 * export const webKSA = defineKSA('web')
 *   .description('Web search and content extraction')
 *   .category('skills')
 *   .group('research')
 *   .fn('search', fn()
 *     .description('Search the web')
 *     .param('query', { type: 'string', required: true })
 *     .param('maxResults', { type: 'number', default: 10 })
 *     .returns<SearchResult[]>()
 *     .impl(service('services.Valyu.internal.search')
 *       .mapArgs(({ query, maxResults }) => ({ query, maxResults, fastMode: true }))
 *       .mapResult(r => r.results || [])
 *     )
 *   )
 *   .build();
 * ```
 */

import type {
  KSADef,
  KSACategory,
  FunctionDef,
  ParamDef,
  ParamType,
  Implementation,
  ServiceImpl,
  PrimitiveImpl,
  CompositeImpl,
  CompositeStep,
  StepContext,
} from "./types";

// ============================================================================
// Service Builder
// ============================================================================

export class ServiceBuilder<TArgs = Record<string, unknown>, TResult = unknown> {
  private _path: string;
  private _mapArgs?: (args: TArgs) => Record<string, unknown>;
  private _mapResult?: (result: unknown) => TResult;

  constructor(path: string) {
    this._path = path;
  }

  /** Map input arguments to service arguments */
  mapArgs<T extends TArgs>(mapper: (args: T) => Record<string, unknown>): ServiceBuilder<T, TResult> {
    this._mapArgs = mapper as (args: TArgs) => Record<string, unknown>;
    return this as unknown as ServiceBuilder<T, TResult>;
  }

  /** Map service result to function return type */
  mapResult<T>(mapper: (result: unknown) => T): ServiceBuilder<TArgs, T> {
    this._mapResult = mapper as unknown as (result: unknown) => TResult;
    return this as unknown as ServiceBuilder<TArgs, T>;
  }

  build(): ServiceImpl<TArgs, TResult> {
    return {
      type: "service",
      path: this._path,
      mapArgs: this._mapArgs,
      mapResult: this._mapResult,
    };
  }
}

/** Create a service implementation */
export function service(path: string): ServiceBuilder {
  return new ServiceBuilder(path);
}

// ============================================================================
// Primitive Builder
// ============================================================================

/** Create a primitive implementation */
export function primitive(name: string): PrimitiveImpl {
  return { type: "primitive", name };
}

// ============================================================================
// Composite Builder
// ============================================================================

export class CompositeBuilder {
  private _steps: CompositeStep[] = [];

  /** Call another KSA function */
  call(
    fnPath: string,
    args?: Record<string, unknown> | ((ctx: StepContext) => Record<string, unknown>),
    as?: string
  ): CompositeBuilder {
    this._steps.push({ call: fnPath, args, as });
    return this;
  }

  /** Return a value */
  return(value: unknown | ((ctx: StepContext) => unknown)): CompositeBuilder {
    this._steps.push({ return: value });
    return this;
  }

  build(): CompositeImpl {
    return { type: "composite", steps: this._steps };
  }
}

/** Create a composite implementation */
export function composite(): CompositeBuilder {
  return new CompositeBuilder();
}

// ============================================================================
// Function Builder
// ============================================================================

export class FunctionBuilder<
  TParams extends Record<string, ParamDef> = Record<string, never>,
  TResult = unknown,
> {
  private _description = "";
  private _params: Record<string, ParamDef> = {};
  private _impl?: Implementation;
  private _returns?: { type: string; description?: string };

  /** Set function description */
  description(desc: string): this {
    this._description = desc;
    return this;
  }

  /** Add a parameter */
  param<K extends string, T extends ParamType>(
    name: K,
    def: ParamDef & { type: T }
  ): FunctionBuilder<TParams & Record<K, ParamDef & { type: T }>, TResult> {
    this._params[name] = def;
    return this as unknown as FunctionBuilder<TParams & Record<K, ParamDef & { type: T }>, TResult>;
  }

  /** Set return type info */
  returns<T>(typeInfo?: { type: string; description?: string }): FunctionBuilder<TParams, T> {
    this._returns = typeInfo;
    return this as unknown as FunctionBuilder<TParams, T>;
  }

  /** Set implementation */
  impl(implementation: Implementation | ServiceBuilder | CompositeBuilder): this {
    if (implementation instanceof ServiceBuilder) {
      this._impl = implementation.build() as Implementation;
    } else if (implementation instanceof CompositeBuilder) {
      this._impl = implementation.build() as Implementation;
    } else {
      this._impl = implementation;
    }
    return this;
  }

  build(name: string): FunctionDef {
    if (!this._impl) {
      throw new Error(`Function "${name}" has no implementation`);
    }
    return {
      name,
      description: this._description,
      params: this._params,
      impl: this._impl,
      returns: this._returns,
    };
  }
}

/** Create a function builder */
export function fn(): FunctionBuilder {
  return new FunctionBuilder();
}

// ============================================================================
// KSA Builder
// ============================================================================

export class KSABuilder {
  private _name: string;
  private _description = "";
  private _category: KSACategory = "skills";
  private _group?: string;
  private _icon?: string;
  private _functions: FunctionDef[] = [];

  constructor(name: string) {
    this._name = name;
  }

  /** Set KSA description */
  description(desc: string): this {
    this._description = desc;
    return this;
  }

  /** Set KSA category */
  category(cat: KSACategory): this {
    this._category = cat;
    return this;
  }

  /** Set KSA group (subcategory) */
  group(grp: string): this {
    this._group = grp;
    return this;
  }

  /** Set KSA icon (MDI icon name) */
  icon(ico: string): this {
    this._icon = ico;
    return this;
  }

  /** Add a function to the KSA */
  fn(name: string, builder: FunctionBuilder): this {
    this._functions.push(builder.build(name));
    return this;
  }

  /** Build the KSA definition */
  build(): KSADef {
    return {
      name: this._name,
      description: this._description,
      category: this._category,
      group: this._group,
      icon: this._icon,
      functions: this._functions,
    };
  }
}

/** Create a KSA builder */
export function defineKSA(name: string): KSABuilder {
  return new KSABuilder(name);
}

// ============================================================================
// Registry Builder
// ============================================================================

/** Create a registry from KSA definitions */
export function createRegistry(...ksas: KSADef[]): Map<string, KSADef> {
  const registry = new Map<string, KSADef>();
  for (const ksa of ksas) {
    registry.set(ksa.name, ksa);
  }
  return registry;
}

/** Get a function from a registry */
export function getFunction(
  registry: Map<string, KSADef>,
  ksaName: string,
  fnName: string
): FunctionDef | undefined {
  const ksa = registry.get(ksaName);
  if (!ksa) return undefined;
  return ksa.functions.find((f) => f.name === fnName);
}
