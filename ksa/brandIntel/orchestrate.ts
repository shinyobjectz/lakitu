/**
 * Brand Intelligence Orchestration Module
 *
 * Main entry point that coordinates the full brand scan pipeline:
 * 1. Pre-research (via Valyu + TheCompanies)
 * 2. Site discovery (context-aware crawling)
 * 3. Extraction (adaptive, higher temperature)
 * 4. Validation (cross-checking)
 * 5. Cloud sync (push to main database)
 *
 * @example
 * const result = await scanBrand("mixpanel.com", { depth: "thorough" });
 * console.log(`Found ${result.products.length} products`);
 * console.log(`Scan completed in ${result.duration}ms`);
 */

import { callGateway } from "../_shared/gateway";
import { researchBrand } from "./research";
import { discoverSite, scrapePage } from "./discovery";
import { extractFromPage, extractFromPages, mergeExtractions } from "./extraction";
import { validateExtraction, validateProductBatch } from "./validation";
import type {
  BrandContext,
  BrandScanResult,
  ScanOptions,
  ValidatedProduct,
  ValidatedPricing,
  ValidatedFeature,
  ValidatedAsset,
  SiteMap,
  PageInfo,
} from "./types";

// ============================================================================
// Main Scan Function
// ============================================================================

/**
 * Full brand scan using the KSA pipeline.
 * Coordinates research, discovery, extraction, and validation.
 *
 * @param domain - Domain to scan (e.g., "mixpanel.com")
 * @param options - Scan options
 * @returns Complete brand scan result
 *
 * @example
 * // Quick scan
 * const result = await scanBrand("stripe.com", { depth: "quick" });
 *
 * // Thorough scan with cloud sync
 * const result = await scanBrand("mixpanel.com", {
 *   depth: "thorough",
 *   brandId: "brand_abc123",
 *   maxPages: 30
 * });
 */
export async function scanBrand(
  domain: string,
  options?: ScanOptions
): Promise<BrandScanResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const phaseDurations = {
    research: 0,
    discovery: 0,
    extraction: 0,
    validation: 0,
    sync: 0,
  };

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const depth = options?.depth || "thorough";
  const maxPages = options?.maxPages || (depth === "thorough" ? 20 : 10);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[BrandIntel] Starting brand scan for ${cleanDomain}`);
  console.log(`  Depth: ${depth}, Max pages: ${maxPages}`);
  console.log(`${"=".repeat(60)}\n`);

  // =========================================================================
  // Phase 1: Pre-research (critical - informs everything else)
  // =========================================================================
  console.log(`\n[BrandIntel] Phase 1: Pre-research...`);
  const researchStart = Date.now();

  let context: BrandContext;
  try {
    context = await researchBrand(cleanDomain, { depth });
  } catch (error) {
    errors.push(`Research failed: ${error}`);
    console.log(`[BrandIntel] Research failed, using defaults`);
    context = {
      name: cleanDomain.split(".")[0],
      domain: cleanDomain,
      businessType: "unknown",
      knownProducts: [],
      pricingModel: "unknown",
      competitors: [],
      recentNews: [],
      companyInfo: null,
    };
  }
  phaseDurations.research = Date.now() - researchStart;

  console.log(`[BrandIntel] Research complete in ${phaseDurations.research}ms`);
  console.log(`  Business type: ${context.businessType}`);
  console.log(`  Known products: ${context.knownProducts.length}`);

  // =========================================================================
  // Phase 2: Site Discovery
  // =========================================================================
  console.log(`\n[BrandIntel] Phase 2: Site Discovery...`);
  const discoveryStart = Date.now();

  let siteMap: SiteMap;
  try {
    siteMap = await discoverSite(cleanDomain, context, { maxPages });
  } catch (error) {
    errors.push(`Discovery failed: ${error}`);
    console.log(`[BrandIntel] Discovery failed, using minimal site map`);

    // Fallback: just scrape homepage
    const homepage = await scrapePage(`https://${cleanDomain}`);
    siteMap = {
      homepage,
      pricing: null,
      products: [],
      features: null,
      about: null,
      allUrls: [homepage.url],
    };
  }
  phaseDurations.discovery = Date.now() - discoveryStart;

  console.log(`[BrandIntel] Discovery complete in ${phaseDurations.discovery}ms`);
  console.log(`  URLs found: ${siteMap.allUrls.length}`);
  console.log(`  Pricing page: ${siteMap.pricing ? "yes" : "no"}`);

  // =========================================================================
  // Phase 3: Extraction
  // =========================================================================
  console.log(`\n[BrandIntel] Phase 3: Extraction...`);
  const extractionStart = Date.now();

  // Collect pages to extract from
  const pagesToExtract: PageInfo[] = [siteMap.homepage];
  if (siteMap.pricing) pagesToExtract.push(siteMap.pricing);
  if (siteMap.features) pagesToExtract.push(siteMap.features);
  pagesToExtract.push(...siteMap.products.slice(0, 10));

  console.log(`[BrandIntel] Extracting from ${pagesToExtract.length} pages...`);

  // Extract from all pages
  const extraction = await extractFromPages(pagesToExtract, context);

  phaseDurations.extraction = Date.now() - extractionStart;
  console.log(`[BrandIntel] Extraction complete in ${phaseDurations.extraction}ms`);
  console.log(`  Products: ${extraction.products.length}`);
  console.log(`  Pricing: ${extraction.pricing ? "found" : "not found"}`);
  console.log(`  Features: ${extraction.features.length}`);

  // =========================================================================
  // Phase 4: Validation
  // =========================================================================
  console.log(`\n[BrandIntel] Phase 4: Validation...`);
  const validationStart = Date.now();

  const validated = await validateExtraction(extraction, context);

  phaseDurations.validation = Date.now() - validationStart;
  console.log(`[BrandIntel] Validation complete in ${phaseDurations.validation}ms`);
  console.log(`  Overall confidence: ${validated.confidence.toFixed(2)}`);
  console.log(`  Products needing review: ${validated.products.filter(p => p.needsReview).length}`);

  // =========================================================================
  // Phase 5: Cloud Sync (optional)
  // =========================================================================
  if (options?.brandId && !options?.skipSync) {
    console.log(`\n[BrandIntel] Phase 5: Cloud Sync...`);
    const syncStart = Date.now();

    try {
      await syncToCloud(options.brandId, validated, context);
      console.log(`[BrandIntel] Synced to cloud successfully`);
    } catch (error) {
      errors.push(`Sync failed: ${error}`);
      console.log(`[BrandIntel] Sync failed: ${error}`);
    }

    phaseDurations.sync = Date.now() - syncStart;
  }

  // =========================================================================
  // Build Result
  // =========================================================================
  const duration = Date.now() - startTime;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[BrandIntel] Scan complete!`);
  console.log(`  Total duration: ${duration}ms`);
  console.log(`  Products: ${validated.products.length}`);
  console.log(`  Features: ${validated.features.length}`);
  console.log(`  Assets: ${validated.assets.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`${"=".repeat(60)}\n`);

  return {
    brand: context,
    products: validated.products,
    pricing: validated.pricing,
    features: validated.features,
    assets: validated.assets,
    siteMap,
    confidence: validated.confidence,
    duration,
    errors,
    phaseDurations,
  };
}

// ============================================================================
// Quick Scan (Simplified)
// ============================================================================

/**
 * Quick brand scan - faster but less thorough.
 * Good for initial assessment or when time is limited.
 *
 * @param domain - Domain to scan
 * @returns Quick scan result
 *
 * @example
 * const result = await quickScan("example.com");
 * console.log(`Found ${result.products.length} products`);
 */
export async function quickScan(domain: string): Promise<BrandScanResult> {
  return scanBrand(domain, {
    depth: "quick",
    maxPages: 5,
    skipSync: true,
  });
}

// ============================================================================
// Cloud Sync
// ============================================================================

/**
 * Sync validated data to cloud Convex database.
 */
async function syncToCloud(
  brandId: string,
  validated: {
    products: ValidatedProduct[];
    pricing: ValidatedPricing | null;
    features: ValidatedFeature[];
    assets: ValidatedAsset[];
  },
  context: BrandContext
): Promise<void> {
  console.log(`[BrandIntel] Syncing to brand ${brandId}...`);

  // Get or verify brand exists
  const brand = await callGateway<any>("features.brands.core.crud.get", {
    id: brandId,
  });

  if (!brand) {
    throw new Error(`Brand not found: ${brandId}`);
  }

  // Sync products
  let productsInserted = 0;
  for (const product of validated.products) {
    // Skip low-confidence products
    if (product.validationScore < 0.5) {
      console.log(`[BrandIntel] Skipping low-confidence product: ${product.name}`);
      continue;
    }

    try {
      await callGateway(
        "features.brands.intelligence.entityInsert.insertProduct",
        {
          brandId,
          name: product.name,
          type: product.type,
          price: product.price,
          currency: product.currency,
          description: product.description,
          images: product.images,
          sourceUrl: product.sourceUrl,
          category: product.category,
          variants: product.variants,
        },
        "mutation"
      );
      productsInserted++;
    } catch (error) {
      console.log(`[BrandIntel] Failed to insert product ${product.name}: ${error}`);
    }
  }

  // Sync assets
  let assetsInserted = 0;
  for (const asset of validated.assets) {
    // Skip junk assets
    if (asset.isJunk) continue;

    try {
      await callGateway(
        "features.brands.intelligence.entityInsert.insertAsset",
        {
          brandId,
          url: asset.url,
          type: asset.type,
          alt: asset.alt,
          context: asset.context,
        },
        "mutation"
      );
      assetsInserted++;
    } catch (error) {
      // Assets often fail due to duplicates - this is fine
    }
  }

  console.log(`[BrandIntel] Sync complete: ${productsInserted} products, ${assetsInserted} assets`);
}

// ============================================================================
// Scan Status Helpers
// ============================================================================

/**
 * Check if a brand has existing data (for deciding if rescan is needed).
 */
export async function getBrandDataStatus(brandId: string): Promise<{
  hasProducts: boolean;
  productCount: number;
  lastScanAt: number | null;
  hasPricing: boolean;
}> {
  try {
    const counts = await callGateway<any>(
      "features.brands.core.products.getBrandEntityCounts",
      { brandId }
    );

    return {
      hasProducts: counts.products > 0,
      productCount: counts.products,
      lastScanAt: null, // Would need to track this separately
      hasPricing: false, // Would need additional query
    };
  } catch {
    return {
      hasProducts: false,
      productCount: 0,
      lastScanAt: null,
      hasPricing: false,
    };
  }
}

/**
 * Check if a rescan is recommended based on existing data and age.
 */
export async function shouldRescan(
  brandId: string,
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): Promise<{
  recommended: boolean;
  reason: string;
}> {
  const status = await getBrandDataStatus(brandId);

  if (!status.hasProducts) {
    return { recommended: true, reason: "No products found" };
  }

  if (status.lastScanAt && Date.now() - status.lastScanAt > maxAgeMs) {
    return { recommended: true, reason: "Data is stale" };
  }

  return { recommended: false, reason: "Data is current" };
}

// ============================================================================
// Exports
// ============================================================================

export { syncToCloud, getBrandDataStatus, shouldRescan };
