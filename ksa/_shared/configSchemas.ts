/**
 * KSA Configuration Schemas
 *
 * Defines the configurable options for each KSA.
 * These schemas drive the UI config panel and validation.
 */

// =============================================================================
// Types
// =============================================================================

export type ConfigFieldType =
  | "select"
  | "multiselect"
  | "boolean"
  | "number"
  | "string"
  | "textarea"
  | "array";

export interface ConfigFieldOption {
  value: string | number | boolean;
  label: string;
}

export interface ConfigField {
  type: ConfigFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  options?: ConfigFieldOption[];
  min?: number;
  max?: number;
  default: unknown;
}

export interface PresetDefinition {
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  baseKSA: string;
  lockedConfig: Record<string, unknown>;
}

// =============================================================================
// Universal Fields (present on all KSAs)
// =============================================================================

export const INSTRUCTIONS_FIELD: ConfigField = {
  type: "textarea",
  label: "Custom Instructions",
  description:
    "Instructions for the agent when using this skill (embedded in system prompt)",
  placeholder:
    'e.g., "Focus on enterprise clients" or "Prioritize recent sources"',
  default: "",
};

// =============================================================================
// Framework Config (Local DB Integration)
// =============================================================================

/**
 * Framework-level config fields that control automatic local DB behaviors.
 * These are applied to ALL KSAs via the proxy layer.
 */
export const FRAMEWORK_CONFIG_SCHEMA: Record<string, ConfigField> = {
  // Caching
  cacheResults: {
    type: "boolean",
    label: "Cache Results",
    description: "Cache function results in local DB to avoid redundant calls",
    default: true,
  },
  cacheTTLMs: {
    type: "number",
    label: "Cache TTL (ms)",
    description: "How long cached results are valid (milliseconds)",
    min: 0,
    max: 3600000, // 1 hour max
    default: 300000, // 5 minutes
  },

  // State Tracking
  trackCalls: {
    type: "boolean",
    label: "Track Calls",
    description: "Log all KSA function calls to local DB for debugging",
    default: true,
  },
  trackFileState: {
    type: "boolean",
    label: "Track File State",
    description: "Track file reads/writes/edits in local DB (file KSA only)",
    default: true,
  },

  // Session Persistence
  persistToSession: {
    type: "boolean",
    label: "Persist to Session",
    description: "Store results in session memory for cross-run access",
    default: false,
  },
};

export const FRAMEWORK_DEFAULTS: Record<string, unknown> = {
  cacheResults: true,
  cacheTTLMs: 300000,
  trackCalls: true,
  trackFileState: true,
  persistToSession: false,
};

/**
 * Framework config type for TypeScript consumers.
 */
export interface FrameworkConfig {
  cacheResults: boolean;
  cacheTTLMs: number;
  trackCalls: boolean;
  trackFileState: boolean;
  persistToSession: boolean;
}

/**
 * Get framework config merged with defaults.
 */
export function getFrameworkConfig(
  userConfig: Partial<FrameworkConfig> = {}
): FrameworkConfig {
  return { ...FRAMEWORK_DEFAULTS, ...userConfig } as FrameworkConfig;
}

// =============================================================================
// Web KSA Config
// =============================================================================

export const WEB_CONFIG_SCHEMA: Record<string, ConfigField> = {
  depth: {
    type: "select",
    label: "Research Depth",
    description: "Number of results to fetch",
    options: [
      { value: "quick", label: "Quick (8 results)" },
      { value: "thorough", label: "Thorough (15+ results)" },
    ],
    default: "quick",
  },
  searchType: {
    type: "select",
    label: "Search Type",
    description: "Type of content to search",
    options: [
      { value: "all", label: "All Sources" },
      { value: "web", label: "Web Only" },
      { value: "news", label: "News Only" },
    ],
    default: "all",
  },
  fastMode: {
    type: "boolean",
    label: "Fast Mode",
    description: "Prioritize speed over depth",
    default: true,
  },
  includeSources: {
    type: "array",
    label: "Include Sources",
    description: "Only search these domains (leave empty for all)",
    placeholder: "e.g., techcrunch.com, reuters.com",
    default: [],
  },
  excludeSources: {
    type: "array",
    label: "Exclude Sources",
    description: "Never search these domains",
    placeholder: "e.g., pinterest.com, reddit.com",
    default: [],
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const WEB_DEFAULTS = {
  depth: "quick",
  searchType: "all",
  fastMode: true,
  includeSources: [],
  excludeSources: [],
  instructions: "",
};

// =============================================================================
// Social KSA Config
// =============================================================================

export const SOCIAL_CONFIG_SCHEMA: Record<string, ConfigField> = {
  platforms: {
    type: "multiselect",
    label: "Platforms",
    description: "Social platforms to search",
    options: [
      { value: "instagram", label: "Instagram" },
      { value: "tiktok", label: "TikTok" },
      { value: "youtube", label: "YouTube" },
      { value: "twitter", label: "Twitter/X" },
      { value: "linkedin", label: "LinkedIn" },
    ],
    default: ["instagram", "tiktok"],
  },
  contentTypes: {
    type: "multiselect",
    label: "Content Types",
    description: "Types of content to fetch",
    options: [
      { value: "profiles", label: "Profiles" },
      { value: "posts", label: "Posts" },
      { value: "comments", label: "Comments" },
    ],
    default: ["profiles", "posts"],
  },
  postsLimit: {
    type: "number",
    label: "Posts Limit",
    description: "Maximum posts per profile",
    min: 1,
    max: 50,
    default: 10,
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const SOCIAL_DEFAULTS = {
  platforms: ["instagram", "tiktok"],
  contentTypes: ["profiles", "posts"],
  postsLimit: 10,
  instructions: "",
};

// =============================================================================
// Companies KSA Config
// =============================================================================

export const COMPANIES_CONFIG_SCHEMA: Record<string, ConfigField> = {
  enrichmentLevel: {
    type: "select",
    label: "Enrichment Level",
    description: "Depth of company data",
    options: [
      { value: "basic", label: "Basic (name, domain, logo)" },
      { value: "detailed", label: "Detailed (+ description, industry)" },
      { value: "full", label: "Full (+ employees, funding, tech)" },
    ],
    default: "basic",
  },
  includeTechStack: {
    type: "boolean",
    label: "Include Tech Stack",
    description: "Fetch technology stack information",
    default: false,
  },
  sources: {
    type: "multiselect",
    label: "Data Sources",
    description: "Sources to query",
    options: [
      { value: "domain", label: "Domain Lookup" },
      { value: "linkedin", label: "LinkedIn" },
      { value: "crunchbase", label: "Crunchbase" },
    ],
    default: ["domain"],
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const COMPANIES_DEFAULTS = {
  enrichmentLevel: "basic",
  includeTechStack: false,
  sources: ["domain"],
  instructions: "",
};

// =============================================================================
// Artifacts KSA Config
// =============================================================================

export const ARTIFACTS_CONFIG_SCHEMA: Record<string, ConfigField> = {
  validationRequired: {
    type: "boolean",
    label: "Require Artifact",
    description: "Stage must produce at least one artifact",
    default: false,
  },
  validationMinLength: {
    type: "number",
    label: "Minimum Length",
    description: "Minimum content length (0 = no limit)",
    min: 0,
    max: 10000,
    default: 0,
  },
  validationFormat: {
    type: "select",
    label: "Required Format",
    description: "Artifact format requirement",
    options: [
      { value: "any", label: "Any Format" },
      { value: "markdown", label: "Markdown" },
      { value: "json", label: "JSON" },
      { value: "html", label: "HTML" },
    ],
    default: "any",
  },
  autoSave: {
    type: "boolean",
    label: "Auto-Save",
    description: "Automatically save artifacts on completion",
    default: true,
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const ARTIFACTS_DEFAULTS = {
  validationRequired: false,
  validationMinLength: 0,
  validationFormat: "any",
  autoSave: true,
  instructions: "",
};

// =============================================================================
// PDF KSA Config
// =============================================================================

export const PDF_CONFIG_SCHEMA: Record<string, ConfigField> = {
  template: {
    type: "select",
    label: "Template",
    description: "PDF template style",
    options: [
      { value: "report", label: "Report" },
      { value: "presentation", label: "Presentation" },
      { value: "minimal", label: "Minimal" },
    ],
    default: "report",
  },
  pageSize: {
    type: "select",
    label: "Page Size",
    description: "Document page size",
    options: [
      { value: "letter", label: "Letter (8.5 x 11)" },
      { value: "a4", label: "A4" },
    ],
    default: "letter",
  },
  includeTableOfContents: {
    type: "boolean",
    label: "Table of Contents",
    description: "Include table of contents",
    default: true,
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const PDF_DEFAULTS = {
  template: "report",
  pageSize: "letter",
  includeTableOfContents: true,
  instructions: "",
};

// =============================================================================
// Email KSA Config
// =============================================================================

export const EMAIL_CONFIG_SCHEMA: Record<string, ConfigField> = {
  fromName: {
    type: "string",
    label: "From Name",
    description: "Sender display name",
    placeholder: "e.g., Marketing Team",
    default: "Agent",
  },
  replyTo: {
    type: "string",
    label: "Reply-To",
    description: "Reply-to email address",
    placeholder: "e.g., replies@company.com",
    default: "",
  },
  sandboxMode: {
    type: "boolean",
    label: "Sandbox Mode",
    description: "Test mode - emails are logged but not sent",
    default: true,
  },
  defaultTemplateId: {
    type: "string",
    label: "Default Template ID",
    description: "SendGrid template ID",
    placeholder: "e.g., d-abc123...",
    default: "",
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const EMAIL_DEFAULTS = {
  fromName: "Agent",
  replyTo: "",
  sandboxMode: true,
  defaultTemplateId: "",
  instructions: "",
};

// =============================================================================
// News KSA Config
// =============================================================================

export const NEWS_CONFIG_SCHEMA: Record<string, ConfigField> = {
  sources: {
    type: "multiselect",
    label: "News Sources",
    description: "Preferred news sources",
    options: [
      { value: "general", label: "General News" },
      { value: "tech", label: "Tech News" },
      { value: "business", label: "Business News" },
      { value: "finance", label: "Finance News" },
    ],
    default: ["general"],
  },
  recency: {
    type: "select",
    label: "Recency",
    description: "How recent should articles be",
    options: [
      { value: "day", label: "Last 24 hours" },
      { value: "week", label: "Last week" },
      { value: "month", label: "Last month" },
      { value: "any", label: "Any time" },
    ],
    default: "week",
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const NEWS_DEFAULTS = {
  sources: ["general"],
  recency: "week",
  instructions: "",
};

// =============================================================================
// Browser KSA Config
// =============================================================================

export const BROWSER_CONFIG_SCHEMA: Record<string, ConfigField> = {
  headless: {
    type: "boolean",
    label: "Headless Mode",
    description: "Run browser without UI",
    default: true,
  },
  timeout: {
    type: "number",
    label: "Page Timeout",
    description: "Max seconds to wait for page load",
    min: 5,
    max: 120,
    default: 30,
  },
  instructions: INSTRUCTIONS_FIELD,
};

export const BROWSER_DEFAULTS = {
  headless: true,
  timeout: 30,
  instructions: "",
};

// =============================================================================
// Platform-Specific Presets
// =============================================================================

export const KSA_PRESETS: PresetDefinition[] = [
  // Social presets
  {
    name: "instagram-research",
    displayName: "Instagram Research",
    description: "Social research focused on Instagram",
    icon: "mdi:instagram",
    baseKSA: "social",
    lockedConfig: { platforms: ["instagram"] },
  },
  {
    name: "tiktok-research",
    displayName: "TikTok Research",
    description: "Social research focused on TikTok trends",
    icon: "mdi:music-note",
    baseKSA: "social",
    lockedConfig: { platforms: ["tiktok"] },
  },
  {
    name: "linkedin-research",
    displayName: "LinkedIn Research",
    description: "B2B professional network research",
    icon: "mdi:linkedin",
    baseKSA: "social",
    lockedConfig: { platforms: ["linkedin"] },
  },
  {
    name: "youtube-research",
    displayName: "YouTube Research",
    description: "Video content and channel analysis",
    icon: "mdi:youtube",
    baseKSA: "social",
    lockedConfig: { platforms: ["youtube"] },
  },

  // Web presets
  {
    name: "news-monitoring",
    displayName: "News Monitoring",
    description: "News-focused web research",
    icon: "mdi:newspaper",
    baseKSA: "web",
    lockedConfig: { searchType: "news" },
  },
  {
    name: "deep-research",
    displayName: "Deep Research",
    description: "Thorough web research with more results",
    icon: "mdi:magnify-plus",
    baseKSA: "web",
    lockedConfig: { depth: "thorough", fastMode: false },
  },

  // Companies presets
  {
    name: "company-enrichment",
    displayName: "Company Enrichment",
    description: "Full company data enrichment",
    icon: "mdi:office-building",
    baseKSA: "companies",
    lockedConfig: { enrichmentLevel: "full", includeTechStack: true },
  },
  {
    name: "tech-stack-lookup",
    displayName: "Tech Stack Lookup",
    description: "Focus on technology stack discovery",
    icon: "mdi:code-braces",
    baseKSA: "companies",
    lockedConfig: { includeTechStack: true },
  },
];

// =============================================================================
// Registry Export
// =============================================================================

export const CONFIG_SCHEMAS: Record<string, Record<string, ConfigField>> = {
  _framework: FRAMEWORK_CONFIG_SCHEMA,
  web: WEB_CONFIG_SCHEMA,
  social: SOCIAL_CONFIG_SCHEMA,
  companies: COMPANIES_CONFIG_SCHEMA,
  artifacts: ARTIFACTS_CONFIG_SCHEMA,
  pdf: PDF_CONFIG_SCHEMA,
  email: EMAIL_CONFIG_SCHEMA,
  news: NEWS_CONFIG_SCHEMA,
  browser: BROWSER_CONFIG_SCHEMA,
};

export const CONFIG_DEFAULTS: Record<string, Record<string, unknown>> = {
  _framework: FRAMEWORK_DEFAULTS,
  web: WEB_DEFAULTS,
  social: SOCIAL_DEFAULTS,
  companies: COMPANIES_DEFAULTS,
  artifacts: ARTIFACTS_DEFAULTS,
  pdf: PDF_DEFAULTS,
  email: EMAIL_DEFAULTS,
  news: NEWS_DEFAULTS,
  browser: BROWSER_DEFAULTS,
};

/**
 * Get config schema for a KSA
 */
export function getConfigSchema(
  ksaName: string
): Record<string, ConfigField> | undefined {
  return CONFIG_SCHEMAS[ksaName];
}

/**
 * Get default config for a KSA
 */
export function getConfigDefaults(
  ksaName: string
): Record<string, unknown> | undefined {
  return CONFIG_DEFAULTS[ksaName];
}

/**
 * Get a preset by name
 */
export function getPreset(name: string): PresetDefinition | undefined {
  return KSA_PRESETS.find((p) => p.name === name);
}

/**
 * Get all presets for a base KSA
 */
export function getPresetsForKSA(ksaName: string): PresetDefinition[] {
  return KSA_PRESETS.filter((p) => p.baseKSA === ksaName);
}

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(
  ksaName: string,
  userConfig: Record<string, unknown>
): Record<string, unknown> {
  const defaults = CONFIG_DEFAULTS[ksaName] || {};
  return { ...defaults, ...userConfig };
}

/**
 * Resolve a preset to its base KSA + merged config
 */
export function resolvePreset(presetName: string): {
  baseKSA: string;
  config: Record<string, unknown>;
  lockedFields: string[];
} | null {
  const preset = getPreset(presetName);
  if (!preset) return null;

  const defaults = CONFIG_DEFAULTS[preset.baseKSA] || {};
  const config = { ...defaults, ...preset.lockedConfig };

  return {
    baseKSA: preset.baseKSA,
    config,
    lockedFields: Object.keys(preset.lockedConfig),
  };
}
