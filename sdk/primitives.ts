/**
 * KSA SDK Primitives
 *
 * Core local capabilities that run in the sandbox.
 * These are the building blocks for primitive implementations.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  modified: number;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface BrowserResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Internal Utilities
// ============================================================================

const SANDBOX_WORKSPACE = "/home/user/workspace";

/** Get effective cwd - fallback to process.cwd() if sandbox path doesn't exist */
async function getEffectiveCwd(requestedCwd?: string): Promise<string> {
  if (requestedCwd) {
    return requestedCwd;
  }
  try {
    await fs.access(SANDBOX_WORKSPACE);
    return SANDBOX_WORKSPACE;
  } catch {
    return process.cwd();
  }
}

/** Escape shell special characters for safe use in double-quoted strings */
function escapeShellArg(arg: string): string {
  return arg.replace(/[\\`$"!]/g, "\\$&");
}

/** Escape regex special characters for grep */
function escapeGrepPattern(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// File Primitives
// ============================================================================

export const file = {
  /** Read file contents */
  async read(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  },

  /** Write content to file (creates dirs if needed) */
  async write(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  },

  /** Edit file by replacing text (must be unique) */
  async edit(filePath: string, oldText: string, newText: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf-8");
    const occurrences = content.split(oldText).length - 1;
    if (occurrences === 0) {
      throw new Error(`Text not found in file: "${oldText.slice(0, 50)}..."`);
    }
    if (occurrences > 1) {
      throw new Error(`Text appears ${occurrences} times, must be unique`);
    }
    await fs.writeFile(filePath, content.replace(oldText, newText), "utf-8");
  },

  /** Find files matching pattern (sanitized for shell safety) */
  async glob(pattern: string, cwd?: string): Promise<string[]> {
    const effectiveCwd = await getEffectiveCwd(cwd);
    const safePattern = escapeShellArg(pattern);
    const { stdout } = await execAsync(
      `find . -type f -name "${safePattern}" 2>/dev/null | head -100`,
      { cwd: effectiveCwd }
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => path.join(effectiveCwd, f));
  },

  /** Search file contents (sanitized for shell safety). Use literal=true for exact string match. */
  async grep(pattern: string, cwd?: string, options?: { literal?: boolean }): Promise<GrepMatch[]> {
    try {
      const effectiveCwd = await getEffectiveCwd(cwd);
      // Use -F for literal string matching (safer), or escape the pattern for regex
      const grepFlag = options?.literal ? "-F" : "";
      const safePattern = options?.literal ? escapeShellArg(pattern) : escapeShellArg(escapeGrepPattern(pattern));
      const { stdout } = await execAsync(
        `grep -rn ${grepFlag} "${safePattern}" . 2>/dev/null | head -50`,
        { cwd: effectiveCwd }
      );
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
          if (!match) return null;
          return {
            file: path.join(effectiveCwd, match[1]),
            line: parseInt(match[2]),
            content: match[3].trim(),
          };
        })
        .filter((m): m is GrepMatch => m !== null);
    } catch {
      return [];
    }
  },

  /** List directory contents */
  async ls(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  },

  /** Check if file exists */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  /** Get file stats */
  async stat(filePath: string): Promise<FileStat> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      modified: stats.mtimeMs,
    };
  },
};

// ============================================================================
// Shell Primitives
// ============================================================================

export const shell = {
  /** Execute command and return output */
  async exec(
    command: string,
    options?: { cwd?: string; timeout?: number }
  ): Promise<ShellResult> {
    try {
      const cwd = await getEffectiveCwd(options?.cwd);
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: options?.timeout || 30_000,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        exitCode: err.code || 1,
      };
    }
  },

  /** Execute command in background (fire-and-forget) */
  async execBackground(command: string, cwd?: string): Promise<void> {
    const effectiveCwd = await getEffectiveCwd(cwd);
    exec(command, { cwd: effectiveCwd }).unref();
  },
};

// ============================================================================
// Browser Primitives
// ============================================================================

export const browser = {
  /** Open URL in browser */
  async open(url: string): Promise<BrowserResult<{ url: string; title: string }>> {
    try {
      const { stdout } = await execAsync(`agent-browser open "${url}"`, {
        timeout: 30_000,
      });
      const result = JSON.parse(stdout);
      return {
        success: true,
        data: { url: result.url, title: result.title },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Take screenshot */
  async screenshot(name = "screenshot"): Promise<BrowserResult<{ path: string; base64: string }>> {
    const screenshotPath = `/home/user/artifacts/${name}.png`;
    try {
      await execAsync(`agent-browser screenshot "${screenshotPath}"`, {
        timeout: 10_000,
      });
      const buffer = await fs.readFile(screenshotPath);
      return {
        success: true,
        data: { path: screenshotPath, base64: buffer.toString("base64") },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Click element by selector */
  async click(selector: string): Promise<BrowserResult> {
    try {
      await execAsync(`agent-browser click "${selector}"`, { timeout: 10_000 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Type text into element */
  async type(selector: string, text: string): Promise<BrowserResult> {
    try {
      await execAsync(`agent-browser type "${selector}" "${text}"`, {
        timeout: 10_000,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Get page HTML */
  async getHtml(): Promise<BrowserResult<string>> {
    try {
      const { stdout } = await execAsync("agent-browser html", {
        timeout: 10_000,
      });
      return { success: true, data: stdout };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Get page text content */
  async getText(): Promise<BrowserResult<string>> {
    try {
      const { stdout } = await execAsync("agent-browser text", {
        timeout: 10_000,
      });
      return { success: true, data: stdout };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Close browser */
  async close(): Promise<BrowserResult> {
    try {
      await execAsync("agent-browser close", { timeout: 5_000 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Primitive Registry
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrimitiveFn = (...args: any[]) => Promise<unknown>;

/** All available primitives mapped by path */
export const PRIMITIVES: Record<string, PrimitiveFn> = {
  // File operations
  "file.read": file.read,
  "file.write": file.write,
  "file.edit": file.edit,
  "file.glob": file.glob,
  "file.grep": file.grep,
  "file.ls": file.ls,
  "file.exists": file.exists,
  "file.stat": file.stat,

  // Shell operations
  "shell.exec": shell.exec,

  // Browser operations
  "browser.open": browser.open,
  "browser.screenshot": browser.screenshot,
  "browser.click": browser.click,
  "browser.type": browser.type,
  "browser.getHtml": browser.getHtml,
  "browser.getText": browser.getText,
  "browser.close": browser.close,
};

/** Get a primitive function by path */
export function getPrimitive(path: string): PrimitiveFn | undefined {
  return PRIMITIVES[path];
}

/** Check if a primitive exists */
export function hasPrimitive(path: string): boolean {
  return path in PRIMITIVES;
}

/** List all primitive paths */
export function listPrimitives(): string[] {
  return Object.keys(PRIMITIVES);
}
