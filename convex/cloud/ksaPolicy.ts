/**
 * KSA Policy Module
 *
 * Provides KSA (Knowledge, Skills, Abilities) registry and policy enforcement
 * for the gateway and frontend.
 *
 * The KSA_REGISTRY is auto-generated from packages/lakitu/ksa/*.ts
 * Run `bun generate:ksa` to regenerate.
 *
 * This file contains:
 * - Re-exports of generated types and functions
 * - Config schemas for UI configuration panels
 * - Category labels and descriptions
 * - Default KSA sets for different purposes
 */

// ============================================================================
// Re-exports from Lakitu KSA Registry
// ============================================================================

// Types
export type {
  KSACategory,
  KSAGroup,
  KSAInfo,
} from "../../ksa/_generated/registry";

// Registry and discovery functions
export {
  KSA_REGISTRY,
  CORE_KSAS,
  getAllKSAs,
  getKSA,
  getKSAsByCategory,
  getKSAsByNames,
  searchKSAs,
} from "../../ksa/_generated/registry";

// Policy functions
export {
  getServicePathsForKSAs,
  isServicePathAllowed,
} from "../../ksa/_generated/registry";

/**
 * Validate KSA names against the registry.
 * Returns valid and invalid KSA names.
 */
export function validateKSAs(ksaNames: string[]): { valid: string[]; invalid: string[] } {
  const validNames = KSA_REGISTRY.map(k => k.name);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const name of ksaNames) {
    if (validNames.includes(name)) {
      valid.push(name);
    } else {
      invalid.push(name);
    }
  }

  return { valid, invalid };
}

// ============================================================================
// Config Field Types
// ============================================================================

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

// ============================================================================
// Universal Fields
// ============================================================================

const INSTRUCTIONS_FIELD: ConfigField = {
  type: "textarea",
  label: "Custom Instructions",
  description:
    "Instructions for the agent when using this skill (embedded in system prompt)",
  placeholder:
    'e.g., "Focus on enterprise clients" or "Prioritize recent sources"',
  default: "",
};

// ============================================================================
// Config Schemas
// ============================================================================

export const CONFIG_SCHEMAS: Record<string, Record<string, ConfigField>> = {
  web: {
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
  },
  social: {
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
  },
  companies: {
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
  },
  artifacts: {
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
  },
  pdf: {
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
  },
  email: {
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
  },
  news: {
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
  },
  browser: {
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
  },
};

export const CONFIG_DEFAULTS: Record<string, Record<string, unknown>> = {
  web: {
    depth: "quick",
    searchType: "all",
    fastMode: true,
    includeSources: [],
    excludeSources: [],
    instructions: "",
  },
  social: {
    platforms: ["instagram", "tiktok"],
    contentTypes: ["profiles", "posts"],
    postsLimit: 10,
    instructions: "",
  },
  companies: {
    enrichmentLevel: "basic",
    includeTechStack: false,
    sources: ["domain"],
    instructions: "",
  },
  artifacts: {
    validationRequired: false,
    validationMinLength: 0,
    validationFormat: "any",
    autoSave: true,
    instructions: "",
  },
  pdf: {
    template: "report",
    pageSize: "letter",
    includeTableOfContents: true,
    instructions: "",
  },
  email: {
    fromName: "Agent",
    replyTo: "",
    sandboxMode: true,
    defaultTemplateId: "",
    instructions: "",
  },
  news: {
    sources: ["general"],
    recency: "week",
    instructions: "",
  },
  browser: {
    headless: true,
    timeout: 30,
    instructions: "",
  },
};

// ============================================================================
// Category Labels
// ============================================================================

import type { KSACategory, KSAGroup } from "../../ksa/_generated/registry";

export const CATEGORY_LABELS: Record<KSACategory, string> = {
  core: "Core (Always Available)",
  skills: "Skills (Research & Data)",
  deliverables: "Deliverables (Output Formats)",
};

export const CATEGORY_DESCRIPTIONS: Record<KSACategory, string> = {
  core: "Fundamental operations available to every agent",
  skills: "Research and data gathering capabilities",
  deliverables: "Create non-standard output formats like PDFs and emails",
};

// ============================================================================
// Group Labels
// ============================================================================

export const GROUP_LABELS: Record<KSAGroup, string> = {
  research: "Research",
};

export const GROUP_DESCRIPTIONS: Record<KSAGroup, string> = {
  research: "Web search, news monitoring, company data, and browser automation",
};

export const GROUP_ICONS: Record<KSAGroup, string> = {
  research: "mdi:magnify",
};

export const GROUP_ORDER: KSAGroup[] = ["research"];

// ============================================================================
// Default KSA Sets
// ============================================================================

import { KSA_REGISTRY, getKSA, CORE_KSAS } from "../../ksa/_generated/registry";

/** KSAs that are disabled by default (require explicit enablement) */
export const DEFAULT_DISABLED_KSAS = ["brandscan", "boards"];

/**
 * Get core KSAs that are always available.
 */
export function getCoreKSAs() {
  return KSA_REGISTRY.filter((k) => k.category === "core");
}

/**
 * Get KSAs by group (within skills category).
 */
export function getKSAsByGroup(group: KSAGroup) {
  return KSA_REGISTRY.filter((k) => k.group === group);
}

/**
 * Get skills KSAs grouped by their group.
 */
export function getSkillsByGroup(): Record<KSAGroup, typeof KSA_REGISTRY> {
  const result: Record<KSAGroup, typeof KSA_REGISTRY> = {
    research: [],
  };

  for (const ksa of KSA_REGISTRY) {
    if (ksa.category === "skills" && ksa.group) {
      result[ksa.group].push(ksa);
    }
  }

  return result;
}

/**
 * Get all available KSA names.
 */
export function getKSANames(): string[] {
  return KSA_REGISTRY.map((k) => k.name);
}

/**
 * Get a default set of KSAs for common use cases.
 */
export function getDefaultKSAs(
  purpose: "research" | "content" | "automation" | "minimal" | "all" = "all"
): string[] {
  const core = CORE_KSAS;

  switch (purpose) {
    case "minimal":
      return core;
    case "research":
      return [...core, "web", "news", "companies", "social"];
    case "content":
      return [...core, "web", "pdf", "email"];
    case "automation":
      return [...core, "web", "pdf", "email", "browser"];
    case "all":
    default:
      return getKSANames().filter((k) => !DEFAULT_DISABLED_KSAS.includes(k));
  }
}

// ============================================================================
// Config Functions
// ============================================================================

/**
 * Get config schema for a KSA.
 */
export function getConfigSchema(
  ksaName: string
): Record<string, ConfigField> | undefined {
  return CONFIG_SCHEMAS[ksaName];
}

/**
 * Get default config for a KSA.
 */
export function getConfigDefaults(
  ksaName: string
): Record<string, unknown> | undefined {
  return CONFIG_DEFAULTS[ksaName];
}

/**
 * Merge user config with defaults.
 */
export function mergeWithDefaults(
  ksaName: string,
  userConfig: Record<string, unknown>
): Record<string, unknown> {
  const defaults = CONFIG_DEFAULTS[ksaName] || {};
  return { ...defaults, ...userConfig };
}
