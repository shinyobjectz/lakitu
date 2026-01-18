/**
 * Prompt-Based Agent Execution
 * 
 * Simple prompt execution for tasks that don't need board workflow:
 * - Board planning / generation
 * - Direct research queries
 * - One-off content generation
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { getToolDocs, PURPOSE_TOOLS } from "@agent/metadata";

// ============================================
// Simple Prompt Execution
// ============================================

/** Run a simple prompt and get results */
export const runPrompt = action({
  args: {
    projectId: v.string(),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    tools: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Combine prompts for Lakitu
      const fullPrompt = args.systemPrompt
        ? `${args.systemPrompt}\n\n---\n\n${args.prompt}`
        : args.prompt;

      // Start Lakitu sandbox session
      const result = await ctx.runAction(api.workflows.sandboxConvex.startSession, {
        projectId: args.projectId,
        prompt: fullPrompt,
        config: {
          model: args.model || "anthropic/claude-3.5-haiku",
          tools: args.tools || [],
        },
      });

      if (!result.success) {
        return { success: false, error: result.error || "Failed to start session" };
      }

      const sessionId = result.sessionId;

      // Wait for completion
      let session: any = null;
      for (let i = 0; i < 300; i++) { // 5 min max
        await new Promise(r => setTimeout(r, 1000));
        session = await ctx.runQuery(api.workflows.sandboxConvex.getSession, { sessionId });

        if (session?.status === "completed" || session?.status === "failed") {
          break;
        }
      }

      if (!session || session.status !== "completed") {
        return { success: false, sessionId, error: "Timeout or session failed" };
      }

      const output = session.output as any;
      return {
        success: true,
        sessionId,
        output: output?.response || "",
        artifacts: output?.artifacts || [],
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

// ============================================
// Board Planning (Generate + Execute)
// ============================================

const boardPlanSchema = v.object({
  title: v.string(),
  description: v.string(),
  stages: v.array(v.object({
    name: v.string(),
    type: v.union(v.literal("agent"), v.literal("human")),
    description: v.string(),
    skillId: v.optional(v.string()),
    order: v.number(),
  })),
});

/** Generate a board plan from user prompt */
export const generateBoardPlan = action({
  args: {
    workspaceId: v.string(),
    userPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    const prompt = `Create a workflow board for: ${args.userPrompt}

Write a JSON file to /home/user/workspace/board_plan.json with this structure:
{
  "title": "Board name",
  "description": "What this workflow accomplishes", 
  "stages": [
    {"name": "Stage Name", "type": "agent" or "human", "description": "What happens", "order": 0}
  ]
}

Rules:
- Create 3-6 stages
- First stage: usually "human" (user provides input)
- Middle stages: "agent" (AI automated tasks)
- Last stage: "human" (review) or "agent" (deliver result)`;

    try {
      // Start Lakitu sandbox session
      const result = await ctx.runAction(api.workflows.sandboxConvex.startSession, {
        projectId: args.workspaceId,
        prompt,
        config: {
          model: "anthropic/claude-3.5-haiku",
          purpose: "board-planning",
        },
      });

      if (!result.success) {
        return { success: false, error: result.error || "Failed to start session" };
      }

      const sessionId = result.sessionId;

      // Wait for completion
      let session: any = null;
      for (let i = 0; i < 120; i++) { // 2 min max for planning
        await new Promise(r => setTimeout(r, 1000));
        session = await ctx.runQuery(api.workflows.sandboxConvex.getSession, { sessionId });

        if (session?.status === "completed" || session?.status === "failed") {
          break;
        }
      }

      if (!session || session.status !== "completed") {
        return { success: false, sessionId, error: "Timeout or session failed" };
      }

      const output = session.output as any;
      const response = output?.response || "";

      // Try to parse plan from response
      if (response) {
        const jsonMatch = response.match(/\{[\s\S]*"title"[\s\S]*"stages"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const plan = JSON.parse(jsonMatch[0]);
            if (plan.title && plan.stages) {
              return { success: true, sessionId, plan };
            }
          } catch {}
        }
      }

      return {
        success: false,
        sessionId,
        error: "Agent did not generate a structured plan",
        debug: { response: response?.substring(0, 500) },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/** Execute an approved board plan */
export const executeBoardPlan = action({
  args: {
    workspaceId: v.string(),
    plan: boardPlanSchema,
  },
  handler: async (ctx, args) => {
    const { workspaceId, plan } = args;

    try {
      const boardId = await ctx.runMutation(api.features.kanban.boards.create, {
        workspaceId,
        name: plan.title,
        description: plan.description,
      });

      const taskIds: string[] = [];
      for (const stage of plan.stages) {
        const taskId = await ctx.runMutation(api.features.kanban.boards.addTask, {
          boardId,
          name: stage.name,
          description: stage.description,
          stageType: stage.type,
          skillId: stage.skillId,
          order: stage.order,
        });
        taskIds.push(taskId);
      }

      return { success: true, boardId, taskIds };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

// ============================================
// Research Queries
// ============================================

/** Run a research query */
export const runResearch = action({
  args: {
    projectId: v.string(),
    query: v.string(),
    depth: v.optional(v.union(v.literal("quick"), v.literal("thorough"))),
  },
  handler: async (ctx, args) => {
    const tools = ["web", "vfs"];
    const prompt = args.depth === "thorough"
      ? `Research thoroughly: ${args.query}\n\nSave findings to /home/user/workspace/research.md`
      : `Quick research: ${args.query}\n\nProvide a concise summary.`;

    try {
      // Start Lakitu sandbox session
      const result = await ctx.runAction(api.workflows.sandboxConvex.startSession, {
        projectId: args.projectId,
        prompt,
        config: { tools, purpose: "research" },
      });

      if (!result.success) {
        return { success: false, error: result.error || "Failed to start session" };
      }

      const sessionId = result.sessionId;

      // Wait for completion
      let session: any = null;
      for (let i = 0; i < 300; i++) { // 5 min max for research
        await new Promise(r => setTimeout(r, 1000));
        session = await ctx.runQuery(api.workflows.sandboxConvex.getSession, { sessionId });

        if (session?.status === "completed" || session?.status === "failed") {
          break;
        }
      }

      if (!session || session.status !== "completed") {
        return { success: false, sessionId, error: "Timeout or session failed" };
      }

      const output = session.output as any;
      return {
        success: true,
        sessionId,
        output: output?.response || "",
        artifacts: output?.artifacts || [],
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});
