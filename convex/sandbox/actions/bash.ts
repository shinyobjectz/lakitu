"use node";

/**
 * Bash Action
 *
 * Internal action for shell execution.
 * Runs commands with timeout handling and output capture.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+[\/~]/i, // rm -rf with root or home
  /sudo/i,
  /chmod\s+777/i,
  />\s*\/etc/i, // writing to /etc
  /curl.*\|\s*(ba)?sh/i, // curl piped to shell
  /wget.*\|\s*(ba)?sh/i,
];

function isSafeCommand(command: string): { safe: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        safe: false,
        reason: `Command matches dangerous pattern: ${pattern}`,
      };
    }
  }
  return { safe: true };
}

export const execute = internalAction({
  args: {
    command: v.string(),
    cwd: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { spawn } = await import("child_process");

    // Safety check
    const safety = isSafeCommand(args.command);
    if (!safety.safe) {
      return {
        success: false,
        error: `Command blocked: ${safety.reason}`,
        command: args.command,
      };
    }

    const cwd = args.cwd || "/home/user/workspace";
    const timeout = args.timeoutMs || 60000;

    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn("bash", ["-c", args.command], {
        cwd,
        env: {
          ...process.env,
          HOME: "/home/user",
          PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
        },
      });

      // Set timeout
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 1000);
      }, timeout);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 100000) {
          stdout = stdout.slice(-100000);
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > 100000) {
          stderr = stderr.slice(-100000);
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (timedOut) {
          resolve({
            success: false,
            error: `Command timed out after ${timeout}ms`,
            command: args.command,
            durationMs,
            stdout: stdout.slice(0, 5000),
            stderr: stderr.slice(0, 5000),
          });
          return;
        }

        resolve({
          success: code === 0,
          exitCode: code,
          command: args.command,
          durationMs,
          stdout,
          stderr,
        });
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: error.message,
          command: args.command,
        });
      });
    });
  },
});
