/**
 * News KSA - Knowledge, Skills, and Abilities
 *
 * Advanced news research and monitoring via APITube.
 * Supports entity tracking, sentiment analysis, brand monitoring.
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content?: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
    domain: string;
    country?: string;
    rank?: number;
  };
  category?: string;
  sentiment?: {
    score: number;
    polarity: "positive" | "negative" | "neutral";
  };
  entities?: string[];
  brands?: string[];
  hasPaywall?: boolean;
  imageUrl?: string;
}

export interface NewsSearchOptions {
  /** Text search query */
  query?: string;
  /** Filter by brand name */
  brand?: string;
  /** Filter by entity ID */
  entityId?: string;
  /** Filter by organization */
  organization?: string;
  /** Category filter (IPTC codes) */
  category?: NewsCategory;
  /** Start date (YYYY-MM-DD) */
  fromDate?: string;
  /** End date (YYYY-MM-DD) */
  toDate?: string;
  /** Language code (e.g., 'en') */
  language?: string;
  /** Source country code */
  sourceCountry?: string;
  /** Source domains to include */
  domains?: string[];
  /** Source domains to exclude */
  excludeDomains?: string[];
  /** Minimum source rank (0-1) */
  minRank?: number;
  /** Sentiment filter */
  sentiment?: "positive" | "negative" | "neutral" | "all";
  /** Exclude duplicates */
  excludeDuplicates?: boolean;
  /** Exclude paywalled content */
  excludePaywall?: boolean;
  /** Results per page */
  limit?: number;
  /** Page number */
  page?: number;
  /** Sort field */
  sortBy?: "published_at" | "relevance" | "sentiment" | "rank";
  /** Sort order */
  sortOrder?: "asc" | "desc";
}

export type NewsCategory =
  | "arts"
  | "crime"
  | "disaster"
  | "economy"
  | "education"
  | "environment"
  | "health"
  | "human_interest"
  | "labour"
  | "lifestyle"
  | "politics"
  | "religion"
  | "science"
  | "society"
  | "sport"
  | "conflict"
  | "weather";

const CATEGORY_MAP: Record<NewsCategory, string> = {
  arts: "medtop:01000000",
  crime: "medtop:02000000",
  disaster: "medtop:03000000",
  economy: "medtop:04000000",
  education: "medtop:05000000",
  environment: "medtop:06000000",
  health: "medtop:07000000",
  human_interest: "medtop:08000000",
  labour: "medtop:09000000",
  lifestyle: "medtop:10000000",
  politics: "medtop:11000000",
  religion: "medtop:12000000",
  science: "medtop:13000000",
  society: "medtop:14000000",
  sport: "medtop:15000000",
  conflict: "medtop:16000000",
  weather: "medtop:17000000",
};

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search for news articles with advanced filtering.
 *
 * @param options - Search options
 * @returns Array of news articles
 *
 * @example
 * const articles = await search({
 *   query: 'artificial intelligence',
 *   category: 'science',
 *   sentiment: 'positive',
 *   limit: 20
 * });
 * for (const a of articles) {
 *   console.log(`[${a.sentiment?.polarity}] ${a.title}`);
 * }
 */
export async function search(options: NewsSearchOptions): Promise<NewsArticle[]> {
  const params: Record<string, any> = {
    per_page: options.limit || 20,
    page: options.page || 1,
  };

  if (options.query) params.query = options.query;
  if (options.brand) params.brand_name = options.brand;
  if (options.entityId) params.entity_id = options.entityId;
  if (options.organization) params.organization_name = options.organization;
  if (options.category) params.category_id = CATEGORY_MAP[options.category];
  if (options.fromDate) params.published_at_start = options.fromDate;
  if (options.toDate) params.published_at_end = options.toDate;
  if (options.language) params.language_code = options.language;
  if (options.sourceCountry) params.source_country_code = options.sourceCountry;
  if (options.domains?.length) params.source_domain = options.domains.join(",");
  if (options.excludeDomains?.length) params.ignore_source_domain = options.excludeDomains.join(",");
  if (options.minRank) params.source_rank_opr_min = options.minRank;
  if (options.sentiment && options.sentiment !== "all") {
    params.sentiment_overall_polarity = options.sentiment;
  }
  if (options.excludeDuplicates) params.is_duplicate = "0";
  if (options.excludePaywall) params.is_paywall = "0";
  if (options.sortBy) {
    const sortMap: Record<string, string> = {
      published_at: "published_at",
      relevance: "relevance",
      sentiment: "sentiment.overall.score",
      rank: "source.rank.opr",
    };
    params.sort_by = sortMap[options.sortBy];
  }
  if (options.sortOrder) params.sort_order = options.sortOrder;

  const data = await callGateway<any>("services.APITube.internal.call", {
    endpoint: "/v1/news/everything",
    params,
  });

  return (data.articles || []).map(mapArticle);
}

/**
 * Get trending news by category.
 *
 * @param category - News category
 * @param limit - Maximum articles (default: 10)
 * @returns Array of trending articles
 *
 * @example
 * const tech = await trending('science', 10);
 * for (const a of tech) {
 *   console.log(`${a.title} (${a.source.name})`);
 * }
 */
export async function trending(
  category: NewsCategory,
  limit = 10
): Promise<NewsArticle[]> {
  return search({
    category,
    excludeDuplicates: true,
    excludePaywall: true,
    minRank: 0.5,
    sortBy: "rank",
    sortOrder: "desc",
    limit,
  });
}

/**
 * Get breaking news (most recent high-quality articles).
 *
 * @param limit - Maximum articles (default: 10)
 * @returns Array of breaking news articles
 *
 * @example
 * const breaking = await breakingNews(5);
 * for (const a of breaking) {
 *   console.log(`[${a.publishedAt}] ${a.title}`);
 * }
 */
export async function breakingNews(limit = 10): Promise<NewsArticle[]> {
  return search({
    excludeDuplicates: true,
    excludePaywall: true,
    minRank: 0.7,
    sortBy: "published_at",
    sortOrder: "desc",
    limit,
  });
}

// ============================================================================
// Monitoring Functions
// ============================================================================

/**
 * Monitor news about a brand.
 *
 * @param brandName - Brand name to monitor
 * @param options - Additional options
 * @returns Array of articles mentioning the brand
 *
 * @example
 * const articles = await monitorBrand('Apple', { sentiment: 'negative', days: 7 });
 * console.log(`Found ${articles.length} negative articles about Apple`);
 */
export async function monitorBrand(
  brandName: string,
  options?: {
    sentiment?: "positive" | "negative" | "neutral";
    days?: number;
    limit?: number;
  }
): Promise<NewsArticle[]> {
  const fromDate = options?.days
    ? new Date(Date.now() - options.days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
    : undefined;

  return search({
    brand: brandName,
    fromDate,
    sentiment: options?.sentiment,
    sortBy: "published_at",
    sortOrder: "desc",
    limit: options?.limit || 20,
  });
}

/**
 * Monitor news about an organization.
 *
 * @param orgName - Organization name
 * @param options - Additional options
 * @returns Array of articles
 *
 * @example
 * const articles = await monitorOrganization('Microsoft');
 * for (const a of articles) {
 *   console.log(`${a.title} - ${a.sentiment?.polarity}`);
 * }
 */
export async function monitorOrganization(
  orgName: string,
  options?: {
    sentiment?: "positive" | "negative" | "neutral";
    days?: number;
    limit?: number;
  }
): Promise<NewsArticle[]> {
  const fromDate = options?.days
    ? new Date(Date.now() - options.days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
    : undefined;

  return search({
    organization: orgName,
    fromDate,
    sentiment: options?.sentiment,
    sortBy: "published_at",
    sortOrder: "desc",
    limit: options?.limit || 20,
  });
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Get sentiment distribution for a topic.
 *
 * @param query - Search query
 * @param days - Number of days to analyze (default: 7)
 * @returns Sentiment breakdown
 *
 * @example
 * const sentiment = await analyzeSentiment('climate change', 30);
 * console.log(`Positive: ${sentiment.positive}%`);
 * console.log(`Negative: ${sentiment.negative}%`);
 * console.log(`Neutral: ${sentiment.neutral}%`);
 */
export async function analyzeSentiment(
  query: string,
  days = 7
): Promise<{ positive: number; negative: number; neutral: number; total: number }> {
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const articles = await search({
    query,
    fromDate,
    limit: 100,
  });

  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const article of articles) {
    const polarity = article.sentiment?.polarity || "neutral";
    counts[polarity]++;
  }

  const total = articles.length || 1;
  return {
    positive: Math.round((counts.positive / total) * 100),
    negative: Math.round((counts.negative / total) * 100),
    neutral: Math.round((counts.neutral / total) * 100),
    total: articles.length,
  };
}

/**
 * Compare news coverage between two topics.
 *
 * @param topic1 - First topic
 * @param topic2 - Second topic
 * @param days - Number of days (default: 7)
 * @returns Comparison data
 *
 * @example
 * const comparison = await compareTopics('electric vehicles', 'hydrogen cars', 30);
 * console.log(`EV articles: ${comparison.topic1.count}`);
 * console.log(`H2 articles: ${comparison.topic2.count}`);
 */
export async function compareTopics(
  topic1: string,
  topic2: string,
  days = 7
): Promise<{
  topic1: { query: string; count: number; avgSentiment: number };
  topic2: { query: string; count: number; avgSentiment: number };
}> {
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [articles1, articles2] = await Promise.all([
    search({ query: topic1, fromDate, limit: 50 }),
    search({ query: topic2, fromDate, limit: 50 }),
  ]);

  const avgSentiment = (articles: NewsArticle[]) => {
    if (!articles.length) return 0;
    const sum = articles.reduce((acc, a) => acc + (a.sentiment?.score || 0), 0);
    return Math.round((sum / articles.length) * 100) / 100;
  };

  return {
    topic1: {
      query: topic1,
      count: articles1.length,
      avgSentiment: avgSentiment(articles1),
    },
    topic2: {
      query: topic2,
      count: articles2.length,
      avgSentiment: avgSentiment(articles2),
    },
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapArticle(data: any): NewsArticle {
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    content: data.content,
    url: data.url || data.canonical_url,
    publishedAt: data.published_at,
    source: {
      name: data.source?.name,
      domain: data.source?.domain,
      country: data.source?.country?.name,
      rank: data.source?.rank?.opr,
    },
    category: data.category?.name,
    sentiment: data.sentiment?.overall
      ? {
          score: data.sentiment.overall.score,
          polarity: data.sentiment.overall.polarity,
        }
      : undefined,
    entities: data.entities?.map((e: any) => e.name),
    brands: data.brands?.map((b: any) => b.name),
    hasPaywall: data.is_paywall,
    imageUrl: data.media?.images?.[0]?.url,
  };
}
