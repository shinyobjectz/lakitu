"use node";

/**
 * LSP Actions
 *
 * Internal actions for Language Server Protocol operations.
 * Manages LSP server lifecycle and communication.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// LSP server state (managed by runtime/lsp/manager.ts)
// These actions communicate with the LSP manager

/**
 * Get diagnostics for a file
 */
export const getDiagnostics = internalAction({
  args: {
    path: v.string(),
    language: v.optional(v.union(v.literal("typescript"), v.literal("python"), v.literal("rust"))),
  },
  handler: async (ctx, args) => {
    const language = args.language || detectLanguage(args.path);
    if (!language) {
      return { success: false, error: "Could not determine language", diagnostics: [] };
    }

    try {
      // Read file content
      const fs = await import("fs/promises");
      const content = await fs.readFile(args.path, "utf8");

      // For TypeScript, we can use the TypeScript compiler API directly
      // This is more reliable than waiting for LSP diagnostics
      if (language === "typescript") {
        const diagnostics = await getTypeScriptDiagnostics(args.path, content);
        return { success: true, diagnostics };
      }

      // For other languages, return empty for now
      // Full LSP integration would use the runtime/lsp/manager.ts
      return { success: true, diagnostics: [], message: `LSP for ${language} not yet integrated` };
    } catch (error: any) {
      return { success: false, error: error.message, diagnostics: [] };
    }
  },
});

/**
 * Get completions at a position
 */
export const getCompletions = internalAction({
  args: {
    path: v.string(),
    line: v.number(),
    character: v.number(),
  },
  handler: async (ctx, args) => {
    const language = detectLanguage(args.path);
    if (!language) {
      return { success: false, error: "Could not determine language", completions: [] };
    }

    try {
      // For TypeScript, use TS language service
      if (language === "typescript") {
        const completions = await getTypeScriptCompletions(args.path, args.line, args.character);
        return { success: true, completions };
      }

      return { success: true, completions: [], message: `LSP for ${language} not yet integrated` };
    } catch (error: any) {
      return { success: false, error: error.message, completions: [] };
    }
  },
});

/**
 * Get hover information at a position
 */
export const getHover = internalAction({
  args: {
    path: v.string(),
    line: v.number(),
    character: v.number(),
  },
  handler: async (ctx, args) => {
    const language = detectLanguage(args.path);
    if (!language) {
      return { success: false, error: "Could not determine language" };
    }

    try {
      if (language === "typescript") {
        const hover = await getTypeScriptHover(args.path, args.line, args.character);
        return { success: true, hover };
      }

      return { success: true, hover: null, message: `LSP for ${language} not yet integrated` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Get definition locations
 */
export const getDefinition = internalAction({
  args: {
    path: v.string(),
    line: v.number(),
    character: v.number(),
  },
  handler: async (ctx, args) => {
    const language = detectLanguage(args.path);
    if (!language) {
      return { success: false, error: "Could not determine language", definitions: [] };
    }

    try {
      if (language === "typescript") {
        const definitions = await getTypeScriptDefinition(args.path, args.line, args.character);
        return { success: true, definitions };
      }

      return { success: true, definitions: [], message: `LSP for ${language} not yet integrated` };
    } catch (error: any) {
      return { success: false, error: error.message, definitions: [] };
    }
  },
});

/**
 * Get references to a symbol
 */
export const getReferences = internalAction({
  args: {
    path: v.string(),
    line: v.number(),
    character: v.number(),
  },
  handler: async (ctx, args) => {
    const language = detectLanguage(args.path);
    if (!language) {
      return { success: false, error: "Could not determine language", references: [] };
    }

    try {
      if (language === "typescript") {
        const references = await getTypeScriptReferences(args.path, args.line, args.character);
        return { success: true, references };
      }

      return { success: true, references: [], message: `LSP for ${language} not yet integrated` };
    } catch (error: any) {
      return { success: false, error: error.message, references: [] };
    }
  },
});

/**
 * Get rename edits for a symbol
 */
export const getRenameEdits = internalAction({
  args: {
    path: v.string(),
    line: v.number(),
    character: v.number(),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const language = detectLanguage(args.path);
    if (!language) {
      return { success: false, error: "Could not determine language", edits: [] };
    }

    try {
      if (language === "typescript") {
        const edits = await getTypeScriptRenameEdits(
          args.path,
          args.line,
          args.character,
          args.newName
        );
        return { success: true, edits };
      }

      return { success: true, edits: [], message: `LSP for ${language} not yet integrated` };
    } catch (error: any) {
      return { success: false, error: error.message, edits: [] };
    }
  },
});

// ============================================
// Helper Functions
// ============================================

function detectLanguage(path: string): "typescript" | "python" | "rust" | null {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();

  if ([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return "typescript";
  }
  if ([".py", ".pyi"].includes(ext)) {
    return "python";
  }
  if (ext === ".rs") {
    return "rust";
  }

  return null;
}

// TypeScript-specific implementations using the TypeScript compiler API

async function getTypeScriptDiagnostics(
  path: string,
  content: string
): Promise<Array<{
  line: number;
  character: number;
  severity: string;
  message: string;
  code?: number;
}>> {
  try {
    const ts = await import("typescript");

    const compilerOptions: any = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    };

    const host = ts.createCompilerHost(compilerOptions);
    const originalReadFile = host.readFile;
    host.readFile = (fileName) => {
      if (fileName === path) return content;
      return originalReadFile(fileName);
    };

    const program = ts.createProgram([path], compilerOptions, host);
    const sourceFile = program.getSourceFile(path);
    if (!sourceFile) return [];

    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];

    return diagnostics.map((d) => {
      const start = d.start ?? 0;
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);

      return {
        line,
        character,
        severity:
          d.category === ts.DiagnosticCategory.Error
            ? "error"
            : d.category === ts.DiagnosticCategory.Warning
              ? "warning"
              : "info",
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        code: d.code,
      };
    });
  } catch (error) {
    console.error("[lsp] TypeScript diagnostics failed:", error);
    return [];
  }
}

async function getTypeScriptCompletions(
  path: string,
  line: number,
  character: number
): Promise<Array<{ label: string; kind: string; detail?: string }>> {
  // Simplified completion - full implementation would use TS language service
  return [];
}

async function getTypeScriptHover(
  path: string,
  line: number,
  character: number
): Promise<{ contents: string } | null> {
  // Simplified hover - full implementation would use TS language service
  return null;
}

async function getTypeScriptDefinition(
  path: string,
  line: number,
  character: number
): Promise<Array<{ path: string; line: number; character: number }>> {
  // Simplified definition - full implementation would use TS language service
  return [];
}

async function getTypeScriptReferences(
  path: string,
  line: number,
  character: number
): Promise<Array<{ path: string; line: number; character: number }>> {
  // Simplified references - full implementation would use TS language service
  return [];
}

async function getTypeScriptRenameEdits(
  path: string,
  line: number,
  character: number,
  newName: string
): Promise<Array<{ path: string; oldText: string; newText: string; line: number; character: number }>> {
  // Simplified rename - full implementation would use TS language service
  return [];
}
