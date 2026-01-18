"use node";

/**
 * Browser Actions
 *
 * Internal actions for browser automation using agent-browser CLI.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

/**
 * Navigate to a URL
 */
export const open = internalAction({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");

      execSync(`agent-browser open "${args.url}"`, {
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true, url: args.url };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Get page snapshot with interactive elements
 */
export const snapshot = internalAction({
  args: {
    interactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");

      const cmdArgs = ["snapshot"];
      if (args.interactive !== false) {
        cmdArgs.push("--interactive");
      }

      const result = execSync(`agent-browser ${cmdArgs.join(" ")}`, {
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      // Parse snapshot output
      const snapshot = parseSnapshot(result);
      return { success: true, ...snapshot };
    } catch (error: any) {
      return { success: false, error: error.message, elements: [] };
    }
  },
});

/**
 * Click an element by ref
 */
export const click = internalAction({
  args: {
    ref: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");

      execSync(`agent-browser click "${args.ref}"`, {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Type text into focused element
 */
export const type = internalAction({
  args: {
    text: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");

      // Escape text for shell
      const escaped = args.text.replace(/"/g, '\\"');

      execSync(`agent-browser type "${escaped}"`, {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Press a keyboard key
 */
export const press = internalAction({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");

      execSync(`agent-browser press "${args.key}"`, {
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Scroll the page
 */
export const scroll = internalAction({
  args: {
    direction: v.union(
      v.literal("up"),
      v.literal("down"),
      v.literal("top"),
      v.literal("bottom")
    ),
  },
  handler: async (ctx, args) => {
    try {
      const { execSync } = await import("child_process");

      execSync(`agent-browser scroll ${args.direction}`, {
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Take a screenshot
 */
export const screenshot = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const { execSync } = await import("child_process");

      const result = execSync(`agent-browser screenshot --format base64`, {
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 50 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true, screenshot: result.trim() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Close browser session
 */
export const close = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const { execSync } = await import("child_process");

      execSync("agent-browser close", {
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          HOME: "/home/user",
        },
      });

      return { success: true };
    } catch (error: any) {
      // Ignore errors on close
      return { success: true };
    }
  },
});

// ============================================
// Helpers
// ============================================

function parseSnapshot(output: string): {
  url: string;
  title: string;
  elements: Array<{
    ref: string;
    tag: string;
    text?: string;
  }>;
} {
  const lines = output.split("\n");
  const elements: Array<{ ref: string; tag: string; text?: string }> = [];
  let url = "";
  let title = "";

  for (const line of lines) {
    if (line.startsWith("URL:")) {
      url = line.slice(4).trim();
      continue;
    }

    if (line.startsWith("Title:")) {
      title = line.slice(6).trim();
      continue;
    }

    // Parse element refs like "@e1 button[Login]"
    const refMatch = line.match(/^(@e\d+)\s+(\w+)(?:\[(.+?)\])?/);
    if (refMatch) {
      elements.push({
        ref: refMatch[1],
        tag: refMatch[2],
        text: refMatch[3],
      });
    }
  }

  return { url, title, elements };
}
