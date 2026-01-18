/**
 * Brand Intelligence Validation Module
 *
 * Cross-check extracted data and assign confidence scores.
 * Validates products, pricing, and features against research context.
 *
 * @example
 * const validated = await validateExtraction(extraction, context);
 * console.log(`Overall confidence: ${validated.confidence}`);
 * console.log(`Products needing review: ${validated.products.filter(p => p.needsReview).length}`);
 */

import type {
  BrandContext,
  ExtractionResult,
  ProductExtraction,
  PricingExtraction,
  FeatureExtraction,
  AssetExtraction,
  ValidatedProduct,
  ValidatedPricing,
  ValidatedFeature,
  ValidatedAsset,
  ValidationResult,
} from "./types";

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate extracted data against research context.
 *
 * @param extraction - Raw extraction result
 * @param context - Brand research context
 * @returns Validated extraction with confidence scores
 *
 * @example
 * const validated = await validateExtraction(extraction, context);
 * console.log(`Overall confidence: ${validated.confidence}`);
 */
export async function validateExtraction(
  extraction: ExtractionResult,
  context: BrandContext
): Promise<{
  products: ValidatedProduct[];
  pricing: ValidatedPricing | null;
  features: ValidatedFeature[];
  assets: ValidatedAsset[];
  confidence: number;
}> {
  console.log(`[BrandIntel] Validating extraction...`);

  // Validate products
  const validatedProducts = extraction.products.map((p) =>
    validateProduct(p, context)
  );

  // Validate pricing
  const validatedPricing = extraction.pricing
    ? validatePricing(extraction.pricing, context)
    : null;

  // Validate features
  const validatedFeatures = extraction.features.map((f) =>
    validateFeature(f, context)
  );

  // Validate assets
  const validatedAssets = extraction.assets.map((a) =>
    validateAsset(a, validatedProducts)
  );

  // Calculate overall confidence
  const productScores = validatedProducts.map((p) => p.validationScore);
  const pricingScore = validatedPricing?.validationScore || 0;
  const allScores = [...productScores, pricingScore].filter((s) => s > 0);

  const overallConfidence =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : extraction.confidence;

  console.log(`[BrandIntel] Validation complete:`);
  console.log(`  Products: ${validatedProducts.length} (${validatedProducts.filter(p => p.needsReview).length} need review)`);
  console.log(`  Overall confidence: ${overallConfidence.toFixed(2)}`);

  return {
    products: validatedProducts,
    pricing: validatedPricing,
    features: validatedFeatures,
    assets: validatedAssets,
    confidence: overallConfidence,
  };
}

// ============================================================================
// Product Validation
// ============================================================================

/**
 * Validate a single product against context.
 */
function validateProduct(
  product: ProductExtraction,
  context: BrandContext
): ValidatedProduct {
  const concerns: string[] = [];
  let score = 0.8; // Start optimistic

  // Check if product name matches known products
  const knownMatch = context.knownProducts.find(
    (known) => fuzzyMatch(known, product.name) > 0.7
  );
  if (knownMatch) {
    score += 0.1;
  }

  // Validate product type matches business type
  if (!isTypeConsistent(product.type, context.businessType)) {
    concerns.push(`Product type "${product.type}" unusual for ${context.businessType} business`);
    score -= 0.1;
  }

  // Check for price sanity
  if (product.price !== undefined) {
    const priceIssue = validatePrice(product.price, product.type, context);
    if (priceIssue) {
      concerns.push(priceIssue);
      score -= 0.15;
    }
  }

  // Check for hallucination signals in name
  const nameIssues = validateProductName(product.name);
  if (nameIssues.length > 0) {
    concerns.push(...nameIssues);
    score -= 0.2 * nameIssues.length;
  }

  // Check image quality
  if (product.images.length === 0) {
    concerns.push("No images found");
    score -= 0.05;
  } else {
    const junkImages = product.images.filter(isJunkImage);
    if (junkImages.length > 0) {
      concerns.push(`${junkImages.length} potentially junk images`);
      score -= 0.05;
    }
  }

  // Check description quality
  if (!product.description || product.description.length < 20) {
    concerns.push("Missing or short description");
    score -= 0.05;
  }

  // Ensure score is in valid range
  score = Math.max(0, Math.min(1, score));

  return {
    ...product,
    validationScore: score,
    validationConcerns: concerns,
    crossCheckSources: knownMatch ? ["pre-research"] : [],
    needsReview: score < 0.6 || concerns.length > 2,
  };
}

function validateProductName(name: string): string[] {
  const issues: string[] = [];

  // Too long (likely extracted paragraph)
  if (name.length > 100) {
    issues.push("Product name too long (might be description)");
  }

  // Contains ellipsis (truncated)
  if (name.includes("...") || name.includes("…")) {
    issues.push("Product name appears truncated");
  }

  // Navigation-like words
  const navWords = [
    "menu",
    "home",
    "about",
    "contact",
    "login",
    "cart",
    "shop",
    "all",
    "back",
    "next",
    "previous",
    "click here",
    "learn more",
    "read more",
  ];
  if (navWords.some((w) => name.toLowerCase() === w)) {
    issues.push("Product name looks like navigation item");
  }

  // Pure numbers or prices extracted as names
  if (/^\$?\d+(\.\d+)?$/.test(name)) {
    issues.push("Product name appears to be just a price/number");
  }

  // Very short generic names
  if (name.length < 3) {
    issues.push("Product name too short");
  }

  return issues;
}

function validatePrice(
  price: number,
  productType: string,
  context: BrandContext
): string | null {
  // Negative prices
  if (price < 0) {
    return "Negative price detected";
  }

  // SaaS pricing sanity
  if (context.businessType === "saas") {
    if (price > 50000) {
      return "Unusually high price for SaaS (over $50k/month?)";
    }
  }

  // Physical product sanity
  if (productType === "physical") {
    if (price > 1000000) {
      return "Unusually high price for physical product";
    }
    if (price < 0.01 && price > 0) {
      return "Suspiciously low price";
    }
  }

  return null;
}

function isTypeConsistent(productType: string, businessType: string): boolean {
  // Physical products are unusual for pure SaaS companies
  if (businessType === "saas" && productType === "physical") {
    return false;
  }

  // SaaS products unusual for pure ecommerce
  if (businessType === "ecommerce" && productType === "saas") {
    return false;
  }

  return true;
}

// ============================================================================
// Pricing Validation
// ============================================================================

function validatePricing(
  pricing: PricingExtraction,
  context: BrandContext
): ValidatedPricing {
  const concerns: string[] = [];
  let score = 0.8;

  // Check tier count
  if (pricing.tiers.length === 0) {
    concerns.push("No pricing tiers found");
    score -= 0.3;
  } else if (pricing.tiers.length === 1) {
    concerns.push("Only one pricing tier (might be incomplete)");
    score -= 0.1;
  }

  // Validate tier prices are in ascending order
  const prices = pricing.tiers
    .map((t) => t.price)
    .filter((p): p is number => p !== null);
  if (prices.length > 1) {
    const isSorted = prices.every((p, i) => i === 0 || p >= prices[i - 1]);
    if (!isSorted) {
      concerns.push("Pricing tiers not in ascending order");
      score -= 0.1;
    }
  }

  // Check for duplicate tier names
  const tierNames = pricing.tiers.map((t) => t.name.toLowerCase());
  const uniqueNames = new Set(tierNames);
  if (uniqueNames.size < tierNames.length) {
    concerns.push("Duplicate tier names detected");
    score -= 0.15;
  }

  // Check pricing model consistency
  if (context.pricingModel !== "unknown" && pricing.model !== context.pricingModel) {
    concerns.push(`Extracted model "${pricing.model}" differs from research "${context.pricingModel}"`);
    score -= 0.1;
  }

  // Validate feature lists aren't empty
  const tiersWithFeatures = pricing.tiers.filter((t) => t.features.length > 0);
  if (tiersWithFeatures.length === 0) {
    concerns.push("No features extracted for any tier");
    score -= 0.1;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    ...pricing,
    validationScore: score,
    validationConcerns: concerns,
  };
}

// ============================================================================
// Feature Validation
// ============================================================================

function validateFeature(
  feature: FeatureExtraction,
  context: BrandContext
): ValidatedFeature {
  let score = 0.8;

  // Check name quality
  if (!feature.name || feature.name.length < 3) {
    score -= 0.3;
  }

  // Check description
  if (!feature.description) {
    score -= 0.1;
  }

  // Boost score if matches known product area
  for (const knownProduct of context.knownProducts) {
    if (
      feature.name.toLowerCase().includes(knownProduct.toLowerCase()) ||
      feature.description?.toLowerCase().includes(knownProduct.toLowerCase())
    ) {
      score += 0.1;
      break;
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    ...feature,
    validationScore: score,
  };
}

// ============================================================================
// Asset Validation
// ============================================================================

function validateAsset(
  asset: AssetExtraction,
  products: ValidatedProduct[]
): ValidatedAsset {
  const isJunk = isJunkImage(asset.url);

  let score = isJunk ? 0.2 : 0.8;

  // Boost if associated with a product
  if (asset.productAssociation) {
    const matchingProduct = products.find(
      (p) => fuzzyMatch(p.name, asset.productAssociation || "") > 0.7
    );
    if (matchingProduct) {
      score += 0.1;
    }
  }

  // Check for meaningful alt text
  if (asset.alt && asset.alt.length > 5) {
    score += 0.05;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    ...asset,
    validationScore: score,
    isJunk,
  };
}

// ============================================================================
// Junk Detection
// ============================================================================

const JUNK_IMAGE_PATTERNS = [
  // Tracking/analytics
  /pixel/i,
  /tracking/i,
  /beacon/i,
  /analytics/i,
  /stat\.gif/i,
  /1x1\.(png|gif|jpg)/i,
  /spacer/i,
  /blank\.(png|gif)/i,

  // Social icons
  /facebook\.com.*icon/i,
  /twitter\.com.*icon/i,
  /linkedin\.com.*icon/i,
  /instagram\.com.*icon/i,

  // Payment/trust badges
  /visa/i,
  /mastercard/i,
  /amex/i,
  /paypal.*badge/i,
  /stripe.*badge/i,
  /trustpilot/i,
  /bbb\.org/i,
  /mcafee.*seal/i,
  /norton.*seal/i,

  // Generic junk
  /placeholder/i,
  /loading/i,
  /spinner/i,
  /ajax-loader/i,
  /cookie.*banner/i,
  /gdpr/i,
  /consent/i,
];

function isJunkImage(url: string): boolean {
  return JUNK_IMAGE_PATTERNS.some((pattern) => pattern.test(url));
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

/**
 * Simple fuzzy string matching (returns 0-1 score).
 */
function fuzzyMatch(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const aNorm = normalize(a);
  const bNorm = normalize(b);

  if (aNorm === bNorm) return 1;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.9;

  // Simple character overlap
  const aChars = new Set(aNorm.split(""));
  const bChars = new Set(bNorm.split(""));
  const intersection = [...aChars].filter((c) => bChars.has(c)).length;
  const union = new Set([...aChars, ...bChars]).size;

  return union > 0 ? intersection / union : 0;
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Validate products in bulk with cross-product checks.
 */
export function validateProductBatch(
  products: ProductExtraction[],
  context: BrandContext
): ValidatedProduct[] {
  const validated = products.map((p) => validateProduct(p, context));

  // Additional cross-product checks
  const names = validated.map((p) => p.name.toLowerCase());

  // Flag duplicates
  const nameCounts = new Map<string, number>();
  for (const name of names) {
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  for (const product of validated) {
    const count = nameCounts.get(product.name.toLowerCase()) || 0;
    if (count > 1) {
      product.validationConcerns.push(`Duplicate product name (appears ${count} times)`);
      product.validationScore -= 0.1;
      product.needsReview = true;
    }
  }

  return validated;
}

// ============================================================================
// Exports
// ============================================================================

export {
  validateProduct,
  validatePricing,
  validateFeature,
  validateAsset,
  validateProductBatch,
  fuzzyMatch,
  isJunkImage,
};
