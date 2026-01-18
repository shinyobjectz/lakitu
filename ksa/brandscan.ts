/**
 * Brand Lookup KSA - Knowledge, Skills, and Abilities
 *
 * Lightweight brand lookups for AI agents. Uses existing brand library
 * data or fast API lookups.
 *
 * IMPORTANT: This KSA does NOT trigger full brand scans. Full scans involve
 * web crawling and can take minutes. For agent tasks, use these lightweight
 * lookups instead.
 *
 * @example
 * import { lookupBrand, getBrandSummary } from './ksa/brandscan';
 *
 * // Quick lookup by domain
 * const brand = await lookupBrand('seismic.com');
 *
 * // Get summary with key metrics
 * const summary = await getBrandSummary(brand.id);
 */

// Re-export all functions from brandLibrary
export {
  lookupBrand,
  searchBrands,
  getBrandFromLibrary,
  getBrandData,
  getBrandSummary,
  listBrands,
  getBrandByDomain,
  // Asset retrieval
  listBrandAssets,
  listBrandProducts,
  listBrandAds,
} from "./brandLibrary";

// Re-export types
export type { BrandLite, BrandData, BrandAsset, BrandProduct, BrandAd } from "./brandLibrary";
