/**
 * Brand Research - Local Convex Functions
 *
 * These functions run in the sandbox's local Convex backend.
 * The agent uses them to store and query discovered data,
 * then syncs verified data to the cloud.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";

// ============================================================================
// Site Analysis
// ============================================================================

/**
 * Store a site analysis result
 */
export const storeSiteAnalysis = mutation({
  args: {
    domain: v.string(),
    siteType: v.union(
      v.literal("ecommerce"),
      v.literal("saas"),
      v.literal("service"),
      v.literal("restaurant"),
      v.literal("media"),
      v.literal("other")
    ),
    platform: v.optional(v.string()),
    confidence: v.number(),
    navigation: v.array(v.object({
      label: v.string(),
      selector: v.optional(v.string()),
      url: v.optional(v.string()),
      purpose: v.string(),
    })),
    observations: v.array(v.string()),
    productLocations: v.array(v.string()),
    screenshotPath: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if we already have an analysis for this domain
    const existing = await ctx.db
      .query("discoveredSites")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ...args,
        analyzedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new
    return await ctx.db.insert("discoveredSites", {
      ...args,
      analyzedAt: Date.now(),
    });
  },
});

/**
 * Get site analysis for a domain
 */
export const getSiteAnalysis = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("discoveredSites")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .first();
  },
});

// ============================================================================
// URL Discovery
// ============================================================================

/**
 * Store discovered URLs
 */
export const storeDiscoveredUrls = mutation({
  args: {
    domain: v.string(),
    urls: v.array(v.object({
      url: v.string(),
      urlType: v.union(
        v.literal("product"),
        v.literal("listing"),
        v.literal("pricing"),
        v.literal("other"),
        v.literal("skip")
      ),
      confidence: v.number(),
    })),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inserted: string[] = [];

    for (const urlData of args.urls) {
      // Skip if already exists
      const existing = await ctx.db
        .query("discoveredUrls")
        .withIndex("by_domain", q => q.eq("domain", args.domain))
        .filter(q => q.eq(q.field("url"), urlData.url))
        .first();

      if (existing) continue;

      const id = await ctx.db.insert("discoveredUrls", {
        domain: args.domain,
        url: urlData.url,
        urlType: urlData.urlType,
        confidence: urlData.confidence,
        scraped: false,
        discoveredAt: Date.now(),
        threadId: args.threadId,
      });
      inserted.push(id);
    }

    return inserted;
  },
});

/**
 * Get URLs to scrape (unscraped product/listing pages)
 */
export const getUrlsToScrape = query({
  args: {
    domain: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    return await ctx.db
      .query("discoveredUrls")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .filter(q =>
        q.and(
          q.eq(q.field("scraped"), false),
          q.or(
            q.eq(q.field("urlType"), "product"),
            q.eq(q.field("urlType"), "listing")
          )
        )
      )
      .take(limit);
  },
});

/**
 * Mark URL as scraped
 */
export const markUrlScraped = mutation({
  args: {
    urlId: v.id("discoveredUrls"),
    productCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.urlId, {
      scraped: true,
      scrapedAt: Date.now(),
      productCount: args.productCount,
      error: args.error,
    });
  },
});

/**
 * Get URL scraping stats
 */
export const getUrlStats = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const urls = await ctx.db
      .query("discoveredUrls")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .collect();

    return {
      total: urls.length,
      product: urls.filter(u => u.urlType === "product").length,
      listing: urls.filter(u => u.urlType === "listing").length,
      scraped: urls.filter(u => u.scraped).length,
      pending: urls.filter(u => !u.scraped && (u.urlType === "product" || u.urlType === "listing")).length,
      failed: urls.filter(u => u.error).length,
    };
  },
});

// ============================================================================
// Product Discovery
// ============================================================================

/**
 * Store discovered products
 */
export const storeProducts = mutation({
  args: {
    domain: v.string(),
    sourceUrl: v.string(),
    products: v.array(v.object({
      name: v.string(),
      type: v.union(
        v.literal("physical"),
        v.literal("saas"),
        v.literal("service")
      ),
      price: v.optional(v.number()),
      currency: v.optional(v.string()),
      description: v.optional(v.string()),
      images: v.array(v.string()),
      category: v.optional(v.string()),
      variants: v.optional(v.array(v.object({
        name: v.string(),
        price: v.optional(v.number()),
        sku: v.optional(v.string()),
        available: v.optional(v.boolean()),
      }))),
    })),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inserted: string[] = [];

    for (const product of args.products) {
      // Check for duplicates by name and domain
      const existing = await ctx.db
        .query("discoveredProducts")
        .withIndex("by_domain", q => q.eq("domain", args.domain))
        .filter(q => q.eq(q.field("name"), product.name))
        .first();

      if (existing) continue;

      const id = await ctx.db.insert("discoveredProducts", {
        domain: args.domain,
        sourceUrl: args.sourceUrl,
        ...product,
        verified: false,
        extractedAt: Date.now(),
        threadId: args.threadId,
        syncedToCloud: false,
      });
      inserted.push(id);
    }

    return inserted;
  },
});

/**
 * Get all products for a domain
 */
export const getProducts = query({
  args: {
    domain: v.string(),
    limit: v.optional(v.number()),
    verifiedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("discoveredProducts")
      .withIndex("by_domain", q => q.eq("domain", args.domain));

    if (args.verifiedOnly) {
      query = query.filter(q => q.eq(q.field("verified"), true));
    }

    return await query.take(args.limit || 100);
  },
});

/**
 * Get product stats for a domain
 */
export const getProductStats = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const products = await ctx.db
      .query("discoveredProducts")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .collect();

    return {
      total: products.length,
      verified: products.filter(p => p.verified).length,
      unverified: products.filter(p => !p.verified).length,
      synced: products.filter(p => p.syncedToCloud).length,
      withImages: products.filter(p => p.images.length > 0).length,
      withPrice: products.filter(p => p.price !== undefined).length,
      byType: {
        physical: products.filter(p => p.type === "physical").length,
        saas: products.filter(p => p.type === "saas").length,
        service: products.filter(p => p.type === "service").length,
      },
    };
  },
});

/**
 * Verify a product
 */
export const verifyProduct = mutation({
  args: {
    productId: v.id("discoveredProducts"),
    verified: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      verified: args.verified,
      verificationNotes: args.notes,
    });
  },
});

/**
 * Mark product as synced to cloud
 */
export const markProductSynced = mutation({
  args: {
    productId: v.id("discoveredProducts"),
    cloudProductId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      syncedToCloud: true,
      cloudProductId: args.cloudProductId,
    });
  },
});

/**
 * Get unsynced products
 */
export const getUnsyncedProducts = query({
  args: {
    domain: v.optional(v.string()),
    verifiedOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("discoveredProducts")
      .withIndex("by_synced", q => q.eq("syncedToCloud", false));

    if (args.domain) {
      query = query.filter(q => q.eq(q.field("domain"), args.domain));
    }

    if (args.verifiedOnly) {
      query = query.filter(q => q.eq(q.field("verified"), true));
    }

    return await query.take(args.limit || 50);
  },
});

// ============================================================================
// Research Summary
// ============================================================================

/**
 * Get full research summary for a domain
 */
export const getResearchSummary = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const site = await ctx.db
      .query("discoveredSites")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .first();

    const urls = await ctx.db
      .query("discoveredUrls")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .collect();

    const products = await ctx.db
      .query("discoveredProducts")
      .withIndex("by_domain", q => q.eq("domain", args.domain))
      .collect();

    return {
      domain: args.domain,
      site: site ? {
        siteType: site.siteType,
        platform: site.platform,
        confidence: site.confidence,
        analyzedAt: site.analyzedAt,
        navigationHints: site.navigation.length,
      } : null,
      urls: {
        total: urls.length,
        product: urls.filter(u => u.urlType === "product").length,
        listing: urls.filter(u => u.urlType === "listing").length,
        scraped: urls.filter(u => u.scraped).length,
      },
      products: {
        total: products.length,
        verified: products.filter(p => p.verified).length,
        synced: products.filter(p => p.syncedToCloud).length,
        withImages: products.filter(p => p.images.length > 0).length,
      },
    };
  },
});
