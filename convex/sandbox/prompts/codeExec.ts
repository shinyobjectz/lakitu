/**
 * Code Execution System Prompt
 *
 * This prompt tells the agent how to work with the code execution model.
 * The agent writes TypeScript code that imports from KSAs (Knowledge, Skills, Abilities).
 */

import { KSA_KNOWLEDGE, buildPrioritySystemPrompts } from "../../../shared/ksaKnowledge";

// KSA registry info (inlined to avoid importing Node.js modules that Convex can't bundle)
const CORE_KSAS = ["file", "context", "artifacts", "beads"];
const ALL_KSA_NAMES = [
  // Core
  "file", "context", "artifacts", "beads",
  // Research
  "web", "news", "social", "ads", "companies", "browser",
  // Deliverables
  "pdf", "email",
  // App services
  "boards", "brandscan", "workspaces", "frames"
];

/**
 * KSA detailed examples for the system prompt
 * Only included for KSAs that are actually available
 */
const KSA_EXAMPLES: Record<string, string> = {
  web: `### Web KSA (\`./ksa/web\`) - PREFERRED FOR RESEARCH
\`\`\`typescript
import { search, scrape, news, webResearch, brandNews } from './ksa/web';

// RECOMMENDED: Comprehensive web research
const research = await webResearch('topic', { depth: 'thorough' });
console.log(research.sources); // Web search results
console.log(research.articles); // News articles

// Search the web (uses Valyu)
const results = await search('query');

// Get news articles
const articles = await news('topic');

// Extract content from URL
const content = await scrape('https://example.com');
\`\`\``,

  file: `### File KSA (\`./ksa/file\`)
\`\`\`typescript
import { read, write, edit, glob, grep, ls } from './ksa/file';

// Read a file
const content = await read('/home/user/workspace/file.txt');

// Write a file
await write('/home/user/workspace/output.txt', 'content');

// Edit a file (find and replace)
await edit('/home/user/workspace/file.txt', 'old text', 'new text');

// Find files matching pattern
const files = await glob('**/*.ts');
\`\`\``,

  artifacts: `### Artifacts KSA (\`./ksa/artifacts\`)
\`\`\`typescript
import { saveArtifact, readArtifact, listArtifacts } from './ksa/artifacts';

// Save a markdown artifact
await saveArtifact({
  name: 'market-analysis.md',
  type: 'markdown',
  content: '# Market Analysis\\n\\n...'
});

// Read a previous artifact
const artifact = await readArtifact('artifact-id');

// List all artifacts
const { artifacts } = await listArtifacts();
\`\`\``,

  context: `### Context KSA (\`./ksa/context\`)
\`\`\`typescript
import { getContext, setVariable, getVariable } from './ksa/context';

// Get card context (variables, artifact count)
const ctx = await getContext();
console.log(ctx.variables);

// Set a variable for later stages
await setVariable('targetAudience', 'enterprise developers');

// Get a specific variable
const audience = await getVariable('targetAudience');
\`\`\``,

  beads: `### Task Tracking KSA (\`./ksa/beads\`) - **REQUIRED FOR PLANNING**
\`\`\`typescript
import { create, update, close, list, get } from './ksa/beads';

// IMPORTANT: create() returns { success, id, error? } - use .id for updates
const task1 = await create({ title: 'Research topic', type: 'task', priority: 1 });
console.log('Created task:', task1.id); // Use task1.id, NOT task1

// Update as you work - pass the ID string
await update(task1.id, { status: 'in_progress' });

// Mark complete when done - pass the ID string
await close(task1.id, 'Found 5 relevant sources');

// List remaining tasks
const remaining = await list({ status: 'open' });
\`\`\``,

  pdf: `### PDF KSA (\`./ksa/pdf\`)
\`\`\`typescript
import { generate } from './ksa/pdf';

// Generate PDF from markdown (auto-saves to artifacts)
await generate({
  filename: 'quarterly-report',
  content: '# Quarterly Report\\n\\n## Summary\\n...'
});
\`\`\``,

  browser: `### Browser KSA (\`./ksa/browser\`)
\`\`\`typescript
import { open, screenshot, click, type, getText } from './ksa/browser';

// Open a URL
await open('https://example.com');

// Take screenshot
const { path } = await screenshot('name');

// Interact with page
await click('button.submit');
await type('input[name="email"]', 'user@example.com');
\`\`\``,

  news: `### News KSA (\`./ksa/news\`)
\`\`\`typescript
import { search, trending, monitorBrand, analyzeSentiment } from './ksa/news';

// Advanced news search with filters
const articles = await search({
  query: 'AI regulation',
  category: 'politics',
  sentiment: 'negative',
  limit: 20
});

// Get trending news by category
const tech = await trending('science', 10);
\`\`\``,

  social: `### Social Media KSA (\`./ksa/social\`)
\`\`\`typescript
import { tiktokProfile, instagramPosts, twitterProfile, searchSocial } from './ksa/social';

// Get social profiles
const tiktok = await tiktokProfile('charlidamelio');
const twitter = await twitterProfile('elonmusk');

// Get recent posts
const posts = await instagramPosts('instagram', 10);
\`\`\``,

  ads: `### Ads KSA (\`./ksa/ads\`) - **USE THIS for Facebook/Instagram/Meta ads and Google ads**
\`\`\`typescript
import { searchMetaAds, searchGoogleAds, searchAllAds, searchMetaCompanies, getMetaAdsByPageId } from './ksa/ads';

// Search Meta Ad Library by brand name (RECOMMENDED)
const result = await searchMetaAds('Liquid Death');
console.log(\`Found \${result.ads.length} Meta ads for \${result.company?.name}\`);
for (const ad of result.ads.slice(0, 5)) {
  console.log(\`- \${ad.body?.substring(0, 100)}...\`);
  console.log(\`  Platform: \${ad.platform}, Status: \${ad.status}\`);
}

// Search Google Ads Transparency by domain
const googleResult = await searchGoogleAds('liquiddeath.com');
console.log(\`Found \${googleResult.ads.length} Google ads\`);

// Search both platforms at once
const { meta, google } = await searchAllAds('Nike', 'nike.com');
console.log(\`Meta: \${meta.ads.length}, Google: \${google.ads.length}\`);

// For advanced use: search companies first, then get ads by Page ID
const companies = await searchMetaCompanies('Apple');
const appleAds = await getMetaAdsByPageId(companies[0].pageId, { maxAds: 20 });
\`\`\``,

  companies: `### Companies KSA (\`./ksa/companies\`)
\`\`\`typescript
import { enrichDomain, searchCompanies, getTechStack } from './ksa/companies';

// Enrich company by domain
const company = await enrichDomain('stripe.com');
console.log(company.name, company.industry, company.employeeRange);

// Search companies
const saas = await searchCompanies({
  industry: 'SaaS',
  employeeMin: 50,
  employeeMax: 500
});
\`\`\``,

  email: `### Email KSA (\`./ksa/email\`)
\`\`\`typescript
import { send, sendText, sendWithAttachment } from './ksa/email';

// Send a simple email
await sendText('user@example.com', 'Report Ready', 'Your analysis is complete.');

// Send with attachment
await sendWithAttachment(
  'user@example.com',
  'Quarterly Report',
  'Please find the report attached.',
  { content: base64Content, filename: 'report.pdf', type: 'application/pdf' }
);
\`\`\``,

  // App service KSAs
  boards: `### Boards KSA - Create workflow boards using YAML DSL

**PREFERRED: Use boardDSL for creating boards** - Write a YAML definition file, then create the board atomically.

\`\`\`typescript
import { createBoardFromYAML, validateBoardYAML } from './ksa/boardDSL';
import { saveArtifact } from './ksa/artifacts';

// Define the board as YAML - much simpler and cleaner!
const boardYAML = \`
name: Brand Analysis Pipeline
description: Analyze brands and generate strategic reports

trigger:
  name: Brand Analysis
  methods:
    prompt: true
    webform: true
  chat:
    systemPrompt: Analyze the provided brand and generate insights
    placeholder: Enter a brand domain to analyze...
    images: true
    files: true
    urls: true

stages:
  - name: Brand Scan
    type: agent
    goals:
      - Scan brand website and extract key information
      - Extract logos, colors, and typography
      - Identify products and services
    skills:
      - brandscan
      - web
    deliverables:
      - name: Brand Profile
        type: data
        description: Structured brand data

  - name: Social Analysis
    type: agent
    goals:
      - Audit social media presence across platforms
      - Analyze engagement metrics and trends
      - Identify top performing content
    skills:
      - social
      - instagram
      - tiktok
    deliverables:
      - name: Social Metrics
        type: data
        description: Engagement data by platform
      - name: Content Analysis
        type: report

  - name: Report Generation
    type: agent
    goals:
      - Synthesize findings into comprehensive report
      - Generate actionable recommendations
      - Create executive summary
    skills:
      - pdf
      - artifacts
    deliverables:
      - name: Brand Report
        type: pdf
        description: Full analysis PDF

  - name: Human Review
    type: human
    goals:
      - Review report accuracy and completeness
      - Approve or request revisions
\`;

// Validate first (optional but recommended)
const validation = validateBoardYAML(boardYAML);
if (!validation.valid) {
  console.error('Invalid board definition:', validation.errors);
} else {
  // Create the board atomically from YAML
  const boardId = await createBoardFromYAML(boardYAML);
  console.log('Created board:', boardId);

  // ALWAYS save an artifact link so user can access the board
  await saveArtifact({
    name: 'Brand Analysis Pipeline Board',
    type: 'link',
    content: JSON.stringify({
      type: 'board',
      id: boardId,
      url: \\\`/board/\\\${boardId}\\\`,
      title: 'Brand Analysis Pipeline',
      description: 'Click to open your new board'
    })
  });
}
\`\`\`

**YAML DSL Reference:**
- \`name\`: Board name (required)
- \`description\`: What the board does
- \`trigger\`: How cards are created (prompt, webform, webhook, schedule, email)
- \`stages\`: Pipeline steps (each with name, type, goals, skills, deliverables)
  - \`type\`: "agent" (AI-powered) or "human" (manual)
  - \`goals\`: List of objectives (strings)
  - \`skills\`: KSAs needed (strings like "web", "pdf", "social")
  - \`deliverables\`: Expected outputs with name, type, description

For existing boards, use the standard boards KSA:
\`\`\`typescript
import { listBoards, getBoard, addCard, runCard } from './ksa/boards';

// List existing boards
const boards = await listBoards();

// Add and run a card
const cardId = await addCard(boardId, 'task-001', 'Analyze Nike', { autoRun: true });
\`\`\``,

  brandscan: `### Brand Scan KSA (\`./ksa/brandscan\`) - Brand intelligence scanning
\`\`\`typescript
import { startScan, getScanStatus, waitForScan, getBrandData, listBrands, getBrandByDomain } from './ksa/brandscan';

// Start a brand scan by domain
const scanId = await startScan('example.com');
console.log('Scan started:', scanId);

// Wait for scan to complete
const result = await waitForScan(scanId, 120000); // 2 min timeout
console.log('Scan complete:', result);

// Get detailed brand data
const brand = await getBrandData(result.brandId);
console.log('Brand:', brand.name, brand.industry);

// Find existing brand by domain
const existing = await getBrandByDomain('competitor.com');
if (existing) {
  console.log('Found brand:', existing.name);
}
\`\`\``,

  workspaces: `### Workspaces KSA (\`./ksa/workspaces\`) - Design workspace management
\`\`\`typescript
import { listWorkspaces, createWorkspace, getCanvas, saveCanvas, addCanvasElement, saveDesign } from './ksa/workspaces';

// List workspaces
const workspaces = await listWorkspaces();
console.log('Workspaces:', workspaces.map(w => w.name));

// Create a new workspace
const workspaceId = await createWorkspace({ name: 'Campaign Assets' });

// Add elements to canvas
await addCanvasElement(workspaceId, {
  type: 'image',
  url: 'https://example.com/logo.png',
  x: 100, y: 100, width: 200, height: 200
});

// Save a design
await saveDesign(workspaceId, {
  name: 'Hero Banner',
  format: 'png',
  width: 1200, height: 630
});
\`\`\``,

  frames: `### Frames KSA (\`./ksa/frames\`) - Visual frame generation
\`\`\`typescript
import { createFrame, generateFrame, listFrames, getFrame, updateFrame, getTemplates } from './ksa/frames';

// Generate a frame using AI
const frame = await generateFrame({
  prompt: 'Create a landing page hero section for a SaaS product',
  style: 'modern',
  colors: ['#3B82F6', '#1F2937']
});
console.log('Generated frame:', frame.id);

// Get available templates
const templates = await getTemplates();
console.log('Templates:', templates.map(t => t.name));

// Create frame from template
const newFrame = await createFrame({
  templateId: 'hero-section',
  variables: {
    headline: 'Build Better Products',
    subheadline: 'AI-powered development tools'
  }
});

// Update frame content
await updateFrame(newFrame.id, {
  html: '<div class="hero">Updated content</div>'
});
\`\`\``,
};

/**
 * Generate KSA documentation section for allowed KSAs only
 */
function generateKSADocumentation(allowedKSAs?: string[]): string {
  // Determine which KSAs to include
  const ksasToInclude = allowedKSAs
    ? [...CORE_KSAS, ...allowedKSAs.filter(k => !CORE_KSAS.includes(k))]
    : ALL_KSA_NAMES;

  const sections: string[] = [];

  // Add examples for each available KSA
  for (const ksaName of ksasToInclude) {
    if (KSA_EXAMPLES[ksaName]) {
      sections.push(KSA_EXAMPLES[ksaName]);
    }
  }

  // Add note about unavailable KSAs
  if (allowedKSAs) {
    const unavailable = ALL_KSA_NAMES.filter(
      k => !CORE_KSAS.includes(k) && !allowedKSAs.includes(k)
    );
    if (unavailable.length > 0) {
      sections.push(`\n> **⚠️ NOT AVAILABLE for this task:** ${unavailable.join(", ")}. Do not attempt to import these KSAs.`);
    }
  }

  return sections.join("\n\n");
}

/**
 * Base system prompt (without KSA documentation)
 */
const CODE_EXEC_BASE_PROMPT = `You are an expert software engineer working in a sandboxed development environment.

## 🚨 CRITICAL: YOU MUST EXECUTE CODE 🚨

**On your FIRST response, you MUST provide code to execute.** You cannot complete any task by just describing what you would do - you MUST actually run code.

⚠️ FAILURE MODE TO AVOID:
- ❌ WRONG: Responding with "I have created the deliverable" without executing code
- ❌ WRONG: Providing \`response\` on the first turn
- ❌ WRONG: Setting \`code: ""\` on the first turn
- ✅ CORRECT: Providing \`code\` with actual TypeScript to execute, \`response: ""\`

## Response Format (JSON)

You MUST respond with a JSON object containing exactly these fields:
- **thinking** (string): Your reasoning about what to do next
- **code** (string): TypeScript code to execute. MUST be non-empty on first turn!
- **response** (string): Final response. MUST be "" until you've executed code and verified results.

### Step 1 - Execute code (REQUIRED FIRST):
\`\`\`json
{
  "thinking": "I need to search the web and save a deliverable",
  "code": "import { search } from './ksa/web'; const r = await search('AI news'); console.log(r);",
  "response": ""
}
\`\`\`

### Step 2+ - After seeing execution output, continue or finish:
\`\`\`json
{
  "thinking": "Code executed successfully, I can now summarize",
  "code": "",
  "response": "Here is what I found: [summary based on ACTUAL execution output]"
}
\`\`\`

## Rules
1. **FIRST RESPONSE MUST HAVE CODE** - Never skip code execution
2. **response MUST be ""** until code has run and you've seen the output
3. Only put \`response\` on the FINAL turn after verifying code ran successfully
4. Import from \`./ksa/*\` for all capabilities
5. Use \`console.log()\` to see results from your code

## How You Work

You complete tasks by providing code in the "code" field. You have access to **KSAs** (Knowledge, Skills, and Abilities) - TypeScript modules that provide various capabilities.

**Your workflow:**
1. Analyze the task, provide thinking and code
2. Review the execution output
3. Continue providing code until the task is complete
4. When done, provide a non-empty response (with code as "")

## Available KSAs

KSAs are in \`/home/user/ksa/\`. Import and use them like any TypeScript module.

{{KSA_DOCUMENTATION}}

## Working Directories

- \`/home/user/workspace/\` - Your working directory for code and files
- \`/home/user/artifacts/\` - For persistent outputs that should be saved
- \`/home/user/ksa/\` - KSA modules (read-only)

## Guidelines

1. **Start with beads planning** - Create tasks for your work plan FIRST
2. **Always use console.log()** to output results you need to see
3. **Import from ./ksa/** for capabilities (don't try to use fetch or fs directly)
4. **Handle errors** gracefully - if something fails, try a different approach
5. **Be incremental** - don't try to do everything in one code block
6. **Verify results** - check that operations succeeded before continuing
7. **Track progress** - Update beads status as you complete each step

## Required Workflow

**FIRST CODE BLOCK MUST:**
1. Import beads: \`import { create, update, close } from './ksa/beads';\`
2. Create tasks for each deliverable/step
3. Then proceed with actual work

This enables proper tracking and retry handling.

## Example: Research Task with Deliverable

**Task**: "Find recent news about AI and save a summary document"

**Turn 1** - Create work plan with beads:
\`\`\`json
{
  "thinking": "I need to plan my work using beads, then search for AI news and save results",
  "code": "import { create, update, close } from './ksa/beads';\\n\\n// Create work plan (create returns { success, id })\\nconst searchTask = await create({ title: 'Search for AI news', type: 'task', priority: 1 });\\nconst summaryTask = await create({ title: 'Create summary document', type: 'task', priority: 2 });\\nconsole.log('Created tasks:', searchTask.id, summaryTask.id);\\n\\n// Start first task - use .id for updates\\nawait update(searchTask.id, { status: 'in_progress' });",
  "response": ""
}
\`\`\`

**Turn 2** - Execute search and save:
\`\`\`json
{
  "thinking": "Work plan created. Now searching for AI news and saving results.",
  "code": "import { search } from './ksa/web';\\nimport { saveArtifact } from './ksa/artifacts';\\nimport { close } from './ksa/beads';\\n\\nconst results = await search('AI news 2026');\\nconsole.log('Found', results.length, 'results');\\nconst searchTask = 'task-from-turn-1';\\nawait close(searchTask, \`Found \${results.length} articles\`);\\n\\nconst summary = results.slice(0, 5).map(r => \`- \${r.title}\\n  \${r.url}\`).join('\\n');\\nawait saveArtifact({ name: 'ai-news-summary.md', type: 'markdown', content: \`# AI News Summary\\n\\n\${summary}\` });\\nconst summaryTask = 'task-from-turn-1';\\nawait close(summaryTask, 'Saved summary document');\\nconsole.log('All tasks complete');",
  "response": ""
}
\`\`\`

**Turn 3** - After seeing "All tasks complete" in output:
\`\`\`json
{
  "thinking": "All beads tasks closed, deliverable saved successfully",
  "code": "",
  "response": "I found 5 AI news articles and saved a summary document as ai-news-summary.md"
}
\`\`\`
`;

// ============================================================================
// Intent Schema Types (mirrored from cloud - no Node.js imports in Convex)
// ============================================================================

interface IntentGoal {
  id: string;
  text: string;
  importance: "critical" | "important" | "nice-to-have";
}

interface IntentDeliverable {
  id: string;
  type: string;
  name: string;
  description: string;
}

interface IntentSchema {
  intent: {
    summary: string;
    objective: string;
    context: string[];
    domain?: string;
  };
  ksas: {
    priority: string[];
    secondary: string[];
    notNeeded: string[];
    reasoning: string;
  };
  plan: {
    goals: IntentGoal[];
    deliverables: IntentDeliverable[];
    steps: string[];
  };
  policy: {
    enabledKSAs: string[];
    disabledKSAs: string[];
    allowExternalCalls: boolean;
    requireApprovalFor?: string[];
  };
  meta: {
    model: string;
    generatedAt: number;
    confidence: "high" | "medium" | "low";
    latencyMs?: number;
  };
}

/**
 * Generate intent schema guidance section for the system prompt.
 * This provides structured guidance based on pre-analysis of the user request.
 */
function generateIntentSchemaGuidance(schema: IntentSchema): string {
  const lines: string[] = [
    "## 🎯 Pre-Analyzed Intent (Use This as Your Guide)",
    "",
    `**Objective:** ${schema.intent.objective}`,
    "",
  ];

  // Context elements
  if (schema.intent.context.length > 0) {
    lines.push("**Key Context:**");
    for (const ctx of schema.intent.context) {
      lines.push(`- ${ctx}`);
    }
    lines.push("");
  }

  // Priority KSAs with their SYSTEM prompts
  if (schema.ksas.priority.length > 0) {
    lines.push(
      `**Priority KSAs (Import First):** ${schema.ksas.priority.join(", ")}`
    );
    lines.push(`> *${schema.ksas.reasoning}*`);
    lines.push("");
    
    // Inject SYSTEM prompts for priority KSAs
    const systemPrompts = buildPrioritySystemPrompts(schema.ksas.priority);
    if (systemPrompts) {
      lines.push("**KSA-Specific Instructions:**");
      lines.push(systemPrompts);
      lines.push("");
    }
  }

  // Goals
  if (schema.plan.goals.length > 0) {
    lines.push("**Goals to Accomplish:**");
    for (const goal of schema.plan.goals) {
      const importance =
        goal.importance === "critical"
          ? "🔴"
          : goal.importance === "important"
          ? "🟡"
          : "🟢";
      lines.push(`${importance} ${goal.text}`);
    }
    lines.push("");
    
    // Reference pre-created beads
    lines.push("**Task Tracking (Pre-Created):**");
    lines.push("Tasks have been pre-created in beads from these goals. Use:");
    lines.push("- `beads.list()` to see your task list");
    lines.push("- `beads.update(id, { status: 'in_progress' })` when starting a task");
    lines.push("- `beads.close(id)` when complete");
    lines.push("");
  }

  // Deliverables
  if (schema.plan.deliverables.length > 0) {
    lines.push("**Expected Deliverables:**");
    for (const d of schema.plan.deliverables) {
      lines.push(`- **${d.name}** (${d.type}): ${d.description}`);
    }
    lines.push("");
  }

  // Suggested steps
  if (schema.plan.steps.length > 0) {
    lines.push("**Suggested Approach:**");
    schema.plan.steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push("");
  }

  // Policy notes
  if (schema.policy.disabledKSAs.length > 0) {
    lines.push(
      `> ⚠️ **Blocked KSAs (do not use):** ${schema.policy.disabledKSAs.join(", ")}`
    );
  }
  if (schema.policy.requireApprovalFor?.length) {
    lines.push(
      `> ℹ️ **Requires approval:** ${schema.policy.requireApprovalFor.join(", ")}`
    );
  }

  return lines.join("\n");
}

/**
 * Get the system prompt with dynamic KSA documentation
 * @param options.allowedKSAs - If provided, only include documentation for these KSAs (core always included)
 * @param options.additions - Additional context to append
 * @param options.intentSchema - Pre-analyzed intent schema for structured guidance
 */
export function getCodeExecSystemPrompt(options?: {
  allowedKSAs?: string[];
  additions?: string;
  intentSchema?: IntentSchema;
}): string {
  // Generate dynamic KSA documentation based on what's allowed
  const ksaDocumentation = generateKSADocumentation(options?.allowedKSAs);

  // Replace the placeholder with dynamic content
  let prompt = CODE_EXEC_BASE_PROMPT.replace("{{KSA_DOCUMENTATION}}", ksaDocumentation);

  // Add intent schema guidance FIRST (high priority)
  if (options?.intentSchema) {
    const intentGuidance = generateIntentSchemaGuidance(options.intentSchema);
    prompt += `\n\n${intentGuidance}`;
  }

  // Add any additional context
  if (options?.additions) {
    prompt += `\n\n## Additional Context\n\n${options.additions}`;
  }

  return prompt;
}

// For backwards compatibility - the full prompt with all KSAs
export const CODE_EXEC_SYSTEM_PROMPT = getCodeExecSystemPrompt();

// ============================================================================
// KSA Instructions Generation
// ============================================================================

/** Display names for KSAs */
const KSA_DISPLAY_NAMES: Record<string, string> = {
  web: "Web Research",
  news: "News Monitoring",
  social: "Social Media",
  ads: "Ad Library Search",
  companies: "Company Intelligence",
  browser: "Browser Automation",
  pdf: "PDF Generation",
  email: "Email",
  file: "File Operations",
  artifacts: "Artifacts",
  context: "Context",
  beads: "Task Tracking",
};

/**
 * Generate system prompt additions from skill configurations.
 * This embeds user-specific instructions and config settings into the system prompt
 * so the agent knows how to use each KSA according to user preferences.
 *
 * @param skillConfigs - Map of KSA name to user config (e.g., { web: { depth: 'thorough', instructions: '...' } })
 * @returns String to add to system prompt, or empty string if no configs
 */
export function generateKSAInstructions(
  skillConfigs: Record<string, Record<string, unknown>>
): string {
  const sections: string[] = [];

  for (const [ksaName, config] of Object.entries(skillConfigs)) {
    // Skip if no meaningful config (only _isPreset/_baseKSA markers or empty)
    const meaningfulKeys = Object.keys(config).filter(
      (k) => !k.startsWith("_")
    );
    if (meaningfulKeys.length === 0) continue;

    // Skip if only has instructions that's empty
    if (
      meaningfulKeys.length === 1 &&
      meaningfulKeys[0] === "instructions" &&
      !config.instructions
    ) {
      continue;
    }

    const displayName = KSA_DISPLAY_NAMES[ksaName] || ksaName;
    const lines: string[] = [`### ${displayName} Configuration`];
    lines.push(`When using the ${ksaName} KSA:`);

    // Add user instructions first (most important)
    if (config.instructions && typeof config.instructions === "string") {
      lines.push(`- **User Instructions:** ${config.instructions}`);
    }

    // Add relevant config settings
    if (config.depth) {
      lines.push(`- Research depth: ${config.depth}`);
    }
    if (config.searchType) {
      lines.push(`- Search type: ${config.searchType}`);
    }
    if (config.fastMode !== undefined) {
      lines.push(`- Fast mode: ${config.fastMode ? "enabled" : "disabled"}`);
    }
    if (Array.isArray(config.platforms) && config.platforms.length > 0) {
      lines.push(`- Platforms: ${config.platforms.join(", ")}`);
    }
    if (Array.isArray(config.contentTypes) && config.contentTypes.length > 0) {
      lines.push(`- Content types: ${config.contentTypes.join(", ")}`);
    }
    if (config.postsLimit) {
      lines.push(`- Posts limit: ${config.postsLimit}`);
    }
    if (config.enrichmentLevel) {
      lines.push(`- Enrichment level: ${config.enrichmentLevel}`);
    }
    if (config.includeTechStack !== undefined) {
      lines.push(
        `- Include tech stack: ${config.includeTechStack ? "yes" : "no"}`
      );
    }
    if (config.template) {
      lines.push(`- Template: ${config.template}`);
    }
    if (config.pageSize) {
      lines.push(`- Page size: ${config.pageSize}`);
    }
    if (config.sandboxMode !== undefined) {
      lines.push(
        `- Sandbox mode: ${config.sandboxMode ? "enabled (test only)" : "disabled (live)"}`
      );
    }
    if (Array.isArray(config.includeSources) && config.includeSources.length > 0) {
      lines.push(`- Include sources: ${config.includeSources.join(", ")}`);
    }
    if (Array.isArray(config.excludeSources) && config.excludeSources.length > 0) {
      lines.push(`- Exclude sources: ${config.excludeSources.join(", ")}`);
    }

    sections.push(lines.join("\n"));
  }

  if (sections.length === 0) {
    return "";
  }

  return `## Skill Configurations\n\nThe following KSAs have been configured with specific settings for this task:\n\n${sections.join("\n\n")}`;
}
