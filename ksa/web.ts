/**
 * Web KSA - Knowledge, Skills, and Abilities
 *
 * Functions for web search and content extraction.
 * Import and use these in your code.
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface ScrapedContent {
  url: string;
  title: string;
  markdown: string;
  text: string;
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Search the web for information.
 *
 * @param query - Search query string
 * @param options - Optional search configuration
 * @returns Array of search results
 *
 * @example
 * const results = await search('TypeScript best practices 2025');
 * for (const r of results) {
 *   console.log(`${r.title}: ${r.url}`);
 * }
 */
export async function search(
  query: string,
  options?: {
    maxResults?: number;
    type?: 'all' | 'web' | 'news' | 'academic';
  }
): Promise<SearchResult[]> {
  const response = await callGateway('services.Valyu.internal.search', {
    query,
    maxResults: options?.maxResults ?? 10,
    searchType: options?.type ?? 'all',
    fastMode: true,
  });
  return response.results || [];
}

/**
 * Extract clean content from a URL.
 *
 * @param url - URL to scrape
 * @returns Extracted content as markdown and text
 *
 * @example
 * const content = await scrape('https://example.com/article');
 * console.log(content.markdown);
 */
export async function scrape(url: string): Promise<ScrapedContent> {
  const response = await callGateway('services.Valyu.internal.contents', {
    urls: [url],
    responseLength: 'large',
    summary: false,
  });
  const content = response.contents?.[0];
  return {
    url,
    title: content?.title || '',
    markdown: content?.markdown || content?.text || '',
    text: content?.text || '',
  };
}

/**
 * Search for recent news articles.
 *
 * @param query - News search query
 * @param limit - Maximum articles to return (default: 10)
 * @returns Array of news articles
 *
 * @example
 * const articles = await news('AI regulation');
 * for (const a of articles) {
 *   console.log(`[${a.source}] ${a.title}`);
 * }
 */
export async function news(query: string, limit = 10): Promise<NewsArticle[]> {
  const response = await callGateway('services.APITube.internal.call', {
    endpoint: '/v1/news/everything',
    params: { q: query, size: limit },
  });
  return (response.articles || response.data || []).map((a: any) => ({
    title: a.title,
    url: a.url,
    source: a.source?.name || a.source,
    publishedAt: a.publishedAt,
    summary: a.description || a.summary,
  }));
}

