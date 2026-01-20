/**
 * Frames Worker Template
 *
 * Standard worker for serving static sites from R2.
 * Copy and customize for your project.
 *
 * Routes:
 *   /{site-name}/           → R2: frames/{site-name}/index.html
 *   /{site-name}/path/file  → R2: frames/{site-name}/path/file
 */

import { getMimeType } from "../r2";

export interface FramesWorkerEnv {
  FRAMES_BUCKET: R2Bucket;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Create a frames worker fetch handler.
 *
 * @param env - Worker environment with FRAMES_BUCKET binding
 */
export function createFramesHandler(env: FramesWorkerEnv) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // Only allow GET/HEAD
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Parse path: /{site-name}/{path}
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length === 0) {
      return new Response(
        `<!DOCTYPE html>
<html>
<head><title>Frames</title></head>
<body>
  <h1>Frames</h1>
  <p>Static sites served from R2.</p>
  <p>Usage: /{site-name}/</p>
</body>
</html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders(),
          },
        }
      );
    }

    const siteName = pathParts[0];
    let filePath = pathParts.slice(1).join("/") || "index.html";

    // Handle trailing slash → index.html
    if (filePath.endsWith("/") || !filePath.includes(".")) {
      filePath = filePath.replace(/\/$/, "") + "/index.html";
      filePath = filePath.replace(/^\//, "");
      if (filePath === "/index.html") filePath = "index.html";
    }

    // R2 key: frames/{site-name}/{path}
    const r2Key = `frames/${siteName}/${filePath}`;

    try {
      const object = await env.FRAMES_BUCKET.get(r2Key);

      if (!object) {
        // Try index.html for directory paths
        if (!filePath.endsWith("index.html")) {
          const indexKey = `frames/${siteName}/${filePath}/index.html`;
          const indexObject = await env.FRAMES_BUCKET.get(indexKey);
          if (indexObject) {
            return new Response(indexObject.body, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
                ...corsHeaders(),
              },
            });
          }
        }

        return new Response(`Not found: ${r2Key}`, {
          status: 404,
          headers: corsHeaders(),
        });
      }

      const contentType = getMimeType(filePath);
      const cacheControl = contentType.startsWith("text/html")
        ? "public, max-age=60" // HTML: short cache
        : "public, max-age=31536000, immutable"; // Assets: long cache

      return new Response(object.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
          ETag: object.httpEtag,
          ...corsHeaders(),
        },
      });
    } catch (error) {
      console.error("R2 fetch error:", error);
      return new Response("Internal error", {
        status: 500,
        headers: corsHeaders(),
      });
    }
  };
}

/**
 * Default export for Cloudflare Workers.
 */
export default {
  async fetch(request: Request, env: FramesWorkerEnv): Promise<Response> {
    const handler = createFramesHandler(env);
    return handler(request);
  },
};
