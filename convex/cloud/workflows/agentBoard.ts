import { v } from "convex/values";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, api, internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import { buildSystemPrompt } from "../utils/kanbanContext";

const workflow = new WorkflowManager(components.workflow);

/**
 * Card Execution Workflow - Durable multi-stage pipeline
 * 
 * Each step waits for completion before proceeding:
 * 1. Setup - Load card, board, task
 * 2. Run Agent - Execute in E2B sandbox (waits for completion)
 * 3. Collect Artifacts - Gather files from sandbox workspace
 * 4. QA Check - Verify deliverables are met
 * 5. Advance/Block - Move to next stage or block workflow
 */
export const cardExecutionWorkflow = workflow.define({
  args: {
    cardId: v.string(),
    boardId: v.string(),
    taskId: v.string(),
    runId: v.string(),
  },
  handler: async (step, args) => {
    const { cardId, boardId, taskId, runId } = args;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: SETUP - Load entities and validate
    // ═══════════════════════════════════════════════════════════════════════
    const card = await step.runQuery(internal.features.kanban.boards.getCardInternal, { id: cardId });
    if (!card) throw new Error("Card not found");

    const board = await step.runQuery(internal.features.kanban.boards.getInternal, { id: boardId });
    if (!board) throw new Error("Board not found");

    const task = board.tasks.find((t: any) => t._id === taskId);
    if (!task) throw new Error("Task not found");

    // Skip if not an agent stage
    const isAgentStage = task.stageType === "agent" || !task.stageType;
    const hasAutomation = task.automation?.enabled;
    if (!isAgentStage && !hasAutomation) {
      console.log(`⏭️ Stage ${task.name} is not agent type, skipping`);
      return { skipped: true, cardId };
    }

    // Mark as running
    await step.runMutation(internal.features.kanban.executor.updateCardRunStatus, { runId, status: "running" });
    await step.runMutation(internal.features.kanban.boards.updateCardStatusInternal, { id: cardId, status: "running" });
    console.log(`📍 Stage "${task.name}" starting for card ${cardId}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: RUN AGENT - Execute in E2B sandbox (waits for completion)
    // ═══════════════════════════════════════════════════════════════════════
    
    // Query artifacts from table (single source of truth) for context
    const artifacts = await step.runQuery(api.features.kanban.artifacts.listCardArtifacts, { cardId });
    const cardWithArtifacts = {
      ...card,
      context: {
        ...card.context,
        artifacts: artifacts.map((a: any) => ({ id: a._id, type: a.type, name: a.name, createdAt: a.createdAt })),
      },
    };
    
    const systemPrompt = buildSystemPrompt(board, task, cardWithArtifacts as any, board.tasks);
    let userPrompt = task.automation?.prompt ||
      (card.context?.variables?.message as string) ||
      `Complete the "${task.name}" stage for this project.`;

    // Check for retry context and add problem details to prompt
    const retryContext = (card.context?.variables as any)?._retryContext;
    if (retryContext?.isRetry) {
      console.log(`🔄 This is retry #${retryContext.retryCount} - adding problem context to prompt`);
      const problem = retryContext.previousProblem;
      const retryGuidance = `

## ⚠️ RETRY CONTEXT - IMPORTANT

This is retry attempt #${retryContext.retryCount}. The previous attempt had issues:

**Problem:** ${problem.type}
**Details:** ${problem.message}
**Missing deliverables:** ${problem.missing?.join(', ') || 'none'}
**Already produced:** ${problem.produced?.map((p: any) => `${p.name} (${p.type})`).join(', ') || 'nothing'}

**DO NOT** recreate artifacts that were already produced successfully.
**DO** create only the missing deliverables listed above.
**VERIFY** each deliverable is saved before completing.

Use beads tracking to ensure all required deliverables are created.
`;
      userPrompt = retryGuidance + "\n\n---\n\n" + userPrompt;
    }

    // Base tools always available
    // Note: OpenCode has built-in tools (read, write, edit, glob, grep) for file ops
    // We only pass "automation" for artifact management (save to Convex)
    const baseTools = ["automation"];
    
    // Derive tools from deliverables - each deliverable type brings its tool
    // Tool names must match the actual Lakitu tool names (underscore format)
    const deliverableToolMap: Record<string, string[]> = {
      pdf: ["pdf_create"],  // The actual tool name in Lakitu
      // For markdown/doc/etc, the agent uses automation_saveArtifact directly
    };
    
    const deliverables = (task.deliverables || []).map((d: any) => ({ name: d.name, type: d.type }));
    const deliverableTools = deliverables.flatMap((d: any) => deliverableToolMap[d.type] || []);
    
    // Derive tools and prompts from skills
    const taskSkillIds = (task.skills || []).map((s: any) => s.id);
    let skillTools: string[] = [];
    let skillPrompts: string[] = [];
    
    if (taskSkillIds.length > 0) {
      const skills = await step.runQuery(api.workflows.crudSkills.getByIds, { skillIds: taskSkillIds });
      skillTools = skills.flatMap((skill: any) => skill.toolIds || []);
      skillPrompts = skills.filter((s: any) => s.prompt).map((s: any) => s.prompt);
    }
    
    // Explicit tools from automation config
    const explicitTools = task.automation?.tools || [];
    
    // Combine all tools (deduplicated)
    const rawTools = [...new Set([...baseTools, ...deliverableTools, ...skillTools, ...explicitTools])];

    // Map skill tool IDs to OpenCode's built-in tool names
    // This allows skills to use semantic tool names that get translated to OpenCode's tools
    const toolNameMap: Record<string, string> = {
      web_search: "websearch",      // Skill's web_search -> OpenCode's websearch
      web_scrape: "webfetch",       // Skill's web_scrape -> OpenCode's webfetch
      web_fetch: "webfetch",        // Alternative name
      search: "websearch",          // Simple alias
      scrape: "webfetch",           // Simple alias
    };

    const tools = rawTools.map((t) => toolNameMap[t] || t);

    // Build enhanced system prompt with skill guidance
    let enhancedSystemPrompt = systemPrompt;
    if (skillPrompts.length > 0) {
      enhancedSystemPrompt += `\n\n## SKILL GUIDANCE\n${skillPrompts.join('\n\n')}`;
    }
    
    // Log task configuration
    const goals = (task.goals || []).filter((g: any) => g.text).map((g: any) => g.text);
    console.log(`🚀 Running agent for stage "${task.name}"`);
    console.log(`🎯 Goals: ${goals.join("; ") || "none"}`);
    console.log(`📚 Skills: ${taskSkillIds.join(", ") || "none"}`);
    console.log(`🔧 Tools: ${tools.join(", ")}`);
    console.log(`📋 Deliverables: ${deliverables.map((d: any) => `${d.name}(${d.type})`).join(", ") || "none"}`);
    
    // Initialize Beads issues for this stage (goals become tasks, deliverables block completion)
    const beadsConfig = {
      stage: {
        id: taskId.toString(),
        name: task.name,
      },
      goals: goals.map((text: string, i: number) => ({
        id: `goal-${i}`,
        title: text,
        type: "goal" as const,
      })),
      deliverables: deliverables.map((d: any, i: number) => ({
        id: `deliv-${i}`,
        title: `Produce: ${d.name}`,
        type: "deliverable" as const,
        fileType: d.type,
      })),
    };
    
    let agentResult: { output?: string; artifacts?: any[]; sandboxId?: string; error?: string };
    
    try {
      // This action WAITS for the agent to complete
      agentResult = await step.runAction(internal.workflows.agentBoard.runAgentStep, {
        cardId, runId, boardId,
        projectId: cardId, // Use cardId so frontend can subscribe to logs by card
        systemPrompt: enhancedSystemPrompt,
        userPrompt,
        model: task.automation?.model || "anthropic/claude-haiku-4.5",
        tools,
        stageName: task.name,
        deliverables,
        beadsConfig,
      });
      
      if (agentResult.error) {
        throw new Error(agentResult.error);
      }
      
      console.log(`✅ Agent completed for stage "${task.name}"`);
      
      // Save agent response to card messages (for thread persistence)
      if (agentResult.output) {
        await step.runMutation(internal.features.kanban.boards.addCardMessageInternal, {
          cardId,
          message: {
            id: `agent-${taskId}-${Date.now()}`,
            role: "assistant" as const,
            content: agentResult.output,
            type: "response",
          },
        });
      }
    } catch (error: any) {
      if (error.message === "Session cancelled by user") {
        console.log(`🛑 Workflow cancelled for card ${cardId}`);
        return { success: false, cancelled: true };
      }
      console.error(`❌ Agent failed:`, error.message);
      await step.runMutation(internal.features.kanban.executor.failCardRun, { runId, error: error.message });
      await step.runMutation(internal.features.kanban.boards.updateCardStatusInternal, { id: cardId, status: "error" });
      throw error;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: SAVE ARTIFACTS - Persist collected files to database
    // ═══════════════════════════════════════════════════════════════════════
    const collectedArtifacts = agentResult.artifacts || [];
    console.log(`💾 Saving ${collectedArtifacts.length} collected artifacts to DB...`);
    
    for (const artifact of collectedArtifacts) {
      try {
        await step.runAction(api.features.kanban.artifacts.saveArtifactWithBackup, {
          cardId,
          runId,
          artifact: {
            type: artifact.type || "markdown",
            name: `${task.name}: ${artifact.name}`,
            content: artifact.content,
            metadata: {
              path: artifact.path,
              collectedAt: Date.now(),
            },
          },
        });
        console.log(`   ✅ Saved: ${artifact.name}`);
      } catch (e: any) {
        console.warn(`   ⚠️ Failed to save ${artifact.name}: ${e.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: QA CHECK - Verify deliverables and advance/block
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`🔍 Running QA check...`);
    
    await step.runMutation(internal.features.kanban.executor.completeCardRun, {
      runId,
      output: {
        summary: agentResult.output || "Stage completed",
        artifacts: collectedArtifacts,
      },
    });

    console.log(`✅ Stage "${task.name}" workflow complete`);
    
    return {
      success: true,
      cardId,
      runId,
      stageName: task.name,
      artifactCount: agentResult.artifacts?.length || 0,
    };
  },
});

/**
 * Run agent step - Executes in Lakitu E2B sandbox and WAITS for completion
 * Uses self-hosted Convex with Agent SDK (Lakitu template)
 */
export const runAgentStep = internalAction({
  args: {
    cardId: v.string(),
    runId: v.string(),
    boardId: v.string(),
    projectId: v.string(),
    systemPrompt: v.string(),
    userPrompt: v.string(),
    model: v.string(),
    tools: v.array(v.string()),
    stageName: v.string(),
    deliverables: v.optional(v.array(v.object({ name: v.string(), type: v.string() }))),
    beadsConfig: v.optional(v.object({
      stage: v.object({ id: v.string(), name: v.string() }),
      goals: v.array(v.object({ id: v.string(), title: v.string(), type: v.literal("goal") })),
      deliverables: v.array(v.object({ id: v.string(), title: v.string(), type: v.literal("deliverable"), fileType: v.string() })),
    })),
  },
  handler: async (ctx, args) => {
    try {
      // Build prompt with deliverable instructions
      let agentPrompt = args.userPrompt;

      // Note: Detailed deliverable instructions are in Lakitu system prompt.
      // The systemPrompt from buildSystemPrompt() already includes deliverables list.
      // We just pass the prompt through without adding duplicate instructions.

      // Combine system prompt and user prompt for Lakitu agent
      const fullPrompt = args.systemPrompt
        ? `${args.systemPrompt}\n\n---\n\n${agentPrompt}`
        : agentPrompt;

      console.log(`📍 Starting Lakitu session for card ${args.cardId}`);

      // Get board to extract userId/orgId for session config
      const board = await ctx.runQuery(internal.features.kanban.boards.getInternal, { id: args.boardId });
      if (!board) {
        return { error: "Board not found" };
      }

      // Start Lakitu sandbox session (creates session AND starts sandbox)
      const result = await ctx.runAction(api.workflows.sandboxConvex.startSession, {
        projectId: args.projectId,
        prompt: fullPrompt,
        config: {
          model: args.model,
          tools: args.tools,
          cardId: args.cardId,
          runId: args.runId,
          stageName: args.stageName,
          deliverables: args.deliverables,
          // Include userId/orgId so gateway can inject them into internal calls
          userId: board.userId,
          orgId: board.orgId,
        },
      });

      if (!result.success) {
        return { error: result.error || "Failed to start session" };
      }

      const sessionId = result.sessionId;
      console.log(`⏳ Waiting for Lakitu completion (session ${sessionId})...`);

      // Poll for completion (session is running asynchronously)
      for (let i = 0; i < 600; i++) { // 10 min max
        await new Promise(r => setTimeout(r, 1000));

        const session = await ctx.runQuery(api.workflows.sandboxConvex.getSession, {
          sessionId,
        });

        if (!session) {
          return { error: "Session not found" };
        }

        if (session.status === "completed") {
          console.log(`✅ Lakitu completed for session ${sessionId}`);
          const output = session.output as any;
          return {
            output: output?.response || "",
            artifacts: output?.artifacts || [],
            sandboxId: session.sandboxId,
          };
        }

        if (session.status === "failed") {
          return { error: session.error || "Sandbox failed" };
        }

        if (session.status === "cancelled") {
          console.log(`🛑 Session was cancelled`);
          return { error: "Session cancelled by user" };
        }

        // Every 30s: log status
        if (i % 30 === 0 && i > 0) {
          const sessionWithLogs = await ctx.runQuery(api.workflows.sandboxConvex.getSessionWithLogs, {
            sessionId,
          });
          const logCount = sessionWithLogs?.logs?.length || 0;
          console.log(`⏳ [${i}s] status=${session.status}, logs=${logCount}`);
        }
      }

      console.error(`⏰ Timeout waiting for Lakitu completion`);
      return { error: "Timeout waiting for sandbox completion (10 min)" };
    } catch (error: any) {
      console.error(`❌ runAgentStep failed:`, error.message);
      return { error: error.message };
    }
  },
});

/**
 * Start the card execution workflow (entry point)
 * Public action - called from parent app via scheduler
 */
export const startCardExecution = action({
  args: {
    cardId: v.string(),
    boardId: v.string(),
    taskId: v.string(),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`🚀 Starting workflow for card ${args.cardId}...`);
    try {
      const workflowId = await workflow.start(
        ctx,
        internal.workflows.agentBoard.cardExecutionWorkflow,
        args
      );
      console.log(`📍 Workflow started: ${workflowId}`);
      return workflowId;
    } catch (error) {
      console.error(`❌ Failed to start workflow:`, error);
      // Note: Parent app should handle card status updates on failure
      throw error;
    }
  },
});

/**
 * Stop a running card execution - kills sandbox, cancels session
 * Public action - called from parent app via scheduler
 */
export const stopCardExecution = action({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    console.log(`🛑 Stopping card ${args.cardId}...`);

    // Find active Lakitu sessions for this card
    const sessions = await ctx.runQuery(api.workflows.sandboxConvex.listSessions, {
      projectId: args.cardId, // Sessions are tracked by cardId
      limit: 10,
    });

    // Cancel any running sessions
    for (const session of sessions) {
      if (session.status === "running" || session.status === "starting") {
        try {
          await ctx.runAction(api.workflows.sandboxConvex.cancelSession, {
            sessionId: session._id,
          });
          console.log(`✅ Cancelled session ${session._id}`);
        } catch (e) {
          console.log(`⚠️ Could not cancel session ${session._id}: ${e}`);
        }
      }
    }

    console.log(`✅ Card ${args.cardId} stopped`);
    // Note: Parent app should handle card run cancellation
  },
});
