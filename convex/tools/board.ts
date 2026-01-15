/**
 * Board Management Tools
 *
 * Cloud-connected tools for agents to create, run, and manage kanban boards.
 * These tools enable agents to orchestrate workflows through the board system.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";

// Module-level gateway config (set by agent/index.ts)
let gatewayConfig: { convexUrl: string; jwt: string; userId?: string } | null = null;

/**
 * Set the gateway config for board tools.
 * Called by the agent when starting a thread.
 */
export function setBoardGatewayConfig(config: { convexUrl: string; jwt: string; userId?: string }) {
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
    console.log("[board] Gateway not configured");
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
      console.error(`[board] Cloud call failed: ${error}`);
      return { error };
    }

    const result = await response.json();
    if (!result.ok) {
      console.error(`[board] Cloud error: ${result.error}`);
      return { error: result.error };
    }

    return result.data;
  } catch (error) {
    console.error(`[board] Cloud exception: ${error}`);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create board management tools bound to a Convex action context.
 */
export function createBoardTools(ctx: ActionCtx) {
  return {
    board_createFromTemplate: tool({
      description:
        "Create a new board from a predefined template. Templates provide ready-to-use workflows for common tasks like research, content creation, and data analysis.",
      parameters: z.object({
        templateId: z.enum([
          "research-report",
          "content-pipeline",
          "data-analysis",
          "competitor-research",
          "social-monitoring",
        ]).describe("The template ID to use"),
        name: z.string().optional().describe("Custom name for the board (defaults to template name)"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.templates.createBoardFromTemplate",
          {
            templateId: args.templateId,
            name: args.name,
          },
          "mutation"
        );

        if (result.error) {
          return { success: false, error: result.error };
        }

        console.log(`[board] Created board from template ${args.templateId}: ${result}`);
        return {
          success: true,
          boardId: result,
          message: `Board created from template "${args.templateId}"`,
        };
      },
    }),

    board_listTemplates: tool({
      description:
        "List all available board templates. Use this to discover what workflow templates are available before creating a board.",
      parameters: z.object({
        category: z.enum(["research", "content", "data", "automation", "custom"]).optional()
          .describe("Filter templates by category"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.templates.listTemplates",
          { category: args.category },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error, templates: [] };
        }

        console.log(`[board] Listed ${result.length} templates`);
        return {
          success: true,
          templates: result,
          count: result.length,
        };
      },
    }),

    board_trigger: tool({
      description:
        "Trigger a board workflow by sending a message or data. This starts a new card/project on the board and runs through its stages.",
      parameters: z.object({
        boardId: z.string().describe("ID of the board to trigger"),
        message: z.string().describe("The message or prompt to start the workflow"),
        source: z.enum(["chat", "form", "webhook"]).default("chat")
          .describe("The trigger source type"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.triggers.triggerCard",
          {
            boardId: args.boardId,
            data: { message: args.message },
            source: args.source,
          },
          "mutation"
        );

        if (result.error) {
          return { success: false, error: result.error };
        }

        console.log(`[board] Triggered board ${args.boardId}, created card: ${result}`);
        return {
          success: true,
          cardId: result,
          message: `Workflow started. Card ID: ${result}`,
        };
      },
    }),

    board_getCardStatus: tool({
      description:
        "Get the status of a card/project to check if it has completed or is still running.",
      parameters: z.object({
        cardId: z.string().describe("ID of the card to check"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.boards.getCard",
          { id: args.cardId },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error };
        }

        if (!result) {
          return { success: false, error: "Card not found" };
        }

        console.log(`[board] Card ${args.cardId} status: ${result.status}`);
        return {
          success: true,
          cardId: args.cardId,
          status: result.status,
          stageName: result.taskName,
          artifactCount: result.context?.artifacts?.length || 0,
        };
      },
    }),

    board_getCardArtifacts: tool({
      description:
        "Get all artifacts produced by a card/project. Use this to retrieve the outputs of a completed workflow.",
      parameters: z.object({
        cardId: z.string().describe("ID of the card"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.boards.getCardWithArtifacts",
          { id: args.cardId },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error, artifacts: [] };
        }

        if (!result) {
          return { success: false, error: "Card not found", artifacts: [] };
        }

        console.log(`[board] Retrieved ${result.artifacts?.length || 0} artifacts for card ${args.cardId}`);
        return {
          success: true,
          cardId: args.cardId,
          status: result.status,
          artifacts: result.artifacts || [],
          count: result.artifacts?.length || 0,
        };
      },
    }),

    board_listCards: tool({
      description:
        "List all cards/projects on a board. Optionally filter by status.",
      parameters: z.object({
        boardId: z.string().describe("ID of the board"),
        status: z.enum(["pending", "queued", "running", "done", "error", "cancelled"]).optional()
          .describe("Filter by card status"),
      }),
      execute: async (args) => {
        const result = await callCloudService(
          "features.kanban.boards.get",
          { id: args.boardId },
          "query"
        );

        if (result.error) {
          return { success: false, error: result.error, cards: [] };
        }

        if (!result) {
          return { success: false, error: "Board not found", cards: [] };
        }

        let cards = result.cards || [];
        if (args.status) {
          cards = cards.filter((c: any) => c.status === args.status);
        }

        console.log(`[board] Listed ${cards.length} cards for board ${args.boardId}`);
        return {
          success: true,
          boardId: args.boardId,
          cards: cards.map((c: any) => ({
            id: c._id,
            name: c.name,
            status: c.status,
            createdAt: c.createdAt,
          })),
          count: cards.length,
        };
      },
    }),

    board_waitForCompletion: tool({
      description:
        "Wait for a card to complete. Polls the status until done, error, or timeout. Returns the final status and artifacts.",
      parameters: z.object({
        cardId: z.string().describe("ID of the card to wait for"),
        timeoutSeconds: z.number().default(300).describe("Maximum time to wait in seconds (default 5 min)"),
        pollIntervalSeconds: z.number().default(5).describe("How often to check status (default 5 seconds)"),
      }),
      execute: async (args) => {
        const startTime = Date.now();
        const timeoutMs = args.timeoutSeconds * 1000;
        const pollMs = args.pollIntervalSeconds * 1000;

        while (Date.now() - startTime < timeoutMs) {
          const result = await callCloudService(
            "features.kanban.boards.getCard",
            { id: args.cardId },
            "query"
          );

          if (result.error) {
            return { success: false, error: result.error };
          }

          if (!result) {
            return { success: false, error: "Card not found" };
          }

          // Check if terminal state
          if (["done", "error", "cancelled"].includes(result.status)) {
            // Get artifacts if done
            if (result.status === "done") {
              const artifactsResult = await callCloudService(
                "features.kanban.boards.getCardWithArtifacts",
                { id: args.cardId },
                "query"
              );

              return {
                success: true,
                completed: true,
                status: result.status,
                cardId: args.cardId,
                artifacts: artifactsResult?.artifacts || [],
                durationMs: Date.now() - startTime,
              };
            }

            return {
              success: true,
              completed: true,
              status: result.status,
              cardId: args.cardId,
              error: result.status === "error" ? result.error : undefined,
              durationMs: Date.now() - startTime,
            };
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          console.log(`[board] Waiting for card ${args.cardId} (status: ${result.status})`);
        }

        return {
          success: true,
          completed: false,
          status: "timeout",
          cardId: args.cardId,
          durationMs: Date.now() - startTime,
          message: "Timed out waiting for completion",
        };
      },
    }),

    board_runWorkflow: tool({
      description:
        "Convenience tool: Create a board from template, trigger it with a message, and wait for completion. Returns the final artifacts.",
      parameters: z.object({
        templateId: z.enum([
          "research-report",
          "content-pipeline",
          "data-analysis",
          "competitor-research",
          "social-monitoring",
        ]).describe("The template ID to use"),
        message: z.string().describe("The message/prompt to start the workflow"),
        boardName: z.string().optional().describe("Custom name for the board"),
        waitForCompletion: z.boolean().default(true).describe("Whether to wait for the workflow to finish"),
        timeoutSeconds: z.number().default(600).describe("Max time to wait (default 10 min)"),
      }),
      execute: async (args) => {
        // Step 1: Create board from template
        const createResult = await callCloudService(
          "features.kanban.templates.createBoardFromTemplate",
          {
            templateId: args.templateId,
            name: args.boardName,
          },
          "mutation"
        );

        if (createResult.error) {
          return { success: false, error: `Failed to create board: ${createResult.error}` };
        }

        const boardId = createResult;
        console.log(`[board] Created board ${boardId} from template ${args.templateId}`);

        // Step 2: Trigger the board
        const triggerResult = await callCloudService(
          "features.kanban.triggers.triggerCard",
          {
            boardId,
            data: { message: args.message },
            source: "chat",
          },
          "mutation"
        );

        if (triggerResult.error) {
          return {
            success: false,
            error: `Failed to trigger workflow: ${triggerResult.error}`,
            boardId,
          };
        }

        const cardId = triggerResult;
        console.log(`[board] Triggered workflow, card: ${cardId}`);

        if (!args.waitForCompletion) {
          return {
            success: true,
            boardId,
            cardId,
            status: "started",
            message: "Workflow started. Use board_waitForCompletion to check status.",
          };
        }

        // Step 3: Wait for completion
        const startTime = Date.now();
        const timeoutMs = args.timeoutSeconds * 1000;
        const pollMs = 5000; // 5 second intervals

        while (Date.now() - startTime < timeoutMs) {
          const statusResult = await callCloudService(
            "features.kanban.boards.getCard",
            { id: cardId },
            "query"
          );

          if (statusResult.error) {
            return {
              success: false,
              error: `Failed to check status: ${statusResult.error}`,
              boardId,
              cardId,
            };
          }

          if (["done", "error", "cancelled"].includes(statusResult.status)) {
            // Get artifacts if done
            if (statusResult.status === "done") {
              const artifactsResult = await callCloudService(
                "features.kanban.boards.getCardWithArtifacts",
                { id: cardId },
                "query"
              );

              return {
                success: true,
                boardId,
                cardId,
                status: "done",
                artifacts: artifactsResult?.artifacts || [],
                durationMs: Date.now() - startTime,
              };
            }

            return {
              success: statusResult.status !== "error",
              boardId,
              cardId,
              status: statusResult.status,
              error: statusResult.error,
              durationMs: Date.now() - startTime,
            };
          }

          await new Promise((resolve) => setTimeout(resolve, pollMs));
          console.log(`[board] Waiting... (status: ${statusResult.status})`);
        }

        return {
          success: false,
          boardId,
          cardId,
          status: "timeout",
          error: "Workflow timed out",
          durationMs: Date.now() - startTime,
        };
      },
    }),
  };
}

// Legacy export for tool definitions (without execute functions)
export const boardTools = {
  board_createFromTemplate: {
    description: "Create a new board from a predefined template",
    parameters: z.object({
      templateId: z.string(),
      name: z.string().optional(),
    }),
  },
  board_listTemplates: {
    description: "List all available board templates",
    parameters: z.object({
      category: z.string().optional(),
    }),
  },
  board_trigger: {
    description: "Trigger a board workflow with a message",
    parameters: z.object({
      boardId: z.string(),
      message: z.string(),
      source: z.string().optional(),
    }),
  },
  board_getCardStatus: {
    description: "Get the status of a card/project",
    parameters: z.object({
      cardId: z.string(),
    }),
  },
  board_getCardArtifacts: {
    description: "Get all artifacts produced by a card",
    parameters: z.object({
      cardId: z.string(),
    }),
  },
  board_listCards: {
    description: "List all cards on a board",
    parameters: z.object({
      boardId: z.string(),
      status: z.string().optional(),
    }),
  },
  board_waitForCompletion: {
    description: "Wait for a card to complete",
    parameters: z.object({
      cardId: z.string(),
      timeoutSeconds: z.number().optional(),
    }),
  },
  board_runWorkflow: {
    description: "Create a board from template, run it, and wait for completion",
    parameters: z.object({
      templateId: z.string(),
      message: z.string(),
      boardName: z.string().optional(),
      waitForCompletion: z.boolean().optional(),
      timeoutSeconds: z.number().optional(),
    }),
  },
};
