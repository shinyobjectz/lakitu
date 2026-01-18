/**
 * Kanban Context Builder
 *
 * Builds system prompts for the Kanban agent.
 * Uses plain types to work with data from parent app.
 */

// Plain types that match parent app's data structures
interface Board {
  name: string;
}

interface BoardTask {
  _id: string;
  name: string;
  automation?: { prompt?: string };
  agentPrompt?: string;
  goals?: Array<{ text?: string }>;
  skills?: Array<{ id: string }>;
  deliverables?: Array<{ name: string; type: string }>;
}

interface Card {
  name: string;
  context?: {
    variables?: { message?: string };
    artifacts?: Array<{ name: string; type: string; id: string }>;
  };
  history?: Array<{
    taskId: string;
    taskName: string;
    summary?: string;
    files?: Array<{ name: string }>;
  }>;
}

/**
 * Builds a CONCISE system prompt for the Kanban agent.
 * Optimized for minimal tokens while preserving essential context.
 */
export function buildSystemPrompt(
  board: Board,
  task: BoardTask,
  card: Card,
  allTasks?: BoardTask[]
) {
  const pipeline = buildPipelineOverview(task, allTasks);
  const previousWork = buildPreviousStageSummaries(card);
  const artifacts = buildArtifactsList(card);
  const deliverables = buildDeliverablesSection(task);
  const ksas = buildKSAsSection(task);

  const userMessage = card.context?.variables?.message;
  const messageSection = userMessage ? `User Request: ${userMessage}\n` : "";

  const hasPreviousWork = (card.history || []).length > 0;
  const continuationGuidance = hasPreviousWork ? `
## IMPORTANT: This is Stage ${(card.history?.length || 0) + 1} of a Multi-Stage Pipeline

You MUST:
1. First, READ the artifacts from previous stages using \`readArtifact()\`
2. Use the content from previous stages as INPUT for your work
3. Do NOT fabricate or make up data - use what was already researched/created
4. If the previous stage produced research/data, REFERENCE IT in your output

` : "";

  return `# ${task.name}
${pipeline}
## Context
Card: ${card.name}
Board: ${board.name}
${messageSection}
${continuationGuidance}${previousWork}${artifacts}
## Objective
${task.automation?.prompt || task.agentPrompt || "Complete this stage."}

${buildGoalsSection(task)}
${deliverables}
${ksas}
## Rules
1. ONLY use KSAs listed above - import and call them in TypeScript code blocks
2. ${hasPreviousWork ? "**FIRST** read artifacts from previous stages, THEN " : ""}Save deliverables by writing code that calls the appropriate KSA:
   - For PDFs: \`import { generate } from './ksa/pdf'; await generate({ filename, content });\`
   - For markdown: \`import { saveArtifact } from './ksa/artifacts'; await saveArtifact({ name, type: 'markdown', content });\`
3. Complete ALL steps in this single turn
4. Respond with a brief summary after all code executes
${hasPreviousWork ? "5. DO NOT make up information - use data from previous stages" : ""}
`.trim();
}

function buildPipelineOverview(currentTask: BoardTask, allTasks?: BoardTask[]) {
  if (!allTasks || allTasks.length <= 1) return "";

  const idx = allTasks.findIndex(t => t._id === currentTask._id);
  if (idx === -1) return "";

  const stages = allTasks.map((t, i) =>
    i < idx ? `✓ ${t.name}` : i === idx ? `→ ${t.name}` : `○ ${t.name}`
  ).join(" | ");

  return `Stage ${idx + 1}/${allTasks.length}: ${stages}\n`;
}

function buildArtifactsList(card: Card) {
  const artifacts = card.context?.artifacts || [];
  if (artifacts.length === 0) return "Artifacts: none yet\n";

  return `## Previous Stage Artifacts (IMPORTANT: READ THESE)
${artifacts.map((a) => `- ${a.name} (${a.type}, ID: ${a.id})`).join("\n")}

**CRITICAL**: Before starting work, you MUST read the artifacts from previous stages.
Use the artifacts KSA to read them:
\`\`\`typescript
import { readArtifact } from './ksa/artifacts';
const content = await readArtifact('${artifacts[0]?.id || 'artifact-id'}');
console.log(content); // Use this content as input for your work
\`\`\`
`;
}

function buildGoalsSection(task: BoardTask) {
  const goals = task.goals || [];
  const goalTexts = goals.filter((g) => g.text).map((g) => g.text);
  if (goalTexts.length === 0) return "";
  return `## Goals\n${goalTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`;
}

function buildKSAsSection(task: BoardTask) {
  const skills = (task.skills || []).map((s) => s.id);
  const deliverables = task.deliverables || [];
  const hasPdf = deliverables.some((d) => d.type === 'pdf');
  const hasResearch = skills.includes('research') || skills.includes('scrape');

  const ksas: string[] = [
    "### artifacts (./ksa/artifacts)",
    "```typescript",
    "import { saveArtifact, readArtifact, listArtifacts } from './ksa/artifacts';",
    "await saveArtifact({ name: 'report.md', type: 'markdown', content: '...' });",
    "```",
    "",
    "### context (./ksa/context)",
    "```typescript",
    "import { getContext, setVariable } from './ksa/context';",
    "const ctx = await getContext();",
    "await setVariable('key', 'value');",
    "```",
  ];

  if (hasPdf) {
    ksas.push(
      "",
      "### pdf (./ksa/pdf)",
      "```typescript",
      "import { generate } from './ksa/pdf';",
      "await generate({ filename: 'report', content: '# Title\\n...' });",
      "```"
    );
  }

  if (hasResearch) {
    ksas.push(
      "",
      "### web (./ksa/web)",
      "```typescript",
      "import { search, scrape, news } from './ksa/web';",
      "const results = await search('query');",
      "const content = await scrape('https://...');",
      "```"
    );
  }

  return `## Available KSAs\n${ksas.join("\n")}`;
}

function buildDeliverablesSection(task: BoardTask) {
  const deliverables = task.deliverables || [];
  if (deliverables.length === 0) return "";

  const hasPdf = deliverables.some((d) => d.type === 'pdf');
  const count = deliverables.length;

  const list = deliverables.map((d, i) => {
    const ksa = d.type === 'pdf'
      ? `import { generate } from './ksa/pdf'`
      : `import { saveArtifact } from './ksa/artifacts'`;
    return `${i + 1}. [${d.name}] → ${d.type.toUpperCase()} → ${ksa}`;
  }).join("\n");

  return `## Required Deliverables (EXACTLY ${count})
${list}

Instructions: Write TypeScript code that imports and calls the KSA ONCE per deliverable.
Use descriptive filenames (not "${deliverables[0]?.name || 'Deliverable Name'}").
${hasPdf ? 'For PDFs: Content should start with ONE # heading (this becomes the title).' : ''}
`;
}

function buildPreviousStageSummaries(card: Card) {
  const history = card.history || [];
  if (history.length === 0) return "";

  const summaries = history.map((h, i) => {
    const filesProduced = (h.files || []).map((f) => f.name).join(", ");
    return `### ${i + 1}. ${h.taskName}
**Summary:** ${h.summary || "No summary available"}
${filesProduced ? `**Files produced:** ${filesProduced}` : ""}`;
  }).join("\n\n");

  return `## What Has Been Done (Previous Stages)

${summaries}

**Your job:** Build upon the work above. Do NOT repeat what was already done.
Read the artifacts from previous stages to understand the context and use their content as input.
`;
}

/**
 * Returns summary of all stages for retrieval.
 */
export function getRetrievableStages(card: Card) {
  return (card.history || []).map((h, i) => ({
    index: i,
    taskId: h.taskId,
    taskName: h.taskName,
    summary: h.summary,
  }));
}
