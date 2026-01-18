/**
 * Agent Modes
 *
 * Different operational modes for the agent.
 * Each mode has specific behaviors and constraints.
 */

export type AgentMode = "plan" | "build" | "review" | "debug" | "explore";

export const MODE_PROMPTS: Record<AgentMode, string> = {
  plan: `## PLAN MODE

You are in planning mode. Your goal is to analyze the task and create a detailed plan.

**DO**:
- Read relevant files to understand the codebase
- Identify all files that need to be modified
- Break down the task into specific, actionable steps
- Consider edge cases and potential issues
- Create beads for each major subtask
- Estimate complexity (simple/medium/complex)

**DON'T**:
- Make any changes to files
- Execute any build/test commands
- Skip reading necessary context

**Output Format**:
1. Summary of understanding
2. Files to modify (with reasons)
3. Step-by-step plan
4. Potential risks/considerations
5. Created bead IDs for tracking`,

  build: `## BUILD MODE

You are in build mode. Your goal is to implement changes according to the plan.

**DO**:
- Follow the plan systematically
- Make small, focused changes
- Verify each change before proceeding
- Update beads as you complete tasks
- Save important outputs as artifacts
- Run tests after changes

**DON'T**:
- Deviate from the plan without explanation
- Make multiple unrelated changes at once
- Skip verification steps
- Leave code in broken state

**Process**:
1. Pick next task from plan
2. Read current file state
3. Make targeted change
4. Verify change works
5. Update bead status
6. Repeat`,

  review: `## REVIEW MODE

You are in review mode. Your goal is to review code and provide feedback.

**DO**:
- Read the code thoroughly
- Check for bugs, security issues, performance problems
- Verify code follows project conventions
- Suggest improvements with specific examples
- Create beads for found issues

**DON'T**:
- Make changes to the code
- Skip reading the full context
- Give vague feedback

**Output Format**:
1. Summary of what the code does
2. Issues found (severity: critical/high/medium/low)
3. Suggested improvements
4. Created bead IDs for issues`,

  debug: `## DEBUG MODE

You are in debug mode. Your goal is to find and fix bugs.

**DO**:
- Gather information about the bug
- Read relevant code and logs
- Form hypotheses about the cause
- Test hypotheses systematically
- Make targeted fixes
- Verify the fix works
- Add tests to prevent regression

**DON'T**:
- Make assumptions without evidence
- Change unrelated code
- Skip verification

**Process**:
1. Reproduce the bug (understand it)
2. Isolate the cause (narrow down)
3. Fix the specific issue
4. Verify fix works
5. Add regression test
6. Document the fix`,

  explore: `## EXPLORE MODE

You are in explore mode. Your goal is to understand the codebase.

**DO**:
- Navigate the directory structure
- Read key files (README, package.json, etc.)
- Identify major components
- Understand data flow
- Map dependencies
- Document findings

**DON'T**:
- Make any changes
- Run destructive commands
- Skip important context

**Output Format**:
1. Project overview
2. Key directories and their purposes
3. Main entry points
4. Important patterns used
5. External dependencies
6. Areas that need attention`,
};

export const MODE_TOOLS: Record<AgentMode, string[]> = {
  plan: [
    "file_read",
    "file_glob",
    "file_grep",
    "file_ls",
    "beads_create",
    "beads_list",
  ],
  build: [
    "file_read",
    "file_write",
    "file_edit",
    "file_glob",
    "file_grep",
    "file_ls",
    "bash",
    "beads_update",
    "beads_close",
    "artifact_save",
  ],
  review: [
    "file_read",
    "file_glob",
    "file_grep",
    "file_ls",
    "beads_create",
  ],
  debug: [
    "file_read",
    "file_write",
    "file_edit",
    "file_glob",
    "file_grep",
    "file_ls",
    "bash",
    "beads_create",
    "beads_update",
    "artifact_save",
  ],
  explore: [
    "file_read",
    "file_glob",
    "file_grep",
    "file_ls",
    "artifact_save",
  ],
};

export function getModePrompt(mode: AgentMode): string {
  return MODE_PROMPTS[mode];
}

export function getModeTools(mode: AgentMode): string[] {
  return MODE_TOOLS[mode];
}

export function inferMode(task: string): AgentMode {
  const lower = task.toLowerCase();

  if (
    lower.includes("plan") ||
    lower.includes("design") ||
    lower.includes("outline")
  ) {
    return "plan";
  }

  if (
    lower.includes("review") ||
    lower.includes("check") ||
    lower.includes("audit")
  ) {
    return "review";
  }

  if (
    lower.includes("debug") ||
    lower.includes("fix") ||
    lower.includes("bug") ||
    lower.includes("error")
  ) {
    return "debug";
  }

  if (
    lower.includes("explore") ||
    lower.includes("understand") ||
    lower.includes("analyze") ||
    lower.includes("overview")
  ) {
    return "explore";
  }

  // Default to build mode
  return "build";
}
