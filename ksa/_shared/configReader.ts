/**
 * KSA Config Reader
 *
 * Utility for reading KSA configurations from environment variables.
 * Used by KSA implementations in the sandbox to access user-configured settings.
 *
 * @example
 * import { getKSAConfig } from './_shared/configReader';
 *
 * const config = getKSAConfig('web');
 * const depth = config.depth || 'quick';
 * const maxResults = depth === 'thorough' ? 15 : 8;
 */

import { CONFIG_DEFAULTS } from "./configSchemas";

// Cache parsed configs to avoid repeated JSON parsing
let configCache: Record<string, Record<string, unknown>> | null = null;

/**
 * Parse skill configs from environment variable
 */
function parseSkillConfigs(): Record<string, Record<string, unknown>> {
  if (configCache) return configCache;

  const envValue = process.env.SKILL_CONFIGS;
  if (!envValue) {
    configCache = {};
    return configCache;
  }

  try {
    configCache = JSON.parse(envValue);
    return configCache || {};
  } catch (e) {
    console.warn("[configReader] Failed to parse SKILL_CONFIGS:", e);
    configCache = {};
    return configCache;
  }
}

/**
 * Get configuration for a specific KSA
 *
 * Returns user config merged with defaults.
 * If no config is set, returns defaults only.
 *
 * @param ksaName - Name of the KSA (e.g., 'web', 'social')
 * @returns Configuration object with all settings
 *
 * @example
 * const webConfig = getKSAConfig('web');
 * // { depth: 'thorough', searchType: 'all', fastMode: true, ... }
 */
export function getKSAConfig<T extends Record<string, unknown> = Record<string, unknown>>(
  ksaName: string
): T {
  const allConfigs = parseSkillConfigs();
  const userConfig = allConfigs[ksaName] || {};
  const defaults = CONFIG_DEFAULTS[ksaName] || {};

  return { ...defaults, ...userConfig } as T;
}

/**
 * Get a specific config value for a KSA
 *
 * @param ksaName - Name of the KSA
 * @param key - Config key to retrieve
 * @param defaultValue - Fallback if not set
 *
 * @example
 * const depth = getConfigValue('web', 'depth', 'quick');
 */
export function getConfigValue<T>(
  ksaName: string,
  key: string,
  defaultValue: T
): T {
  const config = getKSAConfig(ksaName);
  return (config[key] as T) ?? defaultValue;
}

/**
 * Get user instructions for a KSA
 *
 * Returns the custom instructions string if set, empty string otherwise.
 *
 * @param ksaName - Name of the KSA
 *
 * @example
 * const instructions = getInstructions('web');
 * // "Focus on enterprise clients"
 */
export function getInstructions(ksaName: string): string {
  return getConfigValue(ksaName, "instructions", "");
}

/**
 * Check if a platform is enabled for social KSA
 *
 * @param platform - Platform name (instagram, tiktok, etc.)
 *
 * @example
 * if (isPlatformEnabled('instagram')) {
 *   // fetch Instagram data
 * }
 */
export function isPlatformEnabled(platform: string): boolean {
  const config = getKSAConfig("social");
  const platforms = (config.platforms as string[]) || [];
  return platforms.includes(platform);
}

/**
 * Get enabled platforms for social KSA
 *
 * @example
 * const platforms = getEnabledPlatforms();
 * // ['instagram', 'tiktok']
 */
export function getEnabledPlatforms(): string[] {
  const config = getKSAConfig("social");
  return (config.platforms as string[]) || ["instagram", "tiktok"];
}

/**
 * Get web search options based on config
 *
 * Returns options object ready to pass to Valyu search.
 *
 * @example
 * const searchOptions = getWebSearchOptions();
 * const results = await search(query, searchOptions);
 */
export function getWebSearchOptions(): {
  maxResults: number;
  searchType: string;
  fastMode: boolean;
  includedSources?: string[];
  excludedSources?: string[];
} {
  const config = getKSAConfig("web");

  const depth = (config.depth as string) || "quick";
  const maxResults = depth === "thorough" ? 15 : 8;

  return {
    maxResults,
    searchType: (config.searchType as string) || "all",
    fastMode: (config.fastMode as boolean) ?? true,
    includedSources:
      (config.includeSources as string[])?.length > 0
        ? (config.includeSources as string[])
        : undefined,
    excludedSources:
      (config.excludeSources as string[])?.length > 0
        ? (config.excludeSources as string[])
        : undefined,
  };
}

/**
 * Get artifacts validation config
 *
 * @example
 * const validation = getArtifactsValidation();
 * if (validation.required && artifacts.length === 0) {
 *   throw new Error('At least one artifact is required');
 * }
 */
export function getArtifactsValidation(): {
  required: boolean;
  minLength: number;
  format: string;
} {
  const config = getKSAConfig("artifacts");

  return {
    required: (config.validationRequired as boolean) ?? false,
    minLength: (config.validationMinLength as number) ?? 0,
    format: (config.validationFormat as string) || "any",
  };
}

/**
 * Get email config
 *
 * @example
 * const emailConfig = getEmailConfig();
 * if (emailConfig.sandboxMode) {
 *   console.log('Email would be sent:', emailData);
 * }
 */
export function getEmailConfig(): {
  fromName: string;
  replyTo?: string;
  sandboxMode: boolean;
  defaultTemplateId?: string;
} {
  const config = getKSAConfig("email");

  return {
    fromName: (config.fromName as string) || "Agent",
    replyTo: (config.replyTo as string) || undefined,
    sandboxMode: (config.sandboxMode as boolean) ?? true,
    defaultTemplateId: (config.defaultTemplateId as string) || undefined,
  };
}

/**
 * Get PDF config
 *
 * @example
 * const pdfConfig = getPdfConfig();
 * await generatePdf(content, { template: pdfConfig.template });
 */
export function getPdfConfig(): {
  template: string;
  pageSize: string;
  includeTableOfContents: boolean;
} {
  const config = getKSAConfig("pdf");

  return {
    template: (config.template as string) || "report",
    pageSize: (config.pageSize as string) || "letter",
    includeTableOfContents: (config.includeTableOfContents as boolean) ?? true,
  };
}

/**
 * Get companies enrichment config
 *
 * @example
 * const companyConfig = getCompaniesConfig();
 * const data = await enrichCompany(domain, { level: companyConfig.enrichmentLevel });
 */
export function getCompaniesConfig(): {
  enrichmentLevel: string;
  includeTechStack: boolean;
  sources: string[];
} {
  const config = getKSAConfig("companies");

  return {
    enrichmentLevel: (config.enrichmentLevel as string) || "basic",
    includeTechStack: (config.includeTechStack as boolean) ?? false,
    sources: (config.sources as string[]) || ["domain"],
  };
}

/**
 * Clear config cache (useful for testing)
 */
export function clearConfigCache(): void {
  configCache = null;
}

// =============================================================================
// Framework Config (Local DB Integration)
// =============================================================================

import {
  FRAMEWORK_DEFAULTS,
  type FrameworkConfig,
} from "./configSchemas";

/**
 * Get framework config for a specific KSA.
 * Framework config controls automatic local DB behaviors like caching and tracking.
 *
 * @param ksaName - Name of the KSA (optional, for KSA-specific overrides)
 * @returns Framework configuration
 *
 * @example
 * const frameworkConfig = getFrameworkConfigForKSA('file');
 * if (frameworkConfig.trackFileState) {
 *   // Track file access
 * }
 */
export function getFrameworkConfigForKSA(ksaName?: string): FrameworkConfig {
  const allConfigs = parseSkillConfigs();

  // Check for KSA-specific framework overrides
  const ksaConfig = ksaName ? allConfigs[ksaName] || {} : {};

  // Check for global framework config
  const frameworkConfig = allConfigs._framework || {};

  // Merge: defaults < global framework < KSA-specific
  return {
    ...FRAMEWORK_DEFAULTS,
    ...frameworkConfig,
    // Only include framework-relevant fields from KSA config
    ...(ksaConfig.cacheResults !== undefined && { cacheResults: ksaConfig.cacheResults }),
    ...(ksaConfig.cacheTTLMs !== undefined && { cacheTTLMs: ksaConfig.cacheTTLMs }),
    ...(ksaConfig.trackCalls !== undefined && { trackCalls: ksaConfig.trackCalls }),
    ...(ksaConfig.trackFileState !== undefined && { trackFileState: ksaConfig.trackFileState }),
    ...(ksaConfig.persistToSession !== undefined && { persistToSession: ksaConfig.persistToSession }),
  } as FrameworkConfig;
}
