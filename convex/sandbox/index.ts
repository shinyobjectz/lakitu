/**
 * Sandbox Agent - Main Entry Point
 *
 * Re-exports all public APIs for the sandbox agent.
 */

// ============================================
// Agent
// ============================================
export {
  startThread,
  continueThread,
  runWithTimeout,
  getThreadMessages,
  getStreamDeltas,
} from "./agent";
export * as decisions from "./agent/decisions";

// ============================================
// State Management
// ============================================
export * as state from "./state";
export * as files from "./state/files";
export * as checkpoints from "./state/checkpoints";
export * as verification from "./state/verification";
export * as artifacts from "./state/artifacts";

// ============================================
// Planning
// ============================================
export * as planning from "./planning";
export * as beads from "./planning/beads";
export * as sync from "./planning/sync";

// ============================================
// Context
// ============================================
export * as context from "./context";
export * as session from "./context/session";

// ============================================
// Tools (DEPRECATED - Use KSAs instead)
// ============================================
// Legacy tool system has been removed. Use the KSA (Knowledge, Skills, Abilities)
// architecture with code execution mode instead. See packages/lakitu/ksa/

// ============================================
// Prompts
// ============================================
export * as prompts from "./prompts/system";
export * as modes from "./prompts/modes";
