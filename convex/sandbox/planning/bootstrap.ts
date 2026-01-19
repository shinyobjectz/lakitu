/**
 * Bootstrap Planning from Intent Schema
 *
 * Automatically creates beads (task tracking) from pre-analyzed intent schema
 * when an agent session starts, giving the agent a structured task list.
 */

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/**
 * Intent Schema structure (subset of fields we need)
 */
interface IntentSchema {
  intent: {
    summary: string;
    objective: string;
    context: string[];
    domain?: string;
  };
  plan: {
    goals: Array<{
      id: string;
      text: string;
      importance: "critical" | "important" | "nice-to-have";
    }>;
    deliverables: Array<{
      id: string;
      type: string;
      name: string;
      description: string;
    }>;
    steps: string[];
  };
}

/**
 * Bootstrap result with created bead IDs
 */
export interface BootstrapResult {
  epicId: string;
  taskIds: string[];
}

/**
 * Bootstrap beads from an intent schema.
 * Creates a parent epic from the intent summary and child tasks from goals.
 *
 * @param ctx - Convex action context
 * @param intentSchema - Pre-analyzed intent schema
 * @param threadId - Thread ID to associate beads with
 * @returns Created epic and task IDs
 */
export async function bootstrapFromIntentSchema(
  ctx: ActionCtx,
  intentSchema: IntentSchema,
  threadId: string
): Promise<BootstrapResult> {
  // Create parent epic from intent summary
  const epicId = await ctx.runMutation(internal.planning.beads.create, {
    title: intentSchema.intent.summary,
    type: "epic" as const,
    priority: 0,
    description: intentSchema.intent.objective,
    threadId,
  });

  // Create child tasks from goals
  const taskIds: string[] = [];
  for (const goal of intentSchema.plan.goals) {
    const priority =
      goal.importance === "critical"
        ? 0
        : goal.importance === "important"
          ? 1
          : 2;

    const taskId = await ctx.runMutation(internal.planning.beads.create, {
      title: goal.text,
      type: "task" as const,
      priority,
      parentId: epicId,
      threadId,
    });
    taskIds.push(taskId);
  }

  return { epicId, taskIds };
}
