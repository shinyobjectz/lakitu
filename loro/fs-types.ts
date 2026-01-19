/**
 * LoroFS Types - Filesystem CRDT types
 */

/** Node type in the filesystem tree */
export type FSNodeType = "file" | "directory";

/** Metadata for a filesystem node */
export interface FSNode {
  name: string;
  type: FSNodeType;
  size?: number;
  hash?: string;  // Content hash for dedup (SHA-256)
  r2Key?: string; // R2 storage key
  mtime: number;  // Last modification timestamp
  mode?: number;  // File permissions
}

/** A node with its full path */
export interface FSNodeWithPath {
  id: string;
  path: string;
  node: FSNode;
}

/** Serialized state for export/import */
export interface LoroFSState {
  version: string;
  cardId?: string;
  capturedAt: number;
  rootPath: string;
  nodes: FSNodeWithPath[];
}

/** Options for workspace capture */
export interface CaptureOptions {
  exclude?: string[];  // Glob patterns to exclude
  basePath?: string;   // Base path (default: /home/user/workspace)
}

/** Result of a capture operation */
export interface CaptureResult {
  filesUploaded: number;
  directoriesCreated: number;
  totalSize: number;
  snapshot: Uint8Array;
}

/** Result of a restore operation */
export interface RestoreResult {
  filesRestored: number;
  directoriesCreated: number;
  totalSize: number;
}

/** VFS manifest entry (for R2 storage tracking) */
export interface VFSManifestEntry {
  path: string;
  r2Key: string;
  size: number;
  type: string;
  hash?: string;
}
