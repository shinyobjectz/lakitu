/**
 * Brand Scan KSA - Knowledge, Skills, and Abilities
 *
 * Initiate and monitor brand intelligence scans.
 * Scans gather styleguide data, website content, ads, and social media presence.
 *
 * @example
 * import { startScan, waitForScan, getBrandData } from './ksa/brandscan';
 *
 * // Start a scan for a domain
 * const { scanId, brandId } = await startScan('anthropic.com');
 *
 * // Wait for completion (can take several minutes)
 * const result = await waitForScan(scanId);
 *
 * // Get the brand data
 * const brand = await getBrandData(brandId);
 * console.log(brand.styleguide);
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface ScanStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface BrandScanResult {
  scanId: string;
  brandId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  entityCounts?: {
    products?: number;
    assets?: number;
    ads?: number;
    socialPosts?: number;
  };
  steps?: ScanStep[];
  error?: string;
}

export interface BrandData {
  _id: string;
  domain: string;
  name: string;
  description?: string;
  styleguide?: {
    colors?: Array<{ name: string; hex: string }>;
    fonts?: Array<{ name: string; category: string }>;
    voiceTone?: string;
    logoUrl?: string;
  };
  firmography?: {
    industry?: string;
    employees?: string;
    revenue?: string;
    founded?: string;
    headquarters?: string;
  };
  socialProfiles?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  products?: Array<{
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
  }>;
  ads?: Array<{
    id: string;
    platform: string;
    headline?: string;
    imageUrl?: string;
  }>;
  _creationTime: number;
}

export interface ScanOptions {
  maxAds?: number;
  maxPosts?: number;
  embedAssets?: boolean;
  skipSteps?: Array<"intelligence" | "website" | "ads" | "social" | "embeddings">;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Start a brand scan for a domain.
 * This initiates a multi-step workflow that gathers brand intelligence.
 *
 * @param domain - The domain to scan (e.g., 'anthropic.com')
 * @param options - Optional scan configuration
 * @returns Scan ID and brand ID
 *
 * @example
 * const { scanId, brandId } = await startScan('openai.com', {
 *   maxAds: 20,
 *   maxPosts: 50
 * });
 */
export async function startScan(
  domain: string,
  options?: ScanOptions
): Promise<{ scanId: string; brandId: string }> {
  const response = await callGateway<{ scanId: string; brandId: string }>(
    "features.brands.orchestration.scans.startFullScan",
    {
      domain,
      maxAds: options?.maxAds,
      maxPosts: options?.maxPosts,
      embedAssets: options?.embedAssets,
      skipSteps: options?.skipSteps,
    },
    "action"
  );
  return response;
}

/**
 * Get the current status of a brand scan.
 *
 * @param scanId - The scan ID
 * @returns Current scan status with progress and steps
 *
 * @example
 * const status = await getScanStatus(scanId);
 * console.log(`Scan is ${status.progress}% complete`);
 * for (const step of status.steps) {
 *   console.log(`${step.name}: ${step.status}`);
 * }
 */
export async function getScanStatus(scanId: string): Promise<BrandScanResult> {
  const response = await callGateway<{
    _id: string;
    brandId: string;
    status: string;
    progress: number;
    entityCounts?: Record<string, number>;
    steps?: ScanStep[];
    error?: string;
  }>(
    "features.brands.orchestration.scans.getLatest",
    { scanId },
    "query"
  );

  return {
    scanId: response._id || scanId,
    brandId: response.brandId,
    status: response.status as BrandScanResult["status"],
    progress: response.progress || 0,
    entityCounts: response.entityCounts,
    steps: response.steps,
    error: response.error,
  };
}

/**
 * Wait for a brand scan to complete.
 * Polls the scan status until it completes, fails, or times out.
 *
 * @param scanId - The scan ID
 * @param timeoutMs - Maximum wait time in milliseconds (default: 10 minutes)
 * @returns Final scan result
 *
 * @example
 * // Wait up to 15 minutes
 * const result = await waitForScan(scanId, 900000);
 * if (result.status === 'completed') {
 *   console.log('Found', result.entityCounts?.products, 'products');
 * }
 */
export async function waitForScan(
  scanId: string,
  timeoutMs = 600000
): Promise<BrandScanResult> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    const status = await getScanStatus(scanId);

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  const finalStatus = await getScanStatus(scanId);
  return {
    ...finalStatus,
    status: "failed",
    error: `Timeout after ${timeoutMs}ms - scan still ${finalStatus.status}`,
  };
}

/**
 * Get brand data after a completed scan.
 *
 * @param brandId - The brand ID
 * @returns Full brand data including styleguide, products, and ads
 *
 * @example
 * const brand = await getBrandData(brandId);
 * console.log('Brand:', brand.name);
 * console.log('Colors:', brand.styleguide?.colors);
 * console.log('Products:', brand.products?.length);
 */
export async function getBrandData(brandId: string): Promise<BrandData> {
  const response = await callGateway<BrandData>(
    "features.brands.core.crud.get",
    { brandId },
    "query"
  );
  return response;
}

/**
 * Get brand intelligence summary (lighter weight than full data).
 *
 * @param brandId - The brand ID
 * @returns Summary of brand intelligence
 *
 * @example
 * const summary = await getBrandSummary(brandId);
 * console.log(`${summary.productCount} products, ${summary.adCount} ads`);
 */
export async function getBrandSummary(brandId: string): Promise<{
  brandId: string;
  name: string;
  domain: string;
  productCount: number;
  assetCount: number;
  adCount: number;
  socialPostCount: number;
}> {
  const response = await callGateway<{
    brandId: string;
    name: string;
    domain: string;
    productCount: number;
    assetCount: number;
    adCount: number;
    socialPostCount: number;
  }>(
    "features.brands.core.products.getBrandIntelligenceSummary",
    { brandId },
    "query"
  );
  return response;
}

/**
 * List all brands.
 *
 * @returns Array of brands
 *
 * @example
 * const brands = await listBrands();
 * for (const b of brands) {
 *   console.log(`${b.name} (${b.domain})`);
 * }
 */
export async function listBrands(): Promise<BrandData[]> {
  const response = await callGateway<BrandData[]>(
    "features.brands.core.crud.list",
    {},
    "query"
  );
  return response;
}

/**
 * Get brand by domain.
 *
 * @param domain - The domain to look up
 * @returns Brand data or null if not found
 *
 * @example
 * const brand = await getBrandByDomain('anthropic.com');
 * if (brand) {
 *   console.log('Found:', brand.name);
 * }
 */
export async function getBrandByDomain(domain: string): Promise<BrandData | null> {
  try {
    const response = await callGateway<BrandData>(
      "features.brands.core.crud.getByDomain",
      { domain },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * List recent scans.
 *
 * @param brandId - Optional brand ID to filter by
 * @returns Array of recent scans
 *
 * @example
 * const scans = await listScans();
 * for (const s of scans) {
 *   console.log(`Scan ${s.scanId}: ${s.status} (${s.progress}%)`);
 * }
 */
export async function listScans(brandId?: string): Promise<BrandScanResult[]> {
  const response = await callGateway<Array<{
    _id: string;
    brandId: string;
    status: string;
    progress: number;
    entityCounts?: Record<string, number>;
    steps?: ScanStep[];
  }>>(
    "features.brands.orchestration.scans.list",
    { brandId },
    "query"
  );

  return response.map((s) => ({
    scanId: s._id,
    brandId: s.brandId,
    status: s.status as BrandScanResult["status"],
    progress: s.progress || 0,
    entityCounts: s.entityCounts,
    steps: s.steps,
  }));
}
