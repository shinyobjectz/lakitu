"use node";

/**
 * Verification Actions - Node.js Runtime
 *
 * Run tests and linters after edits to catch regressions early.
 * Supports baseline comparisons and rollback on failure.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// Types
// ============================================

interface VerificationResult {
  success: boolean;
  checks: Array<{
    name: string;
    success: boolean;
    output?: string;
    durationMs?: number;
  }>;
}

interface TestSuiteResult {
  success: boolean;
  exitCode: number | null;
  output?: string;
  errors?: string;
  durationMs: number;
  timedOut?: boolean;
  testCommand: string;
}

interface RegressionReport {
  hasRegressions: boolean;
  regressions: string[];
  fixed: string[];
  baselineFailureCount: number;
  currentFailureCount: number;
}

// ============================================
// Actions (run actual verification)
// ============================================

/**
 * Verify a file after edit (run linter/type checker)
 */
export const verifyFile = internalAction({
  args: {
    path: v.string(),
    cwd: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VerificationResult> => {
    const cwd = args.cwd || "/home/user/workspace";
    const results: VerificationResult = {
      success: true,
      checks: [],
    };

    // Determine file type and run appropriate checks
    const ext = args.path.split(".").pop()?.toLowerCase();

    if (ext === "ts" || ext === "tsx") {
      // Run TypeScript type check
      const tscResult = await runCommand("bunx tsc --noEmit", cwd, 30000);
      results.checks.push({
        name: "typescript",
        success: tscResult.exitCode === 0,
        output: tscResult.stderr || tscResult.stdout,
        durationMs: tscResult.durationMs,
      });
      if (tscResult.exitCode !== 0) results.success = false;
    }

    if (ext === "js" || ext === "jsx" || ext === "ts" || ext === "tsx") {
      // Run ESLint
      const eslintResult = await runCommand(
        `bunx eslint "${args.path}" --format compact`,
        cwd,
        15000
      );
      results.checks.push({
        name: "eslint",
        success: eslintResult.exitCode === 0,
        output: eslintResult.stdout,
        durationMs: eslintResult.durationMs,
      });
      // ESLint failures are warnings, not blockers
    }

    if (ext === "py") {
      // Run Python type check
      const mypyResult = await runCommand(`mypy "${args.path}"`, cwd, 30000);
      results.checks.push({
        name: "mypy",
        success: mypyResult.exitCode === 0,
        output: mypyResult.stdout,
        durationMs: mypyResult.durationMs,
      });
      if (mypyResult.exitCode !== 0) results.success = false;
    }

    return results;
  },
});

/**
 * Run the test suite and detect regressions
 */
export const runTestSuite = internalAction({
  args: {
    cwd: v.optional(v.string()),
    testCommand: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TestSuiteResult> => {
    const cwd = args.cwd || "/home/user/workspace";
    const testCommand = args.testCommand || detectTestCommand(cwd);
    const timeoutMs = args.timeoutMs || 120000; // 2 minutes default

    const result = await runCommand(testCommand, cwd, timeoutMs);

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      output: result.stdout,
      errors: result.stderr,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      testCommand,
    };
  },
});

/**
 * Compare test results to detect regressions
 */
export const compareTestResults = internalAction({
  args: {
    baseline: v.any(), // TestSuiteResult
    current: v.any(), // TestSuiteResult
  },
  handler: async (ctx, args): Promise<RegressionReport> => {
    const baseline = args.baseline as TestSuiteResult;
    const current = args.current as TestSuiteResult;

    // Parse test output to extract failure names
    const baselineFailures = parseTestFailures(baseline.output || "");
    const currentFailures = parseTestFailures(current.output || "");

    // Find new failures (regressions)
    const regressions = currentFailures.filter(
      (f) => !baselineFailures.includes(f)
    );

    // Find fixed tests
    const fixed = baselineFailures.filter((f) => !currentFailures.includes(f));

    return {
      hasRegressions: regressions.length > 0,
      regressions,
      fixed,
      baselineFailureCount: baselineFailures.length,
      currentFailureCount: currentFailures.length,
    };
  },
});

// ============================================
// Helpers
// ============================================

async function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
}> {
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn("bash", ["-c", command], {
      cwd,
      env: {
        ...process.env,
        HOME: "/home/user",
        PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
      },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 1000);
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > 50000) stdout = stdout.slice(-50000);
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 50000) stderr = stderr.slice(-50000);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
        timedOut,
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout,
        stderr: error.message,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

function detectTestCommand(cwd: string): string {
  // TODO: Actually check for package.json, etc.
  // For now, default to bun test
  return "bun test";
}

function parseTestFailures(output: string): string[] {
  const failures: string[] = [];

  // Parse common test output formats
  // Vitest/Jest format: "FAIL path/to/test.ts"
  const failRegex = /FAIL\s+(.+)/g;
  let match;
  while ((match = failRegex.exec(output)) !== null) {
    failures.push(match[1].trim());
  }

  // Also look for "✗" or "✕" markers
  const xRegex = /[✗✕]\s+(.+)/g;
  while ((match = xRegex.exec(output)) !== null) {
    failures.push(match[1].trim());
  }

  return [...new Set(failures)]; // Dedupe
}
