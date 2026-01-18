/**
 * Brand Library KSA - Knowledge, Skills, and Abilities
 *
 * Read-only access to the brand library for AI agents.
 * Provides brand lookups, search, and library data retrieval.
 *
 * IMPORTANT: This KSA does NOT trigger full brand scans.
 * Full scans involve web crawling and can take minutes.
 * For agent tasks, use these lightweight lookups instead.
 *
 * For company firmographic data (employees, revenue, etc.),
 * use the `companies` KSA which wraps TheCompaniesAPI.
 *
 * @example
 * import { lookupBrand, searchBrands, getBrandByDomain } from './ksa/brandLibrary';
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
 * Get full brand data - READ ONLY.
 *
 * Accepts either a Convex document ID or a domain name.
 * If a domain is detected, automatically looks up by domain.
 *
 * @param brandIdOrDomain - Either a Convex ID (from brand._id) or a domain (e.g., 'mixpanel.com')
 * @returns Full brand data
 *
 * @example
 * // Works with domain:
 * const brand = await getBrandData('mixpanel.com');
 *
 * // Also works with Convex ID:
 * const brand = await getBrandData(existingBrand._id);
 */
export async function getBrandData(brandIdOrDomain: string): Promise<BrandData> {
  // Detect if input looks like a domain (contains . but no Convex ID pattern)
  const looksLikeDomain = brandIdOrDomain.includes('.') && !brandIdOrDomain.includes('|');
  
  if (looksLikeDomain) {
    // Normalize and look up by domain
    const domain = brandIdOrDomain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    const brand = await getBrandByDomain(domain);
    if (!brand) {
      throw new Error(`Brand not found for domain: ${domain}`);
    }
    return brand;
  }
  
  // Assume it's a Convex ID
  const response = await callGateway<BrandData>(
    "features.brands.core.crud.get",
    { id: brandIdOrDomain },
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
 * This is the RECOMMENDED way to get brand data when you have a domain.
 * Returns full brand data including styleguide, products, and more.
 *
 * @param domain - The domain to look up (e.g., 'mixpanel.com', 'seismic.com')
 * @returns Brand data or null if not in library
 *
 * @example
 * // Get full brand data by domain (recommended)
 * const brand = await getBrandByDomain('mixpanel.com');
 * if (brand) {
 *   console.log('Found:', brand.name);
 *   console.log('Colors:', brand.styleguide?.colors);
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

// ============================================================================
// Functions - Asset Retrieval (Read-Only)
// ============================================================================

/**
 * Brand asset data.
 */
export interface BrandAsset {
  id: string;
  type: string;
  url?: string;
  r2Key?: string;
  content?: string;
  sourceUrl: string;
  metadata?: Record<string, unknown>;
}

/**
 * Brand product data.
 */
export interface BrandProduct {
  id: string;
  name: string;
  description?: string;
  type: 'physical' | 'saas' | 'service';
  price?: string;
  images: string[];
  url?: string;
}

/**
 * Brand ad data.
 */
export interface BrandAd {
  id: string;
  platform: string;
  headline?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  cta?: string;
  landingUrl?: string;
}

/**
 * Get brand assets (images, videos, marketing copy) - READ ONLY.
 *
 * Returns all assets associated with a brand including:
 * - hero_image, product_image, backdrop (images)
 * - video (videos)
 * - value_prop, marketing_copy, testimonial, cta (text content)
 *
 * @param brandId - The brand ID
 * @param limit - Maximum results (default: 50)
 * @returns Array of brand assets with URLs
 *
 * @example
 * const assets = await listBrandAssets(brandId);
 * const images = assets.filter(a => a.type === 'hero_image' || a.type === 'product_image');
 * for (const img of images) {
 *   console.log(`Image: ${img.url}`);
 * }
 */
export async function listBrandAssets(brandId: string, limit = 50): Promise<BrandAsset[]> {
  try {
    const response = await callGateway<BrandAsset[]>(
      "features.brands.agentBrandLookup.listBrandAssets",
      { brandId, limit },
      "action"
    );
    return response;
  } catch {
    return [];
  }
}

/**
 * Get brand products - READ ONLY.
 *
 * Returns products from the brand's catalog including:
 * - Physical products (e-commerce)
 * - SaaS products (software)
 * - Services
 *
 * @param brandId - The brand ID
 * @param limit - Maximum results (default: 50)
 * @returns Array of products with images
 *
 * @example
 * const products = await listBrandProducts(brandId);
 * for (const p of products) {
 *   console.log(`${p.name}: ${p.images[0]}`);
 * }
 */
export async function listBrandProducts(brandId: string, limit = 50): Promise<BrandProduct[]> {
  try {
    const response = await callGateway<BrandProduct[]>(
      "features.brands.agentBrandLookup.listBrandProducts",
      { brandId, limit },
      "action"
    );
    return response;
  } catch {
    return [];
  }
}

/**
 * Get brand ads - READ ONLY.
 *
 * Returns ads from various platforms:
 * - Meta (Facebook/Instagram)
 * - Google
 * - TikTok
 * - LinkedIn
 *
 * @param brandId - The brand ID
 * @param limit - Maximum results (default: 50)
 * @returns Array of ads with creative URLs
 *
 * @example
 * const ads = await listBrandAds(brandId);
 * const metaAds = ads.filter(a => a.platform === 'meta');
 * for (const ad of metaAds) {
 *   console.log(`${ad.headline}: ${ad.imageUrl}`);
 * }
 */
export async function listBrandAds(brandId: string, limit = 50): Promise<BrandAd[]> {
  try {
    const response = await callGateway<BrandAd[]>(
      "features.brands.agentBrandLookup.listBrandAds",
      { brandId, limit },
      "action"
    );
    return response;
  } catch {
    return [];
  }
}
