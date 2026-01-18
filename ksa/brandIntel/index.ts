/**
 * Brand Intelligence KSA - Knowledge, Skills, and Abilities
 *
 * Adaptive, agent-driven brand scanning that uses pre-research
 * context for better extraction results.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    scanBrand()                               │
 * │  Orchestrates the full pipeline                             │
 * └─────────────────────────────────────────────────────────────┘
 *                               │
 *         ┌─────────────────────┼─────────────────────┐
 *         ▼                     ▼                     ▼
 * ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
 * │ RESEARCH      │    │ DISCOVERY     │    │ EXTRACTION    │
 * │               │    │               │    │               │
 * │ Valyu search  │    │ Site crawling │    │ Adaptive LLM  │
 * │ TheCompanies  │    │ URL mapping   │    │ Higher temp   │
 * └───────────────┘    └───────────────┘    └───────────────┘
 *                               │
 *                               ▼
 *                    ┌───────────────────┐
 *                    │ VALIDATION        │
 *                    │                   │
 *                    │ Cross-check data  │
 *                    │ Confidence scores │
 *                    │ Flag uncertain    │
 *                    └───────────────────┘
 * ```
 *
 * ## Key Differences from Legacy Extraction
 *
 * | Aspect | Legacy (extraction.ts) | New (brandIntel) |
 * |--------|----------------------|------------------|
 * | Temperature | 0.1 (rigid) | 0.5 (adaptive) |
 * | Context | None | Pre-research informs extraction |
 * | Schemas | Strict JSON | Flexible with normalization |
 * | Retry | None | Iterative with different strategies |
 * | Validation | Post-hoc filters | Integrated confidence scoring |
 *
 * @example
 * import { scanBrand, quickScan } from './ksa/brandIntel';
 *
 * // Full thorough scan
 * const result = await scanBrand("mixpanel.com", {
 *   depth: "thorough",
 *   brandId: "brand_123" // Optional: sync to cloud
 * });
 * console.log(`Found ${result.products.length} products`);
 *
 * // Quick assessment
 * const quick = await quickScan("stripe.com");
 * console.log(`Business type: ${quick.brand.businessType}`);
 *
 * @example
 * // Use individual modules for custom workflows
 * import { researchBrand } from './ksa/brandIntel/research';
 * import { discoverSite } from './ksa/brandIntel/discovery';
 * import { extractFromPage } from './ksa/brandIntel/extraction';
 *
 * const context = await researchBrand("notion.so");
 * const siteMap = await discoverSite("notion.so", context);
 * const extraction = await extractFromPage(siteMap.pricing!, context);
 */

// ============================================================================
// Main Orchestration
// ============================================================================

export {
  scanBrand,
  quickScan,
  syncToCloud,
  getBrandDataStatus,
  shouldRescan,
} from "./orchestrate";

// ============================================================================
// Individual Modules (for custom workflows)
// ============================================================================

// Research
export { researchBrand, lookupCompany, webResearch } from "./research";

// Discovery
export {
  discoverSite,
  scrapePage,
  classifyUrl,
  extractInternalLinks,
  prioritizeUrls,
} from "./discovery";

// Extraction
export {
  extractFromPage,
  extractFromPages,
  mergeExtractions,
  buildExtractionPrompt,
  normalizeExtraction,
} from "./extraction";

// Validation
export {
  validateExtraction,
  validateProduct,
  validatePricing,
  validateFeature,
  validateAsset,
  validateProductBatch,
  fuzzyMatch,
  isJunkImage,
} from "./validation";

// ============================================================================
// Types
// ============================================================================

export type {
  // Brand Context
  BrandContext,
  BusinessType,
  PricingModel,
  NewsArticle,
  CompanyInfo,

  // Site Discovery
  SiteMap,
  PageInfo,
  PageType,
  DiscoveredUrl,

  // Extraction Results
  ExtractionResult,
  ProductExtraction,
  PricingExtraction,
  FeatureExtraction,
  AssetExtraction,
  ProductType,
  ProductVariant,
  PricingTier,
  AssetType,

  // Validation
  ValidationResult,
  ValidatedProduct,
  ValidatedPricing,
  ValidatedFeature,
  ValidatedAsset,

  // Full Scan
  BrandScanResult,
  ScanOptions,
  SubagentTask,
  SubagentResult,
} from "./types";
