#!/usr/bin/env bun
/**
 * PDF Generator - Thin CLI that delegates to services/pdf/renderer
 *
 * Usage: bun run pdf-generator.ts <output-path> [title]
 * Content is read from stdin
 */

import * as fs from "fs";
import { markdownToDocNode, renderPdf } from "../services/pdf/renderer";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(JSON.stringify({ success: false, error: "Usage: bun run pdf-generator.ts <output-path> [title]" }));
    process.exit(1);
  }

  const outputPath = args[0];
  const title = args[1];

  // Read content from stdin
  let content = "";
  for await (const chunk of Bun.stdin.stream()) {
    content += new TextDecoder().decode(chunk);
  }

  if (!content.trim()) {
    console.error(JSON.stringify({ success: false, error: "No content provided via stdin" }));
    process.exit(1);
  }

  // Ensure output directory exists
  const outputDir = outputPath.substring(0, outputPath.lastIndexOf("/"));
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Convert markdown to document structure and render PDF
  const docNode = markdownToDocNode(content, title);
  await renderPdf(docNode, { outputPath });

  const stats = fs.statSync(outputPath);
  console.log(JSON.stringify({ success: true, path: outputPath, size: stats.size }));
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
