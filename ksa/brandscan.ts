/**
 * Brand Lookup KSA - Knowledge, Skills, and Abilities
 *
 * Lightweight brand lookups for AI agents.
 * Uses existing brand library data or fast API lookups.
 *
 * IMPORTANT: This KSA does NOT trigger full brand scans.
 * Full scans involve web crawling and can take minutes.
 * For agent tasks, use these lightweight lookups instead.
 *
 * @example
 * import { lookupBrand, searchBrands, getBrandByDomain } from './ksa/brandscan';
 *
 * // Quick lookup - checks library first, then lightweight API
 * const brand = await lookupBrand('anthropic.com');
 * if (brand) {
 *   console.log(brand.name, brand.industry);
 * }
 *
 * // Search by name
 * const results = await searchBrands('Nike');
 * console.log(results); // [{ name, domain, icon }]
 *
 * // Get from library only (instant, no API calls)
 * const existing = await getBrandByDomain('anthropic.com');
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

/**
 * Lightweight brand data returned by lookups.
 * Contains basic firmographic info without full intelligence data.
 */
export interface BrandLite {
  name: string;
  domain: string;
  logo?: string;
  icon?: string;
  description?: string;
  tagline?: string;
  industry?: string;
  naicsCodes?: string[];
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  headquarters?: string;
  country?: string;
  employeeCount?: string;
  yearFounded?: number;
  source: "library" | "api";
}

/**
 * Full brand data from the library (only available for scanned brands).
 */
export interface BrandData {
  _id: string;
  domain: string;
  name: string;
  description?: string;
  styleguide?: {
    colors?: Array<{ name: string; hex: string }>;
    fonts?: Array<{ name: string; category: string }>;
    voiceTone?: string;
    logoUrl?: string;
  };
  firmography?: {
    industry?: string;
    employees?: string;
    revenue?: string;
    founded?: string;
    headquarters?: string;
  };
  socialProfiles?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  products?: Array<{
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
  }>;
  ads?: Array<{
    id: string;
    platform: string;
    headline?: string;
    imageUrl?: string;
  }>;
  _creationTime: number;
}

/**
 * Brand search result from name search.
 */
export interface BrandSearchResult {
  name: string;
  domain: string;
  icon?: string;
}

// ============================================================================
// Functions - Lightweight Lookups (Agent-Safe)
// ============================================================================

/**
 * Look up basic brand information - SAFE FOR AGENTS.
 *
 * This function:
 * - Checks the brand library first (instant)
 * - Falls back to lightweight API lookup (Brand.dev, TheCompanies)
 * - NEVER triggers web crawling or full brand scans
 * - Returns in seconds, not minutes
 *
 * @param domain - The domain to look up (e.g., 'anthropic.com')
 * @returns Brand data or null if not found
 *
 * @example
 * const brand = await lookupBrand('anthropic.com');
 * if (brand) {
 *   console.log(`${brand.name} - ${brand.industry}`);
 *   console.log(`Founded: ${brand.yearFounded}`);
 *   console.log(`Source: ${brand.source}`); // 'library' or 'api'
 * }
 */
export async function lookupBrand(domain: string): Promise<BrandLite | null> {
  try {
    const response = await callGateway<BrandLite | null>(
      "features.brands.agentBrandLookup.lookupBrand",
      { domain },
      "action"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * Search for brands by name - SAFE FOR AGENTS.
 *
 * Returns a list of matching brands with basic info.
 * Use this when you have a company name but not a domain.
 *
 * @param query - The brand name to search for
 * @param limit - Maximum results (default: 5)
 * @returns Array of matching brands
 *
 * @example
 * const results = await searchBrands('Nike');
 * for (const r of results) {
 *   console.log(`${r.name} - ${r.domain}`);
 * }
 */
export async function searchBrands(
  query: string,
  limit = 5
): Promise<BrandSearchResult[]> {
  try {
    const response = await callGateway<BrandSearchResult[]>(
      "features.brands.agentBrandLookup.searchBrands",
      { query, limit },
      "action"
    );
    return response;
  } catch {
    return [];
  }
}

/**
 * Get brand from library only - SAFE FOR AGENTS.
 *
 * Only returns brands that exist in the library.
 * Returns null if brand hasn't been scanned yet.
 * Use this when you specifically need library data.
 *
 * @param domain - The domain to look up
 * @returns Brand data or null if not in library
 *
 * @example
 * const brand = await getBrandFromLibrary('anthropic.com');
 * if (brand) {
 *   console.log('Found in library:', brand.name);
 * } else {
 *   console.log('Brand not yet scanned');
 * }
 */
export async function getBrandFromLibrary(domain: string): Promise<BrandLite | null> {
  try {
    const response = await callGateway<BrandLite | null>(
      "features.brands.agentBrandLookup.getBrandFromLibrary",
      { domain },
      "action"
    );
    return response;
  } catch {
    return null;
  }
}

// ============================================================================
// Functions - Library Reads (Read-Only)
// ============================================================================

/**
 * Get full brand data from library - READ ONLY.
 *
 * Returns complete brand data including styleguide, products, and ads.
 * Only works for brands that have been scanned and added to the library.
 *
 * @param brandId - The brand ID
 * @returns Full brand data
 *
 * @example
 * const brand = await getBrandData(brandId);
 * console.log('Brand:', brand.name);
 * console.log('Colors:', brand.styleguide?.colors);
 * console.log('Products:', brand.products?.length);
 */
export async function getBrandData(brandId: string): Promise<BrandData> {
  const response = await callGateway<BrandData>(
    "features.brands.core.crud.get",
    { brandId },
    "query"
  );
  return response;
}

/**
 * Get brand intelligence summary - READ ONLY.
 *
 * Lighter weight than full data, returns counts.
 *
 * @param brandId - The brand ID
 * @returns Summary of brand intelligence
 *
 * @example
 * const summary = await getBrandSummary(brandId);
 * console.log(`${summary.productCount} products, ${summary.adCount} ads`);
 */
export async function getBrandSummary(brandId: string): Promise<{
  brandId: string;
  name: string;
  domain: string;
  productCount: number;
  assetCount: number;
  adCount: number;
  socialPostCount: number;
}> {
  const response = await callGateway<{
    brandId: string;
    name: string;
    domain: string;
    productCount: number;
    assetCount: number;
    adCount: number;
    socialPostCount: number;
  }>(
    "features.brands.core.products.getBrandIntelligenceSummary",
    { brandId },
    "query"
  );
  return response;
}

/**
 * List all brands in the library - READ ONLY.
 *
 * @returns Array of brands
 *
 * @example
 * const brands = await listBrands();
 * for (const b of brands) {
 *   console.log(`${b.name} (${b.domain})`);
 * }
 */
export async function listBrands(): Promise<BrandData[]> {
  const response = await callGateway<BrandData[]>(
    "features.brands.core.crud.list",
    {},
    "query"
  );
  return response;
}

/**
 * Get brand by domain from library - READ ONLY.
 *
 * @param domain - The domain to look up
 * @returns Brand data or null if not in library
 *
 * @example
 * const brand = await getBrandByDomain('anthropic.com');
 * if (brand) {
 *   console.log('Found:', brand.name);
 * }
 */
export async function getBrandByDomain(domain: string): Promise<BrandData | null> {
  try {
    const response = await callGateway<BrandData>(
      "features.brands.core.crud.getByDomain",
      { domain },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}
