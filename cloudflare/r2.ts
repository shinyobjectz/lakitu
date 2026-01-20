/**
 * R2 Storage Utilities
 *
 * Helpers for working with Cloudflare R2 buckets.
 */

import type { FrameMetadata, VersionInfo } from "./types";

/**
 * MIME types for common file extensions.
 */
export const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

/**
 * Get MIME type for a file path.
 */
export function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * R2 Storage client for frames and versioned content.
 */
export class R2Storage {
  constructor(private bucket: R2Bucket) {}

  // ============================================================================
  // Frame Operations
  // ============================================================================

  /**
   * Store a frame file.
   *
   * @param frameName - Frame/site name
   * @param filePath - File path within frame
   * @param content - File content
   */
  async putFrame(frameName: string, filePath: string, content: string | ArrayBuffer): Promise<void> {
    const key = `frames/${frameName}/${filePath}`;
    await this.bucket.put(key, content, {
      httpMetadata: {
        contentType: getMimeType(filePath),
      },
    });
  }

  /**
   * Get a frame file.
   *
   * @param frameName - Frame/site name
   * @param filePath - File path within frame
   */
  async getFrame(frameName: string, filePath: string): Promise<R2ObjectBody | null> {
    const key = `frames/${frameName}/${filePath}`;
    return this.bucket.get(key);
  }

  /**
   * Delete a frame file.
   */
  async deleteFrame(frameName: string, filePath: string): Promise<void> {
    const key = `frames/${frameName}/${filePath}`;
    await this.bucket.delete(key);
  }

  /**
   * List all files in a frame.
   */
  async listFrameFiles(frameName: string): Promise<string[]> {
    const prefix = `frames/${frameName}/`;
    const listed = await this.bucket.list({ prefix });
    return listed.objects.map((obj) => obj.key.slice(prefix.length));
  }

  /**
   * Delete an entire frame.
   */
  async deleteFrameAll(frameName: string): Promise<void> {
    const files = await this.listFrameFiles(frameName);
    for (const file of files) {
      await this.deleteFrame(frameName, file);
    }
  }

  /**
   * Store frame metadata.
   */
  async putFrameMetadata(frameName: string, metadata: FrameMetadata): Promise<void> {
    const key = `frames/${frameName}/_metadata.json`;
    await this.bucket.put(key, JSON.stringify(metadata), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  /**
   * Get frame metadata.
   */
  async getFrameMetadata(frameName: string): Promise<FrameMetadata | null> {
    const key = `frames/${frameName}/_metadata.json`;
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text());
  }

  // ============================================================================
  // Versioned Storage Operations
  // ============================================================================

  /**
   * Store a versioned snapshot.
   *
   * @param repoType - Type of content (e.g., "workspace", "frame")
   * @param repoId - Content identifier
   * @param files - Map of file paths to contents
   * @param message - Version message
   */
  async createVersion(
    repoType: string,
    repoId: string,
    files: Record<string, string>,
    message: string
  ): Promise<VersionInfo> {
    const timestamp = Date.now();
    const hash = `v${timestamp}`;
    const prefix = `repos/${repoType}/${repoId}/versions/${hash}/`;

    // Store files
    for (const [path, content] of Object.entries(files)) {
      await this.bucket.put(`${prefix}files/${path}`, content);
    }

    // Store version info
    const versionInfo: VersionInfo = {
      hash,
      message,
      author: "lakitu-agent",
      timestamp: new Date(timestamp).toISOString(),
      files: Object.keys(files),
    };
    await this.bucket.put(`${prefix}info.json`, JSON.stringify(versionInfo));

    // Update latest pointer
    await this.bucket.put(
      `repos/${repoType}/${repoId}/latest.json`,
      JSON.stringify({ hash, timestamp })
    );

    return versionInfo;
  }

  /**
   * Get a specific version.
   */
  async getVersion(repoType: string, repoId: string, hash: string): Promise<{
    info: VersionInfo;
    files: Record<string, string>;
  } | null> {
    const prefix = `repos/${repoType}/${repoId}/versions/${hash}/`;

    // Get version info
    const infoObj = await this.bucket.get(`${prefix}info.json`);
    if (!infoObj) return null;
    const info = JSON.parse(await infoObj.text()) as VersionInfo;

    // Get files
    const files: Record<string, string> = {};
    const listed = await this.bucket.list({ prefix: `${prefix}files/` });
    for (const obj of listed.objects) {
      const filePath = obj.key.slice(`${prefix}files/`.length);
      const content = await this.bucket.get(obj.key);
      if (content) {
        files[filePath] = await content.text();
      }
    }

    return { info, files };
  }

  /**
   * Get latest version info.
   */
  async getLatestVersion(repoType: string, repoId: string): Promise<{ hash: string; timestamp: number } | null> {
    const obj = await this.bucket.get(`repos/${repoType}/${repoId}/latest.json`);
    if (!obj) return null;
    return JSON.parse(await obj.text());
  }

  /**
   * List all versions.
   */
  async listVersions(repoType: string, repoId: string, limit = 20): Promise<VersionInfo[]> {
    const prefix = `repos/${repoType}/${repoId}/versions/`;
    const listed = await this.bucket.list({ prefix, delimiter: "/" });

    const versions: VersionInfo[] = [];
    for (const p of listed.delimitedPrefixes || []) {
      const infoObj = await this.bucket.get(`${p}info.json`);
      if (infoObj) {
        versions.push(JSON.parse(await infoObj.text()));
      }
    }

    // Sort by timestamp descending
    versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return versions.slice(0, limit);
  }

  // ============================================================================
  // Generic Operations
  // ============================================================================

  /**
   * Put an object.
   */
  async put(key: string, content: string | ArrayBuffer, contentType?: string): Promise<void> {
    await this.bucket.put(key, content, {
      httpMetadata: contentType ? { contentType } : undefined,
    });
  }

  /**
   * Get an object.
   */
  async get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  /**
   * Delete an object.
   */
  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /**
   * List objects with prefix.
   */
  async list(prefix: string, limit?: number): Promise<R2Objects> {
    return this.bucket.list({ prefix, limit });
  }
}
