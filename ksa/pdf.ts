/**
 * PDF Skills
 *
 * Functions for generating PDF documents from markdown.
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface PdfResult {
  success: boolean;
  path: string;
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
 * @param params - Object with filename, content, and optional title
 * @returns Path to generated PDF
 *
 * @example
 * await generate({
 *   filename: 'my-report',
 *   content: '# Report\n\nContent here...',
 *   title: 'Quarterly Report'
 * });
 * // Creates /home/user/artifacts/my-report.pdf
 */
export async function generate(params: GenerateParams): Promise<PdfResult> {
  const { filename, content, title } = params;

  try {
    // Escape markdown for shell
    const escaped = content.replace(/'/g, "'\\''");

    // Build command
    const titleArg = title ? ` "${title}"` : "";
    const cmd = `echo '${escaped}' | generate-pdf "${filename}"${titleArg}`;

    console.log(`[pdf] Generating PDF: ${filename}.pdf`);

    await execAsync(cmd, {
      cwd: "/home/user/workspace",
      timeout: 30_000,
    });

    const path = `/home/user/artifacts/${filename}.pdf`;
    console.log(`[pdf] Generated: ${path}`);

    return {
      success: true,
      path,
    };
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
