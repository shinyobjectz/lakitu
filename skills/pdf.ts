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

// ============================================================================
// Functions
// ============================================================================

/**
 * Generate a PDF from markdown content.
 *
 * @param markdown - Markdown content to convert to PDF
 * @param name - Output filename (without .pdf extension)
 * @param title - Optional document title
 * @returns Path to generated PDF
 *
 * @example
 * await generate('# Report\n\nContent here...', 'my-report', 'Quarterly Report');
 * // Creates /home/user/artifacts/my-report.pdf
 */
export async function generate(
  markdown: string,
  name: string,
  title?: string
): Promise<PdfResult> {
  try {
    // Escape markdown for shell
    const escaped = markdown.replace(/'/g, "'\\''");

    // Build command
    const titleArg = title ? ` "${title}"` : "";
    const cmd = `echo '${escaped}' | generate-pdf "${name}"${titleArg}`;

    await execAsync(cmd, {
      cwd: "/home/user/workspace",
      timeout: 30_000,
    });

    const path = `/home/user/artifacts/${name}.pdf`;

    return {
      success: true,
      path,
    };
  } catch (error) {
    return {
      success: false,
      path: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
