/**
 * Web Tools
 *
 * Web operations that proxy through cloud gateway for external APIs.
 * The sandbox calls cloud Convex services via HTTP gateway with JWT auth.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";

// Module-level gateway config (set by agent/index.ts)
let gatewayConfig: { convexUrl: string; jwt: string } | null = null;

/**
 * Set the gateway config for web tools.
 * Called by the agent when starting a thread.
 */
export function setGatewayConfig(config: { convexUrl: string; jwt: string }) {
  gatewayConfig = config;
}

/**
 * Call a cloud Convex service via the gateway.
 */
async function callCloudService(
  servicePath: string,
  args: Record<string, unknown>
): Promise<any> {
  // Try module config first, then env vars
  const convexUrl = gatewayConfig?.convexUrl || process.env.CONVEX_URL;
  const jwt = gatewayConfig?.jwt || process.env.SANDBOX_JWT;

  if (!convexUrl || !jwt) {
    throw new Error("Gateway not configured. Set gatewayConfig or CONVEX_URL/SANDBOX_JWT env vars.");
  }

  const response = await fetch(`${convexUrl}/agent/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      path: servicePath,
      args,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloud service call failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Cloud service error: ${result.error || JSON.stringify(result)}`);
  }

  return result.data;
}

/**
 * Create web tools bound to a Convex action context.
 */
export function createWebTools(ctx: ActionCtx) {
  return {
    web_search: tool({
      description: "Search the web for information using Valyu. Returns search results from web, academic, and news sources.",
      parameters: z.object({
        query: z.string().describe("Search query"),
        maxResults: z.number().default(10).describe("Max results to return"),
        searchType: z.enum(["all", "web", "proprietary", "news"]).default("all").describe("Type of search"),
        fastMode: z.boolean().default(true).describe("Use fast mode for quicker results"),
      }),
      execute: async (args) => {
        try {
          const result = await callCloudService("services.Valyu.internal.search", {
            query: args.query,
            maxResults: args.maxResults,
            searchType: args.searchType,
            fastMode: args.fastMode,
          });
          return {
            success: true,
            results: result.results || [],
            totalResults: result.total || 0,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    web_scrape: tool({
      description: "Extract clean content from URLs using Valyu. Good for reading articles, documentation, and web pages.",
      parameters: z.object({
        urls: z.array(z.string().url()).describe("URLs to scrape"),
        responseLength: z.enum(["short", "medium", "large", "max"]).default("medium").describe("How much content to return"),
        summary: z.boolean().default(false).describe("Whether to include AI summary"),
      }),
      execute: async (args) => {
        try {
          const result = await callCloudService("services.Valyu.internal.contents", {
            urls: args.urls,
            responseLength: args.responseLength,
            summary: args.summary,
          });
          return {
            success: true,
            contents: result.contents || [],
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    web_news: tool({
      description: "Search for recent news articles on a topic using APITube.",
      parameters: z.object({
        query: z.string().describe("News search query"),
        limit: z.number().default(10).describe("Max articles to return"),
      }),
      execute: async (args) => {
        try {
          const result = await callCloudService("services.APITube.internal.call", {
            endpoint: "/v1/news/everything",
            params: {
              q: args.query,
              size: args.limit,
            },
          });
          return {
            success: true,
            articles: result.articles || result.data || [],
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    web_seo: tool({
      description: "Analyze SEO metrics for a domain or keyword using DataForSEO.",
      parameters: z.object({
        target: z.string().describe("Domain or keyword to analyze"),
        type: z.enum(["domain_metrics", "keyword_search", "serp"]).default("domain_metrics"),
      }),
      execute: async (args) => {
        try {
          // Build endpoint and body based on type
          let endpoint: string;
          let body: any;

          switch (args.type) {
            case "serp":
              endpoint = "/serp/google/organic/live/regular";
              body = { keyword: args.target, location_code: 2840 }; // US
              break;
            case "keyword_search":
              endpoint = "/keywords_data/google_ads/search_volume/live";
              body = { keywords: [args.target], location_code: 2840 };
              break;
            case "domain_metrics":
            default:
              endpoint = "/domain_analytics/whois/overview/live";
              body = { target: args.target };
          }

          const result = await callCloudService("services.DataForSEO.internal.call", {
            endpoint,
            body,
          });
          return {
            success: true,
            data: result.tasks?.[0]?.result || result,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    web_social: tool({
      description: "Research social media profiles using ScrapeCreators.",
      parameters: z.object({
        platform: z.enum(["instagram", "tiktok", "linkedin", "youtube"]).describe("Social platform"),
        username: z.string().describe("Username or handle to research"),
      }),
      execute: async (args) => {
        try {
          // Build endpoint based on platform
          let endpoint: string;
          switch (args.platform) {
            case "instagram":
              endpoint = `/v1/instagram/user/${args.username}`;
              break;
            case "tiktok":
              endpoint = `/v1/tiktok/user/${args.username}`;
              break;
            case "linkedin":
              endpoint = `/v1/linkedin/profile/${args.username}`;
              break;
            case "youtube":
              endpoint = `/v1/youtube/channel/${args.username}`;
              break;
          }

          const result = await callCloudService("services.ScrapeCreators.internal.call", {
            endpoint,
          });
          return {
            success: true,
            profile: result,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    web_firmography: tool({
      description: "Get detailed company data using TheCompanies API.",
      parameters: z.object({
        domain: z.string().describe("Company domain to research (e.g., 'apple.com')"),
      }),
      execute: async (args) => {
        try {
          const result = await callCloudService("services.TheCompanies.internal.call", {
            path: `/v2/companies/${args.domain}`,
            method: "GET",
          });
          return {
            success: true,
            company: result,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    get_timestamp: tool({
      description: "Get the current UTC timestamp",
      parameters: z.object({}),
      execute: async () => {
        const now = new Date();
        return {
          success: true,
          timestamp: now.toISOString(),
          unix: now.getTime(),
          formatted: now.toUTCString(),
        };
      },
    }),
  };
}

// Legacy export for compatibility
export const webTools = {
  web_search: {
    description: "Search the web using Valyu",
    parameters: z.object({
      query: z.string(),
      maxResults: z.number().default(10),
      searchType: z.enum(["all", "web", "proprietary", "news"]).default("all"),
      fastMode: z.boolean().default(true),
    }),
  },
  web_scrape: {
    description: "Extract content from URLs using Valyu",
    parameters: z.object({
      urls: z.array(z.string().url()),
      responseLength: z.enum(["short", "medium", "large", "max"]).default("medium"),
      summary: z.boolean().default(false),
    }),
  },
  web_news: {
    description: "Search for recent news articles",
    parameters: z.object({
      query: z.string(),
      limit: z.number().default(10),
    }),
  },
  web_seo: {
    description: "Analyze SEO metrics for a domain or keyword",
    parameters: z.object({
      target: z.string(),
      type: z.enum(["domain_metrics", "keyword_search", "serp"]).default("domain_metrics"),
    }),
  },
  web_social: {
    description: "Research social media profiles",
    parameters: z.object({
      platform: z.enum(["instagram", "tiktok", "linkedin", "youtube"]),
      username: z.string(),
    }),
  },
  web_firmography: {
    description: "Get detailed company data",
    parameters: z.object({
      domain: z.string(),
    }),
  },
  get_timestamp: {
    description: "Get current UTC timestamp",
    parameters: z.object({}),
  },
};
