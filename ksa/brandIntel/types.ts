/**
 * Brand Intelligence Types
 *
 * Shared TypeScript types for the brandIntel KSA.
 */

// ============================================================================
// Brand Context (Pre-Research)
// ============================================================================

export interface BrandContext {
  name: string;
  domain: string;
  businessType: BusinessType;
  knownProducts: string[];
  pricingModel: PricingModel;
  competitors: string[];
  recentNews: NewsArticle[];
  companyInfo: CompanyInfo | null;
}

export type BusinessType = 'saas' | 'ecommerce' | 'service' | 'hybrid' | 'unknown';
export type PricingModel = 'subscription' | 'one-time' | 'freemium' | 'usage' | 'enterprise' | 'unknown';

export interface NewsArticle {
  title: string;
  url: string;
  date: string;
  source?: string;
}

export interface CompanyInfo {
  employees: string;
  founded: number | null;
  funding: string;
  industry: string;
  headquarters?: {
    city?: string;
    state?: string;
    country?: string;
  };
}

// ============================================================================
// Site Discovery
// ============================================================================

export interface SiteMap {
  homepage: PageInfo;
  pricing: PageInfo | null;
  products: PageInfo[];
  features: PageInfo | null;
  about: PageInfo | null;
  allUrls: string[];
}

export interface PageInfo {
  url: string;
  title: string;
  markdown: string;
  html?: string;
  pageType: PageType;
  scrapedAt: number;
}

export type PageType =
  | 'homepage'
  | 'pricing'
  | 'product'
  | 'products'
  | 'features'
  | 'integrations'
  | 'services'
  | 'about'
  | 'platform'
  | 'legal'
  | 'other';

export interface DiscoveredUrl {
  url: string;
  pageType: PageType;
  priority: number;
  confidence: number;
}

// ============================================================================
// Extraction Results
// ============================================================================

export interface ExtractionResult {
  products: ProductExtraction[];
  pricing: PricingExtraction | null;
  features: FeatureExtraction[];
  assets: AssetExtraction[];
  confidence: number;
  sourceUrl: string;
}

export interface ProductExtraction {
  name: string;
  type: ProductType;
  description?: string;
  price?: number;
  currency?: string;
  images: string[];
  sourceUrl: string;
  category?: string;
  variants?: ProductVariant[];
  confidence: number;
  needsReview?: boolean;
}

export type ProductType = 'physical' | 'saas' | 'service';

export interface ProductVariant {
  name: string;
  price?: number;
  sku?: string;
  available?: boolean;
}

export interface PricingExtraction {
  model: PricingModel;
  tiers: PricingTier[];
  hasFreeTier: boolean;
  hasEnterprise: boolean;
  billingOptions: string[];
  confidence: number;
}

export interface PricingTier {
  name: string;
  displayName?: string;
  price: number | null;
  billingPeriod: 'monthly' | 'annually' | 'one-time' | 'custom';
  priceType: 'per_user' | 'flat' | 'usage' | 'custom';
  isPopular?: boolean;
  features: string[];
}

export interface FeatureExtraction {
  name: string;
  description?: string;
  category?: string;
  status: 'ga' | 'beta' | 'coming_soon';
  includedIn?: string[];
}

export interface AssetExtraction {
  url: string;
  type: AssetType;
  alt?: string;
  context?: string;
  productAssociation?: string;
}

export type AssetType = 'image' | 'video' | 'logo' | 'screenshot' | 'lifestyle';

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  item: any;
  confidence: number;
  sources: string[];
  concerns: string[];
  needsReview: boolean;
}

export interface ValidatedProduct extends ProductExtraction {
  validationScore: number;
  validationConcerns: string[];
  crossCheckSources: string[];
}

export interface ValidatedPricing extends PricingExtraction {
  validationScore: number;
  validationConcerns: string[];
}

export interface ValidatedFeature extends FeatureExtraction {
  validationScore: number;
}

export interface ValidatedAsset extends AssetExtraction {
  validationScore: number;
  isJunk: boolean;
}

// ============================================================================
// Full Scan Results
// ============================================================================

export interface BrandScanResult {
  brand: BrandContext;
  products: ValidatedProduct[];
  pricing: ValidatedPricing | null;
  features: ValidatedFeature[];
  assets: ValidatedAsset[];
  siteMap: SiteMap;
  confidence: number;
  duration: number;
  errors: string[];
  phaseDurations: {
    research: number;
    discovery: number;
    extraction: number;
    validation: number;
    sync: number;
  };
}

export interface ScanOptions {
  includeSocial?: boolean;
  includeAds?: boolean;
  depth?: 'quick' | 'thorough';
  maxPages?: number;
  skipSync?: boolean;
  brandId?: string;
}

// ============================================================================
// Subagent Types
// ============================================================================

export interface SubagentTask {
  name: string;
  task: string;
  tools: string[];
  context?: Record<string, unknown>;
}

export interface SubagentResult {
  name: string;
  success: boolean;
  result: unknown;
  error?: string;
  duration: number;
}
