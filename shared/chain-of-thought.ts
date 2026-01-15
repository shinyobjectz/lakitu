/**
 * Chain of Thought Types
 * 
 * Structured schema for rich UI display of agent activities.
 * Each step type maps to a specific UI component in the frontend.
 */

// ============================================
// Step Status
// ============================================

export type StepStatus = "pending" | "active" | "complete" | "error";

// ============================================
// Base Step
// ============================================

interface BaseStep {
  id: string;
  timestamp: number;
  status: StepStatus;
}

// ============================================
// Step Types
// ============================================

/** Search with results (web_search, web_social lookups) */
export interface SearchStep extends BaseStep {
  type: "search";
  label: string;
  results?: Array<{ url: string; title?: string }>;
}

/** Image found or generated (screenshots, avatars, generated images) */
export interface ImageStep extends BaseStep {
  type: "image";
  label: string;
  src: string;
  caption?: string;
}

/** Text insight or finding (summaries, extracted info) */
export interface TextStep extends BaseStep {
  type: "text";
  label: string;
}

/** Generic tool execution (fallback for unmapped tools) */
export interface ToolStep extends BaseStep {
  type: "tool";
  toolName: string;
  label: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

/** Agent thinking/reasoning */
export interface ThinkingStep extends BaseStep {
  type: "thinking";
  label: string;
}

/** File operation (read, write, edit, artifact save) */
export interface FileStep extends BaseStep {
  type: "file";
  operation: "read" | "write" | "edit" | "save";
  path: string;
  label: string;
}

/** Browser automation action */
export interface BrowserStep extends BaseStep {
  type: "browser";
  action: "navigate" | "click" | "type" | "screenshot" | "scroll";
  label: string;
  url?: string;
  screenshot?: string;
}

// ============================================
// Union Type
// ============================================

export type ChainOfThoughtStep =
  | SearchStep
  | ImageStep
  | TextStep
  | ToolStep
  | ThinkingStep
  | FileStep
  | BrowserStep;

// ============================================
// Helpers
// ============================================

let stepCounter = 0;

export function createStepId(): string {
  return `step_${Date.now()}_${++stepCounter}`;
}

export function createStep<T extends ChainOfThoughtStep>(
  step: Omit<T, "id" | "timestamp" | "status"> & { status?: StepStatus }
): T {
  return {
    id: createStepId(),
    timestamp: Date.now(),
    status: "active",
    ...step,
  } as T;
}

/** Map tool names to step types for automatic conversion */
export const TOOL_STEP_MAP: Record<string, ChainOfThoughtStep["type"]> = {
  // Search tools
  web_search: "search",
  web_social: "search",
  web_news: "search",
  // Browser tools
  browser_open: "browser",
  browser_click: "browser",
  browser_type: "browser",
  browser_screenshot: "browser",
  browser_scroll: "browser",
  browser_snapshot: "browser",
  // File tools
  file_read: "file",
  file_write: "file",
  file_edit: "file",
  artifact_save: "file",
  automation_saveArtifact: "file",
  pdf_create: "file",
  // Default fallback is "tool"
};

/** Get the step type for a tool name */
export function getStepTypeForTool(toolName: string): ChainOfThoughtStep["type"] {
  return TOOL_STEP_MAP[toolName] || "tool";
}
