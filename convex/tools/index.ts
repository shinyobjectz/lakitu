/**
 * Tools Index
 *
 * Export all tool factory functions and legacy tool definitions.
 */

import type { ActionCtx } from "../_generated/server";

// Import factory functions
import { createFileTools, fileTools } from "./file";
import { createBashTool, bashTool } from "./bash";
import { createBeadsTools, beadsTools } from "./beads";
import { createArtifactTools, artifactTools } from "./artifacts";
import { createWebTools, webTools } from "./web";
import { createPdfTools, pdfTools } from "./pdf";
import { createLspTools } from "./lsp";
import { createBrowserTools } from "./browser";
import { createSubagentTools } from "./subagent";
import { createAutomationTools, automationTools } from "./automation";
import { createBoardTools, boardTools } from "./board";

// Re-export factory functions
export { createFileTools } from "./file";
export { createBashTool } from "./bash";
export { createBeadsTools } from "./beads";
export { createArtifactTools } from "./artifacts";
export { createAutomationTools } from "./automation";
export { createWebTools } from "./web";
export { createPdfTools } from "./pdf";
export { createLspTools } from "./lsp";
export { createBrowserTools } from "./browser";
export { createSubagentTools } from "./subagent";
export { createBoardTools } from "./board";

// Re-export legacy definitions
export { fileTools } from "./file";
export { bashTool } from "./bash";
export { beadsTools } from "./beads";
export { artifactTools } from "./artifacts";
export { automationTools } from "./automation";
export { webTools } from "./web";
export { pdfTools } from "./pdf";
export { boardTools } from "./board";

/**
 * Create all tools bound to a Convex action context.
 * This is the primary way to get tools for agent execution.
 */
export function createAllTools(ctx: ActionCtx): Record<string, unknown> {
  return {
    // File operations
    ...createFileTools(ctx),
    bash: createBashTool(ctx),

    // Task tracking
    ...createBeadsTools(ctx),
    ...createArtifactTools(ctx),

    // Automation (cloud-connected artifact management)
    ...createAutomationTools(ctx),

    // Web & search
    ...createWebTools(ctx),

    // PDF generation
    ...createPdfTools(ctx),

    // LSP (language intelligence)
    ...createLspTools(ctx),

    // Browser automation
    ...createBrowserTools(ctx),

    // Subagent orchestration
    ...createSubagentTools(ctx),

    // Board management (create & run workflows)
    ...createBoardTools(ctx),
  };
}

/**
 * Create a subset of tools for subagents
 */
export function createSubagentToolset(ctx: ActionCtx, toolNames: string[]) {
  const allTools = createAllTools(ctx);
  const subset: Record<string, any> = {};

  for (const name of toolNames) {
    if (name in allTools) {
      subset[name] = (allTools as any)[name];
    }
  }

  return subset;
}

/**
 * Legacy combined tools object (without execute functions)
 */
export const allToolDefinitions = {
  ...fileTools,
  bash: bashTool,
  ...beadsTools,
  ...artifactTools,
  ...automationTools,
  ...webTools,
  ...boardTools,
};
