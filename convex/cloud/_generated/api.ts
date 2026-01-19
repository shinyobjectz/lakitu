/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as index from "../index.js";
import type * as intentSchema_generate from "../intentSchema/generate.js";
import type * as intentSchema_index from "../intentSchema/index.js";
import type * as intentSchema_types from "../intentSchema/types.js";
import type * as ksaKnowledge from "../ksaKnowledge.js";
import type * as ksaPolicy from "../ksaPolicy.js";
import type * as mail from "../mail.js";
import type * as utils_kanbanContext from "../utils/kanbanContext.js";
import type * as workflows_agentBoard from "../workflows/agentBoard.js";
import type * as workflows_agentPrompt from "../workflows/agentPrompt.js";
import type * as workflows_agentThread from "../workflows/agentThread.js";
import type * as workflows_compileSandbox from "../workflows/compileSandbox.js";
import type * as workflows_crudBoard from "../workflows/crudBoard.js";
import type * as workflows_crudKSAs from "../workflows/crudKSAs.js";
import type * as workflows_crudLorobeads from "../workflows/crudLorobeads.js";
import type * as workflows_crudSkills from "../workflows/crudSkills.js";
import type * as workflows_crudThreads from "../workflows/crudThreads.js";
import type * as workflows_lifecycleSandbox from "../workflows/lifecycleSandbox.js";
import type * as workflows_sandboxConvex from "../workflows/sandboxConvex.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  index: typeof index;
  "intentSchema/generate": typeof intentSchema_generate;
  "intentSchema/index": typeof intentSchema_index;
  "intentSchema/types": typeof intentSchema_types;
  ksaKnowledge: typeof ksaKnowledge;
  ksaPolicy: typeof ksaPolicy;
  mail: typeof mail;
  "utils/kanbanContext": typeof utils_kanbanContext;
  "workflows/agentBoard": typeof workflows_agentBoard;
  "workflows/agentPrompt": typeof workflows_agentPrompt;
  "workflows/agentThread": typeof workflows_agentThread;
  "workflows/compileSandbox": typeof workflows_compileSandbox;
  "workflows/crudBoard": typeof workflows_crudBoard;
  "workflows/crudKSAs": typeof workflows_crudKSAs;
  "workflows/crudLorobeads": typeof workflows_crudLorobeads;
  "workflows/crudSkills": typeof workflows_crudSkills;
  "workflows/crudThreads": typeof workflows_crudThreads;
  "workflows/lifecycleSandbox": typeof workflows_lifecycleSandbox;
  "workflows/sandboxConvex": typeof workflows_sandboxConvex;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
