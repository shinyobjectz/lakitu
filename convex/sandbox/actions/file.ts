"use node";

/**
 * File Actions
 *
 * Internal actions for file system operations.
 * These run in Node.js context and can use fs, child_process, etc.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Read File
// ============================================

export const readFile = internalAction({
  args: {
    path: v.string(),
    encoding: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { readFile: fsReadFile, stat } = await import("fs/promises");

    try {
      const encoding = (args.encoding || "utf8") as BufferEncoding;
      const content = await fsReadFile(args.path, encoding);
      const stats = await stat(args.path);

      return {
        success: true,
        content,
        path: args.path,
        size: stats.size,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        path: args.path,
      };
    }
  },
});

// ============================================
// Write File
// ============================================

export const writeFile = internalAction({
  args: {
    path: v.string(),
    content: v.string(),
    createDirs: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { writeFile: fsWriteFile, mkdir, stat } = await import("fs/promises");

    try {
      // Check if file exists
      try {
        await stat(args.path);
        return {
          success: false,
          error: "File already exists. Use editFile to modify existing files.",
          path: args.path,
        };
      } catch {
        // File doesn't exist, good to proceed
      }

      // Create parent directories if needed
      if (args.createDirs !== false) {
        const dir = args.path.substring(0, args.path.lastIndexOf("/"));
        if (dir) {
          await mkdir(dir, { recursive: true });
        }
      }

      // Write file
      await fsWriteFile(args.path, args.content, "utf8");

      return {
        success: true,
        path: args.path,
        size: args.content.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        path: args.path,
      };
    }
  },
});

// ============================================
// Edit File
// ============================================

export const editFile = internalAction({
  args: {
    path: v.string(),
    oldContent: v.string(),
    newContent: v.string(),
  },
  handler: async (ctx, args) => {
    const { readFile: fsReadFile, writeFile: fsWriteFile } = await import("fs/promises");

    try {
      // Read current content
      const currentContent = await fsReadFile(args.path, "utf8");

      // Validate precondition
      if (!currentContent.includes(args.oldContent)) {
        return {
          success: false,
          error: "Precondition failed: old_content not found in file.",
          path: args.path,
          hint: "Read the file first to get current content",
        };
      }

      // Apply edit
      const updatedContent = currentContent.replace(args.oldContent, args.newContent);

      // Generate simple diff
      const diff = generateDiff(currentContent, updatedContent, args.path);

      // Write updated content
      await fsWriteFile(args.path, updatedContent, "utf8");

      return {
        success: true,
        path: args.path,
        diff,
        previousContent: currentContent,
        newContent: updatedContent,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        path: args.path,
      };
    }
  },
});

// ============================================
// Glob Files
// ============================================

export const globFiles = internalAction({
  args: {
    pattern: v.string(),
    cwd: v.optional(v.string()),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");
      const cwd = args.cwd || "/home/user/workspace";
      const max = args.maxResults || 100;

      // Use shell find with pattern matching
      // Convert glob pattern to find-compatible pattern
      const pattern = args.pattern;
      let cmd: string;

      if (pattern.includes("**")) {
        // Recursive glob - use find with -name
        const name = pattern.split("/").pop() || "*";
        cmd = `find "${cwd}" -type f -name "${name}" 2>/dev/null | head -${max + 1}`;
      } else if (pattern.includes("*")) {
        // Simple glob - use find with -name
        cmd = `find "${cwd}" -maxdepth 1 -type f -name "${pattern}" 2>/dev/null | head -${max + 1}`;
      } else {
        // Exact path
        cmd = `find "${cwd}" -type f -path "*${pattern}" 2>/dev/null | head -${max + 1}`;
      }

      const output = execSync(cmd, {
        encoding: "utf8",
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      }).trim();

      const files = output ? output.split("\n").filter(Boolean) : [];

      return {
        success: true,
        files: files.slice(0, max),
        count: files.length,
        truncated: files.length > max,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

// ============================================
// Grep Files
// ============================================

export const grepFiles = internalAction({
  args: {
    pattern: v.string(),
    path: v.optional(v.string()),
    fileGlob: v.optional(v.string()),
    maxMatches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");
      const searchPath = args.path || "/home/user/workspace";
      const max = args.maxMatches || 50;

      let cmd = `grep -rn "${args.pattern}" "${searchPath}"`;
      if (args.fileGlob) {
        cmd += ` --include="${args.fileGlob}"`;
      }
      cmd += ` 2>/dev/null | head -${max}`;

      const output = execSync(cmd, {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }).trim();

      const matches = output
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [filePath, lineNum, ...rest] = line.split(":");
          return {
            file: filePath,
            line: parseInt(lineNum, 10),
            content: rest.join(":").trim(),
          };
        });

      return {
        success: true,
        matches,
        count: matches.length,
      };
    } catch (error: any) {
      // grep returns exit code 1 if no matches
      if (error.status === 1) {
        return {
          success: true,
          matches: [],
          count: 0,
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

// ============================================
// List Directory
// ============================================

export const listDir = internalAction({
  args: {
    path: v.string(),
    showHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { readdir } = await import("fs/promises");

    try {
      const entries = await readdir(args.path, { withFileTypes: true });

      const items = entries
        .filter((e) => args.showHidden || !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
          path: `${args.path}/${e.name}`,
        }));

      return {
        success: true,
        items,
        count: items.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

// ============================================
// Helpers
// ============================================

function generateDiff(oldContent: string, newContent: string, path: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  let diff = `--- a/${path}\n+++ b/${path}\n`;

  // Simple line-by-line diff
  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      continue; // Skip unchanged lines for brevity
    }

    if (oldLine !== undefined && newLine !== undefined && oldLine !== newLine) {
      diff += `-${oldLine}\n+${newLine}\n`;
    } else if (oldLine !== undefined) {
      diff += `-${oldLine}\n`;
    } else if (newLine !== undefined) {
      diff += `+${newLine}\n`;
    }
  }

  return diff;
}
