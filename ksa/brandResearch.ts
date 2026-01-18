/**
 * Brand Research KSA - Knowledge, Skills, and Abilities
 *
 * Agent-driven brand analysis and product extraction.
 * Uses browser navigation + visual analysis instead of regex patterns.
 *
 * Data Flow:
 * 1. Explore site with browser KSA
 * 2. Store discoveries in LOCAL Convex (sandbox)
 * 3. Query and verify locally
 * 4. Sync verified data to CLOUD Convex
 *
 * @example
 * // Analyze a brand's website
 * const profile = await analyzeSite("modgents.com");
 * console.log(profile.siteType); // "ecommerce"
 *
 * // Check local discovery stats
 * const stats = await getResearchStats("modgents.com");
 * console.log(`Found ${stats.products.total} products`);
 *
 * // Sync verified products to cloud
 * const synced = await syncToCloud("modgents.com", "brand_123");
 */

import { callGateway } from "./_shared/gateway";
import * as browser from "./browser";
import { scrape } from "./web";
import { api } from "../convex/_generated/api";
import { ConvexClient } from "convex/browser";

// ============================================================================
// ScrapeDo Fallback - For JS-rendered pages that Valyu can't handle
// ============================================================================

interface ScrapeDoResult {
  url: string;
  markdown: string;
  html?: string;
  title?: string;
}

/**
 * Scrape a URL using ScrapeDo via gateway.
 * Use this for sites that need JS rendering or when Valyu fails.
 *
 * @param url - URL to scrape
 * @param options - Scraping options
 * @returns Scraped content
 *
 * @example
 * // Scrape a JS-heavy SPA
 * const content = await scrapeWithScrapeDo("https://example.com");
 * console.log(content.markdown);
 *
 * // Scrape with residential proxy for anti-bot sites
 * const content = await scrapeWithScrapeDo("https://example.com", {
 *   useResidentialProxy: true,
 *   scrollCount: 5
 * });
 */
export async function scrapeWithScrapeDo(
  url: string,
  options?: {
    render?: boolean;
    scrollCount?: number;
    useResidentialProxy?: boolean;
  }
): Promise<ScrapeDoResult> {
  const response = await callGateway("services.ScrapeDo.internal.scrapeSPA", {
    url,
    scrollCount: options?.scrollCount ?? 3,
    clickLoadMore: true,
    extractNextData: true,
    super: options?.useResidentialProxy ?? false,
  });

  if (!response.success) {
    throw new Error(`ScrapeDo failed: ${response.error}`);
  }

  return {
    url,
    markdown: response.markdown || "",
    html: response.html,
    title: response.title,
  };
}

/**
 * Scrape with automatic fallback: tries Valyu first, then ScrapeDo.
 * This handles both simple sites (Valyu) and JS-heavy sites (ScrapeDo).
 *
 * @param url - URL to scrape
 * @returns Scraped content
 */
async function scrapeWithFallback(url: string): Promise<ScrapeDoResult> {
  // Try Valyu first (faster, simpler)
  try {
    const content = await scrape(url);
    if (content.markdown && content.markdown.length > 500) {
      return {
        url,
        markdown: content.markdown,
        title: content.title,
      };
    }
    console.log(`[BrandResearch] Valyu returned thin content, trying ScrapeDo...`);
  } catch (e) {
    console.log(`[BrandResearch] Valyu failed, trying ScrapeDo...`);
  }

  // Fallback to ScrapeDo (handles JS rendering)
  const scrapedoResult = await scrapeWithScrapeDo(url);

  // If still thin, try with residential proxy
  if (!scrapedoResult.markdown || scrapedoResult.markdown.length < 500) {
    console.log(`[BrandResearch] Content thin, retrying with residential proxy...`);
    return await scrapeWithScrapeDo(url, { useResidentialProxy: true, scrollCount: 5 });
  }

  return scrapedoResult;
}

// ============================================================================
// Types
// ============================================================================

export interface SiteProfile {
  domain: string;
  siteType: "ecommerce" | "saas" | "service" | "restaurant" | "media" | "other";
  platform?: "shopify" | "woocommerce" | "magento" | "custom" | "headless";
  confidence: number;
  navigation: NavigationHint[];
  productLocations: string[];
  observations: string[];
}

export interface NavigationHint {
  label: string;
  selector?: string;
  url?: string;
  purpose: "products" | "collections" | "pricing" | "menu" | "other";
}

export interface Product {
  name: string;
  type: "physical" | "saas" | "service";
  price?: number;
  currency?: string;
  description?: string;
  images: string[];
  sourceUrl: string;
  variants?: ProductVariant[];
  category?: string;
}

export interface ProductVariant {
  name: string;
  price?: number;
  sku?: string;
  available?: boolean;
}

export interface ResearchStats {
  domain: string;
  site: {
    siteType: string;
    platform?: string;
    confidence: number;
    analyzedAt: number;
    navigationHints: number;
  } | null;
  urls: {
    total: number;
    product: number;
    listing: number;
    scraped: number;
  };
  products: {
    total: number;
    verified: number;
    synced: number;
    withImages: number;
  };
}

// ============================================================================
// Local Convex Client (Sandbox)
// ============================================================================

// Connect to local Convex running in sandbox
const LOCAL_CONVEX_URL = process.env.CONVEX_URL || "http://127.0.0.1:3210";
let localClient: ConvexClient | null = null;

function getLocalClient(): ConvexClient {
  if (!localClient) {
    localClient = new ConvexClient(LOCAL_CONVEX_URL);
  }
  return localClient;
}

// ============================================================================
// Site Analysis
// ============================================================================

/**
 * Analyze a website to understand its structure and find product locations.
 * Uses visual analysis of screenshots + LLM to understand the site.
 * Stores result in LOCAL Convex for querying.
 *
 * @param domain - Domain to analyze (e.g., "modgents.com")
 * @returns Site profile with navigation hints
 *
 * @example
 * const profile = await analyzeSite("modgents.com");
 * console.log(profile.siteType); // "ecommerce"
 * console.log(profile.navigation); // [{ label: "Shop", purpose: "products" }]
 */
export async function analyzeSite(domain: string): Promise<SiteProfile> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const cleanDomain = new URL(url).hostname.replace("www.", "");

  console.log(`[BrandResearch] Analyzing ${cleanDomain}...`);

  // Open the site and take a screenshot
  const openResult = await browser.open(url);
  if (!openResult.success) {
    throw new Error(`Failed to open ${url}: ${openResult.error}`);
  }

  // Take screenshot for visual analysis
  const screenshot = await browser.screenshot("homepage");

  // Get the HTML and text content
  const html = await browser.getHtml();
  const text = await browser.getText();

  // Use LLM to analyze the site (with vision)
  const analysis = await callGateway("services.OpenRouter.internal.chatCompletion", {
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this website homepage and create a site profile.

Domain: ${cleanDomain}

Text content (first 5000 chars):
${text.slice(0, 5000)}

---

Create a JSON site profile:

{
  "siteType": "ecommerce" | "saas" | "service" | "restaurant" | "media" | "other",
  "platform": "shopify" | "woocommerce" | "magento" | "custom" | "headless" | null,
  "confidence": 0.0-1.0,
  "navigation": [
    {
      "label": "visible text on navigation element",
      "selector": "CSS selector if identifiable",
      "url": "href if visible",
      "purpose": "products" | "collections" | "pricing" | "menu" | "other"
    }
  ],
  "productLocations": ["descriptions of where products might be found"],
  "observations": ["key observations about the site"]
}

Focus on finding:
1. Where products/services/offerings are located
2. Navigation elements that lead to product pages
3. The type of business and platform used`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${screenshot.base64}`,
            },
          },
        ],
      },
    ],
    responseFormat: { type: "json_object" },
  });

  const llmProfile = JSON.parse(analysis.choices?.[0]?.message?.content || "{}");

  const profile: SiteProfile = {
    domain: cleanDomain,
    siteType: llmProfile.siteType || "other",
    platform: llmProfile.platform,
    confidence: llmProfile.confidence || 0.5,
    navigation: llmProfile.navigation || [],
    productLocations: llmProfile.productLocations || [],
    observations: llmProfile.observations || [],
  };

  // Store in local Convex
  const client = getLocalClient();
  await client.mutation(api.brandResearch.storeSiteAnalysis, {
    domain: cleanDomain,
    siteType: profile.siteType,
    platform: profile.platform,
    confidence: profile.confidence,
    navigation: profile.navigation.map(n => ({
      label: n.label,
      selector: n.selector,
      url: n.url,
      purpose: n.purpose,
    })),
    observations: profile.observations,
    productLocations: profile.productLocations,
    screenshotPath: screenshot.path,
  });

  await browser.closeBrowser();

  console.log(`[BrandResearch] Analysis complete: ${profile.siteType} (${profile.platform || "custom"})`);
  console.log(`[BrandResearch] Found ${profile.navigation.length} navigation hints`);

  return profile;
}

// ============================================================================
// URL Discovery
// ============================================================================

/**
 * Discover product URLs on a website by exploring navigation.
 * Uses browser to navigate and find product pages.
 *
 * @param domain - Domain to explore
 * @param profile - Site profile (optional, will analyze if not provided)
 * @returns Number of URLs discovered
 *
 * @example
 * const count = await discoverUrls("modgents.com");
 * console.log(`Discovered ${count} URLs`);
 */
export async function discoverUrls(
  domain: string,
  profile?: SiteProfile
): Promise<number> {
  const siteProfile = profile || await analyzeSite(domain);
  const cleanDomain = siteProfile.domain;
  const baseUrl = `https://${cleanDomain}`;

  console.log(`[BrandResearch] Discovering URLs on ${cleanDomain}...`);

  const discoveredUrls: Array<{ url: string; urlType: string; confidence: number }> = [];

  // Open the homepage
  await browser.open(baseUrl);

  // Strategy 1: Follow navigation hints
  for (const nav of siteProfile.navigation) {
    if (nav.purpose === "products" || nav.purpose === "collections" || nav.purpose === "pricing") {
      try {
        let targetUrl: string;

        if (nav.url) {
          targetUrl = nav.url.startsWith("http")
            ? nav.url
            : new URL(nav.url, baseUrl).href;
        } else if (nav.selector) {
          // Click and get the resulting URL
          await browser.click(nav.selector);
          await new Promise(r => setTimeout(r, 2000));
          // Get current URL from page
          const text = await browser.getText();
          // For now, use nav label as hint
          targetUrl = `${baseUrl}/${nav.label.toLowerCase().replace(/\s+/g, "-")}`;
        } else {
          continue;
        }

        discoveredUrls.push({
          url: targetUrl,
          urlType: nav.purpose === "pricing" ? "pricing" : "listing",
          confidence: 0.8,
        });

        // Navigate and extract links from the page
        await browser.open(targetUrl);
        const html = await browser.getHtml();
        const pageUrls = await extractUrlsFromPage(html, baseUrl, cleanDomain, siteProfile.siteType);
        discoveredUrls.push(...pageUrls);

        console.log(`[BrandResearch] ${nav.label} → ${pageUrls.length} URLs`);
      } catch (e) {
        console.log(`[BrandResearch] Failed to explore ${nav.label}`);
      }
    }
  }

  // Strategy 2: Try common paths
  const commonPaths = ["/products", "/shop", "/collections", "/menu", "/pricing", "/plans"];
  for (const path of commonPaths) {
    try {
      const targetUrl = `${baseUrl}${path}`;
      if (discoveredUrls.some(u => u.url === targetUrl)) continue;

      await browser.open(targetUrl);
      const html = await browser.getHtml();

      if (html.length > 1000) {
        discoveredUrls.push({
          url: targetUrl,
          urlType: "listing",
          confidence: 0.7,
        });

        const pageUrls = await extractUrlsFromPage(html, baseUrl, cleanDomain, siteProfile.siteType);
        discoveredUrls.push(...pageUrls);

        console.log(`[BrandResearch] ${path} → ${pageUrls.length} URLs`);
      }
    } catch {
      // Path doesn't exist
    }
  }

  await browser.closeBrowser();

  // Store in local Convex
  const client = getLocalClient();
  await client.mutation(api.brandResearch.storeDiscoveredUrls, {
    domain: cleanDomain,
    urls: discoveredUrls.map(u => ({
      url: u.url,
      urlType: u.urlType as any,
      confidence: u.confidence,
    })),
  });

  console.log(`[BrandResearch] Discovered ${discoveredUrls.length} URLs total`);

  return discoveredUrls.length;
}

/**
 * Extract URLs from a page using LLM (no regex!)
 */
async function extractUrlsFromPage(
  html: string,
  baseUrl: string,
  domain: string,
  siteType: string
): Promise<Array<{ url: string; urlType: string; confidence: number }>> {
  // Use LLM to classify links from HTML
  const extraction = await callGateway("services.OpenRouter.internal.chatCompletion", {
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "user",
        content: `Extract product/listing URLs from this HTML.

Site type: ${siteType}
Domain: ${domain}

HTML (first 15000 chars):
${html.slice(0, 15000)}

Find all <a href="..."> links that point to:
1. Individual product pages
2. Category/collection pages
3. Pricing pages

Return JSON array:
[
  { "url": "full URL", "urlType": "product" | "listing" | "pricing", "confidence": 0.0-1.0 }
]

IMPORTANT:
- Only include URLs from the same domain (${domain})
- Convert relative URLs to absolute using ${baseUrl}
- Skip navigation, footer, social, blog, about, contact links
- Focus on commerce/product related URLs`,
      },
    ],
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(extraction.choices?.[0]?.message?.content || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================================
// Product Extraction
// ============================================================================

/**
 * Scrape and extract products from discovered URLs.
 * Uses local Convex to track progress.
 *
 * @param domain - Domain to scrape
 * @param maxPages - Maximum pages to scrape (default: 20)
 * @returns Number of products extracted
 *
 * @example
 * const count = await scrapeProducts("modgents.com", 50);
 * console.log(`Extracted ${count} products`);
 */
export async function scrapeProducts(
  domain: string,
  maxPages: number = 20
): Promise<number> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const client = getLocalClient();

  // Get URLs to scrape from local Convex
  const urlsToScrape = await client.query(api.brandResearch.getUrlsToScrape, {
    domain: cleanDomain,
    limit: maxPages,
  });

  console.log(`[BrandResearch] Scraping ${urlsToScrape.length} URLs...`);

  let totalProducts = 0;

  for (const urlRecord of urlsToScrape) {
    try {
      // Scrape the page with automatic fallback (Valyu → ScrapeDo)
      const content = await scrapeWithFallback(urlRecord.url);

      // Extract products using LLM
      const products = await extractProductsFromContent(
        content.markdown,
        urlRecord.url,
        urlRecord.urlType
      );

      // Store products in local Convex
      if (products.length > 0) {
        await client.mutation(api.brandResearch.storeProducts, {
          domain: cleanDomain,
          sourceUrl: urlRecord.url,
          products: products.map(p => ({
            name: p.name,
            type: p.type,
            price: p.price,
            currency: p.currency,
            description: p.description,
            images: p.images,
            category: p.category,
            variants: p.variants,
          })),
        });

        totalProducts += products.length;
        console.log(`[BrandResearch] ${urlRecord.url} → ${products.length} products`);
      }

      // Mark URL as scraped
      await client.mutation(api.brandResearch.markUrlScraped, {
        urlId: urlRecord._id,
        productCount: products.length,
      });
    } catch (e: any) {
      // Mark URL as failed
      await client.mutation(api.brandResearch.markUrlScraped, {
        urlId: urlRecord._id,
        error: e.message,
      });
      console.log(`[BrandResearch] Failed: ${urlRecord.url} - ${e.message}`);
    }
  }

  console.log(`[BrandResearch] Extracted ${totalProducts} products total`);

  return totalProducts;
}

/**
 * Extract products from page content using LLM
 */
async function extractProductsFromContent(
  content: string,
  sourceUrl: string,
  pageType: string
): Promise<Product[]> {
  const extraction = await callGateway("services.OpenRouter.internal.chatCompletion", {
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "user",
        content: `Extract all products from this ${pageType} page.

URL: ${sourceUrl}

Page content:
${content.slice(0, 20000)}

Return JSON array of products:
[
  {
    "name": "Product name",
    "type": "physical" | "saas" | "service",
    "price": 99.99 (number or null),
    "currency": "USD",
    "description": "Brief description",
    "images": ["image URL 1", "image URL 2"],
    "category": "product category",
    "variants": [
      { "name": "Variant name", "price": 99.99, "sku": "SKU123" }
    ]
  }
]

IMPORTANT:
- Only extract REAL products, not navigation items or banners
- Include ALL products visible on this page
- For SaaS, extract pricing plans as products (type: "saas")
- For restaurants, extract menu items as products (type: "physical")
- Extract ALL images associated with each product
- Skip testimonials, team members, blog posts`,
      },
    ],
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(extraction.choices?.[0]?.message?.content || "[]");
    const products = Array.isArray(parsed) ? parsed : [];

    return products.map(p => ({
      name: p.name,
      type: p.type || "physical",
      price: typeof p.price === "number" ? p.price : undefined,
      currency: p.currency,
      description: p.description,
      images: Array.isArray(p.images) ? p.images : [],
      sourceUrl,
      category: p.category,
      variants: p.variants,
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// Stats & Querying
// ============================================================================

/**
 * Get research stats for a domain from local Convex.
 *
 * @param domain - Domain to get stats for
 * @returns Research statistics
 *
 * @example
 * const stats = await getResearchStats("modgents.com");
 * console.log(`Found ${stats.products.total} products`);
 * console.log(`${stats.products.verified} verified`);
 */
export async function getResearchStats(domain: string): Promise<ResearchStats> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const client = getLocalClient();

  return await client.query(api.brandResearch.getResearchSummary, {
    domain: cleanDomain,
  });
}

/**
 * Get all discovered products for a domain.
 *
 * @param domain - Domain to get products for
 * @param verifiedOnly - Only return verified products
 * @returns Array of products
 */
export async function getProducts(
  domain: string,
  verifiedOnly: boolean = false
): Promise<Product[]> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const client = getLocalClient();

  const products = await client.query(api.brandResearch.getProducts, {
    domain: cleanDomain,
    verifiedOnly,
  });

  return products.map((p: any) => ({
    name: p.name,
    type: p.type,
    price: p.price,
    currency: p.currency,
    description: p.description,
    images: p.images,
    sourceUrl: p.sourceUrl,
    category: p.category,
    variants: p.variants,
  }));
}

// ============================================================================
// Monitoring & Progress
// ============================================================================

export interface ResearchProgress {
  domain: string;
  phase: "idle" | "analyzing" | "discovering" | "scraping" | "verifying" | "syncing" | "complete" | "error";
  startedAt?: number;
  completedAt?: number;
  stats: ResearchStats;
  currentUrl?: string;
  errors: string[];
  elapsedMs?: number;
}

export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  issues: ValidationIssue[];
  summary: string;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  field: string;
  message: string;
  productName?: string;
}

// Track active research sessions
const activeResearch = new Map<string, {
  phase: ResearchProgress["phase"];
  startedAt: number;
  currentUrl?: string;
  errors: string[];
}>();

/**
 * Start tracking a research session.
 */
function startResearchTracking(domain: string): void {
  activeResearch.set(domain, {
    phase: "analyzing",
    startedAt: Date.now(),
    errors: [],
  });
}

/**
 * Update research phase.
 */
function updateResearchPhase(
  domain: string,
  phase: ResearchProgress["phase"],
  currentUrl?: string
): void {
  const session = activeResearch.get(domain);
  if (session) {
    session.phase = phase;
    session.currentUrl = currentUrl;
  }
}

/**
 * Record an error in research.
 */
function recordResearchError(domain: string, error: string): void {
  const session = activeResearch.get(domain);
  if (session) {
    session.errors.push(error);
  }
}

/**
 * Get current progress of a research session.
 *
 * @param domain - Domain being researched
 * @returns Current progress including phase, stats, and errors
 *
 * @example
 * const progress = await monitorProgress("modgents.com");
 * console.log(`Phase: ${progress.phase}`);
 * console.log(`Products found: ${progress.stats.products.total}`);
 */
export async function monitorProgress(domain: string): Promise<ResearchProgress> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const session = activeResearch.get(cleanDomain);
  const stats = await getResearchStats(cleanDomain);

  return {
    domain: cleanDomain,
    phase: session?.phase || "idle",
    startedAt: session?.startedAt,
    completedAt: session?.phase === "complete" ? Date.now() : undefined,
    stats,
    currentUrl: session?.currentUrl,
    errors: session?.errors || [],
    elapsedMs: session?.startedAt ? Date.now() - session.startedAt : undefined,
  };
}

/**
 * Wait for a research phase to complete.
 *
 * @param domain - Domain being researched
 * @param targetPhase - Phase to wait for (or "complete")
 * @param timeoutMs - Maximum time to wait (default: 5 minutes)
 * @returns Final progress when target phase reached
 *
 * @example
 * // Wait for scraping to complete
 * const progress = await awaitPhase("modgents.com", "verifying", 120000);
 */
export async function awaitPhase(
  domain: string,
  targetPhase: ResearchProgress["phase"],
  timeoutMs: number = 300000
): Promise<ResearchProgress> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const startTime = Date.now();

  const phaseOrder = ["idle", "analyzing", "discovering", "scraping", "verifying", "syncing", "complete"];
  const targetIndex = phaseOrder.indexOf(targetPhase);

  while (Date.now() - startTime < timeoutMs) {
    const progress = await monitorProgress(cleanDomain);
    const currentIndex = phaseOrder.indexOf(progress.phase);

    // Check if we've reached or passed the target phase
    if (currentIndex >= targetIndex || progress.phase === "error") {
      return progress;
    }

    // Wait before checking again
    await new Promise(r => setTimeout(r, 2000));
  }

  // Timeout reached
  const finalProgress = await monitorProgress(cleanDomain);
  finalProgress.errors.push(`Timeout waiting for phase: ${targetPhase}`);
  return finalProgress;
}

/**
 * Wait for research to fully complete.
 *
 * @param domain - Domain being researched
 * @param timeoutMs - Maximum time to wait (default: 10 minutes)
 * @returns Final progress when complete
 *
 * @example
 * const result = await awaitCompletion("modgents.com");
 * if (result.phase === "complete") {
 *   console.log(`Found ${result.stats.products.total} products!`);
 * }
 */
export async function awaitCompletion(
  domain: string,
  timeoutMs: number = 600000
): Promise<ResearchProgress> {
  return awaitPhase(domain, "complete", timeoutMs);
}

/**
 * Validate research results meet quality standards.
 *
 * @param domain - Domain to validate
 * @param options - Validation options
 * @returns Validation result with score and issues
 *
 * @example
 * const validation = await validateResults("modgents.com", { minProducts: 10 });
 * if (validation.valid) {
 *   console.log(`Validation passed with score ${validation.score}`);
 * } else {
 *   console.log("Issues:", validation.issues);
 * }
 */
export async function validateResults(
  domain: string,
  options?: {
    minProducts?: number;
    minWithImages?: number;
    minWithPrice?: number;
    minVerified?: number;
  }
): Promise<ValidationResult> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const stats = await getResearchStats(cleanDomain);
  const products = await getProducts(cleanDomain);

  const minProducts = options?.minProducts || 5;
  const minWithImages = options?.minWithImages || 3;
  const minWithPrice = options?.minWithPrice || 0;
  const minVerified = options?.minVerified || 0;

  const issues: ValidationIssue[] = [];
  let score = 100;

  // Check minimum products
  if (stats.products.total < minProducts) {
    issues.push({
      severity: "error",
      field: "products.total",
      message: `Found ${stats.products.total} products, need at least ${minProducts}`,
    });
    score -= 30;
  }

  // Check products with images
  if (stats.products.withImages < minWithImages) {
    issues.push({
      severity: "warning",
      field: "products.withImages",
      message: `Only ${stats.products.withImages} products have images, need at least ${minWithImages}`,
    });
    score -= 15;
  }

  // Check products with prices
  const productsWithPrice = products.filter(p => p.price !== undefined).length;
  if (productsWithPrice < minWithPrice) {
    issues.push({
      severity: "warning",
      field: "products.withPrice",
      message: `Only ${productsWithPrice} products have prices, need at least ${minWithPrice}`,
    });
    score -= 10;
  }

  // Check verified products
  if (stats.products.verified < minVerified) {
    issues.push({
      severity: "warning",
      field: "products.verified",
      message: `Only ${stats.products.verified} products verified, need at least ${minVerified}`,
    });
    score -= 10;
  }

  // Check for duplicate products (by name)
  const names = products.map(p => p.name.toLowerCase().trim());
  const uniqueNames = new Set(names);
  if (uniqueNames.size < names.length) {
    const duplicates = names.length - uniqueNames.size;
    issues.push({
      severity: "warning",
      field: "products.duplicates",
      message: `Found ${duplicates} duplicate product names`,
    });
    score -= 5 * Math.min(duplicates, 5);
  }

  // Check for products without names (junk)
  const junkProducts = products.filter(p => !p.name || p.name.length < 3);
  if (junkProducts.length > 0) {
    issues.push({
      severity: "error",
      field: "products.junk",
      message: `Found ${junkProducts.length} products with invalid names`,
    });
    score -= 10 * Math.min(junkProducts.length, 3);
  }

  // Check for navigation junk (common nav words in product names)
  const navWords = ["menu", "home", "about", "contact", "login", "cart", "shop", "all"];
  const navJunk = products.filter(p =>
    navWords.some(word => p.name.toLowerCase() === word)
  );
  if (navJunk.length > 0) {
    issues.push({
      severity: "error",
      field: "products.navJunk",
      message: `Found ${navJunk.length} navigation items extracted as products: ${navJunk.map(p => p.name).join(", ")}`,
    });
    score -= 20;
  }

  score = Math.max(0, score);
  const valid = score >= 60 && !issues.some(i => i.severity === "error");

  return {
    valid,
    score,
    issues,
    summary: valid
      ? `Validation passed with score ${score}/100. Found ${stats.products.total} products.`
      : `Validation failed with score ${score}/100. ${issues.filter(i => i.severity === "error").length} errors found.`,
  };
}

/**
 * Check if research is currently active for a domain.
 */
export function isResearchActive(domain: string): boolean {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const session = activeResearch.get(cleanDomain);
  return session !== undefined && session.phase !== "complete" && session.phase !== "error";
}

/**
 * Cancel an active research session.
 */
export function cancelResearch(domain: string): boolean {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (activeResearch.has(cleanDomain)) {
    activeResearch.delete(cleanDomain);
    return true;
  }
  return false;
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify discovered products with visual inspection.
 * Uses browser to view product pages and confirm data.
 *
 * @param domain - Domain to verify products for
 * @param sampleSize - Number of products to verify (default: 10)
 * @returns Number of products verified
 */
export async function verifyProducts(
  domain: string,
  sampleSize: number = 10
): Promise<number> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const client = getLocalClient();

  // Get unverified products
  const products = await client.query(api.brandResearch.getProducts, {
    domain: cleanDomain,
    verifiedOnly: false,
    limit: sampleSize,
  });

  console.log(`[BrandResearch] Verifying ${products.length} products...`);

  let verified = 0;

  for (const product of products) {
    try {
      // Open product page
      await browser.open(product.sourceUrl);
      const screenshot = await browser.screenshot(`verify-${product._id}`);
      const text = await browser.getText();

      // Ask LLM to verify
      const verification = await callGateway("services.OpenRouter.internal.chatCompletion", {
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Verify this product extraction is correct.

Extracted product:
- Name: ${product.name}
- Type: ${product.type}
- Price: ${product.price} ${product.currency}
- Description: ${product.description}
- Images: ${product.images.length}

Page text:
${text.slice(0, 3000)}

Is this extraction accurate? Return JSON:
{
  "verified": true | false,
  "issues": ["list any issues found"],
  "corrections": { "field": "corrected value" }
}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${screenshot.base64}`,
                },
              },
            ],
          },
        ],
        responseFormat: { type: "json_object" },
      });

      const result = JSON.parse(verification.choices?.[0]?.message?.content || "{}");

      await client.mutation(api.brandResearch.verifyProduct, {
        productId: product._id,
        verified: result.verified === true,
        notes: result.issues?.join("; "),
      });

      if (result.verified) {
        verified++;
        console.log(`[BrandResearch] ✓ ${product.name}`);
      } else {
        console.log(`[BrandResearch] ✗ ${product.name}: ${result.issues?.join(", ")}`);
      }
    } catch (e: any) {
      console.log(`[BrandResearch] Failed to verify ${product.name}: ${e.message}`);
    }
  }

  await browser.closeBrowser();

  console.log(`[BrandResearch] Verified ${verified}/${products.length} products`);

  return verified;
}

// ============================================================================
// Cloud Sync
// ============================================================================

/**
 * Sync verified products to cloud Convex (main database).
 *
 * @param domain - Domain to sync products for
 * @param brandId - Brand ID in cloud database
 * @returns Number of products synced
 *
 * @example
 * const synced = await syncToCloud("modgents.com", "brand_123");
 * console.log(`Synced ${synced} products to cloud`);
 */
export async function syncToCloud(
  domain: string,
  brandId: string
): Promise<number> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const client = getLocalClient();

  // Get unsynced verified products
  const products = await client.query(api.brandResearch.getUnsyncedProducts, {
    domain: cleanDomain,
    verifiedOnly: true,
  });

  console.log(`[BrandResearch] Syncing ${products.length} products to cloud...`);

  let synced = 0;

  for (const product of products) {
    try {
      // Call cloud Convex via gateway
      const cloudResult = await callGateway(
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
        }
      );

      // Mark as synced locally
      await client.mutation(api.brandResearch.markProductSynced, {
        productId: product._id,
        cloudProductId: (cloudResult as any).productId,
      });

      synced++;
    } catch (e: any) {
      console.log(`[BrandResearch] Failed to sync ${product.name}: ${e.message}`);
    }
  }

  console.log(`[BrandResearch] Synced ${synced} products to cloud`);

  return synced;
}

// ============================================================================
// Parallel Scraping
// ============================================================================

/**
 * Scrape multiple URLs in parallel with rate limiting.
 *
 * @param domain - Domain being scraped
 * @param maxConcurrent - Maximum concurrent scrapes (default: 3)
 * @param maxPages - Maximum total pages to scrape
 * @returns Number of products extracted
 *
 * @example
 * const count = await parallelScrape("modgents.com", 5, 50);
 * console.log(`Extracted ${count} products in parallel`);
 */
export async function parallelScrape(
  domain: string,
  maxConcurrent: number = 3,
  maxPages: number = 50
): Promise<number> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const client = getLocalClient();

  // Get all URLs to scrape
  const urlsToScrape = await client.query(api.brandResearch.getUrlsToScrape, {
    domain: cleanDomain,
    limit: maxPages,
  });

  if (urlsToScrape.length === 0) {
    console.log(`[BrandResearch] No URLs to scrape for ${cleanDomain}`);
    return 0;
  }

  console.log(`[BrandResearch] Parallel scraping ${urlsToScrape.length} URLs (concurrency: ${maxConcurrent})...`);

  let totalProducts = 0;
  let completed = 0;

  // Process in batches
  for (let i = 0; i < urlsToScrape.length; i += maxConcurrent) {
    const batch = urlsToScrape.slice(i, i + maxConcurrent);

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(async (urlRecord) => {
        updateResearchPhase(cleanDomain, "scraping", urlRecord.url);

        try {
          const content = await scrape(urlRecord.url);
          const products = await extractProductsFromContent(
            content.markdown,
            urlRecord.url,
            urlRecord.urlType
          );

          if (products.length > 0) {
            await client.mutation(api.brandResearch.storeProducts, {
              domain: cleanDomain,
              sourceUrl: urlRecord.url,
              products: products.map(p => ({
                name: p.name,
                type: p.type,
                price: p.price,
                currency: p.currency,
                description: p.description,
                images: p.images,
                category: p.category,
                variants: p.variants,
              })),
            });
          }

          await client.mutation(api.brandResearch.markUrlScraped, {
            urlId: urlRecord._id,
            productCount: products.length,
          });

          return products.length;
        } catch (e: any) {
          recordResearchError(cleanDomain, `Failed to scrape ${urlRecord.url}: ${e.message}`);
          await client.mutation(api.brandResearch.markUrlScraped, {
            urlId: urlRecord._id,
            error: e.message,
          });
          return 0;
        }
      })
    );

    // Count successes
    for (const result of results) {
      if (result.status === "fulfilled") {
        totalProducts += result.value;
      }
      completed++;
    }

    console.log(`[BrandResearch] Progress: ${completed}/${urlsToScrape.length} URLs, ${totalProducts} products`);

    // Small delay between batches to avoid rate limiting
    if (i + maxConcurrent < urlsToScrape.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[BrandResearch] Parallel scrape complete: ${totalProducts} products from ${completed} URLs`);

  return totalProducts;
}

// ============================================================================
// Full Research Flow
// ============================================================================

export interface FullResearchResult {
  profile: SiteProfile;
  urlsDiscovered: number;
  productsFound: number;
  productsVerified: number;
  productsSynced: number;
  validation: ValidationResult;
  elapsedMs: number;
}

/**
 * Run a full brand research: analyze → discover → scrape → verify → sync.
 * Tracks progress and validates results.
 *
 * @param domain - Domain to research
 * @param brandId - Brand ID to sync to
 * @param options - Research options
 * @returns Research results with validation
 *
 * @example
 * const result = await fullResearch("modgents.com", "brand_123", {
 *   maxProducts: 50,
 *   autoVerify: true,
 *   autoSync: true,
 *   parallel: true,
 * });
 * console.log(`Found ${result.productsFound}, synced ${result.productsSynced}`);
 * console.log(`Validation: ${result.validation.summary}`);
 */
export async function fullResearch(
  domain: string,
  brandId: string,
  options?: {
    maxProducts?: number;
    autoVerify?: boolean;
    autoSync?: boolean;
    parallel?: boolean;
    concurrency?: number;
    minProducts?: number;
  }
): Promise<FullResearchResult> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const maxProducts = options?.maxProducts || 50;
  const autoVerify = options?.autoVerify !== false;
  const autoSync = options?.autoSync !== false;
  const parallel = options?.parallel !== false;
  const concurrency = options?.concurrency || 3;
  const minProducts = options?.minProducts || 5;

  const startTime = Date.now();

  console.log(`[BrandResearch] Starting full research for ${domain}...`);

  // Start tracking
  startResearchTracking(cleanDomain);

  try {
    // Step 1: Analyze site
    updateResearchPhase(cleanDomain, "analyzing");
    const profile = await analyzeSite(domain);

    // Step 2: Discover URLs
    updateResearchPhase(cleanDomain, "discovering");
    const urlsDiscovered = await discoverUrls(domain, profile);

    // Step 3: Scrape products (parallel or sequential)
    updateResearchPhase(cleanDomain, "scraping");
    let productsFound: number;
    if (parallel) {
      productsFound = await parallelScrape(domain, concurrency, maxProducts);
    } else {
      productsFound = await scrapeProducts(domain, maxProducts);
    }

    // Step 4: Verify products (optional)
    let productsVerified = 0;
    if (autoVerify && productsFound > 0) {
      updateResearchPhase(cleanDomain, "verifying");
      productsVerified = await verifyProducts(domain, Math.min(10, productsFound));
    }

    // Step 5: Sync to cloud (optional)
    let productsSynced = 0;
    if (autoSync && productsVerified > 0) {
      updateResearchPhase(cleanDomain, "syncing");
      productsSynced = await syncToCloud(domain, brandId);
    }

    // Step 6: Validate results
    const validation = await validateResults(domain, { minProducts });

    // Mark complete
    updateResearchPhase(cleanDomain, "complete");

    const elapsedMs = Date.now() - startTime;

    console.log(`[BrandResearch] Research complete in ${(elapsedMs / 1000).toFixed(1)}s!`);
    console.log(`  - Site type: ${profile.siteType}`);
    console.log(`  - URLs discovered: ${urlsDiscovered}`);
    console.log(`  - Products found: ${productsFound}`);
    console.log(`  - Products verified: ${productsVerified}`);
    console.log(`  - Products synced: ${productsSynced}`);
    console.log(`  - Validation: ${validation.summary}`);

    return {
      profile,
      urlsDiscovered,
      productsFound,
      productsVerified,
      productsSynced,
      validation,
      elapsedMs,
    };
  } catch (e: any) {
    updateResearchPhase(cleanDomain, "error");
    recordResearchError(cleanDomain, e.message);
    throw e;
  }
}
