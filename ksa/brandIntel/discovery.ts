/**
 * Brand Intelligence Discovery Module
 *
 * Context-aware site crawling and URL mapping.
 * Uses pre-research context to prioritize important pages.
 *
 * @example
 * const context = await researchBrand("mixpanel.com");
 * const siteMap = await discoverSite("mixpanel.com", context);
 * console.log(`Found ${siteMap.products.length} product pages`);
 */

import { callGateway } from "../_shared/gateway";
import type {
  BrandContext,
  SiteMap,
  PageInfo,
  PageType,
  DiscoveredUrl,
} from "./types";

// ============================================================================
// URL Patterns for Page Classification
// ============================================================================

const PAGE_PATTERNS: Array<{ pattern: RegExp; type: PageType; priority: number }> = [
  // Pricing (highest priority for SaaS)
  { pattern: /\/pricing\/?$/i, type: "pricing", priority: 1 },
  { pattern: /\/plans\/?$/i, type: "pricing", priority: 1 },
  { pattern: /\/editions\/?$/i, type: "pricing", priority: 2 },
  { pattern: /\/packages\/?$/i, type: "pricing", priority: 2 },

  // Platform/Products
  { pattern: /\/platform\/?$/i, type: "platform", priority: 1 },
  { pattern: /\/products?\/?$/i, type: "products", priority: 1 },
  { pattern: /\/solutions?\/?$/i, type: "products", priority: 2 },
  { pattern: /\/overview\/?$/i, type: "platform", priority: 2 },

  // Features
  { pattern: /\/features?\/?$/i, type: "features", priority: 1 },
  { pattern: /\/capabilities\/?$/i, type: "features", priority: 2 },
  { pattern: /\/what-we-do\/?$/i, type: "features", priority: 3 },

  // Integrations
  { pattern: /\/integrations?\/?$/i, type: "integrations", priority: 1 },
  { pattern: /\/marketplace\/?$/i, type: "integrations", priority: 1 },
  { pattern: /\/apps?\/?$/i, type: "integrations", priority: 2 },
  { pattern: /\/exchange\/?$/i, type: "integrations", priority: 2 },

  // Services
  { pattern: /\/services?\/?$/i, type: "services", priority: 1 },
  { pattern: /\/professional-services?\/?$/i, type: "services", priority: 1 },
  { pattern: /\/implementation\/?$/i, type: "services", priority: 2 },
  { pattern: /\/support\/?$/i, type: "services", priority: 3 },

  // About
  { pattern: /\/about\/?$/i, type: "about", priority: 3 },
  { pattern: /\/company\/?$/i, type: "about", priority: 3 },

  // Legal (often has product descriptions)
  { pattern: /\/legal\/product-descriptions?\/?$/i, type: "legal", priority: 2 },

  // Individual product pages (lower priority - discovered dynamically)
  { pattern: /\/product\/[^\/]+\/?$/i, type: "product", priority: 3 },
];

// ============================================================================
// Main Discovery Function
// ============================================================================

/**
 * Discover site structure with context-aware crawling.
 *
 * @param domain - Domain to explore
 * @param context - Pre-research brand context
 * @param options - Discovery options
 * @returns Site map with discovered pages
 *
 * @example
 * const context = await researchBrand("mixpanel.com");
 * const siteMap = await discoverSite("mixpanel.com", context, { maxPages: 20 });
 */
export async function discoverSite(
  domain: string,
  context: BrandContext,
  options?: { maxPages?: number }
): Promise<SiteMap> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const baseUrl = `https://${cleanDomain}`;
  const maxPages = options?.maxPages || 20;

  console.log(`[BrandIntel] Discovering site structure for ${cleanDomain}...`);

  // Step 1: Scrape homepage
  const homepage = await scrapePage(baseUrl);

  // Step 2: Extract all internal links from homepage
  const homepageLinks = extractInternalLinks(homepage.markdown, homepage.html || "", cleanDomain);

  // Step 3: Discover SaaS-specific URLs by trying common paths
  const discoveredUrls = await discoverCommonPaths(baseUrl, context);

  // Step 4: Combine and prioritize all URLs
  const allUrls = [...new Set([...homepageLinks, ...discoveredUrls.map((u) => u.url)])];
  const prioritized = prioritizeUrls(allUrls, context);

  console.log(`[BrandIntel] Found ${allUrls.length} URLs, prioritized ${prioritized.length}`);

  // Step 5: Scrape high-priority pages (in batches)
  const pagesToScrape = prioritized.slice(0, maxPages);
  const pages = await scrapeInBatches(pagesToScrape, 5);

  // Step 6: Build site map
  const siteMap: SiteMap = {
    homepage,
    pricing: findPageByType(pages, "pricing"),
    products: findPagesByType(pages, ["products", "product", "platform"]),
    features: findPageByType(pages, "features"),
    about: findPageByType(pages, "about"),
    allUrls: prioritized.map((u) => u.url),
  };

  console.log(`[BrandIntel] Site map complete:`);
  console.log(`  Pricing: ${siteMap.pricing ? "found" : "not found"}`);
  console.log(`  Products: ${siteMap.products.length} pages`);
  console.log(`  Features: ${siteMap.features ? "found" : "not found"}`);

  return siteMap;
}

// ============================================================================
// Page Scraping
// ============================================================================

/**
 * Scrape a single page using ScrapeDo.
 */
export async function scrapePage(url: string): Promise<PageInfo> {
  try {
    const response = await callGateway<any>("services.ScrapeDo.internal.scrapeSPA", {
      url,
      scrollCount: 3,
      clickLoadMore: true,
      extractNextData: true,
      super: false,
    });

    if (!response.success) {
      throw new Error(`ScrapeDo failed: ${response.error}`);
    }

    const pageType = classifyUrl(url);

    return {
      url,
      title: response.title || "",
      markdown: response.markdown || "",
      html: response.html,
      pageType,
      scrapedAt: Date.now(),
    };
  } catch (error) {
    console.log(`[BrandIntel] Failed to scrape ${url}: ${error}`);
    return {
      url,
      title: "",
      markdown: "",
      pageType: "other",
      scrapedAt: Date.now(),
    };
  }
}

/**
 * Scrape multiple pages in batches with concurrency control.
 */
async function scrapeInBatches(
  urls: DiscoveredUrl[],
  batchSize: number
): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (u) => {
        const page = await scrapePage(u.url);
        page.pageType = u.pageType; // Use discovered type
        return page;
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.markdown.length > 100) {
        pages.push(result.value);
      }
    }

    console.log(`[BrandIntel] Scraped ${Math.min(i + batchSize, urls.length)}/${urls.length} pages`);

    // Small delay between batches
    if (i + batchSize < urls.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return pages;
}

// ============================================================================
// URL Discovery & Classification
// ============================================================================

/**
 * Classify a URL based on known patterns.
 */
export function classifyUrl(url: string): PageType {
  try {
    const pathname = new URL(url).pathname;

    for (const { pattern, type } of PAGE_PATTERNS) {
      if (pattern.test(pathname)) {
        return type;
      }
    }

    // Check if homepage
    if (pathname === "/" || pathname === "") {
      return "homepage";
    }

    return "other";
  } catch {
    return "other";
  }
}

/**
 * Extract internal links from page content.
 */
function extractInternalLinks(markdown: string, html: string, domain: string): string[] {
  const links = new Set<string>();

  // Extract from markdown links [text](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    const url = match[2];
    if (isInternalUrl(url, domain)) {
      links.add(normalizeUrl(url, domain));
    }
  }

  // Extract from HTML href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1];
    if (isInternalUrl(url, domain)) {
      links.add(normalizeUrl(url, domain));
    }
  }

  return Array.from(links);
}

/**
 * Check if a URL is internal to the domain.
 */
function isInternalUrl(url: string, domain: string): boolean {
  if (!url) return false;

  // Skip non-http URLs
  if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("javascript:")) {
    return false;
  }

  // Skip anchors and empty
  if (url === "#" || url === "" || url.startsWith("#")) {
    return false;
  }

  // Relative URLs are internal
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }

  // Check if URL matches domain
  try {
    const urlDomain = new URL(url).hostname.replace("www.", "");
    return urlDomain === domain.replace("www.", "");
  } catch {
    return false;
  }
}

/**
 * Normalize URL to absolute form.
 */
function normalizeUrl(url: string, domain: string): string {
  if (url.startsWith("http")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `https://${domain}${url}`;
  }
  return `https://${domain}/${url}`;
}

/**
 * Discover common SaaS paths by trying them directly.
 */
async function discoverCommonPaths(
  baseUrl: string,
  context: BrandContext
): Promise<DiscoveredUrl[]> {
  const discovered: DiscoveredUrl[] = [];

  // Define paths to try based on business type
  const pathsToTry = getPathsForBusinessType(context.businessType);

  console.log(`[BrandIntel] Trying ${pathsToTry.length} common paths...`);

  // Check paths in parallel (small batches)
  const results = await Promise.allSettled(
    pathsToTry.map(async (pathInfo) => {
      const fullUrl = `${baseUrl.replace(/\/$/, "")}${pathInfo.path}`;

      try {
        // Quick check if page exists and has content
        const response = await callGateway<any>("services.ScrapeDo.internal.scrapeSPA", {
          url: fullUrl,
          scrollCount: 1,
          clickLoadMore: false,
          extractNextData: false,
          super: false,
        });

        if (response.success && response.markdown && response.markdown.length > 500) {
          return {
            url: fullUrl,
            pageType: pathInfo.type,
            priority: pathInfo.priority,
            confidence: 0.8,
          };
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      discovered.push(result.value);
      console.log(`[BrandIntel] Found: ${result.value.pageType} at ${result.value.url}`);
    }
  }

  return discovered;
}

/**
 * Get paths to try based on business type.
 */
function getPathsForBusinessType(
  businessType: string
): Array<{ path: string; type: PageType; priority: number }> {
  const commonPaths = [
    { path: "/pricing", type: "pricing" as PageType, priority: 1 },
    { path: "/features", type: "features" as PageType, priority: 1 },
    { path: "/about", type: "about" as PageType, priority: 3 },
  ];

  if (businessType === "saas") {
    return [
      ...commonPaths,
      { path: "/platform", type: "platform" as PageType, priority: 1 },
      { path: "/product", type: "products" as PageType, priority: 1 },
      { path: "/products", type: "products" as PageType, priority: 1 },
      { path: "/integrations", type: "integrations" as PageType, priority: 2 },
      { path: "/marketplace", type: "integrations" as PageType, priority: 2 },
      { path: "/services", type: "services" as PageType, priority: 2 },
      { path: "/solutions", type: "products" as PageType, priority: 2 },
      { path: "/legal/product-descriptions", type: "legal" as PageType, priority: 2 },
    ];
  }

  if (businessType === "ecommerce") {
    return [
      ...commonPaths,
      { path: "/shop", type: "products" as PageType, priority: 1 },
      { path: "/products", type: "products" as PageType, priority: 1 },
      { path: "/collections", type: "products" as PageType, priority: 1 },
      { path: "/catalog", type: "products" as PageType, priority: 2 },
    ];
  }

  // Service or unknown - try all common paths
  return [
    ...commonPaths,
    { path: "/services", type: "services" as PageType, priority: 1 },
    { path: "/products", type: "products" as PageType, priority: 2 },
    { path: "/solutions", type: "products" as PageType, priority: 2 },
    { path: "/what-we-do", type: "features" as PageType, priority: 2 },
  ];
}

/**
 * Prioritize URLs based on context and patterns.
 */
function prioritizeUrls(urls: string[], context: BrandContext): DiscoveredUrl[] {
  const scored: DiscoveredUrl[] = urls.map((url) => {
    const pageType = classifyUrl(url);
    const patternMatch = PAGE_PATTERNS.find((p) => p.pattern.test(new URL(url).pathname));

    let priority = patternMatch?.priority || 5;
    let confidence = 0.5;

    // Boost priority for SaaS companies
    if (context.businessType === "saas") {
      if (pageType === "pricing" || pageType === "platform" || pageType === "features") {
        priority = Math.min(priority, 1);
        confidence = 0.9;
      }
    }

    // Boost priority for ecommerce
    if (context.businessType === "ecommerce") {
      if (pageType === "products" || pageType === "product") {
        priority = Math.min(priority, 1);
        confidence = 0.9;
      }
    }

    // Boost if URL contains known product names
    for (const product of context.knownProducts) {
      if (url.toLowerCase().includes(product.toLowerCase().replace(/\s+/g, "-"))) {
        priority = Math.min(priority, 2);
        confidence = 0.85;
        break;
      }
    }

    return { url, pageType, priority, confidence };
  });

  // Sort by priority (lower is higher priority)
  return scored.sort((a, b) => a.priority - b.priority);
}

// ============================================================================
// Helper Functions
// ============================================================================

function findPageByType(pages: PageInfo[], type: PageType): PageInfo | null {
  return pages.find((p) => p.pageType === type) || null;
}

function findPagesByType(pages: PageInfo[], types: PageType[]): PageInfo[] {
  return pages.filter((p) => types.includes(p.pageType));
}

// ============================================================================
// Exports
// ============================================================================

export { extractInternalLinks, prioritizeUrls };
