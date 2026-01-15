/**
 * Local KSA Template
 *
 * Use this template when creating a KSA that operates locally in the sandbox.
 * (filesystem, bash commands, local binaries)
 *
 * USAGE:
 * 1. Copy this file to ksa/<name>.ts
 * 2. Implement functions using fs, exec, or other local APIs
 * 3. Add to ksa/index.ts registry
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface ExampleResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Example function that runs a bash command.
 *
 * @param arg - Command argument
 * @returns Result of command
 *
 * @example
 * const result = await runCommand('--version');
 * console.log(result.data);
 */
export async function runCommand(arg: string): Promise<ExampleResult> {
  try {
    const { stdout, stderr } = await execAsync(`my-command ${arg}`, {
      timeout: 30_000,
      cwd: "/home/user/workspace",
    });

    return {
      success: true,
      data: stdout.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Example function that reads a file.
 *
 * @param filePath - Path to file
 * @returns File contents
 *
 * @example
 * const content = await readFile('/home/user/workspace/config.json');
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/**
 * Example function that writes a file.
 *
 * @param filePath - Path to file
 * @param content - Content to write
 *
 * @example
 * await writeFile('/home/user/artifacts/output.txt', 'Hello world');
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

// ============================================================================
// DON'T FORGET: Add to ksa/index.ts
// ============================================================================

/*
Add to KSA_REGISTRY in ksa/index.ts:

{
  name: "example",
  description: "Brief description of what this KSA does",
  category: "system", // local KSAs are usually "system" category
  functions: ["runCommand", "readFile", "writeFile"],
  importPath: "./ksa/example",
},

And add export:

export * as example from "./example";
*/
