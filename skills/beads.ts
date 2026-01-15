/**
 * Beads Skills
 *
 * Functions for task tracking using the Beads system.
 * Beads is a distributed issue tracking system that stores issues in git.
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
  createdAt: string;
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
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Create a new issue/task.
 *
 * @param options - Issue creation options
 * @returns The created issue ID
 *
 * @example
 * const id = await create({
 *   title: 'Fix login bug',
 *   type: 'bug',
 *   priority: 1,
 * });
 */
export async function create(options: CreateOptions): Promise<string> {
  const args: string[] = [
    `--title="${options.title}"`,
    `--type=${options.type || "task"}`,
    `--priority=${options.priority ?? 2}`,
  ];

  if (options.description) {
    args.push(`--description="${options.description}"`);
  }

  const { stdout } = await execAsync(`bd create ${args.join(" ")}`, {
    cwd: "/home/user/workspace",
    timeout: 10_000,
  });

  // Extract issue ID from output (e.g., "Created issue: project-abc123")
  const match = stdout.match(/Created issue:\s*(\S+)/);
  if (!match) {
    throw new Error(`Failed to parse issue ID from: ${stdout}`);
  }

  return match[1];
}

/**
 * Update an existing issue.
 *
 * @param id - Issue ID
 * @param options - Fields to update
 *
 * @example
 * await update('project-abc123', { status: 'in_progress' });
 */
export async function update(id: string, options: UpdateOptions): Promise<void> {
  const args: string[] = [id];

  if (options.status) args.push(`--status=${options.status}`);
  if (options.priority !== undefined) args.push(`--priority=${options.priority}`);
  if (options.title) args.push(`--title="${options.title}"`);
  if (options.description) args.push(`--description="${options.description}"`);

  await execAsync(`bd update ${args.join(" ")}`, {
    cwd: "/home/user/workspace",
    timeout: 10_000,
  });
}

/**
 * Close an issue.
 *
 * @param id - Issue ID
 * @param reason - Optional reason for closing
 *
 * @example
 * await close('project-abc123', 'Completed implementation');
 */
export async function close(id: string, reason?: string): Promise<void> {
  const reasonArg = reason ? ` --reason="${reason}"` : "";
  await execAsync(`bd close ${id}${reasonArg}`, {
    cwd: "/home/user/workspace",
    timeout: 10_000,
  });
}

/**
 * List issues.
 *
 * @param options - Filter options
 * @returns Array of issues
 *
 * @example
 * const openTasks = await list({ status: 'open', type: 'task' });
 */
export async function list(options?: {
  status?: IssueStatus;
  type?: IssueType;
}): Promise<Issue[]> {
  const args: string[] = ["--json"];

  if (options?.status) args.push(`--status=${options.status}`);
  if (options?.type) args.push(`--type=${options.type}`);

  try {
    const { stdout } = await execAsync(`bd list ${args.join(" ")}`, {
      cwd: "/home/user/workspace",
      timeout: 10_000,
    });

    return JSON.parse(stdout);
  } catch {
    // If bd list fails or returns empty, return empty array
    return [];
  }
}

/**
 * Get issues that are ready to work on (no blockers).
 *
 * @returns Array of ready issues, sorted by priority
 *
 * @example
 * const ready = await getReady();
 * console.log('Next task:', ready[0]?.title);
 */
export async function getReady(): Promise<Issue[]> {
  try {
    const { stdout } = await execAsync("bd ready --json", {
      cwd: "/home/user/workspace",
      timeout: 10_000,
    });

    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

/**
 * Get a single issue by ID.
 *
 * @param id - Issue ID
 * @returns The issue, or null if not found
 *
 * @example
 * const issue = await get('project-abc123');
 * if (issue) console.log(issue.title);
 */
export async function get(id: string): Promise<Issue | null> {
  try {
    const { stdout } = await execAsync(`bd show ${id} --json`, {
      cwd: "/home/user/workspace",
      timeout: 10_000,
    });

    return JSON.parse(stdout);
  } catch {
    return null;
  }
}
