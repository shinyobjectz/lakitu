/**
 * Artifacts KSA - Knowledge, Skills, and Abilities
 *
 * Save and retrieve artifacts that persist across sandbox sessions.
 * Use this to create outputs that will be available after the agent finishes.
 *
 * CATEGORY: core
 *
 * @example
 * import { saveArtifact, readArtifact, listArtifacts } from './ksa/artifacts';
 *
 * // Save a markdown report
 * await saveArtifact({
 *   name: 'market-analysis-report.md',
 *   type: 'markdown',
 *   content: '# Market Analysis\n\n...',
 * });
 *
 * // Read a previous artifact
 * const report = await readArtifact('abc123');
 *
 * // List all artifacts
 * const artifacts = await listArtifacts();
 */

import { callGateway, THREAD_ID, CARD_ID } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface Artifact {
  id: string;
  name: string;
  type: "markdown" | "json" | "csv" | "text" | "html" | "pdf";
  content?: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export interface SaveArtifactParams {
  name: string;
  type: "markdown" | "json" | "csv" | "text" | "html";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SaveResult {
  success: boolean;
  id?: string;
  name?: string;
  error?: string;
}

export interface ReadResult {
  success: boolean;
  name?: string;
  type?: string;
  content?: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface ListResult {
  success: boolean;
  artifacts: Artifact[];
  count: number;
  error?: string;
}

// ============================================================================
// Legacy Gateway Config (kept for backwards compatibility)
// ============================================================================

let gatewayConfig: { convexUrl: string; jwt: string; cardId?: string } | null =
  null;

/**
 * @deprecated Gateway config is now read from env vars (GATEWAY_URL, SANDBOX_JWT)
 * This function is kept for backwards compatibility but does nothing.
 */
export function setGatewayConfig(config: {
  convexUrl: string;
  jwt: string;
  cardId?: string;
}) {
  gatewayConfig = config;
}

// ============================================================================
// Skills: Saving Artifacts
// ============================================================================

/**
 * Save an artifact to the cloud.
 *
 * Use this for markdown, JSON, CSV, or text files.
 * For PDFs, use the `pdf.generate()` function instead.
 * For emails, use the `email.send()` function instead.
 *
 * @param params - Name, type, content, and optional metadata
 * @returns Result with success status and artifact ID
 *
 * @example
 * // Save a markdown report
 * const result = await saveArtifact({
 *   name: 'competitive-analysis.md',
 *   type: 'markdown',
 *   content: '# Competitive Analysis\n\n## Overview\n...',
 * });
 *
 * if (result.success) {
 *   console.log(`Saved: ${result.name} (${result.id})`);
 * }
 *
 * @example
 * // Save JSON data
 * await saveArtifact({
 *   name: 'research-data.json',
 *   type: 'json',
 *   content: JSON.stringify(data, null, 2),
 * });
 */
export async function saveArtifact(
  params: SaveArtifactParams
): Promise<SaveResult> {
  // Reject PDF - must use pdf.generate()
  if ((params.type as string) === "pdf") {
    return {
      success: false,
      error:
        "Cannot save PDF with saveArtifact. Use pdf.generate() from ./ksa/pdf instead.",
    };
  }

  // Check for thread-based or card-based context
  const threadId = THREAD_ID;
  const cardId = gatewayConfig?.cardId || CARD_ID;

  // Thread artifacts (agent chat threads)
  if (threadId) {
    try {
      const artifactId = await callGateway<string>(
        "internal.agent.workflows.crudThreads.saveThreadArtifact",
        {
          threadId,
          artifact: {
            name: params.name,
            type: params.type,
            content: params.content,
            metadata: params.metadata,
          },
        },
        "mutation"
      );

      console.log(`[artifacts] Saved thread artifact: ${params.name}`);
      return {
        success: true,
        id: artifactId,
        name: params.name,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  // Card artifacts (kanban workflows)
  if (!cardId) {
    return { success: false, error: "No CARD_ID or THREAD_ID available" };
  }

  try {
    const result = await callGateway<{ id: string }>(
      "features.kanban.artifacts.saveArtifactWithBackup",
      {
        cardId,
        artifact: {
          name: params.name,
          type: params.type,
          content: params.content,
          metadata: params.metadata,
        },
      },
      "action"
    );

    console.log(`[artifacts] Saved artifact: ${params.name}`);
    return {
      success: true,
      id: result?.id,
      name: params.name,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

// ============================================================================
// Skills: Reading Artifacts
// ============================================================================

/**
 * Read an artifact by its ID.
 *
 * Use this to access documents created in earlier stages.
 *
 * @param artifactId - ID of the artifact (from context artifacts list)
 * @returns Artifact content and metadata
 *
 * @example
 * const report = await readArtifact('abc123');
 * if (report.success) {
 *   console.log(report.content);
 * }
 */
export async function readArtifact(artifactId: string): Promise<ReadResult> {
  try {
    const result = await callGateway<any>(
      "features.kanban.artifacts.getArtifact",
      { artifactId },
      "query"
    );

    if (!result) {
      return { success: false, error: `Artifact not found: ${artifactId}` };
    }

    console.log(`[artifacts] Read artifact: ${result.name}`);
    return {
      success: true,
      name: result.name,
      type: result.type,
      content: result.content,
      createdAt: result.createdAt,
      metadata: result.metadata,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

/**
 * List all artifacts for the current context (thread or card).
 *
 * For threads: Shows artifacts saved in this chat thread.
 * For cards: Shows artifacts from all stages.
 *
 * @returns List of artifacts with IDs, names, and types
 *
 * @example
 * const { artifacts } = await listArtifacts();
 * for (const art of artifacts) {
 *   console.log(`${art.name} (${art.type})`);
 * }
 */
export async function listArtifacts(): Promise<ListResult> {
  // Check for thread-based or card-based context
  const threadId = THREAD_ID;
  const cardId = gatewayConfig?.cardId || CARD_ID;

  // Thread artifacts
  if (threadId) {
    try {
      const result = await callGateway<any[]>(
        "internal.agent.workflows.crudThreads.listThreadArtifactsInternal",
        { threadId },
        "query"
      );

      const artifacts = Array.isArray(result) ? result : [];
      console.log(`[artifacts] Listed ${artifacts.length} thread artifacts`);

      return {
        success: true,
        artifacts: artifacts.map((a: any) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          createdAt: a.createdAt,
        })),
        count: artifacts.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, artifacts: [], count: 0 };
    }
  }

  // Card artifacts
  if (!cardId) {
    return { success: false, error: "No CARD_ID or THREAD_ID available", artifacts: [], count: 0 };
  }

  try {
    const result = await callGateway<any[]>(
      "features.kanban.artifacts.listCardArtifacts",
      { cardId },
      "query"
    );

    const artifacts = Array.isArray(result) ? result : [];
    console.log(`[artifacts] Listed ${artifacts.length} artifacts`);

    return {
      success: true,
      artifacts: artifacts.map((a: any) => ({
        id: a._id,
        name: a.name,
        type: a.type,
        createdAt: a.createdAt,
      })),
      count: artifacts.length,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg, artifacts: [], count: 0 };
  }
}
