/**
 * Decisions - Intentional Tool Calling & Decision Logging
 *
 * Log agent decisions for transparency and debugging.
 * Track tool selection reasoning and expected outcomes.
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Mutations
// ============================================

/**
 * Log a decision
 */
export const log = mutation({
  args: {
    threadId: v.string(),
    task: v.string(),
    decisionType: v.union(
      v.literal("tool_selection"),
      v.literal("file_edit"),
      v.literal("task_breakdown"),
      v.literal("verification"),
      v.literal("rollback"),
      v.literal("checkpoint"),
      v.literal("error_recovery")
    ),
    selectedTools: v.optional(v.array(v.string())),
    reasoning: v.string(),
    expectedOutcome: v.optional(v.string()),
    alternatives: v.optional(
      v.array(
        v.object({
          option: v.string(),
          reason: v.string(),
        })
      )
    ),
    confidence: v.optional(v.number()), // 0-1
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentDecisions", {
      threadId: args.threadId,
      task: args.task,
      decisionType: args.decisionType,
      selectedTools: args.selectedTools,
      reasoning: args.reasoning,
      expectedOutcome: args.expectedOutcome,
      alternatives: args.alternatives,
      confidence: args.confidence,
      metadata: args.metadata,
      timestamp: Date.now(),
      // Outcome tracking - use undefined instead of null
      outcome: undefined,
      outcomeRecordedAt: undefined,
    });
  },
});

/**
 * Record the outcome of a decision
 */
export const recordOutcome = mutation({
  args: {
    id: v.id("agentDecisions"),
    outcome: v.union(
      v.literal("success"),
      v.literal("partial_success"),
      v.literal("failure"),
      v.literal("abandoned")
    ),
    actualResult: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      outcome: args.outcome,
      actualResult: args.actualResult,
      outcomeNotes: args.notes,
      outcomeRecordedAt: Date.now(),
    });
  },
});

/**
 * Log a tool execution
 */
export const logToolExecution = mutation({
  args: {
    decisionId: v.optional(v.id("agentDecisions")),
    threadId: v.string(),
    toolName: v.string(),
    input: v.any(),
    output: v.optional(v.any()),
    success: v.boolean(),
    durationMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("toolExecutions", {
      decisionId: args.decisionId,
      threadId: args.threadId,
      toolName: args.toolName,
      input: args.input,
      output: args.output,
      success: args.success,
      durationMs: args.durationMs,
      error: args.error,
      timestamp: Date.now(),
    });
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get decisions for a thread
 */
export const getByThread = query({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentDecisions")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get recent decisions across all threads
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentDecisions")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get tool executions for a thread
 */
export const getToolExecutions = query({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolExecutions")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get decision stats
 */
export const getStats = query({
  args: { threadId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { threadId } = args;
    const decisions = threadId
      ? await ctx.db
          .query("agentDecisions")
          .withIndex("by_thread", (q) => q.eq("threadId", threadId))
          .collect()
      : await ctx.db.query("agentDecisions").collect();

    const byType: Record<string, number> = {};
    const byOutcome: Record<string, number> = {
      success: 0,
      partial_success: 0,
      failure: 0,
      abandoned: 0,
      pending: 0,
    };

    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const decision of decisions) {
      byType[decision.decisionType] = (byType[decision.decisionType] || 0) + 1;

      if (decision.outcome) {
        byOutcome[decision.outcome]++;
      } else {
        byOutcome.pending++;
      }

      if (decision.confidence !== null && decision.confidence !== undefined) {
        totalConfidence += decision.confidence;
        confidenceCount++;
      }
    }

    return {
      total: decisions.length,
      byType,
      byOutcome,
      averageConfidence:
        confidenceCount > 0 ? totalConfidence / confidenceCount : null,
      successRate:
        decisions.length > 0
          ? byOutcome.success / (decisions.length - byOutcome.pending)
          : null,
    };
  },
});

/**
 * Get tool usage stats
 */
export const getToolStats = query({
  args: { threadId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { threadId } = args;
    const executions = threadId
      ? await ctx.db
          .query("toolExecutions")
          .withIndex("by_thread", (q) => q.eq("threadId", threadId))
          .collect()
      : await ctx.db.query("toolExecutions").collect();

    const byTool: Record<
      string,
      {
        count: number;
        successes: number;
        failures: number;
        totalDurationMs: number;
      }
    > = {};

    for (const exec of executions) {
      if (!byTool[exec.toolName]) {
        byTool[exec.toolName] = {
          count: 0,
          successes: 0,
          failures: 0,
          totalDurationMs: 0,
        };
      }

      byTool[exec.toolName].count++;
      if (exec.success) {
        byTool[exec.toolName].successes++;
      } else {
        byTool[exec.toolName].failures++;
      }
      byTool[exec.toolName].totalDurationMs += exec.durationMs;
    }

    // Calculate averages
    const stats = Object.entries(byTool).map(([name, data]) => ({
      name,
      count: data.count,
      successRate: data.successes / data.count,
      averageDurationMs: data.totalDurationMs / data.count,
    }));

    // Sort by usage count
    stats.sort((a, b) => b.count - a.count);

    return {
      totalExecutions: executions.length,
      uniqueTools: Object.keys(byTool).length,
      tools: stats,
    };
  },
});
