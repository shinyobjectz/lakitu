/**
 * LoroFS - CRDT-backed Filesystem Tree
 * 
 * Uses Loro's MovableTree for hierarchical filesystem tracking with:
 * - Concurrent edit support (multi-agent)
 * - Ordered children (file ordering in directories)
 * - Metadata per node (name, size, hash, timestamps)
 * - Incremental sync + snapshot compaction
 * 
 * File contents are stored externally in R2, referenced by content hash.
 */

import { LoroDoc, UndoManager } from "loro-crdt";
import type { FSNode, FSNodeWithPath, LoroFSState, VFSManifestEntry } from "./fs-types";

/**
 * LoroFS - Filesystem tree with CRDT sync
 */
export class LoroFS {
  private doc: LoroDoc;
  private undoManager: UndoManager;
  private rootPath: string;

  constructor(options?: { cardId?: string; rootPath?: string }) {
    this.doc = new LoroDoc();
    this.undoManager = new UndoManager(this.doc);
    this.rootPath = options?.rootPath || "/home/user/workspace";

    // Initialize document structure
    const meta = this.doc.getMap("meta");
    meta.set("version", "1.0");
    meta.set("createdAt", Date.now());
    meta.set("rootPath", this.rootPath);
    if (options?.cardId) meta.set("cardId", options.cardId);

    // Initialize the tree with root node
    const tree = this.doc.getTree("fs");
    const root = tree.createNode();
    const rootData = root.data;
    rootData.set("name", this.rootPath.split("/").pop() || "workspace");
    rootData.set("type", "directory");
    rootData.set("mtime", Date.now());
    
    this.doc.commit();
  }

  // ============================================
  // Node Operations
  // ============================================

  /** Create a file or directory node */
  createNode(parentPath: string, data: FSNode): string {
    const tree = this.doc.getTree("fs");
    const parent = this.findNodeByPath(parentPath);
    
    if (!parent) {
      this.ensureDirectory(parentPath);
    }

    const parentNode = this.findNodeByPath(parentPath);
    if (!parentNode) throw new Error(`Parent path not found: ${parentPath}`);

    const node = tree.createNode(parentNode.id);
    const nodeData = node.data;
    nodeData.set("name", data.name);
    nodeData.set("type", data.type);
    nodeData.set("mtime", data.mtime || Date.now());
    if (data.size !== undefined) nodeData.set("size", data.size);
    if (data.hash) nodeData.set("hash", data.hash);
    if (data.r2Key) nodeData.set("r2Key", data.r2Key);
    if (data.mode !== undefined) nodeData.set("mode", data.mode);

    this.doc.commit();
    return node.id;
  }

  /** Ensure a directory exists, creating parent directories as needed */
  ensureDirectory(path: string): string {
    const parts = this.getPathParts(path);
    let currentPath = this.rootPath;
    let parentId: string | undefined;

    const tree = this.doc.getTree("fs");
    const roots = tree.roots();
    if (roots.length === 0) throw new Error("No root node");
    parentId = roots[0].id;

    for (const part of parts) {
      currentPath = `${currentPath}/${part}`;
      const existing = this.findNodeByPath(currentPath);
      
      if (existing) {
        parentId = existing.id;
      } else {
        const node = tree.createNode(parentId);
        node.data.set("name", part);
        node.data.set("type", "directory");
        node.data.set("mtime", Date.now());
        parentId = node.id;
      }
    }

    this.doc.commit();
    return parentId!;
  }

  /** Update a node's metadata */
  updateNode(path: string, patch: Partial<FSNode>): boolean {
    const node = this.findNodeByPath(path);
    if (!node) return false;

    const tree = this.doc.getTree("fs");
    const treeNode = tree.getNodeByID(node.id);
    if (!treeNode) return false;

    const data = treeNode.data;
    if (patch.name !== undefined) data.set("name", patch.name);
    if (patch.type !== undefined) data.set("type", patch.type);
    if (patch.size !== undefined) data.set("size", patch.size);
    if (patch.hash !== undefined) data.set("hash", patch.hash);
    if (patch.r2Key !== undefined) data.set("r2Key", patch.r2Key);
    if (patch.mtime !== undefined) data.set("mtime", patch.mtime);
    if (patch.mode !== undefined) data.set("mode", patch.mode);

    this.doc.commit();
    return true;
  }

  /** Move a node (rename = move to same parent with new name) */
  moveNode(fromPath: string, toPath: string): boolean {
    const node = this.findNodeByPath(fromPath);
    if (!node) return false;

    const tree = this.doc.getTree("fs");
    const treeNode = tree.getNodeByID(node.id);
    if (!treeNode) return false;

    const toPathParts = toPath.split("/");
    const newName = toPathParts.pop()!;
    const newParentPath = toPathParts.join("/") || this.rootPath;
    const newParentId = this.ensureDirectory(newParentPath);

    treeNode.move(newParentId);
    treeNode.data.set("name", newName);
    treeNode.data.set("mtime", Date.now());

    this.doc.commit();
    return true;
  }

  /** Delete a node (and all children for directories) */
  deleteNode(path: string): boolean {
    const node = this.findNodeByPath(path);
    if (!node) return false;

    this.doc.getTree("fs").delete(node.id);
    this.doc.commit();
    return true;
  }

  /** Get a node by path */
  getNode(path: string): FSNodeWithPath | null {
    return this.findNodeByPath(path);
  }

  // ============================================
  // Tree Traversal
  // ============================================

  /** List all paths in the tree */
  listPaths(): FSNodeWithPath[] {
    const result: FSNodeWithPath[] = [];
    const tree = this.doc.getTree("fs");
    const roots = tree.roots();
    if (roots.length === 0) return result;

    const walk = (nodeId: string, parentPath: string) => {
      const node = tree.getNodeByID(nodeId);
      if (!node) return;

      const data = node.data.toJSON() as FSNode;
      const path = parentPath === this.rootPath ? parentPath : `${parentPath}/${data.name}`;
      result.push({ id: nodeId, path, node: data });

      const children = node.children();
      if (children) {
        for (const child of children) walk(child.id, path);
      }
    };

    walk(roots[0].id, this.rootPath.split("/").slice(0, -1).join("/") || "");
    return result;
  }

  /** List only files */
  listFiles(): FSNodeWithPath[] {
    return this.listPaths().filter(n => n.node.type === "file");
  }

  /** List only directories */
  listDirectories(): FSNodeWithPath[] {
    return this.listPaths().filter(n => n.node.type === "directory");
  }

  /** Get VFS manifest (for R2 storage tracking) */
  getVFSManifest(): VFSManifestEntry[] {
    return this.listFiles()
      .filter(f => f.node.r2Key)
      .map(f => ({
        path: f.path,
        r2Key: f.node.r2Key!,
        size: f.node.size || 0,
        type: f.node.type,
        hash: f.node.hash,
      }));
  }

  // ============================================
  // Sync Primitives
  // ============================================

  exportSnapshot(): Uint8Array { return this.doc.export({ mode: "snapshot" }); }
  exportFrom(version: Uint8Array): Uint8Array { return this.doc.export({ mode: "update", from: version }); }
  import(data: Uint8Array): void { this.doc.import(data); this.doc.commit(); }
  version(): Uint8Array { return this.doc.version(); }

  toJSON(): LoroFSState {
    const meta = this.doc.getMap("meta").toJSON();
    return {
      version: meta.version as string,
      cardId: meta.cardId as string | undefined,
      capturedAt: meta.updatedAt as number || Date.now(),
      rootPath: this.rootPath,
      nodes: this.listPaths(),
    };
  }

  static fromSnapshot(snapshot: Uint8Array, options?: { rootPath?: string }): LoroFS {
    const fs = new LoroFS(options);
    fs.doc.import(snapshot);
    fs.doc.commit();
    const meta = fs.doc.getMap("meta").toJSON();
    if (meta.rootPath) fs.rootPath = meta.rootPath as string;
    return fs;
  }

  // ============================================
  // History
  // ============================================

  undo(): boolean { return this.undoManager.undo(); }
  redo(): boolean { return this.undoManager.redo(); }

  // ============================================
  // Helpers
  // ============================================

  private getPathParts(path: string): string[] {
    const relativePath = path.startsWith(this.rootPath) ? path.slice(this.rootPath.length) : path;
    return relativePath.split("/").filter(Boolean);
  }

  private findNodeByPath(path: string): FSNodeWithPath | null {
    const tree = this.doc.getTree("fs");
    const roots = tree.roots();
    if (roots.length === 0) return null;

    if (path === this.rootPath) {
      const root = roots[0];
      return { id: root.id, path: this.rootPath, node: root.data.toJSON() as FSNode };
    }

    const parts = this.getPathParts(path);
    let currentNode = roots[0];
    let currentPath = this.rootPath;

    for (const part of parts) {
      const children = currentNode.children();
      if (!children) return null;

      let found = false;
      for (const child of children) {
        const data = child.data.toJSON() as FSNode;
        if (data.name === part) {
          currentNode = child;
          currentPath = `${currentPath}/${part}`;
          found = true;
          break;
        }
      }
      if (!found) return null;
    }

    return { id: currentNode.id, path: currentPath, node: currentNode.data.toJSON() as FSNode };
  }
}
