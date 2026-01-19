/**
 * KSA Knowledge Index
 * 
 * Contains SYSTEM prompts and ABOUT info for KSAs.
 * Used by the intent schema generator to make better KSA prioritization decisions.
 * 
 * NOTE: This is the cloud-side knowledge index. Project-specific KSA knowledge
 * is defined in the project's lakitu/*.ts files and used by the sandbox agent.
 */

export interface KsaKnowledge {
  /** System prompt added to agent when this KSA is prioritized */
  system?: string;
  /** Detailed usage info for intent schema analysis */
  about?: string;
}

/**
 * KSA Knowledge Registry
 * 
 * Maps KSA names to their knowledge content.
 * Priority KSAs get their SYSTEM prompts injected into the agent.
 * ABOUT info helps the intent analyzer choose the right KSAs.
 */
export const KSA_KNOWLEDGE: Record<string, KsaKnowledge> = {
  // =========================================================================
  // Visual/Workspace KSAs - Critical for design tasks
  // =========================================================================
  
  frames: {
    system: `You create visual HTML/Tailwind components. When users ask for ads, landing pages, UI components, or visual elements, use the frames KSA to generate them with proper dimensions and styling.`,
    about: `WHEN TO USE: Creating ads, banners, landing page sections, UI mockups, or any standalone visual HTML component.

KEY FUNCTIONS:
- create({ name, code, codeType, width, height }) - Create a visual frame
- list() - Get all frames in workspace
- update(id, changes) - Modify existing frame

CODE TYPES: "tailwind" (recommended), "html"

AD DIMENSIONS:
- Meta Feed: 1200x628 or 1080x1080
- Meta Stories: 1080x1920
- Google Display: 300x250, 728x90
- TikTok: 1080x1920

Use frames for polished visual output. Use canvas for diagrams/flowcharts.`,
  },

  workspaces: {
    system: `You are working in a visual workspace environment. Use workspaces and canvas KSAs to manage canvas elements, create visual layouts, and organize designs.`,
    about: `WHEN TO USE: Managing design projects, storing designs, workspace-level operations.

KEY FUNCTIONS:
- create({ name }) - Create new workspace
- getCanvas() / saveCanvas() - Access canvas
- listDesigns() / saveDesign() - Save named designs

For visual layouts/diagrams, use the canvas KSA with CanvasManager.`,
  },

  canvas: {
    system: `You create visual diagrams and layouts on the workspace canvas. When users ask for flowcharts, mind maps, org charts, process diagrams, or any visual arrangement, use the canvas KSA.`,
    about: `WHEN TO USE: Creating flowcharts, diagrams, mind maps, process flows, org charts, or any visual layout with connected elements.

KEY CLASS: CanvasManager
- new CanvasManager(workspaceId)
- load() - Load canvas state
- add(element) - Add element
- connect(fromId, toId) - Create arrow/connection
- save() - Persist changes

ELEMENT TYPES: shape(), text(), frame(), note()
SHAPE VARIANTS: "rectangle", "ellipse", "diamond", "rounded"

FLOWCHART EXAMPLE:
canvas.add(shape("start", { variant: "ellipse", position: {x:200,y:50}, label: "Start" }));
canvas.add(shape("process", { variant: "rectangle", position: {x:200,y:150}, label: "Process" }));
canvas.connect("start", "process");
await canvas.save();

ALWAYS use canvas for diagrams/flowcharts instead of text descriptions.`,
  },

  // =========================================================================
  // Core KSAs
  // =========================================================================

  artifacts: {
    about: `WHEN TO USE: Saving text documents, reports, data files that persist after agent finishes.
NOT FOR: Visual content (use frames), diagrams (use canvas).
TYPES: "markdown", "json", "csv", "text"`,
  },

  beads: {
    about: `WHEN TO USE: Breaking complex multi-step tasks into trackable subtasks.
NOT FOR: Simple single-step tasks. Most agent tasks don't need beads.`,
  },

  file: {
    about: `WHEN TO USE: Reading/writing files in the sandbox, searching codebases.
KEY FUNCTIONS: read(), write(), edit(), glob(), grep()`,
  },

  // =========================================================================
  // Research KSAs
  // =========================================================================

  web: {
    about: `WHEN TO USE: Web search, content extraction, research tasks.
KEY FUNCTIONS: search(query), scrape(url), webResearch(topic)`,
  },

  news: {
    about: `WHEN TO USE: News monitoring, trending topics, brand mentions.
KEY FUNCTIONS: search(), trending(), breakingNews(), monitorBrand()`,
  },

  companies: {
    about: `WHEN TO USE: Company research, domain enrichment, firmographic data.
KEY FUNCTIONS: enrichDomain(), searchCompanies(), getTechStack()`,
  },

  social: {
    about: `WHEN TO USE: Social media research, profile analysis, content scraping.
PLATFORMS: TikTok, Instagram, YouTube, Twitter, LinkedIn
KEY FUNCTIONS: tiktokProfile(), instagramPosts(), searchSocial()`,
  },

  // =========================================================================
  // Deliverable KSAs
  // =========================================================================

  pdf: {
    about: `WHEN TO USE: Generating PDF documents from markdown content.
KEY FUNCTIONS: generate({ content, title, options })`,
  },

  email: {
    about: `WHEN TO USE: Sending emails via SendGrid.
KEY FUNCTIONS: send(), sendHtml(), sendTemplate()`,
  },
};

/**
 * Get SYSTEM prompt for a KSA
 */
export function getKsaSystem(name: string): string | undefined {
  return KSA_KNOWLEDGE[name]?.system;
}

/**
 * Get ABOUT info for a KSA
 */
export function getKsaAbout(name: string): string | undefined {
  return KSA_KNOWLEDGE[name]?.about;
}

/**
 * Get all KSAs that have knowledge defined
 */
export function getKsasWithKnowledge(): string[] {
  return Object.keys(KSA_KNOWLEDGE);
}

/**
 * Build ABOUT summary for a list of KSAs
 */
export function buildKsaAboutSummary(ksaNames?: string[]): string {
  const names = ksaNames || Object.keys(KSA_KNOWLEDGE);
  const lines: string[] = [];
  
  for (const name of names) {
    const knowledge = KSA_KNOWLEDGE[name];
    if (knowledge?.about) {
      lines.push(`### ${name}`);
      lines.push(knowledge.about);
      lines.push("");
    }
  }
  
  return lines.join("\n");
}

/**
 * Build SYSTEM prompts for priority KSAs
 */
export function buildPrioritySystemPrompts(priorityKsas: string[]): string {
  const systems: string[] = [];
  
  for (const name of priorityKsas) {
    const system = KSA_KNOWLEDGE[name]?.system;
    if (system) {
      systems.push(`[${name.toUpperCase()}]: ${system}`);
    }
  }
  
  return systems.join("\n\n");
}
