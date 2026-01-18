/**
 * Brand Intelligence Extraction Module
 *
 * Adaptive extraction that uses research context for better results.
 * Uses higher temperature (0.5) and iterative approaches instead of
 * rigid JSON schemas.
 *
 * @example
 * const context = await researchBrand("mixpanel.com");
 * const result = await extractFromPage(pageInfo, context);
 * console.log(`Found ${result.products.length} products`);
 */

import { callGateway } from "../_shared/gateway";
import type {
  BrandContext,
  PageInfo,
  ExtractionResult,
  ProductExtraction,
  PricingExtraction,
  FeatureExtraction,
  AssetExtraction,
  PricingTier,
  ProductType,
} from "./types";

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract products/pricing from a page using research context.
 * Higher temperature, iterative approach.
 *
 * @param page - Page content to extract from
 * @param context - Pre-research brand context
 * @param options - Extraction options
 * @returns Extraction result with products, pricing, features
 *
 * @example
 * const result = await extractFromPage(pricingPage, context, { maxRetries: 2 });
 * console.log(`Found ${result.products.length} products`);
 * console.log(`Confidence: ${result.confidence}`);
 */
export async function extractFromPage(
  page: PageInfo,
  context: BrandContext,
  options?: { maxRetries?: number }
): Promise<ExtractionResult> {
  const maxRetries = options?.maxRetries ?? 2;

  console.log(`[BrandIntel] Extracting from ${page.url} (${page.pageType})...`);

  // Build context-aware extraction prompt
  const prompt = buildExtractionPrompt(page, context);

  try {
    // First pass: free-form extraction with higher temperature
    const response = await callGateway<any>(
      "services.OpenRouter.internal.chatCompletion",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        responseFormat: { type: "json_object" },
        temperature: 0.5, // Higher temperature for inference
      }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    const rawExtraction = JSON.parse(content);

    // Normalize to structured format
    const result = normalizeExtraction(rawExtraction, page.url);

    console.log(`[BrandIntel] Extracted: ${result.products.length} products, confidence: ${result.confidence.toFixed(2)}`);

    // If low confidence and retries available, try again with different approach
    if (result.confidence < 0.5 && maxRetries > 0) {
      console.log(`[BrandIntel] Low confidence, retrying with focused extraction...`);
      return extractWithFocusedApproach(page, context, maxRetries - 1);
    }

    return result;
  } catch (error) {
    console.log(`[BrandIntel] Extraction failed: ${error}`);

    // Fallback to basic extraction
    if (maxRetries > 0) {
      return extractWithFocusedApproach(page, context, maxRetries - 1);
    }

    return {
      products: [],
      pricing: null,
      features: [],
      assets: [],
      confidence: 0,
      sourceUrl: page.url,
    };
  }
}

/**
 * Extract products from multiple pages and merge results.
 */
export async function extractFromPages(
  pages: PageInfo[],
  context: BrandContext
): Promise<ExtractionResult> {
  console.log(`[BrandIntel] Extracting from ${pages.length} pages...`);

  const extractions = await Promise.all(
    pages.map((page) => extractFromPage(page, context))
  );

  return mergeExtractions(extractions);
}

// ============================================================================
// Prompt Building
// ============================================================================

function buildExtractionPrompt(page: PageInfo, context: BrandContext): string {
  const pageTypeHints = getPageTypeHints(page.pageType);

  return `You are analyzing a ${context.businessType} company's website page.

## What we already know about this brand:
- Name: ${context.name}
- Business Type: ${context.businessType}
- Known products: ${context.knownProducts.length > 0 ? context.knownProducts.join(", ") : "None identified yet"}
- Pricing model: ${context.pricingModel}
- Competitors: ${context.competitors.length > 0 ? context.competitors.join(", ") : "Unknown"}
${context.companyInfo ? `- Company: ${context.companyInfo.employees} employees, ${context.companyInfo.industry}` : ""}

## Page being analyzed:
- URL: ${page.url}
- Type: ${page.pageType}
- Title: ${page.title}

## Your task:
${pageTypeHints}

Be thorough - describe everything you find.
If you see something that matches our known products, include extra details.
If you find NEW products not in our list, include those too.
DO NOT make up products - only extract what is ACTUALLY on this page.

## Page content:
${page.markdown.slice(0, 25000)}

## Output format:
Return a JSON object with this structure:
{
  "products": [{
    "name": "Product name (exact as shown)",
    "type": "physical" | "saas" | "service",
    "description": "Brief description",
    "price": 99.99 | null,
    "currency": "USD" | null,
    "images": ["image URL 1"],
    "category": "category if mentioned",
    "confidence": 0.0-1.0
  }],
  "pricing": {
    "model": "subscription" | "one-time" | "freemium" | "usage" | "enterprise" | null,
    "tiers": [{
      "name": "Tier name",
      "price": 99.99 | null,
      "billingPeriod": "monthly" | "annually" | "one-time" | "custom",
      "priceType": "per_user" | "flat" | "usage" | "custom",
      "isPopular": true | false,
      "features": ["feature 1", "feature 2"]
    }],
    "hasFreeTier": true | false,
    "hasEnterprise": true | false,
    "confidence": 0.0-1.0
  } | null,
  "features": [{
    "name": "Feature name",
    "description": "Brief description",
    "category": "Analytics" | "AI" | "Security" | "Collaboration" | "Other",
    "status": "ga" | "beta" | "coming_soon"
  }],
  "assets": [{
    "url": "image/video URL",
    "type": "image" | "video" | "logo" | "screenshot" | "lifestyle",
    "alt": "alt text if available",
    "context": "where/how it's used"
  }],
  "overallConfidence": 0.0-1.0,
  "notes": "Any observations about the extraction"
}

IMPORTANT:
- Only extract what is ACTUALLY present in the content
- Include confidence scores for each item
- If a field is not found, use null (not empty string)
- For prices, extract numeric values only (no currency symbols in the number)
- For images, only include absolute URLs that look like product/marketing images
- Skip navigation icons, social icons, decorative elements`;
}

function getPageTypeHints(pageType: string): string {
  const hints: Record<string, string> = {
    pricing: `Focus on extracting ALL pricing tiers, features included in each tier, and pricing model.
Look for: plan names, prices, billing periods, feature comparisons, enterprise options.
Extract the complete feature matrix if available.`,

    platform: `Focus on extracting platform components, modules, and how they fit together.
Look for: platform pillars, product modules, add-ons, architectural diagrams described.`,

    products: `Focus on extracting ALL products/services listed on this page.
Look for: product names, descriptions, key features, pricing if shown.
For ecommerce: include variants, SKUs, inventory status.
For SaaS: include plan differences, feature limits.`,

    features: `Focus on extracting ALL features and capabilities.
Look for: feature names, descriptions, which plans include them, AI capabilities.
Group by category if the page does so.`,

    integrations: `Focus on extracting ALL integrations and marketplace apps.
Look for: integration names, categories, native vs third-party, description of what they do.`,

    services: `Focus on extracting professional services offerings.
Look for: service types (implementation, training, consulting), pricing, duration.`,

    homepage: `Extract the main products/services and unique selling points.
Look for: hero section offerings, featured products, pricing CTAs.`,
  };

  return hints[pageType] || `Extract all products, services, and pricing from this page.`;
}

// ============================================================================
// Focused Extraction (Retry Strategy)
// ============================================================================

async function extractWithFocusedApproach(
  page: PageInfo,
  context: BrandContext,
  retriesLeft: number
): Promise<ExtractionResult> {
  // Try a more focused extraction based on page type
  const focusedPrompt = buildFocusedPrompt(page, context);

  try {
    const response = await callGateway<any>(
      "services.OpenRouter.internal.chatCompletion",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: focusedPrompt }],
        responseFormat: { type: "json_object" },
        temperature: 0.3, // Lower temperature for focused retry
      }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    const rawExtraction = JSON.parse(content);

    return normalizeExtraction(rawExtraction, page.url);
  } catch (error) {
    console.log(`[BrandIntel] Focused extraction failed: ${error}`);
    return {
      products: [],
      pricing: null,
      features: [],
      assets: [],
      confidence: 0,
      sourceUrl: page.url,
    };
  }
}

function buildFocusedPrompt(page: PageInfo, context: BrandContext): string {
  if (page.pageType === "pricing") {
    return `Extract ONLY pricing information from this ${context.businessType} company's pricing page.

Company: ${context.name}
Page: ${page.url}

Content:
${page.markdown.slice(0, 20000)}

Return JSON with ONLY pricing tiers found:
{
  "pricing": {
    "model": "subscription" | "freemium" | "one-time" | "usage" | "enterprise",
    "tiers": [{
      "name": "tier name",
      "price": number | null,
      "billingPeriod": "monthly" | "annually",
      "priceType": "per_user" | "flat",
      "features": ["feature1", "feature2"]
    }],
    "hasFreeTier": boolean,
    "hasEnterprise": boolean,
    "confidence": 0.0-1.0
  }
}`;
  }

  // Generic focused prompt
  return `Extract the main offerings from this page. Be concise and accurate.

Company: ${context.name} (${context.businessType})
Page: ${page.url}

Content:
${page.markdown.slice(0, 20000)}

Return JSON:
{
  "products": [{ "name": "...", "type": "saas"|"physical"|"service", "description": "...", "confidence": 0.9 }],
  "features": [{ "name": "...", "description": "..." }],
  "overallConfidence": 0.0-1.0
}`;
}

// ============================================================================
// Normalization
// ============================================================================

function normalizeExtraction(raw: any, sourceUrl: string): ExtractionResult {
  const products: ProductExtraction[] = [];
  const features: FeatureExtraction[] = [];
  const assets: AssetExtraction[] = [];

  // Normalize products
  if (Array.isArray(raw.products)) {
    for (const p of raw.products) {
      if (!p.name || typeof p.name !== "string") continue;

      products.push({
        name: p.name.trim(),
        type: validateProductType(p.type),
        description: p.description || undefined,
        price: typeof p.price === "number" ? p.price : undefined,
        currency: p.currency || undefined,
        images: Array.isArray(p.images) ? p.images.filter(isValidImageUrl) : [],
        sourceUrl,
        category: p.category || undefined,
        variants: p.variants || undefined,
        confidence: typeof p.confidence === "number" ? p.confidence : 0.7,
      });
    }
  }

  // Normalize pricing
  let pricing: PricingExtraction | null = null;
  if (raw.pricing && raw.pricing.tiers) {
    const tiers: PricingTier[] = [];

    for (const t of raw.pricing.tiers || []) {
      if (!t.name) continue;

      tiers.push({
        name: t.name,
        displayName: t.displayName,
        price: typeof t.price === "number" ? t.price : null,
        billingPeriod: t.billingPeriod || "monthly",
        priceType: t.priceType || "flat",
        isPopular: t.isPopular || false,
        features: Array.isArray(t.features) ? t.features : [],
      });
    }

    if (tiers.length > 0) {
      pricing = {
        model: raw.pricing.model || "unknown",
        tiers,
        hasFreeTier: raw.pricing.hasFreeTier || false,
        hasEnterprise: raw.pricing.hasEnterprise || false,
        billingOptions: raw.pricing.billingOptions || [],
        confidence: raw.pricing.confidence || 0.7,
      };
    }
  }

  // Normalize features
  if (Array.isArray(raw.features)) {
    for (const f of raw.features) {
      if (!f.name) continue;

      features.push({
        name: f.name,
        description: f.description,
        category: f.category,
        status: f.status || "ga",
        includedIn: f.includedIn,
      });
    }
  }

  // Normalize assets
  if (Array.isArray(raw.assets)) {
    for (const a of raw.assets) {
      if (!a.url || !isValidImageUrl(a.url)) continue;

      assets.push({
        url: a.url,
        type: a.type || "image",
        alt: a.alt,
        context: a.context,
        productAssociation: a.productAssociation,
      });
    }
  }

  // Calculate overall confidence
  const confidences = [
    ...products.map((p) => p.confidence),
    pricing?.confidence || 0,
    raw.overallConfidence || 0,
  ].filter((c) => c > 0);

  const overallConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  return {
    products,
    pricing,
    features,
    assets,
    confidence: overallConfidence,
    sourceUrl,
  };
}

function validateProductType(type: string): ProductType {
  const valid: ProductType[] = ["physical", "saas", "service"];
  return valid.includes(type as ProductType) ? (type as ProductType) : "saas";
}

function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  // Must be absolute URL
  if (!url.startsWith("http")) return false;

  // Skip common junk patterns
  const junkPatterns = [
    /tracking/i,
    /pixel/i,
    /beacon/i,
    /analytics/i,
    /1x1/,
    /\.gif$/i,
    /spacer/i,
    /blank/i,
    /facebook\.com/i,
    /twitter\.com/i,
    /linkedin\.com/i,
    /google\.com\/.*\/ads/i,
  ];

  return !junkPatterns.some((p) => p.test(url));
}

// ============================================================================
// Merging Multiple Extractions
// ============================================================================

/**
 * Merge multiple extraction results, deduplicating by name.
 */
export function mergeExtractions(extractions: ExtractionResult[]): ExtractionResult {
  const products: ProductExtraction[] = [];
  const features: FeatureExtraction[] = [];
  const assets: AssetExtraction[] = [];
  let pricing: PricingExtraction | null = null;

  const seenProductNames = new Set<string>();
  const seenFeatureNames = new Set<string>();
  const seenAssetUrls = new Set<string>();

  for (const extraction of extractions) {
    // Merge products (dedupe by normalized name)
    for (const product of extraction.products) {
      const key = product.name.toLowerCase().trim();
      if (!seenProductNames.has(key)) {
        seenProductNames.add(key);
        products.push(product);
      }
    }

    // Use highest confidence pricing
    if (extraction.pricing) {
      if (!pricing || extraction.pricing.confidence > pricing.confidence) {
        pricing = extraction.pricing;
      }
    }

    // Merge features (dedupe by name)
    for (const feature of extraction.features) {
      const key = feature.name.toLowerCase().trim();
      if (!seenFeatureNames.has(key)) {
        seenFeatureNames.add(key);
        features.push(feature);
      }
    }

    // Merge assets (dedupe by URL)
    for (const asset of extraction.assets) {
      if (!seenAssetUrls.has(asset.url)) {
        seenAssetUrls.add(asset.url);
        assets.push(asset);
      }
    }
  }

  // Calculate merged confidence
  const confidences = extractions.map((e) => e.confidence).filter((c) => c > 0);
  const mergedConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  return {
    products,
    pricing,
    features,
    assets,
    confidence: mergedConfidence,
    sourceUrl: extractions[0]?.sourceUrl || "",
  };
}

// ============================================================================
// Exports
// ============================================================================

export { buildExtractionPrompt, normalizeExtraction, mergeExtractions };
