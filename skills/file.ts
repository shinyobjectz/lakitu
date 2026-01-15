/**
 * File Skills
 *
 * Functions for reading, writing, and searching files.
 * These operate on the local filesystem in the sandbox.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Functions
// ============================================================================

/**
 * Read a file's contents.
 *
 * @param filePath - Path to the file
 * @returns File contents as string
 *
 * @example
 * const content = await read('/home/user/workspace/package.json');
 * const pkg = JSON.parse(content);
 * console.log(pkg.name);
 */
export async function read(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Write content to a file. Creates the file if it doesn't exist.
 *
 * @param filePath - Path to the file
 * @param content - Content to write
 *
 * @example
 * await write('/home/user/workspace/output.txt', 'Hello, world!');
 */
export async function write(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Edit a file by replacing text.
 *
 * @param filePath - Path to the file
 * @param oldText - Text to find (must be unique in file)
 * @param newText - Text to replace with
 *
 * @example
 * await edit('/home/user/workspace/config.ts',
 *   'debug: false',
 *   'debug: true'
 * );
 */
export async function edit(
  filePath: string,
  oldText: string,
  newText: string
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');

  const occurrences = content.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new Error(`Text not found in file: "${oldText.slice(0, 50)}..."`);
  }
  if (occurrences > 1) {
    throw new Error(`Text appears ${occurrences} times, must be unique. Add more context.`);
  }

  const newContent = content.replace(oldText, newText);
  await fs.writeFile(filePath, newContent, 'utf-8');
}

/**
 * Find files matching a glob pattern.
 *
 * @param pattern - Glob pattern (e.g., "**\/*.ts")
 * @param cwd - Directory to search in (default: /home/user/workspace)
 * @returns Array of matching file paths
 *
 * @example
 * const tsFiles = await glob('**\/*.ts');
 * console.log(`Found ${tsFiles.length} TypeScript files`);
 */
export async function glob(
  pattern: string,
  cwd = '/home/user/workspace'
): Promise<string[]> {
  const { stdout } = await execAsync(
    `find . -type f -name "${pattern}" 2>/dev/null | head -100`,
    { cwd }
  );
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(f => path.join(cwd, f));
}

/**
 * Search file contents for a pattern.
 *
 * @param pattern - Regex pattern to search for
 * @param cwd - Directory to search in (default: /home/user/workspace)
 * @returns Array of matches with file, line number, and content
 *
 * @example
 * const matches = await grep('TODO:');
 * for (const m of matches) {
 *   console.log(`${m.file}:${m.line}: ${m.content}`);
 * }
 */
export async function grep(
  pattern: string,
  cwd = '/home/user/workspace'
): Promise<Array<{ file: string; line: number; content: string }>> {
  try {
    const { stdout } = await execAsync(
      `grep -rn "${pattern}" . 2>/dev/null | head -50`,
      { cwd }
    );
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
        if (!match) return null;
        return {
          file: path.join(cwd, match[1]),
          line: parseInt(match[2]),
          content: match[3].trim(),
        };
      })
      .filter(Boolean) as Array<{ file: string; line: number; content: string }>;
  } catch {
    return []; // No matches
  }
}

/**
 * List directory contents.
 *
 * @param dirPath - Path to directory
 * @returns Array of file/directory names
 *
 * @example
 * const files = await ls('/home/user/workspace');
 * console.log(files);
 */
export async function ls(dirPath: string): Promise<string[]> {
  return fs.readdir(dirPath);
}
