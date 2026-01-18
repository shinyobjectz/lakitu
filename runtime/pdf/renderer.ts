/**
 * PDF Renderer - Converts DocNode schema to PDFKit drawing calls
 */

import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import type { DocNode, TextVariant } from './schema';
import { tokens } from './schema';

export interface RenderContext {
  doc: PDFKit.PDFDocument;
  x: number;
  y: number;
  width: number;
}

interface TextStyle {
  size: number;
  font: string;
  lineGap: number;
  color: string;
}

function getTextStyle(variant?: TextVariant): TextStyle {
  const base = tokens.typography[variant || 'body'];
  const colorMap: Record<TextVariant, string> = {
    title: tokens.colors.text,
    subtitle: tokens.colors.textMuted,
    body: tokens.colors.text,
    caption: tokens.colors.textCaption,
  };
  return { ...base, color: colorMap[variant || 'body'] };
}

function drawRoundedRect(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  r: number, color: string
) {
  doc.save().fillColor(color).roundedRect(x, y, w, h, r).fill().restore();
}

function measureText(doc: PDFKit.PDFDocument, text: string, width: number, style: TextStyle): number {
  doc.fontSize(style.size).font(style.font);
  return doc.heightOfString(text, { width }) + style.lineGap;
}

function measureNode(doc: PDFKit.PDFDocument, node: DocNode, width: number): number {
  switch (node.type) {
    case 'text': {
      const style = getTextStyle(node.variant);
      return measureText(doc, node.text, width, style);
    }
    case 'spacer':
      return node.size;
    case 'divider':
      return 12;
    case 'card': {
      const padding = node.padding ?? tokens.spacing.card;
      const innerWidth = width - padding * 2;
      let h = padding * 2;
      for (const child of node.children) {
        h += measureNode(doc, child, innerWidth);
      }
      return h + tokens.spacing.gap;
    }
    case 'stack': {
      if (node.direction === 'column') {
        let h = 0;
        for (const child of node.children) {
          h += measureNode(doc, child, width);
        }
        return h;
      } else {
        const gap = node.gap ?? tokens.spacing.gap;
        const colWidth = (width - gap * (node.children.length - 1)) / node.children.length;
        let maxH = 0;
        for (const child of node.children) {
          maxH = Math.max(maxH, measureNode(doc, child, colWidth));
        }
        return maxH + tokens.spacing.gap;
      }
    }
    case 'table': {
      const rowHeight = 22;
      return rowHeight * (1 + node.rows.length) + tokens.spacing.gap;
    }
    case 'image':
      return (node.height ?? 100) + tokens.spacing.gap;
    default:
      return 0;
  }
}

function renderNode(node: DocNode, ctx: RenderContext): number {
  const { doc, x, y, width } = ctx;

  switch (node.type) {
    case 'page': {
      doc.addPage();
      if (node.backgroundColor) {
        doc.save()
          .rect(0, 0, doc.page.width, doc.page.height)
          .fill(node.backgroundColor)
          .restore();
      }
      let currentY = tokens.spacing.page;
      for (const child of node.children) {
        currentY += renderNode(child, {
          doc, x: tokens.spacing.page, y: currentY,
          width: doc.page.width - tokens.spacing.page * 2
        });
      }
      return 0;
    }

    case 'text': {
      const style = getTextStyle(node.variant);
      doc.fontSize(style.size).fillColor(node.color ?? style.color).font(style.font);
      const height = doc.heightOfString(node.text, { width, align: node.align ?? 'left' });
      doc.text(node.text, x, y, { width, align: node.align ?? 'left' });
      return height + style.lineGap;
    }

    case 'spacer':
      return node.size;

    case 'divider': {
      const color = node.color ?? tokens.colors.divider;
      doc.save().strokeColor(color).lineWidth(1).moveTo(x, y + 6).lineTo(x + width, y + 6).stroke().restore();
      return 12;
    }

    case 'card': {
      const padding = node.padding ?? tokens.spacing.card;
      const radius = node.radius ?? tokens.radius.card;
      const innerWidth = width - padding * 2;

      let cardHeight = padding * 2;
      for (const child of node.children) {
        cardHeight += measureNode(doc, child, innerWidth);
      }

      if (node.backgroundColor) {
        drawRoundedRect(doc, x, y, width, cardHeight, radius, node.backgroundColor);
      }

      let currentY = y + padding;
      for (const child of node.children) {
        currentY += renderNode(child, { doc, x: x + padding, y: currentY, width: innerWidth });
      }

      return cardHeight + tokens.spacing.gap;
    }

    case 'stack': {
      const gap = node.gap ?? tokens.spacing.gap;
      if (node.direction === 'column') {
        let currentY = y;
        for (const child of node.children) {
          currentY += renderNode(child, { doc, x, y: currentY, width });
        }
        return currentY - y;
      } else {
        const colWidth = (width - gap * (node.children.length - 1)) / node.children.length;
        let maxH = 0;
        let currentX = x;
        for (const child of node.children) {
          const h = renderNode(child, { doc, x: currentX, y, width: colWidth });
          maxH = Math.max(maxH, h);
          currentX += colWidth + gap;
        }
        return maxH + tokens.spacing.gap;
      }
    }

    case 'table': {
      const rowHeight = 22;
      const colWidth = width / node.headers.length;
      const headerBg = node.headerBg ?? tokens.colors.primary;

      doc.save().fillColor(headerBg).rect(x, y, width, rowHeight).fill().restore();

      doc.fillColor(tokens.colors.white).fontSize(10).font('Helvetica-Bold');
      node.headers.forEach((header, i) => {
        doc.text(header, x + i * colWidth + 6, y + 6, { width: colWidth - 12 });
      });

      let currentY = y + rowHeight;
      node.rows.forEach((row, rowIndex) => {
        if (rowIndex % 2 === 0) {
          doc.save().fillColor(tokens.colors.background).rect(x, currentY, width, rowHeight).fill().restore();
        }

        doc.fillColor(tokens.colors.text).fontSize(10).font('Helvetica');
        row.forEach((cell, i) => {
          doc.text(cell, x + i * colWidth + 6, currentY + 6, { width: colWidth - 12 });
        });
        currentY += rowHeight;
      });

      return currentY - y + tokens.spacing.gap;
    }

    case 'image': {
      try {
        const imgWidth = node.width ?? width;
        const imgHeight = node.height ?? 100;
        doc.image(node.src, x, y, { width: imgWidth, height: imgHeight });
        return imgHeight + tokens.spacing.gap;
      } catch {
        doc.save().fillColor(tokens.colors.background).rect(x, y, width, 100).fill().restore();
        doc.fillColor(tokens.colors.textMuted).fontSize(10).text('Image not available', x, y + 40, { width, align: 'center' });
        return 100 + tokens.spacing.gap;
      }
    }

    default:
      return 0;
  }
}

export interface RenderOptions {
  format?: 'a4' | 'letter';
  outputPath: string;
}

export async function renderPdf(spec: DocNode, options: RenderOptions): Promise<string> {
  const doc = new PDFDocument({
    size: options.format === 'letter' ? 'LETTER' : 'A4',
    margin: tokens.spacing.page,
    autoFirstPage: true,
  });

  const writeStream = fs.createWriteStream(options.outputPath);
  doc.pipe(writeStream);

  if (spec.type === 'page') {
    let currentY = tokens.spacing.page;
    for (const child of (spec as any).children || []) {
      currentY += renderNode(child, {
        doc,
        x: tokens.spacing.page,
        y: currentY,
        width: doc.page.width - tokens.spacing.page * 2,
      });
    }
  } else {
    renderNode(spec, {
      doc,
      x: tokens.spacing.page,
      y: tokens.spacing.page,
      width: doc.page.width - tokens.spacing.page * 2,
    });
  }

  doc.end();
  await new Promise<void>((resolve) => writeStream.on('finish', resolve));

  return options.outputPath;
}

/**
 * Convert markdown to DocNode for PDF rendering
 */
export function markdownToDocNode(md: string, title?: string): DocNode {
  const children: DocNode[] = [];
  const lines = md.split('\n');
  let i = 0;

  let firstHeading: string | null = null;
  for (let j = 0; j < lines.length; j++) {
    const l = lines[j].trim();
    if (!l) continue;
    if (l.startsWith('# ')) {
      firstHeading = l.slice(2);
      break;
    }
    break;
  }

  const docTitle = title || firstHeading;
  // Skip the first heading if we're using it as the document title (either from title arg or from content)
  const skipFirstHeading = firstHeading && (title ? firstHeading === title : true);

  if (docTitle) {
    children.push({ type: 'text', variant: 'title', text: docTitle });
    children.push({ type: 'spacer', size: 8 });
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) { i++; continue; }

    if (line.startsWith('### ')) {
      children.push({ type: 'spacer', size: 8 });
      children.push({ type: 'text', variant: 'subtitle', text: line.slice(4) });
      i++; continue;
    }
    if (line.startsWith('## ')) {
      children.push({ type: 'spacer', size: 12 });
      children.push({ type: 'text', variant: 'subtitle', text: line.slice(3) });
      i++; continue;
    }
    if (line.startsWith('# ')) {
      if (skipFirstHeading && line.slice(2) === firstHeading) {
        i++; continue;
      }
      children.push({ type: 'spacer', size: 16 });
      children.push({ type: 'text', variant: 'title', text: line.slice(2) });
      i++; continue;
    }

    if (line === '---' || line === '***') {
      children.push({ type: 'divider' });
      i++; continue;
    }

    if (line.includes('|') && lines[i + 1]?.includes('---')) {
      const headers = line.split('|').map(h => h.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i].split('|').map(c => c.trim()).filter(Boolean);
        rows.push(row);
        i++;
      }
      children.push({ type: 'table', headers, rows });
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
      let listText = '';
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith('- ') || l.startsWith('* ') || /^\d+\.\s/.test(l)) {
          listText += '• ' + l.replace(/^[-*]\s|^\d+\.\s/, '') + '\n';
          i++;
        } else break;
      }
      children.push({ type: 'text', variant: 'body', text: listText.trim() });
      continue;
    }

    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].includes('|')) {
      para += ' ' + lines[i].trim();
      i++;
    }
    para = para.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
    children.push({ type: 'text', variant: 'body', text: para });
  }

  return { type: 'page', children };
}
