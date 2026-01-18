/**
 * Board Planning Workflow - AI-assisted board creation
 * 
 * Spawns an agent with board-manager skill to generate a plan,
 * then executes the plan on user approval.
 */

import { v } from "convex/values";
import { action, mutation, query, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

// ============================================
// Schema
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

// ============================================
// Generate Plan - Spawns agent to create plan
// ============================================

export const generatePlan = action({
  args: {
    workspaceId: v.string(),
    userPrompt: v.string(),
    useOpenCode: v.optional(v.boolean()), // Feature flag for new OpenCode sandbox
  },
  handler: async (ctx, args) => {
    // Use OpenCode by default for board planning (more reliable)
    const useOpenCode = args.useOpenCode !== false;
    
    // Build prompt - OpenCode uses built-in file editing
    const prompt = useOpenCode
      ? `Create a workflow board for: ${args.userPrompt}

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
- Last stage: "human" (review) or "agent" (deliver result)`
      : args.userPrompt;

    const systemPrompt = useOpenCode ? undefined : `You are CodeMode. Create workflow boards.

## Rules
- Create 3-6 stages
- First stage: usually "human" (user input)
- Middle: "agent" stages with relevant skills  
- Last: "human" (review) or "agent" (deliver)

Output a JSON plan with title, description, and stages array.`;

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

      // Wait for completion (poll session status)
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

      // Try to parse plan from response
      const response = output?.response || "";
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

      // Try to find plan in tool call results
      const toolCalls = output?.toolCalls || [];
      for (const tc of toolCalls) {
        if (tc.result && typeof tc.result === "string") {
          const jsonMatch = tc.result.match(/\{[\s\S]*"title"[\s\S]*"stages"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const plan = JSON.parse(jsonMatch[0]);
              if (plan.title && plan.stages) {
                return { success: true, sessionId, plan };
              }
            } catch {}
          }
        }
      }

      return {
        success: false,
        sessionId,
        error: "Agent did not generate a structured plan. Please try again.",
        debug: { response: response?.substring(0, 500), toolCalls: toolCalls?.length },
      };
    } catch (error: any) {
      console.error("[generatePlan] Error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

// ============================================
// Execute Plan - Creates board from approved plan
// ============================================

export const executePlan = action({
  args: {
    workspaceId: v.string(),
    plan: boardPlanSchema,
  },
  handler: async (ctx, args) => {
    const { workspaceId, plan } = args;

    try {
      // Create board
      const boardId = await ctx.runMutation(api.features.kanban.boards.create, {
        workspaceId,
        name: plan.title,
        description: plan.description,
      });

      // Create tasks for each stage
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

      return {
        success: true,
        boardId,
        taskIds,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

// ============================================
// Stream-based generation (for real-time UI)
// ============================================

export const streamGeneratePlan = internalAction({
  args: {
    workspaceId: v.string(),
    userPrompt: v.string(),
    planSessionId: v.string(), // For streaming updates
  },
  handler: async (ctx, args) => {
    // This allows streaming updates to the UI via the session
    return ctx.runAction(internal.workflows.create.board.generatePlan, {
      workspaceId: args.workspaceId,
      userPrompt: args.userPrompt,
    });
  },
});
