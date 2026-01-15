"use node";

/**
 * PDF Generation Action
 *
 * Uses PDFKit to generate PDFs from markdown content.
 * This runs in Node.js runtime due to PDFKit dependency.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import PDFDocument from "pdfkit";
import * as fs from "fs";

// Design tokens
const tokens = {
  colors: {
    primary: "#1D4ED8",
    primaryLight: "#EFF6FF",
    background: "#F3F4F6",
    text: "#111827",
    textMuted: "#4B5563",
    textCaption: "#9CA3AF",
    white: "#FFFFFF",
    divider: "#E5E7EB",
  },
  spacing: {
    page: 40,
    card: 16,
    gap: 12,
  },
  radius: {
    card: 8,
  },
  typography: {
    title: { size: 22, font: "Helvetica-Bold", lineGap: 10 },
    subtitle: { size: 14, font: "Helvetica-Bold", lineGap: 6 },
    body: { size: 11, font: "Helvetica", lineGap: 6 },
    caption: { size: 9, font: "Helvetica", lineGap: 4 },
  },
} as const;

type TextVariant = "title" | "subtitle" | "body" | "caption";

interface TextStyle {
  size: number;
  font: string;
  lineGap: number;
  color: string;
}

function getTextStyle(variant?: TextVariant): TextStyle {
  const base = tokens.typography[variant || "body"];
  const colorMap: Record<TextVariant, string> = {
    title: tokens.colors.text,
    subtitle: tokens.colors.textMuted,
    body: tokens.colors.text,
    caption: tokens.colors.textCaption,
  };
  return { ...base, color: colorMap[variant || "body"] };
}

type DocNode =
  | { type: "page"; children: DocNode[]; backgroundColor?: string }
  | { type: "text"; text: string; variant?: TextVariant; color?: string; align?: "left" | "center" | "right" }
  | { type: "spacer"; size: number }
  | { type: "divider"; color?: string }
  | { type: "table"; headers: string[]; rows: string[][]; headerBg?: string };

function measureNode(doc: PDFKit.PDFDocument, node: DocNode, width: number): number {
  switch (node.type) {
    case "text": {
      const style = getTextStyle(node.variant);
      doc.fontSize(style.size).font(style.font);
      return doc.heightOfString(node.text, { width }) + style.lineGap;
    }
    case "spacer":
      return node.size;
    case "divider":
      return 12;
    case "table": {
      const rowHeight = 22;
      return rowHeight * (1 + node.rows.length) + tokens.spacing.gap;
    }
    default:
      return 0;
  }
}

function renderNode(
  doc: PDFKit.PDFDocument,
  node: DocNode,
  x: number,
  y: number,
  width: number
): number {
  switch (node.type) {
    case "page": {
      let currentY = tokens.spacing.page;
      for (const child of node.children) {
        currentY += renderNode(
          doc,
          child,
          tokens.spacing.page,
          currentY,
          doc.page.width - tokens.spacing.page * 2
        );
      }
      return 0;
    }

    case "text": {
      const style = getTextStyle(node.variant);
      doc.fontSize(style.size).fillColor(node.color ?? style.color).font(style.font);
      const height = doc.heightOfString(node.text, { width, align: node.align ?? "left" });
      doc.text(node.text, x, y, { width, align: node.align ?? "left" });
      return height + style.lineGap;
    }

    case "spacer":
      return node.size;

    case "divider": {
      const color = node.color ?? tokens.colors.divider;
      doc.save().strokeColor(color).lineWidth(1).moveTo(x, y + 6).lineTo(x + width, y + 6).stroke().restore();
      return 12;
    }

    case "table": {
      const rowHeight = 22;
      const colWidth = width / node.headers.length;
      const headerBg = node.headerBg ?? tokens.colors.primary;

      doc.save().fillColor(headerBg).rect(x, y, width, rowHeight).fill().restore();

      doc.fillColor(tokens.colors.white).fontSize(10).font("Helvetica-Bold");
      node.headers.forEach((header, i) => {
        doc.text(header, x + i * colWidth + 6, y + 6, { width: colWidth - 12 });
      });

      let currentY = y + rowHeight;
      node.rows.forEach((row, rowIndex) => {
        if (rowIndex % 2 === 0) {
          doc.save().fillColor(tokens.colors.background).rect(x, currentY, width, rowHeight).fill().restore();
        }

        doc.fillColor(tokens.colors.text).fontSize(10).font("Helvetica");
        row.forEach((cell, i) => {
          doc.text(cell, x + i * colWidth + 6, currentY + 6, { width: colWidth - 12 });
        });
        currentY += rowHeight;
      });

      return currentY - y + tokens.spacing.gap;
    }

    default:
      return 0;
  }
}

function markdownToDocNode(md: string, title?: string): DocNode {
  const children: DocNode[] = [];
  const lines = md.split("\n");
  let i = 0;

  let firstHeading: string | null = null;
  for (let j = 0; j < lines.length; j++) {
    const l = lines[j].trim();
    if (!l) continue;
    if (l.startsWith("# ")) {
      firstHeading = l.slice(2);
      break;
    }
    break;
  }

  const docTitle = title || firstHeading;
  const skipFirstHeading = title && firstHeading;

  if (docTitle) {
    children.push({ type: "text", variant: "title", text: docTitle });
    children.push({ type: "spacer", size: 8 });
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) { i++; continue; }

    if (line.startsWith("### ")) {
      children.push({ type: "spacer", size: 8 });
      children.push({ type: "text", variant: "subtitle", text: line.slice(4) });
      i++; continue;
    }
    if (line.startsWith("## ")) {
      children.push({ type: "spacer", size: 12 });
      children.push({ type: "text", variant: "subtitle", text: line.slice(3) });
      i++; continue;
    }
    if (line.startsWith("# ")) {
      if (skipFirstHeading && line.slice(2) === firstHeading) {
        i++; continue;
      }
      children.push({ type: "spacer", size: 16 });
      children.push({ type: "text", variant: "title", text: line.slice(2) });
      i++; continue;
    }

    if (line === "---" || line === "***") {
      children.push({ type: "divider" });
      i++; continue;
    }

    if (line.includes("|") && lines[i + 1]?.includes("---")) {
      const headers = line.split("|").map(h => h.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i].split("|").map(c => c.trim()).filter(Boolean);
        rows.push(row);
        i++;
      }
      children.push({ type: "table", headers, rows });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ") || /^\d+\.\s/.test(line)) {
      let listText = "";
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith("- ") || l.startsWith("* ") || /^\d+\.\s/.test(l)) {
          listText += "• " + l.replace(/^[-*]\s|^\d+\.\s/, "") + "\n";
          i++;
        } else break;
      }
      children.push({ type: "text", variant: "body", text: listText.trim() });
      continue;
    }

    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].includes("|")) {
      para += " " + lines[i].trim();
      i++;
    }
    para = para.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1");
    children.push({ type: "text", variant: "body", text: para });
  }

  return { type: "page", children };
}

/**
 * Generate a PDF from markdown content
 */
export const generatePdf = internalAction({
  args: {
    filename: v.string(),
    content: v.string(),
    title: v.optional(v.string()),
    format: v.optional(v.union(v.literal("a4"), v.literal("letter"))),
    outputDir: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outputDir = args.outputDir || "/home/user/workspace";
    const outputPath = `${outputDir}/${args.filename}.pdf`;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert markdown to document structure
    const docNode = markdownToDocNode(args.content, args.title);

    // Create PDF
    const doc = new PDFDocument({
      size: args.format === "a4" ? "A4" : "LETTER",
      margin: tokens.spacing.page,
      autoFirstPage: true,
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Render document
    if (docNode.type === "page") {
      let currentY = tokens.spacing.page;
      for (const child of docNode.children) {
        currentY += renderNode(
          doc,
          child,
          tokens.spacing.page,
          currentY,
          doc.page.width - tokens.spacing.page * 2
        );
      }
    }

    doc.end();
    await new Promise<void>((resolve) => writeStream.on("finish", resolve));

    // Get file size
    const stats = fs.statSync(outputPath);

    return {
      success: true,
      path: outputPath,
      filename: `${args.filename}.pdf`,
      size: stats.size,
    };
  },
});
