/**
 * KSA Index - Knowledge, Skills, and Abilities
 *
 * Central registry and discovery for all KSAs.
 * Use this to understand what capabilities are available.
 *
 * ## Categories
 *
 * - **core**: Always available - fundamental operations every agent needs
 * - **skills**: Research & data gathering - require explicit enablement
 * - **deliverables**: Non-standard output formats (PDF, email) - require explicit enablement
 *
 * ## Local DB Framework Integration
 *
 * All KSAs are automatically wrapped with the framework proxy layer.
 * This enables:
 * - **Caching**: Avoid redundant API calls
 * - **File Tracking**: Automatic file state tracking in local DB
 * - **Call Logging**: Observe what the agent does
 * - **Session Persistence**: Store results across agent runs
 *
 * The KSA_REGISTRY is auto-generated from KSA source files.
 * Run `bun generate:ksa` to regenerate.
 */

import { createKSAProxyAuto } from "./_shared/ksaProxy";

// ============================================================================
// Raw Module Imports
// ============================================================================

import * as fileRaw from "./file";
import * as contextRaw from "./context";
import * as artifactsRaw from "./artifacts";
import * as beadsRaw from "./beads";
import * as webRaw from "./web";
import * as newsRaw from "./news";
import * as socialRaw from "./social";
import * as adsRaw from "./ads";
import * as companiesRaw from "./companies";
import * as browserRaw from "./browser";
import * as pdfRaw from "./pdf";
import * as emailRaw from "./email";
import * as boardsRaw from "./boards";
import * as boardDSLRaw from "./boardDSL";
import * as brandLibraryRaw from "./brandLibrary";
import * as brandResearchRaw from "./brandResearch";
import * as brandIntelRaw from "./brandIntel";
import * as workspacesRaw from "./workspaces";
import * as framesRaw from "./frames";
import * as loggerRaw from "./logger";

// ============================================================================
// Proxied KSA Exports (with automatic local DB integration)
// ============================================================================

// Core KSAs (always available)
export const file = createKSAProxyAuto("file", fileRaw);
export const context = createKSAProxyAuto("context", contextRaw);
export const artifacts = createKSAProxyAuto("artifacts", artifactsRaw);
export const beads = createKSAProxyAuto("beads", beadsRaw);

// Skills KSAs (research & data gathering)
export const web = createKSAProxyAuto("web", webRaw);
export const news = createKSAProxyAuto("news", newsRaw);
export const social = createKSAProxyAuto("social", socialRaw);
export const ads = createKSAProxyAuto("ads", adsRaw);
export const companies = createKSAProxyAuto("companies", companiesRaw);
export const browser = createKSAProxyAuto("browser", browserRaw);

// Deliverables KSAs (non-standard output formats)
export const pdf = createKSAProxyAuto("pdf", pdfRaw);
export const email = createKSAProxyAuto("email", emailRaw);

// App-wide KSAs (app services and management)
export const boards = createKSAProxyAuto("boards", boardsRaw);
export const boardDSL = createKSAProxyAuto("boardDSL", boardDSLRaw);
export const brandLibrary = createKSAProxyAuto("brandLibrary", brandLibraryRaw);
export const brandResearch = createKSAProxyAuto("brandResearch", brandResearchRaw);
export const brandIntel = createKSAProxyAuto("brandIntel", brandIntelRaw);
export const workspaces = createKSAProxyAuto("workspaces", workspacesRaw);
export const frames = createKSAProxyAuto("frames", framesRaw);
export const logger = createKSAProxyAuto("logger", loggerRaw);

// Legacy alias - use 'brandLibrary' instead
/** @deprecated Use 'brandLibrary' instead */
export const brandscan = brandLibrary;

// Legacy alias - use 'artifacts' instead
/** @deprecated Use 'artifacts' instead */
export const { saveArtifact, readArtifact, listArtifacts } = artifacts as typeof artifactsRaw;

// ============================================================================
// Re-exports from Generated Registry
// ============================================================================

// Types
export type { KSAInfo, KSACategory, KSAGroup } from "./_generated/registry";

// Registry and discovery functions
export {
  KSA_REGISTRY,
  CORE_KSAS,
  getAllKSAs,
  getKSA,
  getKSAsByCategory,
  getKSAsByNames,
  searchKSAs,
} from "./_generated/registry";

// Policy functions
export {
  getServicePathsForKSAs,
  isServicePathAllowed,
} from "./_generated/registry";

// ============================================================================
// Re-exports from Config Schemas
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
  // Framework config
  FRAMEWORK_CONFIG_SCHEMA,
  FRAMEWORK_DEFAULTS,
  getFrameworkConfig,
} from "./_shared/configSchemas";

export type { FrameworkConfig } from "./_shared/configSchemas";

// ============================================================================
// Re-exports from Local DB Framework
// ============================================================================

export {
  localDb,
  getSessionId,
  getThreadId,
  getCardId,
  isLocalDbAvailable,
  getLocalDbConfig,
} from "./_shared/localDb";

export {
  createKSAProxy,
  createKSAProxies,
  createKSAProxyAuto,
  isProxyDisabled,
  getProxyDebugInfo,
} from "./_shared/ksaProxy";

export type { ProxyOptions } from "./_shared/ksaProxy";

export {
  KSA_BEHAVIORS,
  getBehavior,
  hasCustomBehaviors,
} from "./_shared/ksaBehaviors";

export type {
  KSABehavior,
  BeforeHook,
  AfterHook,
  HookContext,
  BeforeHookResult,
} from "./_shared/ksaBehaviors";

// ============================================================================
// Prompt Generation
// ============================================================================

import { KSA_REGISTRY, type KSACategory, type KSAInfo } from "./_generated/registry";

const CATEGORY_LABELS: Record<KSACategory, string> = {
  core: "Core (Always Available)",
  skills: "Skills (Research & Data)",
  deliverables: "Deliverables (Output Formats)",
};

/**
 * Generate a summary of KSAs for the system prompt.
 * @param allowedKSAs - If provided, only include these KSAs (core always included)
 */
export function generateKSASummary(allowedKSAs?: string[]): string {
  const lines: string[] = ["## Available KSAs (Knowledge, Skills, Abilities)\n"];

  // If allowedKSAs provided, include core + allowed; otherwise include all
  const ksasToInclude = allowedKSAs
    ? KSA_REGISTRY.filter(k => k.category === "core" || allowedKSAs.includes(k.name))
    : KSA_REGISTRY;

  const byCategory = new Map<KSACategory, KSAInfo[]>();
  for (const ksa of ksasToInclude) {
    if (!byCategory.has(ksa.category)) {
      byCategory.set(ksa.category, []);
    }
    byCategory.get(ksa.category)!.push(ksa);
  }

  // Order: core first, then skills, then deliverables
  const categoryOrder: KSACategory[] = ["core", "skills", "deliverables"];

  for (const category of categoryOrder) {
    const ksas = byCategory.get(category);
    if (!ksas || ksas.length === 0) continue;

    lines.push(`### ${CATEGORY_LABELS[category]}\n`);
    for (const ksa of ksas) {
      lines.push(`**${ksa.name}** - ${ksa.description}`);
      lines.push(`\`import { ${ksa.functions.slice(0, 3).join(", ")}${ksa.functions.length > 3 ? ", ..." : ""} } from '${ksa.importPath}';\``);
      lines.push("");
    }
  }

  if (allowedKSAs) {
    const notAllowed = KSA_REGISTRY.filter(k => k.category !== "core" && !allowedKSAs.includes(k.name));
    if (notAllowed.length > 0) {
      lines.push(`\n> **Note:** The following KSAs are NOT available for this task: ${notAllowed.map(k => k.name).join(", ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate import examples for allowed KSAs.
 */
export function generateKSAImportExamples(allowedKSAs?: string[]): string {
  const ksas = allowedKSAs
    ? KSA_REGISTRY.filter(k => k.category === "core" || allowedKSAs.includes(k.name))
    : KSA_REGISTRY;

  return ksas.map(k =>
    `// ${k.description}\nimport { ${k.functions.slice(0, 2).join(", ")} } from '${k.importPath}';`
  ).join("\n\n");
}
