/**
 * Lakitu Cloud Component Schema
 *
 * Tables for agent sessions, threads, skills, and sandbox management.
 * This is a Convex component schema - tables are isolated from the main app.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Session management
  agentSessions: defineTable({
    projectId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    sandboxId: v.optional(v.string()),
    sandboxHost: v.optional(v.string()), // e2b public host URL for direct HTTP
    openCodeSessionId: v.optional(v.string()), // OpenCode session ID for polling
    config: v.optional(v.any()),
    secret: v.optional(v.string()),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    logs: v.optional(v.array(v.string())),
    lastHeartbeat: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_sandbox", ["sandboxId"])
    .index("by_status", ["status"]),

  // Session logs (separated for high-concurrency writes)
  agentSessionLogs: defineTable({
    sessionId: v.id("agentSessions"),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Beads Issues (separated for high-concurrency writes)
  beadsIssues: defineTable({
    cardId: v.string(), // ID from parent app's cards table
    beadsId: v.string(),
    title: v.string(),
    type: v.string(),
    status: v.string(),
    parent: v.optional(v.string()),
    blocks: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    updatedAt: v.number(),
  })
    .index("by_card", ["cardId"])
    .index("by_beadsId", ["beadsId"])
    .index("by_card_beads", ["cardId", "beadsId"]),

  // Project-level conversations (for workflows)
  agentConversations: defineTable({
    projectId: v.string(),
    messages: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      timestamp: v.number(),
      metadata: v.optional(v.any()),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Chat threads
  threads: defineTable({
    userId: v.string(),
    orgId: v.optional(v.string()),
    boardId: v.optional(v.string()),
    workspaceId: v.optional(v.string()), // Workspace-scoped threads
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_org", ["orgId"])
    .index("by_workspace", ["workspaceId"]),

  // Thread messages
  threadMessages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    // Metadata for special message types
    metadata: v.optional(v.object({
      type: v.optional(v.union(
        v.literal("text"),
        v.literal("subagent"),
        v.literal("board_execution"),
        v.literal("frame_preview"),
        v.literal("artifact"),
        v.literal("session_logs")
      )),
      data: v.optional(v.any()),
      // Persisted session logs (CoT) for historical display
      sessionLogs: v.optional(v.object({
        logs: v.array(v.object({
          type: v.string(),
          label: v.string(),
          status: v.optional(v.string()),
          details: v.optional(v.string()),
          data: v.optional(v.any()),
        })),
        status: v.string(),
      })),
      // Generation time in milliseconds
      generationTime: v.optional(v.number()),
      // Chain of thought steps
      thinking: v.optional(v.any()),
    })),
  }).index("by_thread", ["threadId"]),

  // Thread artifacts (for agent chat threads, similar to kanban artifacts)
  threadArtifacts: defineTable({
    threadId: v.id("threads"),
    sessionId: v.optional(v.id("convexSandboxSessions")),
    type: v.string(), // markdown, json, csv, text, html, pdf
    name: v.string(),
    content: v.string(),
    r2Key: v.optional(v.string()), // R2 backup key
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_session", ["sessionId"]),

  // Skill definitions
  skills: defineTable({
    skillId: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    category: v.string(),
    toolIds: v.array(v.string()),
    prompt: v.optional(v.string()),
    configSchema: v.optional(v.any()),
    defaults: v.optional(v.any()),
    isBuiltIn: v.boolean(),
    userId: v.optional(v.string()),
    orgId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_skillId", ["skillId"])
    .index("by_builtin", ["isBuiltIn"])
    .index("by_user", ["userId"]),

  // Beads/Loro snapshots
  beadsSnapshots: defineTable({
    cardId: v.string(), // ID from parent app's cards table
    runId: v.optional(v.string()), // ID from parent app's cardRuns table
    loroSnapshot: v.optional(v.bytes()),
    beadsState: v.string(),
    vfsManifest: v.array(v.object({
      path: v.string(),
      r2Key: v.string(),
      size: v.number(),
      type: v.string(),
    })),
    gitCommit: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_card", ["cardId"])
    .index("by_run", ["runId"]),

  // Beads Loro CRDT updates
  beadsLoroUpdates: defineTable({
    cardId: v.string(), // ID from parent app's cards table
    updateBytes: v.bytes(),
    clientId: v.string(),
    createdAt: v.number(),
  }).index("by_card_time", ["cardId", "createdAt"]),

  // Multi-agent mail coordination
  agentMail: defineTable({
    senderId: v.string(),
    recipientId: v.string(),
    messageType: v.string(),
    payload: v.any(),
    read: v.optional(v.boolean()),
    status: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_recipient", ["recipientId"])
    .index("by_sender", ["senderId"]),

  // UI context for agent interactions
  agentContexts: defineTable({
    userId: v.string(),
    context: v.any(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Custom tool definitions (user/vendor/integration extensible)
  customTools: defineTable({
    toolId: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("core"),
      v.literal("research"),
      v.literal("content"),
      v.literal("workflow"),
      v.literal("integration")
    ),
    exports: v.array(v.object({
      name: v.string(),
      description: v.string(),
    })),
    implementation: v.string(), // TypeScript code
    isBuiltIn: v.boolean(),
    userId: v.optional(v.string()),
    orgId: v.optional(v.string()),
    vendorId: v.optional(v.string()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_toolId", ["toolId"])
    .index("by_builtin", ["isBuiltIn"])
    .index("by_user", ["userId"])
    .index("by_org", ["orgId"])
    .index("by_vendor", ["vendorId"]),

  // Compiled sandbox files stored in R2
  compiledSandbox: defineTable({
    version: v.string(), // Semantic version or timestamp
    type: v.union(v.literal("tool"), v.literal("skill"), v.literal("agent"), v.literal("service")),
    name: v.string(), // e.g., "web", "research", "automator"
    r2Key: v.string(), // R2 storage key
    contentHash: v.string(), // For cache invalidation
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_type_name", ["type", "name"])
    .index("by_version", ["version"]),

  // ============================================
  // Convex Sandbox Sessions (new architecture)
  // Self-hosted Convex in E2B with Agent SDK
  // ============================================

  convexSandboxSessions: defineTable({
    projectId: v.string(),
    prompt: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("starting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("checkpointed")
    ),
    config: v.optional(v.any()),
    // Sandbox info
    sandboxId: v.optional(v.string()),
    sandboxUrl: v.optional(v.string()),
    // Agent thread in sandbox Convex
    threadId: v.optional(v.string()),
    // Results
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    // Checkpointing for chained runs
    checkpointId: v.optional(v.string()),
    iteration: v.number(),
    // Metrics
    metrics: v.optional(v.any()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_sandbox", ["sandboxId"]),

  // Convex sandbox session logs
  convexSandboxLogs: defineTable({
    sessionId: v.id("convexSandboxSessions"),
    message: v.string(), // Plain text or JSON-stringified structured log
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    timestamp: v.number(),
    // Structured log fields (optional)
    stepType: v.optional(v.string()), // thinking, tool, search, file, text
  }).index("by_session", ["sessionId"]),

  // ============================================
  // Model Configuration
  // Centralized LLM model settings
  // ============================================

  modelConfig: defineTable({
    defaultPreset: v.string(), // "fast", "balanced", "capable", "vision"
    presets: v.optional(v.any()), // Custom preset overrides
    useCaseOverrides: v.optional(v.any()), // Per-use-case model overrides
  }),

  // ============================================
  // Sandbox Cache
  // E2B sandbox state caching for fast startup
  // ============================================

  sandboxCache: defineTable({
    templateId: v.string(),
    checkpointId: v.string(),
    configHash: v.optional(v.string()),
    config: v.optional(v.any()),
    state: v.union(
      v.literal("creating"),
      v.literal("ready"),
      v.literal("expired")
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_template", ["templateId"])
    .index("by_checkpoint", ["checkpointId"])
    .index("by_expires", ["expiresAt"]),

  // ============================================
  // Warm Sandbox Pool
  // Pre-warmed E2B sandboxes for fast startup
  // ============================================

  sandboxPool: defineTable({
    sandboxId: v.string(),
    sandboxUrl: v.string(),
    sandboxHost: v.string(),
    status: v.union(
      v.literal("warming"),   // Being created
      v.literal("ready"),     // Available for claiming
      v.literal("claimed"),   // In use
      v.literal("expired"),   // Past TTL, needs cleanup
    ),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
    expiresAt: v.number(),      // createdAt + TTL (8 min)
    claimedAt: v.optional(v.number()),
    claimedBy: v.optional(v.string()), // sessionId
  })
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),
});
