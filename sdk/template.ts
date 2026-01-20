/**
 * Template Configuration Module
 *
 * Type helpers for customizing the E2B sandbox template.
 *
 * @example
 * ```typescript
 * // convex/lakitu/template.config.ts
 * import { defineTemplate } from '@lakitu/sdk/template';
 *
 * export default defineTemplate({
 *   packages: {
 *     apt: ["ffmpeg", "imagemagick"],
 *     pip: ["pandas", "numpy"],
 *     npm: ["sharp"],
 *   },
 *   services: ["redis"],
 *   setup: ["pip install -r requirements.txt"],
 * });
 * ```
 *
 * @packageDocumentation
 */

/**
 * Template configuration for customizing sandbox packages and services.
 */
export interface TemplateConfig {
  /**
   * Packages to install in the sandbox.
   */
  packages?: {
    /** APT packages (Ubuntu) */
    apt?: string[];
    /** Python packages via pip */
    pip?: string[];
    /** Node.js packages via npm */
    npm?: string[];
  };

  /**
   * Services to pre-start in the sandbox.
   * Currently supported: "redis", "postgres"
   */
  services?: ("redis" | "postgres" | string)[];

  /**
   * Custom setup commands to run after package installation.
   * These run as the user (not root).
   */
  setup?: string[];

  /**
   * Environment variables to set in the sandbox.
   */
  env?: Record<string, string>;

  /**
   * Files to copy into the sandbox.
   * Key is destination path, value is source path (relative to project root).
   */
  files?: Record<string, string>;
}

/**
 * Define a template configuration with type checking.
 *
 * @param config - Template configuration object
 * @returns The same config object (for type inference)
 *
 * @example
 * ```typescript
 * import { defineTemplate } from '@lakitu/sdk/template';
 *
 * export default defineTemplate({
 *   packages: {
 *     apt: ["ffmpeg"],
 *     pip: ["opencv-python"],
 *   },
 *   setup: [
 *     "pip install -r requirements.txt",
 *   ],
 * });
 * ```
 */
export function defineTemplate(config: TemplateConfig): TemplateConfig {
  return config;
}

/**
 * Default template configuration (empty - no customizations).
 */
export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  packages: {
    apt: [],
    pip: [],
    npm: [],
  },
  services: [],
  setup: [],
  env: {},
  files: {},
};

/**
 * Merge two template configs, with the second taking precedence.
 */
export function mergeTemplateConfigs(
  base: TemplateConfig,
  override: TemplateConfig
): TemplateConfig {
  return {
    packages: {
      apt: [...(base.packages?.apt || []), ...(override.packages?.apt || [])],
      pip: [...(base.packages?.pip || []), ...(override.packages?.pip || [])],
      npm: [...(base.packages?.npm || []), ...(override.packages?.npm || [])],
    },
    services: [...(base.services || []), ...(override.services || [])],
    setup: [...(base.setup || []), ...(override.setup || [])],
    env: { ...(base.env || {}), ...(override.env || {}) },
    files: { ...(base.files || {}), ...(override.files || {}) },
  };
}
