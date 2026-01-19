/**
 * Loro CRDT primitives for Lakitu
 * 
 * - LoroBeads: CRDT-backed task planning with dependencies and memory
 * - LoroFS: CRDT-backed filesystem tree for workspace persistence
 */

export { LoroBeads } from "./beads";
export { LoroFS } from "./fs";

export type {
  // Beads types
  BeadsIssue,
  IssueType,
  IssueStatus,
  CreateIssueInput,
  UpdateIssueInput,
  Dependency,
  DependencyTree,
  TreeNode,
  MemoryEntry,
  MemoryType,
  CreateMemoryInput,
  LoroBeadsState,
} from "./beads-types";

export type {
  // FS types
  FSNode,
  FSNodeType,
  FSNodeWithPath,
  LoroFSState,
  CaptureOptions,
  CaptureResult,
  RestoreResult,
  VFSManifestEntry,
} from "./fs-types";
