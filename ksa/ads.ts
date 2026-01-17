/**
 * Ads KSA - Knowledge, Skills, and Abilities
 *
 * Search and analyze advertising data from Meta Ad Library and Google Ads Transparency.
 * Provides access to competitor ad creative, copy, and targeting data.
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface MetaAd {
  id: string;
  pageId: string;
  pageName: string;
  platform: "facebook" | "instagram" | "meta"; // meta = both platforms
  status: "active" | "inactive";
  startDate?: string;
  endDate?: string;
  body?: string;
  title?: string;
  linkUrl?: string;
  callToAction?: string;
  images: string[];
  videoUrl?: string;
  videoPreviewUrl?: string;
}

export interface GoogleAd {
  id: string;
  advertiser: string;
  advertiserId: string;
  format: "text" | "image" | "video" | "responsive";
  headline?: string;
  description?: string;
  displayUrl?: string;
  finalUrl?: string;
  images: string[];
  videoUrl?: string;
  firstSeen?: string;
  lastSeen?: string;
  region?: string;
}

export interface MetaCompany {
  pageId: string;
  name: string;
  likes?: number;
  category?: string;
}

export interface AdSearchResult {
  company?: MetaCompany;
  ads: MetaAd[];
  totalCount: number;
}

export interface GoogleAdSearchResult {
  advertiser: string;
  advertiserId: string;
  ads: GoogleAd[];
  totalCount: number;
}

// ============================================================================
// Meta Ad Library Functions
// ============================================================================

/**
 * Search for companies/pages in the Meta Ad Library.
 *
 * @param query - Brand or company name to search
 * @returns List of matching companies with their Page IDs
 *
 * @example
 * const companies = await searchMetaCompanies('Liquid Death');
 * console.log(companies[0].name, companies[0].pageId);
 */
export async function searchMetaCompanies(query: string): Promise<MetaCompany[]> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/facebook/adLibrary/search/companies",
    params: { query },
  });

  const results = data.searchResults || [];
  return results.map((c: any) => ({
    pageId: c.page_id,
    name: c.name,
    likes: c.likes,
    category: c.category,
  }));
}

/**
 * Get all ads for a specific Meta/Facebook page.
 *
 * @param pageId - Facebook Page ID (from searchMetaCompanies)
 * @param options - Optional filters
 * @returns Ads from the Meta Ad Library
 *
 * @example
 * const companies = await searchMetaCompanies('Liquid Death');
 * const ads = await getMetaAdsByPageId(companies[0].pageId);
 * console.log(`Found ${ads.length} ads`);
 */
export async function getMetaAdsByPageId(
  pageId: string,
  options?: {
    status?: "active" | "inactive" | "all";
    maxAds?: number;
  }
): Promise<MetaAd[]> {
  const allAds: MetaAd[] = [];
  let cursor: string | null = null;
  const maxPages = 5;
  const maxAds = options?.maxAds || 50;

  for (let page = 0; page < maxPages && allAds.length < maxAds; page++) {
    const params: Record<string, any> = {
      pageId,
      status: options?.status?.toUpperCase() || "ALL",
      trim: "true",
    };
    if (cursor) params.cursor = cursor;

    const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
      endpoint: "/facebook/adLibrary/company/ads",
      params,
    });

    const pageAds = data.results || [];
    if (pageAds.length === 0) break;

    for (const ad of pageAds) {
      if (allAds.length >= maxAds) break;

      const snapshot = ad.snapshot || {};
      const images: string[] = [];

      // Collect all images
      if (snapshot.videos?.[0]?.video_preview_image_url) {
        images.push(snapshot.videos[0].video_preview_image_url);
      }
      if (snapshot.images) {
        for (const img of snapshot.images) {
          if (img.url || img.original_image_url) {
            images.push(img.url || img.original_image_url);
          }
        }
      }
      if (snapshot.cards) {
        for (const card of snapshot.cards) {
          if (card.image_url) images.push(card.image_url);
        }
      }

      // Determine platform from publisher_platforms
      const platforms = ad.publisher_platforms || [];
      let platform: "facebook" | "instagram" | "meta" = "meta";
      if (platforms.includes("facebook") && !platforms.includes("instagram")) {
        platform = "facebook";
      } else if (platforms.includes("instagram") && !platforms.includes("facebook")) {
        platform = "instagram";
      }

      allAds.push({
        id: ad.id || ad.ad_archive_id,
        pageId: ad.page_id,
        pageName: ad.page_name,
        platform,
        status: ad.is_active ? "active" : "inactive",
        startDate: ad.start_date,
        endDate: ad.end_date,
        body: snapshot.body?.text,
        title: snapshot.title,
        linkUrl: snapshot.link_url,
        callToAction: snapshot.cta_text,
        images,
        videoUrl: snapshot.videos?.[0]?.video_hd_url || snapshot.videos?.[0]?.video_sd_url,
        videoPreviewUrl: snapshot.videos?.[0]?.video_preview_image_url,
      });
    }

    cursor = data.cursor || null;
    if (!cursor) break;
  }

  return allAds;
}

/**
 * Search for Meta ads by brand name (convenience function).
 * Combines searchMetaCompanies + getMetaAdsByPageId.
 *
 * @param brandName - Brand or company name
 * @param options - Optional filters
 * @returns Search result with company info and ads
 *
 * @example
 * const result = await searchMetaAds('Liquid Death');
 * console.log(`${result.company?.name}: ${result.ads.length} ads`);
 * for (const ad of result.ads.slice(0, 5)) {
 *   console.log(`- ${ad.body?.substring(0, 100)}...`);
 * }
 */
export async function searchMetaAds(
  brandName: string,
  options?: {
    status?: "active" | "inactive" | "all";
    maxAds?: number;
  }
): Promise<AdSearchResult> {
  // Step 1: Search for the company
  const companies = await searchMetaCompanies(brandName);
  if (companies.length === 0) {
    return { ads: [], totalCount: 0 };
  }

  // Pick the best match (first result, usually highest relevance/likes)
  const company = companies[0];

  // Step 2: Get ads for that company
  const ads = await getMetaAdsByPageId(company.pageId, options);

  return {
    company,
    ads,
    totalCount: ads.length,
  };
}

// ============================================================================
// Google Ads Transparency Functions
// ============================================================================

/**
 * Search for Google ads by domain.
 *
 * @param domain - Advertiser domain (e.g., 'liquiddeath.com')
 * @param options - Optional filters
 * @returns Google ads for the domain
 *
 * @example
 * const result = await searchGoogleAds('liquiddeath.com');
 * console.log(`Found ${result.ads.length} Google ads`);
 */
export async function searchGoogleAds(
  domain: string,
  options?: {
    region?: string;
    maxAds?: number;
  }
): Promise<GoogleAdSearchResult> {
  const params: Record<string, any> = {
    domain,
    region: options?.region || "US",
  };

  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/google/adstransparency/advertiser",
    params,
  });

  const advertiser = data.advertiser || {};
  const rawAds = data.ads || [];

  const ads: GoogleAd[] = rawAds.slice(0, options?.maxAds || 50).map((ad: any) => ({
    id: ad.id || ad.creative_id,
    advertiser: advertiser.name || domain,
    advertiserId: advertiser.id,
    format: ad.format || "image",
    headline: ad.headline,
    description: ad.description,
    displayUrl: ad.display_url,
    finalUrl: ad.final_url,
    images: ad.images || [],
    videoUrl: ad.video_url,
    firstSeen: ad.first_seen,
    lastSeen: ad.last_seen,
    region: ad.region,
  }));

  return {
    advertiser: advertiser.name || domain,
    advertiserId: advertiser.id,
    ads,
    totalCount: ads.length,
  };
}

// ============================================================================
// Combined Search
// ============================================================================

/**
 * Search for ads across both Meta and Google platforms.
 *
 * @param brandName - Brand name for Meta search
 * @param domain - Domain for Google search (optional, derived from brand if not provided)
 * @param options - Search options
 * @returns Combined results from both platforms
 *
 * @example
 * const { meta, google } = await searchAllAds('Liquid Death', 'liquiddeath.com');
 * console.log(`Meta: ${meta.ads.length} ads, Google: ${google.ads.length} ads`);
 */
export async function searchAllAds(
  brandName: string,
  domain?: string,
  options?: {
    maxAds?: number;
    metaOnly?: boolean;
    googleOnly?: boolean;
  }
): Promise<{
  meta: AdSearchResult;
  google: GoogleAdSearchResult;
}> {
  const results: { meta: AdSearchResult; google: GoogleAdSearchResult } = {
    meta: { ads: [], totalCount: 0 },
    google: { advertiser: "", advertiserId: "", ads: [], totalCount: 0 },
  };

  // Run searches in parallel
  const promises: Promise<void>[] = [];

  if (!options?.googleOnly) {
    promises.push(
      searchMetaAds(brandName, { maxAds: options?.maxAds }).then((r) => {
        results.meta = r;
      })
    );
  }

  if (!options?.metaOnly && domain) {
    promises.push(
      searchGoogleAds(domain, { maxAds: options?.maxAds }).then((r) => {
        results.google = r;
      })
    );
  }

  await Promise.all(promises);
  return results;
}
