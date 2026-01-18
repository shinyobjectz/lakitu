/**
 * DocNode Schema - Layout primitives for PDF generation
 */

export type TextVariant = 'title' | 'subtitle' | 'body' | 'caption';
export type Alignment = 'left' | 'center' | 'right';
export type StackDirection = 'row' | 'column';

export type DocNode =
  | PageNode
  | StackNode
  | CardNode
  | TextNode
  | TableNode
  | SpacerNode
  | DividerNode
  | ImageNode;

export interface PageNode {
  type: 'page';
  children: DocNode[];
  backgroundColor?: string;
}

export interface StackNode {
  type: 'stack';
  direction: StackDirection;
  gap?: number;
  children: DocNode[];
}

export interface CardNode {
  type: 'card';
  padding?: number;
  radius?: number;
  backgroundColor?: string;
  children: DocNode[];
}

export interface TextNode {
  type: 'text';
  text: string;
  variant?: TextVariant;
  color?: string;
  align?: Alignment;
}

export interface TableNode {
  type: 'table';
  headers: string[];
  rows: string[][];
  headerBg?: string;
}

export interface SpacerNode {
  type: 'spacer';
  size: number;
}

export interface DividerNode {
  type: 'divider';
  color?: string;
}

export interface ImageNode {
  type: 'image';
  src: string;
  width?: number;
  height?: number;
}

export const tokens = {
  colors: {
    primary: '#1D4ED8',
    primaryLight: '#EFF6FF',
    background: '#F3F4F6',
    text: '#111827',
    textMuted: '#4B5563',
    textCaption: '#9CA3AF',
    white: '#FFFFFF',
    divider: '#E5E7EB',
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
    title: { size: 22, font: 'Helvetica-Bold', lineGap: 10 },
    subtitle: { size: 14, font: 'Helvetica-Bold', lineGap: 6 },
    body: { size: 11, font: 'Helvetica', lineGap: 6 },
    caption: { size: 9, font: 'Helvetica', lineGap: 4 },
  },
} as const;
