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
 */

// ============================================================================
// Re-exports for Convenience
// ============================================================================

// Core KSAs (always available)
export * as file from "./file";
export * as context from "./context";
export * as artifacts from "./artifacts";
export * as beads from "./beads";

// Skills KSAs (research & data gathering)
export * as web from "./web";
export * as news from "./news";
export * as social from "./social";
export * as companies from "./companies";
export * as browser from "./browser";

// Deliverables KSAs (non-standard output formats)
export * as pdf from "./pdf";
export * as email from "./email";

// App-wide KSAs (app services and management)
export * as boards from "./boards";
export * as brandscan from "./brandscan";
export * as workspaces from "./workspaces";
export * as frames from "./frames";

// Legacy alias - use 'artifacts' instead
/** @deprecated Use 'artifacts' instead */
export { saveArtifact, readArtifact, listArtifacts } from "./artifacts";

// ============================================================================
// KSA Registry Types
// ============================================================================

import {
  CONFIG_SCHEMAS,
  CONFIG_DEFAULTS,
  KSA_PRESETS,
  type ConfigField,
  type PresetDefinition,
  getConfigSchema as _getConfigSchema,
  getConfigDefaults as _getConfigDefaults,
  getPreset as _getPreset,
  getPresetsForKSA as _getPresetsForKSA,
  resolvePreset as _resolvePreset,
} from "./_shared/configSchemas";

// Re-export config utilities
export {
  type ConfigField,
  type PresetDefinition,
  CONFIG_SCHEMAS,
  CONFIG_DEFAULTS,
  KSA_PRESETS,
};
export const getConfigSchema = _getConfigSchema;
export const getConfigDefaults = _getConfigDefaults;
export const getPreset = _getPreset;
export const getPresetsForKSA = _getPresetsForKSA;
export const resolvePreset = _resolvePreset;

export type KSACategory = "core" | "skills" | "deliverables";

export interface KSAInfo {
  name: string;
  description: string;
  category: KSACategory;
  functions: string[];
  importPath: string;
  /** Service paths this KSA calls (for policy enforcement) */
  servicePaths?: string[];
  /** Whether this KSA runs locally (no cloud calls) */
  isLocal?: boolean;
  /** Icon for UI display (mdi: format) */
  icon?: string;
  /** Configuration schema for this KSA */
  configSchema?: Record<string, ConfigField>;
  /** Default configuration values */
  defaults?: Record<string, unknown>;
}

// ============================================================================
// KSA Registry - Source of Truth
// ============================================================================

/**
 * Registry of all available KSAs.
 * This is the source of truth for discovery and policy enforcement.
 */
export const KSA_REGISTRY: KSAInfo[] = [
  // =========================================================================
  // CORE KSAs - Always Available
  // =========================================================================
  {
    name: "file",
    description: "Read, write, edit, and search files in the workspace",
    category: "core",
    functions: ["read", "write", "edit", "glob", "grep", "ls"],
    importPath: "./ksa/file",
    isLocal: true,
    icon: "mdi:file-document-outline",
  },
  {
    name: "context",
    description: "Access card context, variables, and stage information",
    category: "core",
    functions: ["getContext", "setVariable", "getVariable"],
    importPath: "./ksa/context",
    servicePaths: ["features.kanban.executor.getCardContext", "features.kanban.executor.setCardVariable"],
    icon: "mdi:database-outline",
  },
  {
    name: "artifacts",
    description: "Save and retrieve artifacts (markdown, JSON, CSV, text) that persist across stages",
    category: "core",
    functions: ["saveArtifact", "readArtifact", "listArtifacts"],
    importPath: "./ksa/artifacts",
    servicePaths: [
      "features.kanban.artifacts.saveArtifactWithBackup",
      "features.kanban.artifacts.getArtifact",
      "features.kanban.artifacts.listCardArtifacts",
    ],
    icon: "mdi:package-variant-closed",
    configSchema: CONFIG_SCHEMAS.artifacts,
    defaults: CONFIG_DEFAULTS.artifacts,
  },
  {
    name: "beads",
    description: "Track tasks and issues with the Beads distributed issue tracker",
    category: "core",
    functions: ["create", "update", "close", "list", "getReady", "get"],
    importPath: "./ksa/beads",
    isLocal: true,
    icon: "mdi:checkbox-multiple-outline",
  },

  // =========================================================================
  // SKILLS KSAs - Research & Data Gathering (Opt-in)
  // =========================================================================
  {
    name: "web",
    description: "Search the web, scrape content from URLs, get news",
    category: "skills",
    functions: ["search", "scrape", "news", "brandNews", "webResearch"],
    importPath: "./ksa/web",
    servicePaths: [
      "services.Valyu.internal.search",
      "services.APITube.internal.search",
    ],
    icon: "mdi:web",
    configSchema: CONFIG_SCHEMAS.web,
    defaults: CONFIG_DEFAULTS.web,
  },
  {
    name: "news",
    description: "Advanced news research - search, monitor brands, analyze sentiment",
    category: "skills",
    functions: [
      "search",
      "trending",
      "breakingNews",
      "monitorBrand",
      "monitorOrganization",
      "analyzeSentiment",
      "compareTopics",
    ],
    importPath: "./ksa/news",
    servicePaths: ["services.APITube.internal.call"],
    icon: "mdi:newspaper",
    configSchema: CONFIG_SCHEMAS.news,
    defaults: CONFIG_DEFAULTS.news,
  },
  {
    name: "social",
    description: "Scrape social media profiles and posts (TikTok, Instagram, Twitter, YouTube, LinkedIn)",
    category: "skills",
    functions: [
      "tiktokProfile",
      "instagramProfile",
      "youtubeProfile",
      "twitterProfile",
      "linkedinProfile",
      "tiktokPosts",
      "instagramPosts",
      "twitterPosts",
      "searchSocial",
    ],
    importPath: "./ksa/social",
    servicePaths: ["services.ScrapeCreators.internal.call"],
    icon: "mdi:account-group",
    configSchema: CONFIG_SCHEMAS.social,
    defaults: CONFIG_DEFAULTS.social,
  },
  {
    name: "companies",
    description: "Enrich company data by domain - industry, employees, tech stack, funding",
    category: "skills",
    functions: [
      "enrichDomain",
      "enrichCompany",
      "bulkEnrich",
      "searchCompanies",
      "findSimilar",
      "companiesByTech",
      "getTechStack",
    ],
    importPath: "./ksa/companies",
    servicePaths: ["services.TheCompanies.internal.call"],
    icon: "mdi:office-building",
    configSchema: CONFIG_SCHEMAS.companies,
    defaults: CONFIG_DEFAULTS.companies,
  },
  {
    name: "browser",
    description: "Automate browser interactions - navigate, click, type, screenshot",
    category: "skills",
    functions: ["open", "screenshot", "click", "type", "getText", "getHtml", "closeBrowser"],
    importPath: "./ksa/browser",
    isLocal: true,
    icon: "mdi:web-box",
    configSchema: CONFIG_SCHEMAS.browser,
    defaults: CONFIG_DEFAULTS.browser,
  },

  // =========================================================================
  // DELIVERABLES KSAs - Non-Standard Output Formats (Opt-in)
  // =========================================================================
  {
    name: "pdf",
    description: "Generate PDF documents from markdown content",
    category: "deliverables",
    functions: ["generate"],
    importPath: "./ksa/pdf",
    isLocal: true,
    icon: "mdi:file-pdf-box",
    configSchema: CONFIG_SCHEMAS.pdf,
    defaults: CONFIG_DEFAULTS.pdf,
  },
  {
    name: "email",
    description: "Send emails via SendGrid - text, HTML, attachments, templates",
    category: "deliverables",
    functions: ["send", "sendText", "sendHtml", "sendWithAttachment", "sendTemplate", "sendBulk"],
    importPath: "./ksa/email",
    servicePaths: ["services.SendGrid.internal.send"],
    icon: "mdi:email-outline",
    configSchema: CONFIG_SCHEMAS.email,
    defaults: CONFIG_DEFAULTS.email,
  },

  // =========================================================================
  // APP-WIDE KSAs - App Services and Management (Opt-in)
  // =========================================================================
  {
    name: "boards",
    description: "Create, manage, and execute kanban boards with automated workflows. Supports templates for common use cases.",
    category: "skills",
    functions: [
      "listBoards",
      "getBoard",
      "createBoard",
      "addCard",
      "runCard",
      "getCardStatus",
      "waitForCard",
      "stopCard",
      "getCompletedCards",
      "listTemplates",
      "getTemplate",
      "createBoardFromTemplate",
    ],
    importPath: "./ksa/boards",
    servicePaths: [
      "features.kanban.boards.list",
      "features.kanban.boards.get",
      "features.kanban.boards.create",
      "features.kanban.boards.update",
      "features.kanban.boards.addTask",
      "features.kanban.boards.addCard",
      "features.kanban.boards.getCard",
      "features.kanban.boards.getCardWithArtifacts",
      "features.kanban.boards.stopCard",
      "features.kanban.boards.getCompletedCards",
      "features.kanban.templates.listTemplates",
      "features.kanban.templates.getTemplate",
      "features.kanban.templates.createBoardFromTemplate",
      "agent.workflows.agentBoard.startCardExecution",
    ],
    icon: "mdi:view-kanban",
  },
  {
    name: "brandscan",
    description: "Initiate and monitor brand intelligence scans for domains",
    category: "skills",
    functions: ["startScan", "getScanStatus", "waitForScan", "getBrandData", "getBrandSummary", "listBrands", "getBrandByDomain", "listScans"],
    importPath: "./ksa/brandscan",
    servicePaths: [
      "features.brands.orchestration.scans.startFullScan",
      "features.brands.orchestration.scans.getLatest",
      "features.brands.orchestration.scans.list",
      "features.brands.core.crud.get",
      "features.brands.core.crud.getByDomain",
      "features.brands.core.crud.list",
      "features.brands.core.products.getBrandIntelligenceSummary",
    ],
    icon: "mdi:radar",
  },
  {
    name: "workspaces",
    description: "Create and manage design workspaces with canvas tools",
    category: "skills",
    functions: ["listWorkspaces", "createWorkspace", "getWorkspace", "updateWorkspaceName", "deleteWorkspace", "getCanvas", "saveCanvas", "addCanvasElement", "removeCanvasElement", "updateCanvasElement", "addConnection", "listDesigns", "saveDesign"],
    importPath: "./ksa/workspaces",
    servicePaths: [
      "features.workspaces.workspaces.list",
      "features.workspaces.workspaces.create",
      "features.workspaces.workspaces.get",
      "features.workspaces.workspaces.updateName",
      "features.workspaces.workspaces.remove",
      "features.workspaces.canvas.get",
      "features.workspaces.canvas.save",
      "features.workspaces.designs.listDesigns",
      "features.workspaces.designs.saveDesign",
    ],
    icon: "mdi:palette",
  },
  {
    name: "frames",
    description: "Generate and edit visual frames (HTML/Tailwind/Svelte components)",
    category: "skills",
    functions: ["createFrame", "getFrame", "listFrames", "updateFrame", "deleteFrame", "generateFrame", "createPage", "getPage", "listPages", "updatePage", "getTemplates", "getAdSpecs", "snapshotFrame", "rollbackFrame", "trackView", "trackConversion"],
    importPath: "./ksa/frames",
    servicePaths: [
      "features.frames.crud.createFrame",
      "features.frames.crud.getFrame",
      "features.frames.crud.listFrames",
      "features.frames.crud.updateFrame",
      "features.frames.crud.deleteFrame",
      "features.frames.crud.createPage",
      "features.frames.crud.getPage",
      "features.frames.crud.listPages",
      "features.frames.crud.updatePage",
      "features.frames.templates.listTemplates",
      "features.frames.ads.getAdSpecs",
      "features.frames.versions.snapshot",
      "features.frames.versions.rollback",
      "features.frames.analytics.trackView",
      "features.frames.analytics.trackConversion",
      "services.OpenRouter.internal.chat",
    ],
    icon: "mdi:image-frame",
  },
];

// ============================================================================
// Core KSAs - Always Available
// ============================================================================

/** Names of core KSAs that are always available */
export const CORE_KSAS = KSA_REGISTRY.filter(k => k.category === "core").map(k => k.name);

/** Get the core KSAs that are always available */
export function getCoreKSAs(): KSAInfo[] {
  return KSA_REGISTRY.filter(k => k.category === "core");
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Get all available KSAs.
 */
export function getAllKSAs(): KSAInfo[] {
  return KSA_REGISTRY;
}

/**
 * Get KSAs by category.
 */
export function getKSAsByCategory(category: KSACategory): KSAInfo[] {
  return KSA_REGISTRY.filter((k) => k.category === category);
}

/**
 * Find a KSA by name.
 */
export function getKSA(name: string): KSAInfo | undefined {
  return KSA_REGISTRY.find((k) => k.name === name);
}

/**
 * Get multiple KSAs by names.
 */
export function getKSAsByNames(names: string[]): KSAInfo[] {
  return KSA_REGISTRY.filter((k) => names.includes(k.name));
}

/**
 * Search KSAs by keyword in name or description.
 */
export function searchKSAs(keyword: string): KSAInfo[] {
  const lower = keyword.toLowerCase();
  return KSA_REGISTRY.filter(
    (k) =>
      k.name.toLowerCase().includes(lower) ||
      k.description.toLowerCase().includes(lower) ||
      k.functions.some((f) => f.toLowerCase().includes(lower))
  );
}

/**
 * Get all service paths for a list of KSAs.
 * Used for policy enforcement.
 */
export function getServicePathsForKSAs(ksaNames: string[]): string[] {
  const paths = new Set<string>();
  for (const name of ksaNames) {
    const ksa = getKSA(name);
    if (ksa?.servicePaths) {
      ksa.servicePaths.forEach(p => paths.add(p));
    }
  }
  return Array.from(paths);
}

/**
 * Check if a service path is allowed for a set of KSAs.
 */
export function isServicePathAllowed(path: string, allowedKSANames: string[]): boolean {
  // Core KSAs are always allowed
  const allAllowed = [...CORE_KSAS, ...allowedKSANames];
  const allowedPaths = getServicePathsForKSAs(allAllowed);
  return allowedPaths.some(p => path.startsWith(p) || p.startsWith(path));
}

// ============================================================================
// Prompt Generation
// ============================================================================

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
