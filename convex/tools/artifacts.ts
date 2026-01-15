/**
 * Artifact Tools
 *
 * Save and retrieve important outputs that persist
 * after the agent session ends.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";

// Module-level gateway config (set by agent/index.ts)
let gatewayConfig: { convexUrl: string; jwt: string; cardId?: string } | null = null;

/**
 * Set the gateway config for artifact tools.
 * Called by the agent when starting a thread.
 */
export function setArtifactGatewayConfig(config: { convexUrl: string; jwt: string; cardId?: string }) {
  gatewayConfig = config;
}

/**
 * Save artifact to cloud via gateway.
 */
async function saveToCloud(artifact: {
  name: string;
  type: string;
  content: string;
  cardId?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const convexUrl = gatewayConfig?.convexUrl || process.env.CONVEX_URL;
  const jwt = gatewayConfig?.jwt || process.env.SANDBOX_JWT;
  const cardId = artifact.cardId || gatewayConfig?.cardId || process.env.CARD_ID;

  if (!convexUrl || !jwt) {
    console.log("[artifacts] Gateway not configured, saving locally only");
    return { success: false, error: "Gateway not configured" };
  }

  if (!cardId) {
    console.log("[artifacts] No cardId available, saving locally only");
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
        type: "action",
        args: {
          cardId,
          artifact: {
            name: artifact.name,
            type: artifact.type,
            content: artifact.content,
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[artifacts] Cloud save failed: ${error}`);
      return { success: false, error };
    }

    const result = await response.json();
    if (!result.ok) {
      console.error(`[artifacts] Cloud save error: ${result.error}`);
      return { success: false, error: result.error };
    }

    console.log(`[artifacts] Saved to cloud: ${artifact.name}`);
    return { success: true, id: result.data };
  } catch (error) {
    console.error(`[artifacts] Cloud save exception: ${error}`);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create artifact tools bound to a Convex action context.
 */
export function createArtifactTools(ctx: ActionCtx) {
  // Create the save artifact tool once, expose under multiple names for compatibility
  const saveArtifactTool = tool({
    description:
      "Save text/markdown artifacts. For PDF files, use pdf_create instead - this tool cannot create PDFs.",
      parameters: z.object({
        name: z.string().describe("Name for the artifact (e.g. 'Important Info.md')"),
        content: z.string().optional().describe("Content to save (for text artifacts)"),
        path: z.string().optional().describe("Path to file to save as artifact"),
        type: z.string().default("text/markdown").describe("Type: text/markdown, json, csv. NOT pdf - use pdf_create for PDFs"),
        metadata: z.record(z.any()).optional(),
      }),
      execute: async (args) => {
        // Reject PDF type - must use pdf_create tool instead
        if (args.type === 'pdf' || args.type === 'application/pdf') {
          return {
            success: false,
            error: "Cannot save PDF with this tool. Use the pdf_create tool to generate and save PDFs.",
          };
        }

        let content = args.content;
        let size = 0;

        // If path provided, read from file via action
        if (args.path && !content) {
          const result = await ctx.runAction(internal.actions.file.readFile, {
            path: args.path,
          });

          if (!result.success) {
            return {
              success: false,
              error: `Failed to read file: ${result.error}`,
            };
          }

          content = result.content;
          size = result.size || 0;
        }

        if (!content) {
          return {
            success: false,
            error: "Either content or path must be provided",
          };
        }

        size = size || content.length;

        // Save to local sandbox database
        const localId = await ctx.runMutation(api.state.artifacts.save, {
          name: args.name,
          type: args.type,
          content,
          path: args.path || `/artifacts/${args.name}`,
          size,
          metadata: args.metadata,
        });

        // Sync to cloud immediately (don't just queue)
        const cloudResult = await saveToCloud({
          name: args.name,
          type: args.type,
          content,
        });

        return {
          success: true,
          id: cloudResult.id || localId,
          name: args.name,
          size,
          syncedToCloud: cloudResult.success,
          message: `Saved artifact: ${args.name}${cloudResult.success ? " (synced to cloud)" : " (local only)"}`,
        };
      },
    });

  return {
    // Expose save artifact under multiple names for compatibility
    artifact_save: saveArtifactTool,
    automation_saveArtifact: saveArtifactTool, // Alias for prompt compatibility

    artifact_read: tool({
      description: "Read a previously saved artifact",
      parameters: z.object({
        name: z.string().describe("Name of the artifact to read"),
      }),
      execute: async (args) => {
        const artifact = await ctx.runQuery(api.state.artifacts.getByName, {
          name: args.name,
        });

        if (!artifact) {
          return {
            success: false,
            error: `Artifact not found: ${args.name}`,
          };
        }

        return {
          success: true,
          name: artifact.name,
          type: artifact.type,
          content: artifact.content,
          size: artifact.size,
          createdAt: artifact.createdAt,
          metadata: artifact.metadata,
        };
      },
    }),

    artifact_list: tool({
      description: "List all saved artifacts",
      parameters: z.object({
        limit: z.number().default(50),
      }),
      execute: async (args) => {
        const artifacts = await ctx.runQuery(api.state.artifacts.list, {
          limit: args.limit,
        });

        return {
          success: true,
          artifacts: artifacts.map((a: { _id: string; name: string; type: string; size: number; createdAt: number }) => ({
            id: a._id,
            name: a.name,
            type: a.type,
            size: a.size,
            createdAt: a.createdAt,
          })),
          count: artifacts.length,
        };
      },
    }),
  };
}

// Legacy export for compatibility
export const artifactTools = {
  artifact_save: {
    description: "Save an important output as an artifact",
    parameters: z.object({
      name: z.string(),
      content: z.string().optional(),
      path: z.string().optional(),
      type: z.string().default("text/plain"),
      metadata: z.record(z.any()).optional(),
    }),
  },
  artifact_read: {
    description: "Read a saved artifact",
    parameters: z.object({
      name: z.string(),
    }),
  },
  artifact_list: {
    description: "List all saved artifacts",
    parameters: z.object({
      limit: z.number().default(50),
    }),
  },
};
