/**
 * Sandbox Agent Schema
 *
 * Tables for the self-hosted Convex backend running in E2B sandbox.
 * Includes: beads (task tracking), file state, decisions, artifacts,
 * verification, checkpoints, and context management.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // Beads - Task Tracking (CRDT-enabled)
  // ============================================

  beads: defineTable({
    // Core fields
    title: v.string(),
    type: v.union(
      v.literal("task"),
      v.literal("bug"),
      v.literal("feature"),
      v.literal("chore"),
      v.literal("epic")
    ),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("closed")
    ),
    priority: v.number(), // 0=critical, 1=high, 2=medium, 3=low, 4=backlog

    // Context
    threadId: v.optional(v.string()), // Convex Agent thread
    parentId: v.optional(v.id("beads")), // For subtasks
    blockedBy: v.optional(v.array(v.id("beads"))),

    // Content
    description: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),

    // Loro CRDT state for sync
    loroState: v.optional(v.bytes()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
    closeReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_thread", ["threadId"])
    .index("by_parent", ["parentId"]),

  // ============================================
  // File State - Track files touched by agent
  // ============================================

  fileState: defineTable({
    path: v.string(),
    lastOperation: v.union(
      v.literal("read"),
      v.literal("write"),
      v.literal("edit")
    ),
    lastAccessAt: v.number(),
    contentHash: v.optional(v.string()),
    size: v.optional(v.number()),
    threadId: v.optional(v.string()),
    accessCount: v.number(),
    createdAt: v.number(),
    lastEditId: v.optional(v.id("editHistory")),
  })
    .index("by_path", ["path"])
    .index("by_thread", ["threadId"]),

  // ============================================
  // Edit History - Track file edits with diffs
  // ============================================

  editHistory: defineTable({
    path: v.string(),
    fileStateId: v.optional(v.id("fileState")),
    oldContentHash: v.string(),
    newContentHash: v.string(),
    diff: v.string(),
    verified: v.boolean(),
    threadId: v.optional(v.string()),
    createdAt: v.number(),
    // Rollback tracking
    rolledBack: v.optional(v.boolean()),
    rollbackReason: v.optional(v.string()),
    rolledBackAt: v.optional(v.number()),
  })
    .index("by_path", ["path"])
    .index("by_thread", ["threadId"]),

  // ============================================
  // Verification Results
  // ============================================

  verificationResults: defineTable({
    editId: v.optional(v.id("editHistory")),
    path: v.string(),
    success: v.boolean(),
    checks: v.array(
      v.object({
        name: v.string(),
        success: v.boolean(),
        output: v.optional(v.string()),
        durationMs: v.optional(v.number()),
      })
    ),
    threadId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_path", ["path"])
    .index("by_thread", ["threadId"]),

  // ============================================
  // Test Baselines
  // ============================================

  testBaselines: defineTable({
    threadId: v.string(),
    result: v.any(), // TestSuiteResult
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),

  // ============================================
  // Decisions - Logged agent decisions
  // ============================================

  agentDecisions: defineTable({
    threadId: v.string(),
    task: v.string(),
    decisionType: v.union(
      v.literal("tool_selection"),
      v.literal("file_edit"),
      v.literal("task_breakdown"),
      v.literal("verification"),
      v.literal("rollback"),
      v.literal("checkpoint"),
      v.literal("error_recovery")
    ),
    selectedTools: v.optional(v.array(v.string())),
    reasoning: v.string(),
    expectedOutcome: v.optional(v.string()),
    alternatives: v.optional(
      v.array(
        v.object({
          option: v.string(),
          reason: v.string(),
        })
      )
    ),
    confidence: v.optional(v.number()),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
    // Outcome tracking
    outcome: v.optional(
      v.union(
        v.literal("success"),
        v.literal("partial_success"),
        v.literal("failure"),
        v.literal("abandoned")
      )
    ),
    actualResult: v.optional(v.string()),
    outcomeNotes: v.optional(v.string()),
    outcomeRecordedAt: v.optional(v.number()),
  }).index("by_thread", ["threadId"]),

  // ============================================
  // Tool Executions - Track tool usage
  // ============================================

  toolExecutions: defineTable({
    decisionId: v.optional(v.id("agentDecisions")),
    threadId: v.string(),
    toolName: v.string(),
    input: v.any(),
    output: v.optional(v.any()),
    success: v.boolean(),
    durationMs: v.number(),
    error: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_tool", ["toolName"]),

  // ============================================
  // Artifacts - Produced outputs
  // ============================================

  artifacts: defineTable({
    name: v.string(),
    type: v.string(), // mime type
    path: v.string(), // local path in sandbox

    // Content (for small artifacts) or reference (for large)
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    size: v.number(),

    // Metadata
    threadId: v.optional(v.string()),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_name", ["name"])
    .index("by_thread", ["threadId"]),

  // ============================================
  // Session Memory - Persist across commands
  // ============================================

  sessionMemory: defineTable({
    sessionId: v.string(),
    key: v.string(),
    value: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_key", ["sessionId", "key"]),

  // ============================================
  // Context Cache - Cached context for tasks
  // ============================================

  contextCache: defineTable({
    sessionId: v.string(),
    taskHash: v.string(),
    context: v.object({
      relevantFiles: v.array(
        v.object({
          path: v.string(),
          snippet: v.optional(v.string()),
          importance: v.number(),
        })
      ),
      toolsNeeded: v.array(v.string()),
      tokenBudget: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
    hitCount: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_task", ["sessionId", "taskHash"]),

  // ============================================
  // Dependency Graph - File dependencies
  // ============================================

  dependencyGraph: defineTable({
    sessionId: v.string(),
    fromPath: v.string(),
    toPath: v.string(),
    type: v.union(
      v.literal("import"),
      v.literal("reference"),
      v.literal("test"),
      v.literal("config")
    ),
    createdAt: v.number(),
    lastSeen: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_from", ["sessionId", "fromPath"])
    .index("by_to", ["sessionId", "toPath"]),

  // ============================================
  // Checkpoints - For chained runs
  // ============================================

  checkpoints: defineTable({
    sessionId: v.string(),
    threadId: v.string(),
    iteration: v.number(),

    // Compressed state
    messageHistory: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
        timestamp: v.optional(v.number()),
      })
    ),
    fileState: v.array(
      v.object({
        path: v.string(),
        contentHash: v.string(),
        size: v.number(),
        lastModified: v.number(),
      })
    ),
    beadsState: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        status: v.string(),
        type: v.string(),
        priority: v.number(),
      })
    ),
    artifactsProduced: v.array(v.string()),

    // Next action
    nextTask: v.string(),
    reason: v.union(
      v.literal("timeout"),
      v.literal("token_limit"),
      v.literal("manual"),
      v.literal("error_recovery")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("restored"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("superseded")
    ),
    metadata: v.optional(v.any()),

    // Timestamps
    createdAt: v.number(),
    restoredAt: v.optional(v.number()),
    restoredToThread: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    finalResult: v.optional(v.any()),
  })
    .index("by_session", ["sessionId"])
    .index("by_thread", ["threadId"])
    .index("by_status", ["status"]),

  // ============================================
  // Subagents - Child agent tracking
  // ============================================

  subagents: defineTable({
    parentThreadId: v.string(),
    threadId: v.string(),
    name: v.string(),
    task: v.string(),
    tools: v.array(v.string()),
    model: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_parent", ["parentThreadId"])
    .index("by_status", ["status"]),

  // ============================================
  // Brand Research - Discovered brand data
  // ============================================

  discoveredSites: defineTable({
    domain: v.string(),
    siteType: v.union(
      v.literal("ecommerce"),
      v.literal("saas"),
      v.literal("service"),
      v.literal("restaurant"),
      v.literal("media"),
      v.literal("other")
    ),
    platform: v.optional(v.string()),
    confidence: v.number(),

    // Navigation hints for product discovery
    navigation: v.array(v.object({
      label: v.string(),
      selector: v.optional(v.string()),
      url: v.optional(v.string()),
      purpose: v.string(),
    })),

    // Analysis results
    observations: v.array(v.string()),
    productLocations: v.array(v.string()),

    // Metadata
    screenshotPath: v.optional(v.string()),
    analyzedAt: v.number(),
    threadId: v.optional(v.string()),
  })
    .index("by_domain", ["domain"])
    .index("by_thread", ["threadId"]),

  discoveredProducts: defineTable({
    // Source info
    domain: v.string(),
    sourceUrl: v.string(),

    // Product data
    name: v.string(),
    type: v.union(
      v.literal("physical"),
      v.literal("saas"),
      v.literal("service")
    ),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.array(v.string()),
    category: v.optional(v.string()),

    // Variants
    variants: v.optional(v.array(v.object({
      name: v.string(),
      price: v.optional(v.number()),
      sku: v.optional(v.string()),
      available: v.optional(v.boolean()),
    }))),

    // Verification
    verified: v.boolean(),
    verificationNotes: v.optional(v.string()),

    // Metadata
    extractedAt: v.number(),
    threadId: v.optional(v.string()),

    // Sync status
    syncedToCloud: v.boolean(),
    cloudProductId: v.optional(v.string()),
  })
    .index("by_domain", ["domain"])
    .index("by_thread", ["threadId"])
    .index("by_synced", ["syncedToCloud"]),

  discoveredUrls: defineTable({
    domain: v.string(),
    url: v.string(),

    // Classification
    urlType: v.union(
      v.literal("product"),
      v.literal("listing"),
      v.literal("pricing"),
      v.literal("other"),
      v.literal("skip")
    ),
    confidence: v.number(),

    // Scrape status
    scraped: v.boolean(),
    scrapedAt: v.optional(v.number()),
    productCount: v.optional(v.number()),
    error: v.optional(v.string()),

    // Metadata
    discoveredAt: v.number(),
    threadId: v.optional(v.string()),
  })
    .index("by_domain", ["domain"])
    .index("by_type", ["urlType"])
    .index("by_scraped", ["scraped"])
    .index("by_thread", ["threadId"]),

  // ============================================
  // Sync Queue - Items to sync to cloud
  // ============================================

  syncQueue: defineTable({
    type: v.union(
      v.literal("artifact"),
      v.literal("bead"),
      v.literal("checkpoint"),
      v.literal("decision"),
      v.literal("result")
    ),
    itemId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    priority: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    attempts: v.number(),
    // Progress tracking
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cloudId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    lastAttemptAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"]),
});
