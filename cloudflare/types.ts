/**
 * Cloudflare Types
 *
 * Common types for workers and R2 integration.
 */

/**
 * Worker environment bindings.
 */
export interface WorkerEnv {
  /** R2 bucket for frames/static sites */
  FRAMES_BUCKET?: R2Bucket;
  /** R2 bucket for git-backed storage */
  GIT_BUCKET?: R2Bucket;
  /** General storage bucket */
  STORAGE_BUCKET?: R2Bucket;
}

/**
 * Frame metadata stored alongside files.
 */
export interface FrameMetadata {
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  files: string[];
  settings?: Record<string, unknown>;
}

/**
 * Git repository metadata.
 */
export interface RepoMetadata {
  repoType: string;
  repoId: string;
  branch: string;
  createdAt: number;
  lastCommit?: string;
}

/**
 * Version/commit info.
 */
export interface VersionInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  files?: string[];
}
