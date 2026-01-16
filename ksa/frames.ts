/**
 * Frames KSA - Knowledge, Skills, and Abilities
 *
 * Create and manage visual frames (HTML/Tailwind/Svelte components).
 * Frames are stored in Convex and rendered via SecureFrame in sandboxed iframes.
 *
 * @example
 * import { createFrame, listFrames, generateFrame } from './ksa/frames';
 *
 * // Create a frame with HTML/Tailwind
 * const frameId = await createFrame(workspaceId, {
 *   name: 'Hero Section',
 *   code: '<section class="bg-black text-white p-20">...</section>',
 *   codeType: 'tailwind',
 *   dimensions: { width: 1200, height: 600 }
 * });
 *
 * // Generate a frame from description
 * const generatedId = await generateFrame(workspaceId, 'A modern hero section with gradient background');
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface Frame {
  _id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  slug: string;
  code: string;
  codeType: "html" | "svelte" | "htmx" | "tailwind";
  dimensions: {
    width: number;
    height: number;
    aspectRatio?: string;
  };
  adMeta?: {
    platform: "meta" | "google" | "tiktok" | "linkedin";
    format: string;
    trackingPixels?: string[];
    cta?: string;
  };
  sectionMeta?: {
    sectionType: "hero" | "features" | "pricing" | "testimonials" | "cta" | "form";
    formFields?: unknown[];
  };
  cssVariables?: Record<string, string>;
  status: "draft" | "published" | "archived";
  publishedAt?: number;
  viewCount: number;
  conversionCount: number;
  _creationTime: number;
}

export interface Page {
  _id: string;
  workspaceId: string;
  title: string;
  slug: string;
  pageType: "landing" | "multi";
  frameRefs: Array<{
    frameId: string;
    order: number;
  }>;
  customDomain?: string;
  isPublished: boolean;
  status: "draft" | "published" | "archived";
  _creationTime: number;
}

export interface FrameTemplate {
  id: string;
  name: string;
  category: string;
  code: string;
  codeType: "html" | "svelte" | "htmx" | "tailwind";
  dimensions: { width: number; height: number };
  thumbnail?: string;
}

export interface AdSpec {
  platform: string;
  format: string;
  width: number;
  height: number;
  aspectRatio: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Create a new frame.
 *
 * @param workspaceId - The workspace ID
 * @param options - Frame configuration
 * @returns The new frame ID
 *
 * @example
 * const frameId = await createFrame(workspaceId, {
 *   name: 'Call to Action',
 *   code: '<div class="bg-blue-600 text-white p-8 rounded-lg">...</div>',
 *   codeType: 'tailwind',
 *   dimensions: { width: 800, height: 400 }
 * });
 */
export async function createFrame(
  workspaceId: string,
  options: {
    name: string;
    code: string;
    codeType?: "html" | "svelte" | "htmx" | "tailwind";
    dimensions?: { width: number; height: number };
    adMeta?: Frame["adMeta"];
    sectionMeta?: Frame["sectionMeta"];
    cssVariables?: Record<string, string>;
  }
): Promise<string> {
  const slug = options.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const response = await callGateway<string>(
    "features.frames.crud.createFrame",
    {
      workspaceId,
      name: options.name,
      slug,
      code: options.code,
      codeType: options.codeType || "tailwind",
      dimensions: options.dimensions || { width: 800, height: 600 },
      adMeta: options.adMeta,
      sectionMeta: options.sectionMeta,
      cssVariables: options.cssVariables,
    },
    "mutation"
  );
  return response;
}

/**
 * Get a frame by ID.
 *
 * @param frameId - The frame ID
 * @returns Frame data or null if not found
 *
 * @example
 * const frame = await getFrame(frameId);
 * console.log(`${frame.name}: ${frame.codeType}`);
 */
export async function getFrame(frameId: string): Promise<Frame | null> {
  try {
    const response = await callGateway<Frame>(
      "features.frames.crud.getFrame",
      { frameId },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * List frames in a workspace.
 *
 * @param workspaceId - The workspace ID
 * @returns Array of frames
 *
 * @example
 * const frames = await listFrames(workspaceId);
 * for (const f of frames) {
 *   console.log(`${f.name} (${f.codeType}) - ${f.status}`);
 * }
 */
export async function listFrames(workspaceId: string): Promise<Frame[]> {
  const response = await callGateway<Frame[]>(
    "features.frames.crud.listFrames",
    { workspaceId },
    "query"
  );
  return response;
}

/**
 * Update a frame.
 *
 * @param frameId - The frame ID
 * @param updates - Properties to update
 *
 * @example
 * await updateFrame(frameId, {
 *   name: 'Updated Hero',
 *   code: '<section>...</section>',
 *   status: 'published'
 * });
 */
export async function updateFrame(
  frameId: string,
  updates: {
    name?: string;
    code?: string;
    codeType?: "html" | "svelte" | "htmx" | "tailwind";
    dimensions?: { width: number; height: number };
    status?: "draft" | "published" | "archived";
    cssVariables?: Record<string, string>;
  }
): Promise<void> {
  await callGateway(
    "features.frames.crud.updateFrame",
    { frameId, ...updates },
    "mutation"
  );
}

/**
 * Delete a frame.
 *
 * @param frameId - The frame ID to delete
 *
 * @example
 * await deleteFrame(frameId);
 */
export async function deleteFrame(frameId: string): Promise<void> {
  await callGateway(
    "features.frames.crud.deleteFrame",
    { frameId },
    "mutation"
  );
}

/**
 * Generate a frame from a description using AI.
 * Creates HTML/Tailwind code based on the natural language description.
 *
 * @param workspaceId - The workspace ID
 * @param description - Natural language description of the desired frame
 * @param options - Optional generation settings
 * @returns The new frame ID
 *
 * @example
 * const frameId = await generateFrame(workspaceId,
 *   'A modern hero section with a gradient background from purple to blue, ' +
 *   'centered white text with a headline and subheadline, and a glowing CTA button'
 * );
 */
export async function generateFrame(
  workspaceId: string,
  description: string,
  options?: {
    style?: "modern" | "minimal" | "bold" | "corporate";
    dimensions?: { width: number; height: number };
    codeType?: "html" | "tailwind" | "svelte";
  }
): Promise<string> {
  // Use the AI service to generate HTML
  const styleGuide = {
    modern: "Use modern design patterns with subtle shadows, rounded corners, and contemporary typography",
    minimal: "Keep it clean and minimal with lots of whitespace and simple forms",
    bold: "Use bold colors, strong typography, and impactful visual elements",
    corporate: "Professional and trustworthy design with clean lines and business-appropriate colors",
  };

  const styleHint = options?.style ? styleGuide[options.style] : styleGuide.modern;
  const dimensions = options?.dimensions || { width: 1200, height: 600 };

  // Generate the HTML using LLM
  const response = await callGateway<{ code: string }>(
    "services.OpenRouter.internal.chat",
    {
      messages: [
        {
          role: "system",
          content: `You are an expert HTML/Tailwind CSS designer. Generate clean, responsive HTML using Tailwind CSS classes.
${styleHint}
Output ONLY the HTML code, no explanations or markdown.
The design should fit ${dimensions.width}x${dimensions.height} pixels.`,
        },
        {
          role: "user",
          content: description,
        },
      ],
      model: "anthropic/claude-3-5-sonnet",
      max_tokens: 4000,
    },
    "action"
  );

  // Extract HTML from response
  let code = response.code || "";

  // Clean up the response - remove markdown code blocks if present
  code = code.replace(/```html?\n?/g, "").replace(/```\n?$/g, "").trim();

  // Create the frame
  const name = description.slice(0, 50) + (description.length > 50 ? "..." : "");

  return createFrame(workspaceId, {
    name,
    code,
    codeType: options?.codeType || "tailwind",
    dimensions,
  });
}

/**
 * Create a page (container for multiple frames).
 *
 * @param workspaceId - The workspace ID
 * @param options - Page configuration
 * @returns The new page ID
 *
 * @example
 * const pageId = await createPage(workspaceId, {
 *   title: 'Landing Page',
 *   pageType: 'landing',
 *   frameRefs: [
 *     { frameId: heroFrameId, order: 0 },
 *     { frameId: featuresFrameId, order: 1 }
 *   ]
 * });
 */
export async function createPage(
  workspaceId: string,
  options: {
    title: string;
    pageType?: "landing" | "multi";
    frameRefs?: Array<{ frameId: string; order: number }>;
  }
): Promise<string> {
  const slug = options.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const response = await callGateway<string>(
    "features.frames.crud.createPage",
    {
      workspaceId,
      title: options.title,
      slug,
      pageType: options.pageType || "landing",
      frameRefs: options.frameRefs || [],
    },
    "mutation"
  );
  return response;
}

/**
 * Get a page by ID.
 *
 * @param pageId - The page ID
 * @returns Page data or null if not found
 *
 * @example
 * const page = await getPage(pageId);
 * console.log(`${page.title} has ${page.frameRefs.length} frames`);
 */
export async function getPage(pageId: string): Promise<Page | null> {
  try {
    const response = await callGateway<Page>(
      "features.frames.crud.getPage",
      { pageId },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * List pages in a workspace.
 *
 * @param workspaceId - The workspace ID
 * @returns Array of pages
 *
 * @example
 * const pages = await listPages(workspaceId);
 */
export async function listPages(workspaceId: string): Promise<Page[]> {
  const response = await callGateway<Page[]>(
    "features.frames.crud.listPages",
    { workspaceId },
    "query"
  );
  return response;
}

/**
 * Update a page.
 *
 * @param pageId - The page ID
 * @param updates - Properties to update
 *
 * @example
 * await updatePage(pageId, {
 *   title: 'Updated Landing Page',
 *   frameRefs: [{ frameId: newHeroId, order: 0 }],
 *   isPublished: true
 * });
 */
export async function updatePage(
  pageId: string,
  updates: {
    title?: string;
    frameRefs?: Array<{ frameId: string; order: number }>;
    isPublished?: boolean;
    status?: "draft" | "published" | "archived";
  }
): Promise<void> {
  await callGateway(
    "features.frames.crud.updatePage",
    { pageId, ...updates },
    "mutation"
  );
}

/**
 * Get available frame templates.
 *
 * @returns Array of templates
 *
 * @example
 * const templates = await getTemplates();
 * for (const t of templates) {
 *   console.log(`${t.name} (${t.category})`);
 * }
 */
export async function getTemplates(): Promise<FrameTemplate[]> {
  const response = await callGateway<FrameTemplate[]>(
    "features.frames.templates.listTemplates",
    {},
    "query"
  );
  return response;
}

/**
 * Get ad specifications for different platforms.
 *
 * @param platform - Optional platform to filter by
 * @returns Array of ad specs
 *
 * @example
 * const specs = await getAdSpecs('meta');
 * for (const s of specs) {
 *   console.log(`${s.format}: ${s.width}x${s.height}`);
 * }
 */
export async function getAdSpecs(platform?: string): Promise<AdSpec[]> {
  const response = await callGateway<AdSpec[]>(
    "features.frames.ads.getAdSpecs",
    { platform },
    "query"
  );
  return response;
}

/**
 * Create a version snapshot of a frame.
 *
 * @param frameId - The frame ID
 * @returns The version ID
 *
 * @example
 * const versionId = await snapshotFrame(frameId);
 */
export async function snapshotFrame(frameId: string): Promise<string> {
  const response = await callGateway<string>(
    "features.frames.versions.snapshot",
    { frameId },
    "mutation"
  );
  return response;
}

/**
 * Rollback a frame to a previous version.
 *
 * @param versionId - The version ID to rollback to
 *
 * @example
 * await rollbackFrame(versionId);
 */
export async function rollbackFrame(versionId: string): Promise<void> {
  await callGateway(
    "features.frames.versions.rollback",
    { versionId },
    "mutation"
  );
}

/**
 * Track a view on a frame (for analytics).
 *
 * @param frameId - The frame ID
 *
 * @example
 * await trackView(frameId);
 */
export async function trackView(frameId: string): Promise<void> {
  await callGateway(
    "features.frames.analytics.trackView",
    { frameId },
    "mutation"
  );
}

/**
 * Track a conversion on a frame (for analytics).
 *
 * @param frameId - The frame ID
 *
 * @example
 * await trackConversion(frameId);
 */
export async function trackConversion(frameId: string): Promise<void> {
  await callGateway(
    "features.frames.analytics.trackConversion",
    { frameId },
    "mutation"
  );
}
