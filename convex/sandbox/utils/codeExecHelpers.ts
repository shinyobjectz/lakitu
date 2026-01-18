/**
 * Code Execution Helpers
 *
 * Pure functions for parsing and preparing code for execution.
 * These don't require Node.js APIs.
 */

/**
 * Extract code blocks from LLM response text.
 *
 * Supports:
 * - ```typescript ... ```
 * - ```ts ... ```
 * - ```javascript ... ```
 * - ```js ... ```
 * - ``` ... ``` (unmarked, treated as TypeScript)
 */
export function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];

  // Match fenced code blocks
  const fenceRegex = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = fenceRegex.exec(text)) !== null) {
    const code = match[1].trim();
    if (code.length > 0) {
      blocks.push(code);
    }
  }

  return blocks;
}

/**
 * Wrap code to ensure it can import from KSAs.
 *
 * Adds the necessary import path setup if not already present.
 */
export function wrapCodeForExecution(code: string): string {
  // If code already has imports from KSAs, use it as-is
  if (code.includes("from './ksa/") || code.includes('from "./ksa/')) {
    return code;
  }

  // If code has imports from 'ksa/', adjust the path
  if (code.includes("from 'ksa/") || code.includes('from "ksa/')) {
    return code.replace(/from ['"]KSAs\//g, "from './ksa/");
  }

  return code;
}
