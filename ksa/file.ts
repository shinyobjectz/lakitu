/**
 * File KSA - File system operations
 *
 * Provides functions for reading, writing, and searching files in the sandbox.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

/**
 * Read a file's contents
 *
 * @example
 * const content = await read('/home/user/workspace/file.txt');
 */
export async function read(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/**
 * Write content to a file (creates directories if needed)
 *
 * @example
 * await write('/home/user/workspace/output.txt', 'Hello World');
 */
export async function write(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Edit a file by replacing text (must be unique)
 *
 * @example
 * await edit('/home/user/workspace/file.txt', 'old text', 'new text');
 */
export async function edit(filePath: string, oldText: string, newText: string): Promise<void> {
  const content = await fs.readFile(filePath, "utf-8");
  const occurrences = content.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new Error(`Text not found in file: "${oldText.slice(0, 50)}..."`);
  }
  if (occurrences > 1) {
    throw new Error(`Text appears ${occurrences} times, must be unique`);
  }
  await fs.writeFile(filePath, content.replace(oldText, newText), "utf-8");
}

/**
 * Find files matching a pattern
 *
 * @example
 * const files = await glob('*.ts');
 * const tsFiles = await glob('**/*.ts', '/home/user/workspace');
 */
export async function glob(pattern: string, cwd?: string): Promise<string[]> {
  const effectiveCwd = await getEffectiveCwd(cwd);
  const safePattern = escapeShellArg(pattern);
  try {
    const { stdout } = await execAsync(
      `find . -type f -name "${safePattern}" 2>/dev/null | head -100`,
      { cwd: effectiveCwd }
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => path.join(effectiveCwd, f));
  } catch {
    return [];
  }
}

/**
 * Search file contents for a pattern
 *
 * @example
 * const matches = await grep('TODO');
 * const matches = await grep('function', '/home/user/workspace', { literal: true });
 */
export async function grep(
  pattern: string,
  cwd?: string,
  options?: { literal?: boolean }
): Promise<GrepMatch[]> {
  try {
    const effectiveCwd = await getEffectiveCwd(cwd);
    const grepFlag = options?.literal ? "-F" : "";
    const safePattern = options?.literal
      ? escapeShellArg(pattern)
      : escapeShellArg(escapeGrepPattern(pattern));
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
}

/**
 * List directory contents
 *
 * @example
 * const files = await ls('/home/user/workspace');
 */
export async function ls(dirPath: string): Promise<string[]> {
  return fs.readdir(dirPath);
}

/**
 * Check if a file exists
 *
 * @example
 * if (await exists('/home/user/workspace/file.txt')) { ... }
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
