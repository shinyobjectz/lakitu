/**
 * LoroBeads Type Definitions
 * 
 * Core types for CRDT-backed task planning with Beads semantics.
 */

// ============================================
// Issue Types
// ============================================

export type IssueType = "goal" | "deliverable" | "discovery" | "task" | "research";
export type IssueStatus = "open" | "in_progress" | "done" | "blocked" | "wontfix";

export interface BeadsIssue {
  id: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  priority: number; // 0 = critical, 4 = low
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateIssueInput {
  title: string;
  type: IssueType;
  priority?: number;
  description?: string;
}

export interface UpdateIssueInput {
  status?: IssueStatus;
  priority?: number;
  description?: string;
}

// ============================================
// Dependency Types
// ============================================

export interface Dependency {
  blockedBy: string[];  // Issue IDs that block this issue
  parent?: string;      // Parent issue ID (for hierarchy)
}

export interface DependencyTree {
  roots: TreeNode[];
}

export interface TreeNode {
  issue: BeadsIssue;
  children: TreeNode[];
  blockedBy: BeadsIssue[];
}

// ============================================
// Memory Types
// ============================================

export type MemoryType = "fact" | "discovery" | "decision" | "observation";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  fromIssue?: string;  // Issue ID that triggered this memory
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  fromIssue?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Document Types
// ============================================

export interface LoroBeadsState {
  version: string;
  cardId?: string;
  createdAt: number;
  issues: BeadsIssue[];
  dependencies: Record<string, Dependency>;
  memory: MemoryEntry[];
}
