/**
 * LoroBeads - CRDT-backed Task Planning
 * 
 * Combines Loro's conflict-free state management with Beads task semantics
 * for multi-agent coordination with dependency tracking and memory.
 */

import { LoroDoc, UndoManager } from "loro-crdt";
import type {
  BeadsIssue,
  CreateIssueInput,
  UpdateIssueInput,
  Dependency,
  DependencyTree,
  TreeNode,
  MemoryEntry,
  CreateMemoryInput,
  LoroBeadsState,
  IssueStatus,
} from "./beads-types";

// Generate short collision-resistant ID
function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * LoroBeads - Unified CRDT-backed task planning
 * 
 * Document structure:
 * - meta: LoroMap (version, cardId, createdAt)
 * - issues: LoroList<LoroMap> (task entries)
 * - dependencies: LoroMap (issueId -> { blockedBy, parent })
 * - memory: LoroList<LoroMap> (agent memory entries)
 */
export class LoroBeads {
  private doc: LoroDoc;
  private undoManager: UndoManager;

  constructor(cardId?: string) {
    this.doc = new LoroDoc();
    this.undoManager = new UndoManager(this.doc);

    // Initialize document structure
    const meta = this.doc.getMap("meta");
    meta.set("version", "1.0");
    meta.set("createdAt", Date.now());
    if (cardId) meta.set("cardId", cardId);

    this.doc.getList("issues");
    this.doc.getMap("dependencies");
    this.doc.getList("memory");
    this.doc.commit();
  }

  // ============================================
  // Issue CRUD
  // ============================================

  /** Create a new issue */
  create(input: CreateIssueInput): string {
    const id = genId();
    const issue: BeadsIssue = {
      id,
      title: input.title,
      type: input.type,
      status: "open",
      priority: input.priority ?? 2,
      description: input.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const issues = this.doc.getList("issues");
    issues.push(issue);
    this.doc.commit();
    return id;
  }

  /** Update an existing issue */
  update(id: string, patch: UpdateIssueInput): boolean {
    const issues = this.doc.getList("issues");
    const arr = issues.toArray() as BeadsIssue[];
    const index = arr.findIndex((i) => i.id === id);
    if (index === -1) return false;

    const current = arr[index];
    const updated: BeadsIssue = { ...current, ...patch, updatedAt: Date.now() };
    issues.delete(index, 1);
    issues.insert(index, updated);
    this.doc.commit();
    return true;
  }

  /** Close an issue as done */
  close(id: string, reason?: string): boolean {
    const issues = this.doc.getList("issues");
    const arr = issues.toArray() as BeadsIssue[];
    const index = arr.findIndex((i) => i.id === id);
    if (index === -1) return false;

    const current = arr[index];
    const description = reason
      ? `${current.description || ""}\n[DONE] ${reason}`.trim()
      : current.description;

    const updated: BeadsIssue = { ...current, status: "done", description, updatedAt: Date.now() };
    issues.delete(index, 1);
    issues.insert(index, updated);
    this.doc.commit();
    return true;
  }

  /** Get an issue by ID */
  get(id: string): BeadsIssue | undefined {
    return (this.doc.getList("issues").toArray() as BeadsIssue[]).find((i) => i.id === id);
  }

  /** List all issues with optional filter */
  list(filter?: { status?: IssueStatus; type?: string }): BeadsIssue[] {
    let issues = this.doc.getList("issues").toArray() as BeadsIssue[];
    if (filter?.status) issues = issues.filter((i) => i.status === filter.status);
    if (filter?.type) issues = issues.filter((i) => i.type === filter.type);
    return issues;
  }

  // ============================================
  // Dependency Management
  // ============================================

  /** Add a blocking dependency (blocker must complete before blocked) */
  addDependency(blocker: string, blocked: string): void {
    const deps = this.doc.getMap("dependencies");
    const current = (deps.get(blocked) as Dependency) || { blockedBy: [] };
    if (!current.blockedBy.includes(blocker)) {
      current.blockedBy.push(blocker);
      deps.set(blocked, current);
      this.doc.commit();
    }
  }

  /** Remove a blocking dependency */
  removeDependency(blocker: string, blocked: string): void {
    const deps = this.doc.getMap("dependencies");
    const current = deps.get(blocked) as Dependency | undefined;
    if (current) {
      current.blockedBy = current.blockedBy.filter((id) => id !== blocker);
      deps.set(blocked, current);
      this.doc.commit();
    }
  }

  /** Set parent-child relationship */
  setParent(child: string, parent: string): void {
    const deps = this.doc.getMap("dependencies");
    const current = (deps.get(child) as Dependency) || { blockedBy: [] };
    current.parent = parent;
    deps.set(child, current);
    this.doc.commit();
  }

  /** Get dependencies for an issue */
  getDependencies(id: string): Dependency {
    return (this.doc.getMap("dependencies").get(id) as Dependency) || { blockedBy: [] };
  }

  // ============================================
  // Beads Algorithms
  // ============================================

  /** Find issues that are ready to work on (no unfinished blockers) */
  ready(filter?: { type?: string }): BeadsIssue[] {
    const issues = this.doc.getList("issues").toArray() as BeadsIssue[];
    const deps = this.doc.getMap("dependencies");
    const blockedSet = new Set<string>();

    for (const [issueId, dep] of Object.entries(deps.toJSON())) {
      const dependency = dep as Dependency;
      for (const blockerId of dependency.blockedBy) {
        const blocker = issues.find((i) => i.id === blockerId);
        if (blocker && blocker.status !== "done") blockedSet.add(issueId);
      }
    }

    let ready = issues.filter((i) => i.status === "open" && !blockedSet.has(i.id));
    if (filter?.type) ready = ready.filter((i) => i.type === filter.type);
    return ready.sort((a, b) => a.priority - b.priority);
  }

  /** Find all blocked issues */
  blocked(): BeadsIssue[] {
    const issues = this.doc.getList("issues").toArray() as BeadsIssue[];
    const deps = this.doc.getMap("dependencies");
    const blockedSet = new Set<string>();

    for (const [issueId, dep] of Object.entries(deps.toJSON())) {
      const dependency = dep as Dependency;
      for (const blockerId of dependency.blockedBy) {
        const blocker = issues.find((i) => i.id === blockerId);
        if (blocker && blocker.status !== "done") blockedSet.add(issueId);
      }
    }
    return issues.filter((i) => i.status !== "done" && blockedSet.has(i.id));
  }

  /** Build dependency tree for visualization */
  tree(): DependencyTree {
    const issues = this.doc.getList("issues").toArray() as BeadsIssue[];
    const deps = this.doc.getMap("dependencies").toJSON() as Record<string, Dependency>;

    const roots = issues.filter((i) => !deps[i.id]?.parent);

    const buildNode = (issue: BeadsIssue): TreeNode => {
      const dep = deps[issue.id] || { blockedBy: [] };
      const children = issues.filter((i) => deps[i.id]?.parent === issue.id);
      const blockedByIssues = dep.blockedBy
        .map((id) => issues.find((i) => i.id === id))
        .filter(Boolean) as BeadsIssue[];
      return { issue, children: children.map(buildNode), blockedBy: blockedByIssues };
    };

    return { roots: roots.map(buildNode) };
  }

  // ============================================
  // Memory Layer
  // ============================================

  /** Store a memory entry (fact, discovery, decision) */
  remember(input: CreateMemoryInput): string {
    const id = genId();
    const entry: MemoryEntry = {
      id,
      type: input.type,
      content: input.content,
      fromIssue: input.fromIssue,
      timestamp: Date.now(),
      metadata: input.metadata,
    };
    this.doc.getList("memory").push(entry);
    this.doc.commit();
    return id;
  }

  /** Recall memory entries */
  recall(options?: { type?: string; limit?: number; fromIssue?: string }): MemoryEntry[] {
    let entries = this.doc.getList("memory").toArray() as MemoryEntry[];
    if (options?.type) entries = entries.filter((e) => e.type === options.type);
    if (options?.fromIssue) entries = entries.filter((e) => e.fromIssue === options.fromIssue);
    entries.sort((a, b) => b.timestamp - a.timestamp);
    if (options?.limit) entries = entries.slice(0, options.limit);
    return entries;
  }

  // ============================================
  // Sync Primitives
  // ============================================

  exportSnapshot(): Uint8Array { return this.doc.export({ mode: "snapshot" }); }
  exportFrom(version: Uint8Array): Uint8Array { return this.doc.export({ mode: "update", from: version }); }
  import(data: Uint8Array): void { this.doc.import(data); this.doc.commit(); }
  version(): Uint8Array { return this.doc.version(); }

  toJSON(): LoroBeadsState {
    const meta = this.doc.getMap("meta").toJSON();
    return {
      version: meta.version as string,
      cardId: meta.cardId as string | undefined,
      createdAt: meta.createdAt as number,
      issues: this.doc.getList("issues").toArray() as BeadsIssue[],
      dependencies: this.doc.getMap("dependencies").toJSON() as Record<string, Dependency>,
      memory: this.doc.getList("memory").toArray() as MemoryEntry[],
    };
  }

  fromJSON(state: LoroBeadsState): void {
    const issues = this.doc.getList("issues");
    const deps = this.doc.getMap("dependencies");
    const memory = this.doc.getList("memory");

    while (issues.length > 0) issues.delete(0, 1);
    while (memory.length > 0) memory.delete(0, 1);

    const meta = this.doc.getMap("meta");
    meta.set("version", state.version);
    meta.set("createdAt", state.createdAt);
    if (state.cardId) meta.set("cardId", state.cardId);

    for (const issue of state.issues) issues.push(issue);
    for (const [id, dep] of Object.entries(state.dependencies)) deps.set(id, dep);
    for (const entry of state.memory) memory.push(entry);
    this.doc.commit();
  }

  // ============================================
  // History
  // ============================================

  undo(): boolean { return this.undoManager.undo(); }
  redo(): boolean { return this.undoManager.redo(); }
  checkpoint(): Uint8Array { return this.version(); }
}
