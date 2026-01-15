/**
 * KSA Index - Knowledge, Skills, and Abilities
 *
 * Central registry and discovery for all KSAs.
 * Use this to understand what capabilities are available.
 */

// ============================================================================
// Re-exports for Convenience
// ============================================================================

// System KSAs (local operations)
export * as file from "./file";
export * as browser from "./browser";
export * as beads from "./beads";
export * as pdf from "./pdf";

// Research KSAs (gateway operations)
export * as web from "./web";
export * as news from "./news";
export * as social from "./social";
export * as companies from "./companies";
export * as email from "./email";

// ============================================================================
// KSA Registry
// ============================================================================

export interface KSAInfo {
  name: string;
  description: string;
  category: "system" | "research" | "data" | "create" | "ai";
  functions: string[];
  importPath: string;
}

/**
 * Registry of all available KSAs.
 * This is the source of truth for discovery.
 */
export const KSA_REGISTRY: KSAInfo[] = [
  // System KSAs
  {
    name: "file",
    description: "Read, write, edit, and search files in the workspace",
    category: "system",
    functions: ["read", "write", "edit", "glob", "grep", "ls"],
    importPath: "./ksa/file",
  },
  {
    name: "browser",
    description: "Automate browser interactions - navigate, click, type, screenshot",
    category: "system",
    functions: ["open", "screenshot", "click", "type", "getText", "getHtml", "closeBrowser"],
    importPath: "./ksa/browser",
  },
  {
    name: "beads",
    description: "Track tasks and issues with the Beads distributed issue tracker",
    category: "system",
    functions: ["create", "update", "close", "list", "getReady", "get"],
    importPath: "./ksa/beads",
  },
  {
    name: "pdf",
    description: "Generate PDF documents from markdown content",
    category: "create",
    functions: ["generate"],
    importPath: "./ksa/pdf",
  },

  // Research KSAs
  {
    name: "web",
    description: "Search the web and extract content from URLs",
    category: "research",
    functions: ["search", "scrape", "news"],
    importPath: "./ksa/web",
  },
  {
    name: "news",
    description: "Advanced news research - search, monitor brands, analyze sentiment",
    category: "research",
    functions: [
      "search",
      "trending",
      "breakingNews",
      "monitorBrand",
      "monitorOrganization",
      "analyzeSentiment",
      "compareTopics",
    ],
    importPath: "./ksa/news",
  },
  {
    name: "social",
    description: "Scrape social media profiles and posts (TikTok, Instagram, Twitter, YouTube, LinkedIn)",
    category: "research",
    functions: [
      "tiktokProfile",
      "instagramProfile",
      "youtubeProfile",
      "twitterProfile",
      "linkedinProfile",
      "tiktokPosts",
      "instagramPosts",
      "twitterPosts",
      "searchSocial",
    ],
    importPath: "./ksa/social",
  },
  {
    name: "companies",
    description: "Enrich company data by domain - industry, employees, tech stack, funding",
    category: "data",
    functions: [
      "enrichDomain",
      "enrichCompany",
      "bulkEnrich",
      "searchCompanies",
      "findSimilar",
      "companiesByTech",
      "getTechStack",
    ],
    importPath: "./ksa/companies",
  },
  {
    name: "email",
    description: "Send emails via SendGrid - text, HTML, attachments, templates",
    category: "create",
    functions: ["send", "sendText", "sendHtml", "sendWithAttachment", "sendTemplate", "sendBulk"],
    importPath: "./ksa/email",
  },
];

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Get all available KSAs.
 */
export function getAllKSAs(): KSAInfo[] {
  return KSA_REGISTRY;
}

/**
 * Get KSAs by category.
 */
export function getKSAsByCategory(category: KSAInfo["category"]): KSAInfo[] {
  return KSA_REGISTRY.filter((k) => k.category === category);
}

/**
 * Find a KSA by name.
 */
export function getKSA(name: string): KSAInfo | undefined {
  return KSA_REGISTRY.find((k) => k.name === name);
}

/**
 * Search KSAs by keyword in name or description.
 */
export function searchKSAs(keyword: string): KSAInfo[] {
  const lower = keyword.toLowerCase();
  return KSA_REGISTRY.filter(
    (k) =>
      k.name.toLowerCase().includes(lower) ||
      k.description.toLowerCase().includes(lower) ||
      k.functions.some((f) => f.toLowerCase().includes(lower))
  );
}

/**
 * Generate a summary of all KSAs for the system prompt.
 */
export function generateKSASummary(): string {
  const lines: string[] = ["## Available KSAs (Knowledge, Skills, Abilities)\n"];

  const byCategory = new Map<string, KSAInfo[]>();
  for (const ksa of KSA_REGISTRY) {
    if (!byCategory.has(ksa.category)) {
      byCategory.set(ksa.category, []);
    }
    byCategory.get(ksa.category)!.push(ksa);
  }

  const categoryNames: Record<string, string> = {
    system: "System Operations",
    research: "Research & Information",
    data: "Data Enrichment",
    create: "Content Creation",
    ai: "AI Capabilities",
  };

  for (const [category, ksas] of byCategory) {
    lines.push(`### ${categoryNames[category] || category}\n`);
    for (const ksa of ksas) {
      lines.push(`**${ksa.name}** - ${ksa.description}`);
      lines.push(`\`import { ${ksa.functions.slice(0, 3).join(", ")}${ksa.functions.length > 3 ? ", ..." : ""} } from '${ksa.importPath}';\``);
      lines.push("");
    }
  }

  return lines.join("\n");
}
