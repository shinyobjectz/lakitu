/**
 * Beads KSA - Knowledge, Skills, and Abilities
 *
 * Task planning and tracking for agent workflows.
 * Use beads to break down work into trackable tasks, track progress,
 * and coordinate retries.
 *
 * OPTIMIZATION: update() and close() use fire-and-forget by default
 * to reduce latency. Set { blocking: true } for synchronous behavior.
 *
 * @example
 * import { create, update, close, list, get } from './ksa/beads';
 *
 * // Create tasks for work plan
 * const researchTask = await create({ title: 'Research topic', type: 'task', priority: 1 });
 * const writeTask = await create({ title: 'Write report', type: 'task', priority: 2 });
 *
 * // Update as you progress (non-blocking by default)
 * update(researchTask.id, { status: 'in_progress' });
 *
 * // Close when done (non-blocking by default)
 * close(researchTask.id, 'Found 5 relevant sources');
 */

// ============================================================================
// Local Convex Client (bypasses cloud gateway, calls sandbox Convex directly)
// ============================================================================

// The sandbox's local Convex URL (NOT the cloud gateway)
const LOCAL_CONVEX_URL = process.env.CONVEX_URL || "http://localhost:3210";

async function callLocalConvex<T = unknown>(
  path: string,
  args: Record<string, unknown>,
  type: "query" | "mutation" | "action" = "mutation"
): Promise<T> {
  // Convert path like "planning.beads.create" to Convex format "planning/beads:create"
  const parts = path.split(".");
  const funcName = parts.pop()!;
  const modulePath = parts.join("/");
  const convexPath = `${modulePath}:${funcName}`;

  const response = await fetch(`${LOCAL_CONVEX_URL}/api/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: convexPath,
      args,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local Convex error (${response.status}): ${text}`);
  }

  const result = await response.json();
  return result.value as T;
}

function fireLocalConvex(
  path: string,
  args: Record<string, unknown>,
  type: "query" | "mutation" | "action" = "mutation"
): void {
  // Convert path like "planning.beads.create" to Convex format "planning/beads:create"
  const parts = path.split(".");
  const funcName = parts.pop()!;
  const modulePath = parts.join("/");
  const convexPath = `${modulePath}:${funcName}`;

  fetch(`${LOCAL_CONVEX_URL}/api/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: convexPath,
      args,
    }),
  }).catch(() => {
    // Fire and forget - ignore errors
  });
}

// ============================================================================
// Types
// ============================================================================

export type IssueType = "bug" | "task" | "feature" | "epic" | "chore";
export type IssueStatus = "open" | "in_progress" | "blocked" | "closed";
export type Priority = 0 | 1 | 2 | 3 | 4;

export interface Issue {
  id: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: Priority;
  description?: string;
  createdAt: number;
}

export interface CreateOptions {
  title: string;
  type?: IssueType;
  priority?: Priority;
  description?: string;
}

export interface UpdateOptions {
  status?: IssueStatus;
  priority?: Priority;
  title?: string;
  description?: string;
  /** If true, wait for server response (default: false for speed) */
  blocking?: boolean;
}

export interface CloseOptions {
  /** If true, wait for server response (default: false for speed) */
  blocking?: boolean;
}

export interface CreateResult {
  success: boolean;
  id: string;
  error?: string;
}

// ============================================================================
// Local Convex wrapper with fallback
// ============================================================================

async function callLocal(
  servicePath: string,
  args: Record<string, unknown>,
  type: "query" | "action" | "mutation" = "mutation"
): Promise<any> {
  if (!LOCAL_CONVEX_URL) {
    console.log("[beads] CONVEX_URL not configured, using in-memory fallback");
    return { error: "Local Convex not configured" };
  }

  try {
    return await callLocalConvex(servicePath, args, type);
  } catch (error) {
    console.error(`[beads] Local Convex exception: ${error}`);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function fireLocal(
  servicePath: string,
  args: Record<string, unknown>,
  type: "query" | "action" | "mutation" = "mutation"
): void {
  if (!LOCAL_CONVEX_URL) {
    console.log("[beads] CONVEX_URL not configured, skipping fire-and-forget");
    return;
  }
  fireLocalConvex(servicePath, args, type);
}

// In-memory fallback for when gateway isn't available
const inMemoryTasks: Map<string, Issue> = new Map();
let nextId = 1;

// ============================================================================
// Functions
// ============================================================================

/**
 * Create a new task for tracking work.
 *
 * @param options - Task creation options
 * @returns Created task with ID
 *
 * @example
 * const task = await create({
 *   title: 'Research market trends',
 *   type: 'task',
 *   priority: 1,
 * });
 * console.log(`Created task: ${task.id}`);
 */
export async function create(options: CreateOptions): Promise<CreateResult> {
  console.log(`[beads] Creating task: "${options.title}"`);

  // Try cloud first
  const result = await callLocal("planning.beads.create", {
    title: options.title,
    type: options.type || "task",
    priority: options.priority ?? 2,
    description: options.description,
  });

  if (!result.error && result) {
    console.log(`[beads] Created task in cloud: ${result}`);
    return { success: true, id: String(result) };
  }

  // Fallback to in-memory
  const id = `task-${nextId++}`;
  const task: Issue = {
    id,
    title: options.title,
    type: options.type || "task",
    status: "open",
    priority: (options.priority ?? 2) as Priority,
    description: options.description,
    createdAt: Date.now(),
  };
  inMemoryTasks.set(id, task);
  console.log(`[beads] Created task in-memory: ${id}`);
  return { success: true, id };
}

/**
 * Update an existing task.
 * Uses fire-and-forget by default for speed. Set blocking: true to wait.
 *
 * @param id - Task ID
 * @param options - Fields to update
 *
 * @example
 * // Non-blocking (default) - faster
 * update('task-1', { status: 'in_progress' });
 *
 * // Blocking - wait for confirmation
 * await update('task-1', { status: 'in_progress', blocking: true });
 */
export async function update(id: string, options: UpdateOptions): Promise<void> {
  const { blocking, ...updateFields } = options;
  console.log(`[beads] Updating task ${id}: ${JSON.stringify(updateFields)}${blocking ? " (blocking)" : ""}`);

  // Update in-memory immediately (for local consistency)
  const task = inMemoryTasks.get(id);
  if (task) {
    if (updateFields.status) task.status = updateFields.status;
    if (updateFields.priority !== undefined) task.priority = updateFields.priority;
    if (updateFields.title) task.title = updateFields.title;
    if (updateFields.description) task.description = updateFields.description;
  }

  // Fire-and-forget by default for speed
  if (!blocking) {
    fireLocal("planning.beads.update", { id, ...updateFields });
    console.log(`[beads] Updated task (fire-and-forget): ${id}`);
    return;
  }

  // Blocking mode - wait for server
  const result = await callLocal("planning.beads.update", { id, ...updateFields });
  if (!result.error) {
    console.log(`[beads] Updated task in cloud: ${id}`);
  }
}

/**
 * Close a task as completed.
 * Uses fire-and-forget by default for speed.
 *
 * @param id - Task ID
 * @param reason - Optional completion reason
 * @param options - Optional settings (blocking: true to wait)
 *
 * @example
 * // Non-blocking (default) - faster
 * close('task-1', 'Successfully generated report');
 *
 * // Blocking - wait for confirmation
 * await close('task-1', 'Done', { blocking: true });
 */
export async function close(id: string, reason?: string, options?: CloseOptions): Promise<void> {
  console.log(`[beads] Closing task ${id}${reason ? `: ${reason}` : ""}${options?.blocking ? " (blocking)" : ""}`);

  // Update in-memory immediately (for local consistency)
  const task = inMemoryTasks.get(id);
  if (task) {
    task.status = "closed";
  }

  // Fire-and-forget by default for speed
  if (!options?.blocking) {
    fireLocal("planning.beads.close", { id, reason });
    console.log(`[beads] Closed task (fire-and-forget): ${id}`);
    return;
  }

  // Blocking mode - wait for server
  const result = await callLocal("planning.beads.close", { id, reason });
  if (!result.error) {
    console.log(`[beads] Closed task in cloud: ${id}`);
  }
}

/**
 * List tasks with optional filters.
 *
 * @param options - Filter options
 * @returns Array of tasks
 *
 * @example
 * const openTasks = await list({ status: 'open' });
 * console.log(`${openTasks.length} tasks remaining`);
 */
export async function list(options?: {
  status?: IssueStatus;
  type?: IssueType;
}): Promise<Issue[]> {
  console.log(`[beads] Listing tasks: ${JSON.stringify(options || {})}`);

  // Try cloud first
  const result = await callLocal(
    "planning.beads.list",
    {
      status: options?.status,
      type: options?.type,
    },
    "query"
  );

  if (!result.error && Array.isArray(result)) {
    console.log(`[beads] Listed ${result.length} tasks from cloud`);
    return result.map((t: any) => ({
      id: t._id || t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      priority: t.priority,
      description: t.description,
      createdAt: t.createdAt,
    }));
  }

  // Fallback to in-memory
  let tasks = Array.from(inMemoryTasks.values());
  if (options?.status) {
    tasks = tasks.filter((t) => t.status === options.status);
  }
  if (options?.type) {
    tasks = tasks.filter((t) => t.type === options.type);
  }
  console.log(`[beads] Listed ${tasks.length} tasks from memory`);
  return tasks;
}

/**
 * Get tasks ready to work on (open and unblocked).
 *
 * @returns Array of ready tasks, sorted by priority
 *
 * @example
 * const ready = await getReady();
 * if (ready.length > 0) {
 *   console.log(`Next task: ${ready[0].title}`);
 * }
 */
export async function getReady(): Promise<Issue[]> {
  console.log(`[beads] Getting ready tasks`);

  // Try cloud first
  const result = await callLocal("planning.beads.getReady", {}, "query");

  if (!result.error && Array.isArray(result)) {
    console.log(`[beads] Found ${result.length} ready tasks from cloud`);
    return result.map((t: any) => ({
      id: t._id || t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      priority: t.priority,
      description: t.description,
      createdAt: t.createdAt,
    }));
  }

  // Fallback to in-memory
  const tasks = Array.from(inMemoryTasks.values())
    .filter((t) => t.status === "open")
    .sort((a, b) => a.priority - b.priority);
  console.log(`[beads] Found ${tasks.length} ready tasks from memory`);
  return tasks;
}

/**
 * Get a single task by ID.
 *
 * @param id - Task ID
 * @returns The task, or null if not found
 *
 * @example
 * const task = await get('task-1');
 * if (task) {
 *   console.log(`Task status: ${task.status}`);
 * }
 */
export async function get(id: string): Promise<Issue | null> {
  console.log(`[beads] Getting task: ${id}`);

  // Try cloud first
  const result = await callLocal("planning.beads.get", { id }, "query");

  if (!result.error && result) {
    console.log(`[beads] Got task from cloud: ${id}`);
    return {
      id: result._id || result.id,
      title: result.title,
      type: result.type,
      status: result.status,
      priority: result.priority,
      description: result.description,
      createdAt: result.createdAt,
    };
  }

  // Fallback to in-memory
  const task = inMemoryTasks.get(id);
  if (task) {
    console.log(`[beads] Got task from memory: ${id}`);
    return task;
  }

  console.log(`[beads] Task not found: ${id}`);
  return null;
}
