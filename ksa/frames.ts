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

import { callGateway, callGatewayBatch } from "./_shared/gateway";

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
  // Validation with clear errors
  if (!workspaceId) {
    throw new Error("createFrame: workspaceId is required");
  }
  if (!options) {
    throw new Error("createFrame: options object is required");
  }
  if (!options.name) {
    throw new Error("createFrame: options.name is required");
  }
  if (!options.code) {
    throw new Error("createFrame: options.code is required");
  }

  // Validate dimensions if provided
  const dimensions = options.dimensions || { width: 800, height: 600 };
  if (typeof dimensions.width !== "number" || typeof dimensions.height !== "number") {
    throw new Error("createFrame: dimensions must have numeric width and height");
  }

  // Validate codeType
  const validCodeTypes = ["html", "svelte", "htmx", "tailwind"];
  const codeType = options.codeType || "tailwind";
  if (!validCodeTypes.includes(codeType)) {
    throw new Error(`createFrame: codeType must be one of ${validCodeTypes.join(", ")}`);
  }

  const slug = options.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Build args, excluding undefined optional fields to avoid Convex validation issues
  const args: Record<string, unknown> = {
    workspaceId,
    name: options.name,
    slug,
    code: options.code,
    codeType,
    dimensions,
  };
  if (options.adMeta !== undefined) args.adMeta = options.adMeta;
  if (options.sectionMeta !== undefined) args.sectionMeta = options.sectionMeta;
  if (options.cssVariables !== undefined) args.cssVariables = options.cssVariables;

  // Note: userId is injected by gateway from session config
  try {
    const frameId = await callGateway<string>(
      "internal.features.frames.internal.createFrameInternal",
      args,
      "mutation"
    );

    // Also add the frame to the workspace canvas so it's visible
    try {
      console.log(`[createFrame] Adding frame ${frameId} to canvas for workspace ${workspaceId}`);

      // Get current canvas
      const currentCanvas = await callGateway<any>(
        "internal.features.workspaces.internal.getCanvasInternal",
        { workspaceId },
        "query"
      );
      console.log(`[createFrame] Current canvas:`, currentCanvas ? "exists" : "empty");

      // Canvas format matches @workspaces/core types:
      // - elements (not nodes)
      // - connections (not edges)
      // - viewport.offset (not translation)
      // - Element.size: {x, y} (not data.width/height)
      const canvas = currentCanvas || {
        version: "1.0",
        elements: [],
        connections: [],
        viewport: {
          offset: { x: 0, y: 0 },
          zoom: 1,
        },
        settings: {},
      };

      // Calculate position for new frame (stack below existing frames)
      const existingElements = canvas.elements || [];
      const maxY = existingElements.reduce((max: number, el: any) => {
        const elBottom = (el.position?.y || 0) + (el.size?.y || 600);
        return Math.max(max, elBottom);
      }, 0);

      // Add frame as canvas element
      canvas.elements = [
        ...existingElements,
        {
          id: frameId,
          position: { x: 100, y: maxY + 50 },
          size: { x: dimensions.width, y: dimensions.height },
          container: true, // Frames are containers
          data: {
            label: options.name,
            code: options.code,
            codeType,
            frameId,
          },
        },
      ];

      // Save updated canvas
      console.log(`[createFrame] Saving canvas with ${canvas.elements.length} elements`);
      await callGateway<void>(
        "internal.features.workspaces.internal.saveCanvasInternal",
        { workspaceId, canvas },
        "mutation"
      );
      console.log(`[createFrame] Canvas saved successfully`);
    } catch (canvasError) {
      // Log the error - canvas update failed but frame was created
      console.error(`[createFrame] Canvas update failed: ${canvasError instanceof Error ? canvasError.message : String(canvasError)}`);
      // Don't throw - frame creation succeeded, canvas update is secondary
    }

    return frameId;
  } catch (error) {
    throw new Error(
      `createFrame failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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
    // Note: userId is injected by gateway from session config
    const response = await callGateway<Frame>(
      "internal.features.frames.internal.getFrameInternal",
      { id: frameId },
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
  // Note: userId is injected by gateway from session config
  const response = await callGateway<Frame[]>(
    "internal.features.frames.internal.listFramesInternal",
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
  // Note: userId is injected by gateway from session config
  await callGateway(
    "internal.features.frames.internal.updateFrameInternal",
    { id: frameId, ...updates },
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
  // Note: userId is injected by gateway from session config
  await callGateway(
    "internal.features.frames.internal.deleteFrameInternal",
    { id: frameId },
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
  const response = await callGateway<{ content: string }>(
    "services.OpenRouter.internal.chat",
    {
      prompt: description,
      system: `You are an expert HTML/Tailwind CSS designer. Generate clean, responsive HTML using Tailwind CSS classes.
${styleHint}
Output ONLY the HTML code, no explanations or markdown.
The design should fit ${dimensions.width}x${dimensions.height} pixels.`,
      model: "anthropic/claude-3-5-sonnet",
      maxTokens: 4000,
    },
    "action"
  );

  // Extract HTML from response
  let code = response.content || "";

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

  // Note: userId is injected by gateway from session config
  const response = await callGateway<string>(
    "internal.features.frames.internal.createPageInternal",
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
    // Note: userId is injected by gateway from session config
    const response = await callGateway<Page>(
      "internal.features.frames.internal.getPageInternal",
      { id: pageId },
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
  // Note: userId is injected by gateway from session config
  const response = await callGateway<Page[]>(
    "internal.features.frames.internal.listPagesInternal",
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
  // Note: userId is injected by gateway from session config
  await callGateway(
    "internal.features.frames.internal.updatePageInternal",
    { id: pageId, ...updates },
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
  // Note: userId is injected by gateway from session config
  const response = await callGateway<string>(
    "internal.features.frames.internal.snapshotFrameInternal",
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
  // Note: userId is injected by gateway from session config
  await callGateway(
    "internal.features.frames.internal.rollbackFrameInternal",
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
