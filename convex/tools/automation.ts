/**
 * Automation Tools
 *
 * Cloud-connected tools for managing artifacts across kanban card stages.
 * These tools call the cloud Convex gateway to read/write artifacts that
 * persist across sandbox sessions.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";

// Module-level gateway config (set by agent/index.ts)
let gatewayConfig: { convexUrl: string; jwt: string; cardId?: string } | null = null;

/**
 * Set the gateway config for automation tools.
 * Called by the agent when starting a thread.
 */
export function setAutomationGatewayConfig(config: { convexUrl: string; jwt: string; cardId?: string }) {
  gatewayConfig = config;
}

/**
 * Call a cloud Convex service via the gateway.
 */
async function callCloudService(
  servicePath: string,
  args: Record<string, unknown>,
  type: "query" | "action" | "mutation" = "query"
): Promise<any> {
  const convexUrl = gatewayConfig?.convexUrl || process.env.CONVEX_URL;
  const jwt = gatewayConfig?.jwt || process.env.SANDBOX_JWT;

  if (!convexUrl || !jwt) {
    console.log("[automation] Gateway not configured");
    return { error: "Gateway not configured" };
  }

  try {
    const response = await fetch(`${convexUrl}/agent/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        path: servicePath,
        type,
        args,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[automation] Cloud call failed: ${error}`);
      return { error };
    }

    const result = await response.json();
    if (!result.ok) {
      console.error(`[automation] Cloud error: ${result.error}`);
      return { error: result.error };
    }

    return result.data;
  } catch (error) {
    console.error(`[automation] Cloud exception: ${error}`);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create automation tools bound to a Convex action context.
 * Note: automation_saveArtifact is provided as an alias in artifacts.ts
 */
export function createAutomationTools(ctx: ActionCtx) {
  return {
    // automation_saveArtifact is provided in artifacts.ts as alias to artifact_save

    automation_readArtifact: tool({
      description:
        "Read an artifact from a previous stage by its ID. Use this to access documents created in earlier stages.",
      parameters: z.object({
        artifactId: z.string().describe("ID of the artifact to read (from context artifacts list)"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.artifacts.getArtifact",
          { artifactId: args.artifactId },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error };
        }

        if (!result) {
          return { success: false, error: `Artifact not found: ${args.artifactId}` };
        }

        console.log(`[automation] Read artifact from cloud: ${result.name}`);
        return {
          success: true,
          name: result.name,
          type: result.type,
          content: result.content,
          createdAt: result.createdAt,
          metadata: result.metadata,
        };
      },
    }),

    automation_listArtifacts: tool({
      description:
        "List all artifacts for the current card. Shows artifacts from all stages.",
      parameters: z.object({}),
      execute: async () => {
        const cardId = gatewayConfig?.cardId || process.env.CARD_ID;
        if (!cardId) {
          return { success: false, error: "No cardId available", artifacts: [] };
        }

        const result = await callCloudService(
          "features.kanban.artifacts.listCardArtifacts",
          { cardId },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error, artifacts: [] };
        }

        const artifacts = Array.isArray(result) ? result : [];
        console.log(`[automation] Listed ${artifacts.length} artifacts from cloud`);
        return {
          success: true,
          artifacts: artifacts.map((a: any) => ({
            id: a._id,
            name: a.name,
            type: a.type,
            createdAt: a.createdAt,
          })),
          count: artifacts.length,
        };
      },
    }),

    automation_getContext: tool({
      description:
        "Get the current card's context including variables and artifact references.",
      parameters: z.object({}),
      execute: async () => {
        const cardId = gatewayConfig?.cardId || process.env.CARD_ID;
        if (!cardId) {
          return { success: false, error: "No cardId available" };
        }

        const result = await callCloudService(
          "features.kanban.executor.getCardContext",
          { cardId },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error };
        }

        console.log(`[automation] Got card context from cloud`);
        return {
          success: true,
          cardId,
          workspaceId: result.workspaceId,
          variables: result.variables || {},
          artifactCount: (result.artifacts || []).length,
        };
      },
    }),

    automation_setVariable: tool({
      description:
        "Set a variable in the card context. Variables persist across stages.",
      parameters: z.object({
        key: z.string().describe("Variable name"),
        value: z.any().describe("Variable value (any JSON-serializable value)"),
      }),
      execute: async (args) => {
        const cardId = gatewayConfig?.cardId || process.env.CARD_ID;
        if (!cardId) {
          return { success: false, error: "No cardId available" };
        }

        const result = await callCloudService(
          "features.kanban.executor.setVariable",
          {
            cardId,
            key: args.key,
            value: args.value,
          },
          "mutation"
        );

        if (result.error) {
          return { success: false, error: result.error };
        }

        console.log(`[automation] Set variable ${args.key} in cloud`);
        return {
          success: true,
          key: args.key,
          message: `Variable set: ${args.key}`,
        };
      },
    }),
  };
}

// Legacy export for compatibility
// Note: automation_saveArtifact is defined in artifacts.ts as alias to artifact_save
export const automationTools = {
  automation_readArtifact: {
    description: "Read an artifact from a previous stage",
    parameters: z.object({
      artifactId: z.string(),
    }),
  },
  automation_listArtifacts: {
    description: "List all artifacts for the current card",
    parameters: z.object({}),
  },
  automation_getContext: {
    description: "Get the current card's context",
    parameters: z.object({}),
  },
  automation_setVariable: {
    description: "Set a variable in the card context",
    parameters: z.object({
      key: z.string(),
      value: z.any(),
    }),
  },
};
