/**
 * PDF Skills
 *
 * Functions for generating PDF documents from markdown.
 * PDFs are automatically uploaded to cloud storage after generation.
 *
 * @example
 * import { generate } from './ksa/pdf';
 *
 * const result = await generate({
 *   filename: 'quarterly-report',
 *   content: '# Q1 Report\n\n## Summary\n...',
 *   title: 'Quarterly Report Q1 2024',
 * });
 *
 * if (result.success) {
 *   console.log(`PDF saved: ${result.name}`);
 * }
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { callGateway, THREAD_ID, CARD_ID } from "./_shared/gateway";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface PdfResult {
  success: boolean;
  path: string;
  name?: string;
  artifactId?: string;
  error?: string;
}

export interface GenerateParams {
  filename: string;
  content: string;
  title?: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Generate a PDF from markdown content.
 *
 * The PDF is:
 * 1. Generated locally using the generate-pdf CLI
 * 2. Automatically uploaded to cloud storage (thread or card artifacts)
 *
 * @param params - Object with filename, content, and optional title
 * @returns Result with path, name, and artifact ID
 *
 * @example
 * const result = await generate({
 *   filename: 'competitive-analysis',
 *   content: '# Competitive Analysis\n\n## Overview\n...',
 *   title: 'Competitive Analysis Report'
 * });
 *
 * if (result.success) {
 *   console.log(`PDF uploaded: ${result.name} (${result.artifactId})`);
 * }
 */
export async function generate(params: GenerateParams): Promise<PdfResult> {
  const { filename, content, title } = params;
  const pdfName = `${filename}.pdf`;
  const localPath = `/home/user/artifacts/${pdfName}`;

  try {
    // Step 1: Generate PDF locally
    const escaped = content.replace(/'/g, "'\\''");
    const titleArg = title ? ` "${title}"` : "";
    const cmd = `echo '${escaped}' | generate-pdf "${filename}"${titleArg}`;

    console.log(`[pdf] Generating PDF: ${pdfName}`);

    await execAsync(cmd, {
      cwd: "/home/user/workspace",
      timeout: 30_000,
    });

    console.log(`[pdf] Generated locally: ${localPath}`);

    // Step 2: Read PDF and convert to base64
    let base64Content: string;
    try {
      const pdfBuffer = await readFile(localPath);
      base64Content = pdfBuffer.toString("base64");
      console.log(`[pdf] Read PDF: ${pdfBuffer.length} bytes`);
    } catch (readError) {
      console.warn(`[pdf] Could not read PDF for upload: ${readError}`);
      return {
        success: true,
        path: localPath,
        name: pdfName,
        error: "PDF generated but could not be uploaded to cloud",
      };
    }

    // Step 3: Upload to cloud storage
    const threadId = THREAD_ID;
    const cardId = CARD_ID;

    if (threadId) {
      // Thread-based session - save to thread artifacts
      try {
        const artifactId = await callGateway<string>(
          "internal.agent.workflows.crudThreads.saveThreadArtifact",
          {
            threadId,
            artifact: {
              name: pdfName,
              type: "pdf",
              content: base64Content,
              metadata: { title, generatedAt: Date.now() },
            },
          },
          "mutation"
        );

        console.log(`[pdf] Uploaded to thread artifacts: ${pdfName}`);
        return {
          success: true,
          path: localPath,
          name: pdfName,
          artifactId,
        };
      } catch (uploadError) {
        const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
        console.warn(`[pdf] Cloud upload failed: ${msg}`);
        return {
          success: true,
          path: localPath,
          name: pdfName,
          error: `PDF generated but upload failed: ${msg}`,
        };
      }
    } else if (cardId) {
      // Card-based session - save to card artifacts
      try {
        const result = await callGateway<{ id: string }>(
          "features.kanban.artifacts.saveArtifactWithBackup",
          {
            cardId,
            artifact: {
              name: pdfName,
              type: "pdf",
              content: base64Content,
              metadata: { title, generatedAt: Date.now() },
            },
          },
          "action"
        );

        console.log(`[pdf] Uploaded to card artifacts: ${pdfName}`);
        return {
          success: true,
          path: localPath,
          name: pdfName,
          artifactId: result?.id,
        };
      } catch (uploadError) {
        const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
        console.warn(`[pdf] Cloud upload failed: ${msg}`);
        return {
          success: true,
          path: localPath,
          name: pdfName,
          error: `PDF generated but upload failed: ${msg}`,
        };
      }
    } else {
      console.warn("[pdf] No THREAD_ID or CARD_ID - PDF saved locally only");
      return {
        success: true,
        path: localPath,
        name: pdfName,
        error: "No THREAD_ID or CARD_ID available for cloud upload",
      };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[pdf] Generation failed: ${msg}`);
    return {
      success: false,
      path: "",
      error: msg,
    };
  }
}
