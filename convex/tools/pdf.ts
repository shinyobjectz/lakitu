/**
 * PDF Tools
 *
 * Generate PDF documents from markdown content.
 * Calls internal action that uses PDFKit in Node.js runtime.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Create PDF tools bound to a Convex action context.
 */
export function createPdfTools(ctx: ActionCtx) {
  return {
    pdf_create: tool({
      description:
        "Create a PDF document from markdown content. The PDF will be saved to the workspace directory.",
      parameters: z.object({
        filename: z.string().describe("Output filename (without .pdf extension)"),
        content: z.string().describe("Markdown content to convert to PDF"),
        title: z.string().optional().describe("Document title (overrides first heading)"),
        format: z.enum(["a4", "letter"]).default("letter").describe("Page format"),
      }),
      execute: async (args) => {
        try {
          // Call the internal action that runs in Node.js runtime
          const result = await ctx.runAction(internal.actions.pdf.generatePdf, {
            filename: args.filename,
            content: args.content,
            title: args.title,
            format: args.format,
          });

          if (!result.success) {
            return {
              success: false,
              error: "PDF generation failed",
            };
          }

          return {
            success: true,
            path: result.path,
            filename: result.filename,
            size: result.size,
            message: `Created PDF: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
  };
}

// Legacy export for compatibility
export const pdfTools = {
  pdf_create: {
    description: "Create a PDF document from markdown content",
    parameters: z.object({
      filename: z.string(),
      content: z.string(),
      title: z.string().optional(),
      format: z.enum(["a4", "letter"]).default("letter"),
    }),
  },
};
