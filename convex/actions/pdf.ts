"use node";

/**
 * PDF Generation Action
 *
 * Calls the runtime PDF generator script which uses PDFKit.
 * Running via external script ensures fonts are properly resolved.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { execSync } from "child_process";
import * as fs from "fs";

/**
 * Generate a PDF from markdown content using runtime script
 */
export const generatePdf = internalAction({
  args: {
    filename: v.string(),
    content: v.string(),
    title: v.optional(v.string()),
    format: v.optional(v.union(v.literal("a4"), v.literal("letter"))),
    outputDir: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const outputDir = args.outputDir || "/home/user/artifacts";
    const outputPath = `${outputDir}/${args.filename}.pdf`;

    try {
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write content to temp file
      const tempFile = `/tmp/pdf-content-${Date.now()}.md`;
      fs.writeFileSync(tempFile, args.content);

      // Build command - call the runtime PDF generator
      const titleArg = args.title ? `"${args.title.replace(/"/g, '\\"')}"` : '""';
      const cmd = `cat "${tempFile}" | bun run /home/user/lakitu/runtime/pdf-generator.ts "${outputPath}" ${titleArg}`;

      console.log(`[pdf action] Running: ${cmd}`);

      // Execute PDF generator
      const result = execSync(cmd, {
        encoding: "utf-8",
        timeout: 60000,
        cwd: "/home/user/lakitu",
        env: {
          ...process.env,
          HOME: "/home/user",
          PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
        },
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        console.warn("[pdf action] Failed to clean temp file:", e);
      }

      // Parse result
      const parsed = JSON.parse(result.trim());

      if (!parsed.success) {
        console.error("[pdf action] Generator failed:", parsed.error);
        return {
          success: false,
          error: parsed.error || "PDF generation failed",
          path: "",
          filename: "",
          size: 0,
          pdfBase64: "",
        };
      }

      // Read PDF and convert to base64
      const pdfBuffer = fs.readFileSync(outputPath);
      const pdfBase64 = pdfBuffer.toString("base64");

      console.log(`[pdf action] Generated PDF: ${outputPath} (${pdfBuffer.length} bytes)`);

      return {
        success: true,
        path: outputPath,
        filename: `${args.filename}.pdf`,
        size: parsed.size || pdfBuffer.length,
        pdfBase64,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[pdf action] Error:", errorMsg);

      // Check for specific error types
      if (errorMsg.includes("ENOENT") && errorMsg.includes("pdf-generator")) {
        return {
          success: false,
          error: "PDF generator script not found. Ensure /home/user/lakitu/runtime/pdf-generator.ts exists.",
          path: "",
          filename: "",
          size: 0,
          pdfBase64: "",
        };
      }

      return {
        success: false,
        error: errorMsg,
        path: "",
        filename: "",
        size: 0,
        pdfBase64: "",
      };
    }
  },
});
