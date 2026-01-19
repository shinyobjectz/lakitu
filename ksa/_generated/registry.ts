/**
 * KSA Registry - Auto-generated for Lakitu
 *
 * DO NOT EDIT MANUALLY - run `bun generate:ksa`
 *
 * Generated at: 2026-01-17T17:36:27.662Z
 *
 * This file is generated from the source of truth at:
 * packages/lakitu/ksa/*.ts
 */

// ============================================================================
// Types (defined inline for sandbox compatibility)
// ============================================================================

export type KSACategory = "core" | "skills" | "deliverables";
export type KSAGroup = "research";

export interface KSAInfo {
  name: string;
  description: string;
  category: KSACategory;
  group?: KSAGroup;
  functions: string[];
  importPath: string;
  servicePaths: string[];
  isLocal: boolean;
  icon?: string;
  /** System prompt added to agent when this KSA is prioritized */
  system?: string;
  /** Detailed usage info for intent schema analysis */
  about?: string;
}

// ============================================================================
// Generated Registry
// ============================================================================

export const KSA_REGISTRY: KSAInfo[] = [
  {
    name: "browser",
    description: "Browser Skills Functions for browser automation. Uses the agent-browser CLI for headless browser control.",
    category: "skills" as const,
    functions: ["open", "screenshot", "click", "type", "getHtml", "getText", "closeBrowser"],
    importPath: "./ksa/browser",
    servicePaths: [],
    isLocal: true,
  },
  {
    name: "brandscan",
    description: "Brand Lookup KSA - Knowledge, Skills, and Abilities Lightweight brand lookups for AI agents. Uses existing brand library data or fast API lookups. IMPORTANT: This KSA does NOT trigger full brand scans. Full scans involve web crawling and can take minutes. For agent tasks, use these lightweight lookups instead.",
    category: "skills" as const,
    functions: ["lookupBrand", "searchBrands", "getBrandFromLibrary", "getBrandData", "getBrandSummary", "listBrands", "getBrandByDomain", "listBrandAssets", "listBrandProducts", "listBrandAds"],
    importPath: "./ksa/brandscan",
    servicePaths: ["features.brands.agentBrandLookup.lookupBrand", "features.brands.agentBrandLookup.searchBrands", "features.brands.agentBrandLookup.getBrandFromLibrary", "features.brands.agentBrandLookup.listBrandAssets", "features.brands.agentBrandLookup.listBrandProducts", "features.brands.agentBrandLookup.listBrandAds", "features.brands.core.crud.get", "features.brands.core.products.getBrandIntelligenceSummary", "features.brands.core.crud.list", "features.brands.core.crud.getByDomain"],
    isLocal: false,
  },
  {
    name: "boardDSL",
    description: "Board DSL KSA - Create boards from YAML definitions Instead of making multiple API calls, define your entire board in YAML and create it atomically with a single function call.",
    category: "skills" as const,
    functions: ["createBoardFromYAML", "validateBoardYAML"],
    importPath: "./ksa/boardDSL",
    servicePaths: ["internal.features.kanban.boards.createInternal", "internal.features.kanban.boards.addTaskInternal", "internal.features.kanban.boards.updateTriggerInternal"],
    isLocal: false,
  },
  {
    name: "social",
    description: "Social Media KSA - Knowledge, Skills, and Abilities Scrape and analyze social media profiles and content across platforms. Supports: TikTok, Instagram, YouTube, Twitter/X, LinkedIn, Facebook, Reddit, and more.",
    category: "skills" as const,
    functions: ["tiktokProfile", "instagramProfile", "youtubeProfile", "twitterProfile", "linkedinProfile", "tiktokPosts", "instagramPosts", "twitterPosts", "searchSocial"],
    importPath: "./ksa/social",
    servicePaths: ["services.ScrapeCreators.internal.call"],
    isLocal: false,
  },
  {
    name: "news",
    description: "News KSA - Knowledge, Skills, and Abilities Advanced news research and monitoring via APITube. Supports entity tracking, sentiment analysis, brand monitoring.",
    category: "skills" as const,
    functions: ["search", "trending", "breakingNews", "monitorBrand", "monitorOrganization", "analyzeSentiment", "compareTopics"],
    importPath: "./ksa/news",
    servicePaths: ["services.APITube.internal.call"],
    isLocal: false,
  },
  {
    name: "boards",
    description: "Boards KSA - Knowledge, Skills, and Abilities Manage and execute kanban boards programmatically. Use this to create boards, add cards, and trigger automated execution. IMPORTANT: When creating boards, ALWAYS design appropriate stages. Each stage needs: name, stageType ('agent' or 'human'), and optionally goals.",
    category: "skills" as const,
    functions: ["listBoards", "getBoard", "createBoard", "setTrigger", "addCard", "runCard", "getCardStatus", "waitForCard", "stopCard", "getCompletedCards", "listTemplates", "getTemplate", "createBoardFromTemplate"],
    importPath: "./ksa/boards",
    servicePaths: ["features.kanban.boards.list", "features.kanban.boards.get", "features.kanban.templates.createBoardFromTemplate", "internal.features.kanban.boards.createInternal", "internal.features.kanban.boards.addTaskInternal", "internal.features.kanban.boards.updateTriggerInternal", "internal.features.kanban.boards.createCardInternal", "agent.workflows.agentBoard.startCardExecution", "features.kanban.boards.getCard", "features.kanban.boards.stopCard", "features.kanban.boards.getCompletedCards", "features.kanban.templates.listTemplates", "features.kanban.templates.getTemplate"],
    isLocal: false,
  },
  {
    name: "beads",
    description: "Beads KSA - Knowledge, Skills, and Abilities Task planning and tracking for agent workflows. Use beads to break down work into trackable tasks, track progress, and coordinate retries. OPTIMIZATION: update() and close() use fire-and-forget by default to reduce latency. Set { blocking: true } for synchronous behavior.",
    category: "core" as const,
    functions: ["create", "update", "close", "list", "getReady", "get"],
    importPath: "./ksa/beads",
    servicePaths: [],
    isLocal: true,
  },
  {
    name: "pdf",
    description: "PDF Skills Functions for generating PDF documents from markdown. PDFs are automatically uploaded to cloud storage after generation.",
    category: "deliverables" as const,
    functions: ["generate"],
    importPath: "./ksa/pdf",
    servicePaths: ["internal.agent.workflows.crudThreads.saveThreadArtifact", "features.kanban.artifacts.saveArtifactWithBackup"],
    isLocal: false,
  },
  {
    name: "web",
    description: "Web KSA - Knowledge, Skills, and Abilities Functions for web search and content extraction. Import and use these in your code.",
    category: "skills" as const,
    functions: ["search", "scrape", "news", "brandNews", "webResearch"],
    importPath: "./ksa/web",
    servicePaths: ["services.Valyu.internal.search", "services.Valyu.internal.contents", "services.APITube.internal.call"],
    isLocal: false,
  },
  {
    name: "artifacts",
    description: "Artifacts KSA - Knowledge, Skills, and Abilities Save and retrieve artifacts that persist across sandbox sessions. Use this to create outputs that will be available after the agent finishes. CATEGORY: core",
    category: "core" as const,
    functions: ["setGatewayConfig", "saveArtifact", "readArtifact", "listArtifacts"],
    importPath: "./ksa/artifacts",
    servicePaths: ["internal.agent.workflows.crudThreads.saveThreadArtifact", "features.kanban.artifacts.saveArtifactWithBackup", "features.kanban.artifacts.getArtifact", "internal.agent.workflows.crudThreads.listThreadArtifactsInternal", "features.kanban.artifacts.listCardArtifacts", "internal.features.workspaces.internal.getCanvasInternal", "internal.features.workspaces.internal.saveCanvasInternal"],
    isLocal: false,
  },
  {
    name: "workspaces",
    description: "Workspaces KSA - Knowledge, Skills, and Abilities Create and manage design workspaces with canvas tools. Workspaces contain frames, designs, and collaborative elements.",
    category: "skills" as const,
    functions: ["listWorkspaces", "createWorkspace", "getWorkspace", "updateWorkspaceName", "deleteWorkspace", "getCanvas", "saveCanvas", "addCanvasElement", "removeCanvasElement", "updateCanvasElement", "addConnection", "listDesigns", "saveDesign"],
    importPath: "./ksa/workspaces",
    servicePaths: ["features.workspaces.workspaces.list", "features.workspaces.workspaces.create", "features.workspaces.workspaces.get", "features.workspaces.workspaces.updateName", "features.workspaces.workspaces.remove", "features.workspaces.canvas.get", "features.workspaces.canvas.save", "features.workspaces.designs.listDesigns", "features.workspaces.designs.saveDesign"],
    isLocal: false,
  },
  {
    name: "logger",
    description: "Logger KSA - Knowledge, Skills, and Abilities for Semantic Logging Provides clean, user-friendly logging functions that emit structured logs for beautiful UI display using ai-elements components. Usage in agent code: ```typescript import { log, logPlan, logTask, logThinking, logSearch, logSource } from './ksa/logger'; // Simple log log.info(\"Starting analysis...\"); // Planning logPlan(\"Research Project\", \"Gathering information about the topic\", [ { title: \"Search web\", status: \"complete\" }, { title: \"Analyze results\", status: \"active\" }, { title: \"Generate report\", status: \"pending\" }, ]); // Task completion logTask(\"Collected 5 data sources\", true); // Thinking/reasoning logThinking(\"Evaluating which sources are most relevant...\"); // Search results logSearch(\"Web research\", [ { title: \"Article 1\", url: \"https://...\", description: \"...\" }, ]); // Sources/citations logSource(\"Wikipedia\", \"https://wikipedia.org/...\", \"Background information\"); ```",
    category: "skills" as const,
    functions: ["logPlan", "logThinking", "logTask", "logSearch", "logSource", "logFile", "logTool", "createProgress"],
    importPath: "./ksa/logger",
    servicePaths: [],
    isLocal: true,
  },
  {
    name: "file",
    description: "File Skills Functions for reading, writing, and searching files. These operate on the local filesystem in the sandbox.",
    category: "core" as const,
    functions: ["read", "write", "edit", "glob", "grep", "ls"],
    importPath: "./ksa/file",
    servicePaths: [],
    isLocal: true,
  },
  {
    name: "frames",
    description: "Frames KSA - Knowledge, Skills, and Abilities Create and manage visual frames (HTML/Tailwind/Svelte components). Frames are stored in Convex and rendered via SecureFrame in sandboxed iframes.",
    category: "skills" as const,
    functions: ["createFrame", "getFrame", "listFrames", "updateFrame", "deleteFrame", "generateFrame", "createPage", "getPage", "listPages", "updatePage", "getTemplates", "getAdSpecs", "snapshotFrame", "rollbackFrame", "trackView", "trackConversion"],
    importPath: "./ksa/frames",
    servicePaths: ["internal.features.frames.internal.createFrameInternal", "internal.features.frames.internal.getFrameInternal", "internal.features.frames.internal.listFramesInternal", "internal.features.frames.internal.updateFrameInternal", "internal.features.frames.internal.deleteFrameInternal", "internal.features.frames.internal.createPageInternal", "internal.features.frames.internal.getPageInternal", "internal.features.frames.internal.listPagesInternal", "internal.features.frames.internal.updatePageInternal", "internal.features.frames.internal.snapshotFrameInternal", "internal.features.frames.internal.rollbackFrameInternal", "internal.features.workspaces.internal.getCanvasInternal", "internal.features.workspaces.internal.saveCanvasInternal", "services.OpenRouter.internal.chat", "features.frames.templates.listTemplates", "features.frames.ads.getAdSpecs", "features.frames.analytics.trackView", "features.frames.analytics.trackConversion"],
    isLocal: false,
  },
  {
    name: "ads",
    description: "Ads KSA - Knowledge, Skills, and Abilities Search and analyze advertising data from Meta Ad Library and Google Ads Transparency. Provides access to competitor ad creative, copy, and targeting data.",
    category: "skills" as const,
    functions: ["searchMetaCompanies", "getMetaAdsByPageId", "searchMetaAds", "searchGoogleAds", "searchAllAds"],
    importPath: "./ksa/ads",
    servicePaths: ["services.ScrapeCreators.internal.call"],
    isLocal: false,
  },
  {
    name: "context",
    description: "Context KSA - Knowledge, Skills, and Abilities Manage card context and variables that persist across stages. Use this to read the current context and set variables for later stages.",
    category: "core" as const,
    functions: ["setGatewayConfig", "getContext", "getVariable", "setVariable"],
    importPath: "./ksa/context",
    servicePaths: ["features.kanban.executor.getCardContext", "features.kanban.executor.setVariable"],
    isLocal: false,
  },
  {
    name: "companies",
    description: "Companies KSA - Knowledge, Skills, and Abilities Enrich and lookup company information including: - Domain/website enrichment - Company search - Industry classification - Employee counts, funding, tech stack",
    category: "skills" as const,
    functions: ["enrichDomain", "enrichCompany", "bulkEnrich", "searchCompanies", "findSimilar", "companiesByTech", "getTechStack"],
    importPath: "./ksa/companies",
    servicePaths: ["services.TheCompanies.internal.call"],
    isLocal: false,
  },
  {
    name: "email",
    description: "Email KSA - Knowledge, Skills, and Abilities Send emails via SendGrid. Supports: - Plain text and HTML emails - Multiple recipients (to, cc, bcc) - Attachments - Templates",
    category: "deliverables" as const,
    functions: ["send", "sendText", "sendHtml", "sendWithAttachment", "sendTemplate", "sendBulk"],
    importPath: "./ksa/email",
    servicePaths: ["services.SendGrid.internal.send"],
    isLocal: false,
  }
];

// ============================================================================
// Discovery functions
// ============================================================================

export const getAllKSAs = () => KSA_REGISTRY;

export const getKSAsByCategory = (category: KSACategory) =>
  KSA_REGISTRY.filter((k) => k.category === category);

export const getKSA = (name: string) =>
  KSA_REGISTRY.find((k) => k.name === name);

export const getKSAsByNames = (names: string[]) =>
  KSA_REGISTRY.filter((k) => names.includes(k.name));

export const searchKSAs = (keyword: string) => {
  const lower = keyword.toLowerCase();
  return KSA_REGISTRY.filter(
    (k) =>
      k.name.toLowerCase().includes(lower) ||
      k.description.toLowerCase().includes(lower) ||
      k.functions.some((f) => f.toLowerCase().includes(lower))
  );
};

/** Names of core KSAs that are always available */
export const CORE_KSAS = KSA_REGISTRY.filter((k) => k.category === "core").map((k) => k.name);

// ============================================================================
// Policy Functions
// ============================================================================

/**
 * Get allowed service paths for a set of KSA names.
 * Used by gateway to enforce access control.
 */
export function getServicePathsForKSAs(ksaNames: string[]): string[] {
  const paths = new Set<string>();
  for (const name of ksaNames) {
    const ksa = getKSA(name);
    if (ksa) {
      for (const path of ksa.servicePaths) {
        paths.add(path);
      }
    }
  }
  return Array.from(paths);
}

/**
 * Check if a service path is allowed for the given KSAs.
 */
export function isServicePathAllowed(path: string, allowedKSAs: string[]): boolean {
  // Core KSAs are always allowed
  const allAllowed = [...CORE_KSAS, ...allowedKSAs];
  const allowedPaths = getServicePathsForKSAs(allAllowed);
  return allowedPaths.some((p) => path.startsWith(p) || p.startsWith(path));
}
