/**
 * PDF Tools
 *
 * Generate PDF documents from markdown content.
 * Calls internal action that runs PDF generation in Node.js runtime.
 * Auto-saves PDFs as artifacts to the cloud.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

// Module-level gateway config (set by agent/index.ts)
let pdfGatewayConfig: { convexUrl: string; jwt: string; cardId?: string } | null = null;

/**
 * Set the gateway config for PDF tools (for auto-artifact save).
 */
export function setPdfGatewayConfig(config: { convexUrl: string; jwt: string; cardId?: string }) {
  pdfGatewayConfig = config;
}

/**
 * Save artifact to cloud via gateway
 */
async function saveArtifactToCloud(
  name: string,
  type: string,
  content: string
): Promise<{ success: boolean; artifactId?: string; error?: string }> {
  const convexUrl = pdfGatewayConfig?.convexUrl || process.env.CONVEX_URL;
  const jwt = pdfGatewayConfig?.jwt || process.env.SANDBOX_JWT;
  const cardId = pdfGatewayConfig?.cardId || process.env.CARD_ID;

  if (!convexUrl || !jwt) {
    console.log("[pdf] Gateway not configured, skipping artifact save");
    return { success: false, error: "Gateway not configured" };
  }

  if (!cardId) {
    console.log("[pdf] No cardId, skipping artifact save");
    return { success: false, error: "No cardId available" };
  }

  try {
    const response = await fetch(`${convexUrl}/agent/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        path: "features.kanban.artifacts.saveArtifactWithBackup",
        type: "mutation",
        args: {
          cardId,
          artifact: { name, type, content },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[pdf] Artifact save failed: ${error}`);
      return { success: false, error };
    }

    const result = await response.json();
    if (!result.ok) {
      console.error(`[pdf] Artifact save error: ${result.error}`);
      return { success: false, error: result.error };
    }

    console.log(`[pdf] Saved PDF artifact to cloud: ${name}`);
    return { success: true, artifactId: result.data?.artifactId };
  } catch (error) {
    console.error(`[pdf] Artifact save exception: ${error}`);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create PDF tools bound to a Convex action context.
 */
export function createPdfTools(ctx: ActionCtx) {
  return {
    pdf_create: tool({
      description:
        "Create a PDF from markdown. Call this with filename and content to generate and save a PDF artifact.",
      parameters: z.object({
        filename: z.string().describe("PDF filename without extension, e.g. 'report' or 'summary'"),
        content: z.string().describe("The markdown text to convert to PDF"),
      }),
      execute: async (args) => {
        console.log(`[pdf_create] CALLED with filename="${args.filename}", content length=${args.content.length}`);
        try {
          // Call the internal action that runs in Node.js runtime with PDF script
          console.log(`[pdf_create] Calling generatePdf action...`);
          const result = await ctx.runAction(internal.actions.pdf.generatePdf, {
            filename: args.filename,
            content: args.content,
            format: "letter",
          });
          console.log(`[pdf_create] generatePdf returned: success=${result.success}, error=${result.error || 'none'}`);

          if (!result.success) {
            return {
              success: false,
              error: result.error || "PDF generation failed",
            };
          }

          // Auto-save as artifact to cloud (PDF is already base64 from action)
          const artifactResult = await saveArtifactToCloud(
            result.filename,
            "pdf",
            result.pdfBase64
          );

          return {
            success: true,
            path: result.path,
            filename: result.filename,
            size: result.size,
            artifactSaved: artifactResult.success,
            artifactId: artifactResult.artifactId,
            message: artifactResult.success
              ? `Created and saved PDF: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`
              : `Created PDF: ${result.filename} (artifact save failed: ${artifactResult.error})`,
          };
        } catch (error) {
          console.error(`[pdf] Error: ${error}`);
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
