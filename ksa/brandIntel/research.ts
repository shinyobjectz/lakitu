/**
 * Brand Intelligence Research Module
 *
 * Pre-research the brand before crawling their site.
 * Uses Valyu search + TheCompanies API to build context.
 *
 * @example
 * const context = await researchBrand("mixpanel.com");
 * console.log(context.businessType); // "saas"
 * console.log(context.knownProducts); // ["Mixpanel Analytics", "Session Replay"]
 */

import { callGateway } from "../_shared/gateway";
import type {
  BrandContext,
  BusinessType,
  PricingModel,
  NewsArticle,
  CompanyInfo,
} from "./types";

// ============================================================================
// Main Research Function
// ============================================================================

/**
 * Research a brand before crawling their site.
 * Uses Valyu search + TheCompanies API to build context.
 *
 * @param domain - Domain to research (e.g., "mixpanel.com")
 * @param options - Research options
 * @returns Brand context with pre-research data
 *
 * @example
 * const context = await researchBrand("mixpanel.com", { depth: "thorough" });
 * console.log(`Business type: ${context.businessType}`);
 * console.log(`Known products: ${context.knownProducts.join(", ")}`);
 * console.log(`Competitors: ${context.competitors.join(", ")}`);
 */
export async function researchBrand(
  domain: string,
  options?: { depth?: "quick" | "thorough" }
): Promise<BrandContext> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const depth = options?.depth || "thorough";

  console.log(`[BrandIntel] Researching ${cleanDomain} (${depth})...`);

  // Run research in parallel
  const [webResults, companyData] = await Promise.all([
    webResearch(`${cleanDomain} products pricing features`, { depth }),
    lookupCompany(cleanDomain).catch(() => null),
  ]);

  // Analyze research to extract structured context
  const analysis = await analyzeResearch(cleanDomain, webResults, companyData);

  const context: BrandContext = {
    name: companyData?.name || extractBrandName(cleanDomain),
    domain: cleanDomain,
    businessType: analysis.businessType,
    knownProducts: analysis.products,
    pricingModel: analysis.pricingModel,
    competitors: analysis.competitors,
    recentNews: webResults.articles.slice(0, 5),
    companyInfo: companyData
      ? {
          employees: companyData.employeeRange || String(companyData.employeeCount || ""),
          founded: companyData.foundedYear || null,
          funding: companyData.funding?.total
            ? `$${(companyData.funding.total / 1_000_000).toFixed(1)}M`
            : "",
          industry: companyData.industry || "",
          headquarters: companyData.headquarters,
        }
      : null,
  };

  console.log(`[BrandIntel] Research complete:`);
  console.log(`  Business type: ${context.businessType}`);
  console.log(`  Known products: ${context.knownProducts.length}`);
  console.log(`  Competitors: ${context.competitors.length}`);

  return context;
}

// ============================================================================
// Web Research
// ============================================================================

interface WebResearchResult {
  sources: SearchResult[];
  articles: NewsArticle[];
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

/**
 * Comprehensive web research combining search and news.
 */
async function webResearch(
  query: string,
  options: { depth: "quick" | "thorough" }
): Promise<WebResearchResult> {
  const maxResults = options.depth === "thorough" ? 15 : 8;

  try {
    // Use Valyu for web search
    const searchResponse = await callGateway<any>("services.Valyu.internal.search", {
      query,
      maxResults,
      searchType: "all",
      fastMode: true,
    });

    const sources: SearchResult[] = (searchResponse.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet || r.description || "",
      source: r.source || new URL(r.url).hostname,
    }));

    // Extract news articles
    const articles: NewsArticle[] = sources
      .filter((s) => isNewsSource(s.source))
      .map((s) => ({
        title: s.title,
        url: s.url,
        date: "",
        source: s.source,
      }));

    return { sources, articles };
  } catch (error) {
    console.log(`[BrandIntel] Web research failed: ${error}`);
    return { sources: [], articles: [] };
  }
}

function isNewsSource(source: string): boolean {
  const newsDomains = [
    "techcrunch",
    "forbes",
    "bloomberg",
    "reuters",
    "wsj",
    "nytimes",
    "theverge",
    "wired",
    "venturebeat",
    "businessinsider",
    "cnbc",
    "cnet",
  ];
  return newsDomains.some((d) => source.toLowerCase().includes(d));
}

// ============================================================================
// Company Lookup
// ============================================================================

interface CompanyData {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  employeeCount?: number;
  employeeRange?: string;
  foundedYear?: number;
  headquarters?: {
    city?: string;
    state?: string;
    country?: string;
  };
  funding?: {
    total?: number;
    lastRound?: string;
  };
}

/**
 * Look up company data using TheCompanies API.
 */
async function lookupCompany(domain: string): Promise<CompanyData | null> {
  try {
    const data = await callGateway<any>("services.TheCompanies.internal.call", {
      path: "/v2/companies/by-domain",
      params: { domain },
    });

    if (!data || !data.name) return null;

    return {
      name: data.name || data.company_name || "",
      domain: data.domain || domain,
      description: data.description || data.short_description,
      industry: data.industry || data.primary_industry,
      employeeCount: data.employee_count || data.employees,
      employeeRange: data.employee_range || data.employees_range,
      foundedYear: data.founded_year || data.year_founded,
      headquarters: data.headquarters || {
        city: data.city,
        state: data.state,
        country: data.country,
      },
      funding: data.funding
        ? {
            total: data.funding.total_funding || data.total_funding,
            lastRound: data.funding.last_round_type || data.last_funding_type,
          }
        : undefined,
    };
  } catch (error) {
    console.log(`[BrandIntel] Company lookup failed: ${error}`);
    return null;
  }
}

// ============================================================================
// Analysis
// ============================================================================

interface ResearchAnalysis {
  businessType: BusinessType;
  products: string[];
  pricingModel: PricingModel;
  competitors: string[];
}

/**
 * Analyze research results using LLM to extract structured insights.
 */
async function analyzeResearch(
  domain: string,
  webResults: WebResearchResult,
  companyData: CompanyData | null
): Promise<ResearchAnalysis> {
  const prompt = `Analyze this brand research and extract structured insights.

Domain: ${domain}
Company name: ${companyData?.name || "Unknown"}
Industry: ${companyData?.industry || "Unknown"}
Description: ${companyData?.description || "Unknown"}

Web search results:
${webResults.sources
  .slice(0, 10)
  .map((s) => `- ${s.title}: ${s.snippet}`)
  .join("\n")}

Based on this research, provide a JSON analysis:

{
  "businessType": "saas" | "ecommerce" | "service" | "hybrid" | "unknown",
  "products": ["list of known product names"],
  "pricingModel": "subscription" | "one-time" | "freemium" | "usage" | "enterprise" | "unknown",
  "competitors": ["list of competitor company names"]
}

RULES:
1. businessType: Determine if this is a SaaS company, ecommerce store, service business, or hybrid
2. products: Extract ACTUAL product/service names mentioned in the research
3. pricingModel: Infer the pricing model from context clues
4. competitors: List 3-5 direct competitors if mentioned or can be inferred

Return ONLY valid JSON, no explanation.`;

  try {
    const response = await callGateway<any>(
      "services.OpenRouter.internal.chatCompletion",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        responseFormat: { type: "json_object" },
      }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    const analysis = JSON.parse(content);

    return {
      businessType: validateBusinessType(analysis.businessType),
      products: Array.isArray(analysis.products) ? analysis.products.slice(0, 20) : [],
      pricingModel: validatePricingModel(analysis.pricingModel),
      competitors: Array.isArray(analysis.competitors)
        ? analysis.competitors.slice(0, 10)
        : [],
    };
  } catch (error) {
    console.log(`[BrandIntel] Analysis failed: ${error}`);
    // Return defaults based on company data
    return {
      businessType: inferBusinessType(companyData),
      products: [],
      pricingModel: "unknown",
      competitors: [],
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function extractBrandName(domain: string): string {
  // Remove TLD and capitalize
  const name = domain.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function validateBusinessType(type: string): BusinessType {
  const valid: BusinessType[] = ["saas", "ecommerce", "service", "hybrid", "unknown"];
  return valid.includes(type as BusinessType) ? (type as BusinessType) : "unknown";
}

function validatePricingModel(model: string): PricingModel {
  const valid: PricingModel[] = [
    "subscription",
    "one-time",
    "freemium",
    "usage",
    "enterprise",
    "unknown",
  ];
  return valid.includes(model as PricingModel) ? (model as PricingModel) : "unknown";
}

function inferBusinessType(companyData: CompanyData | null): BusinessType {
  if (!companyData?.industry) return "unknown";

  const industry = companyData.industry.toLowerCase();
  if (
    industry.includes("software") ||
    industry.includes("saas") ||
    industry.includes("technology")
  ) {
    return "saas";
  }
  if (
    industry.includes("retail") ||
    industry.includes("ecommerce") ||
    industry.includes("consumer goods")
  ) {
    return "ecommerce";
  }
  if (
    industry.includes("consulting") ||
    industry.includes("agency") ||
    industry.includes("professional services")
  ) {
    return "service";
  }
  return "unknown";
}

// ============================================================================
// Exports
// ============================================================================

export { lookupCompany, webResearch };
