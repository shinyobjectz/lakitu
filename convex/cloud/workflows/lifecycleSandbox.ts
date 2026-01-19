/**
 * Sandbox Lifecycle - E2B sandbox spawn and session management
 *
 * NON-BLOCKING flow (avoids E2B gRPC stream timeout):
 * 1. Create session in pending state
 * 2. Spawn E2B sandbox, start OpenCode server
 * 3. POST async prompt to OpenCode (returns immediately)
 * 4. Schedule polling action to check for completion
 * 5. Polling action collects results when done (fresh E2B connection each time)
 *
 * Why non-blocking? The E2B SDK uses @connectrpc/connect for gRPC which
 * times out after ~50-60s inside Convex actions, even though the sandbox
 * continues running. By using scheduled polling with fresh connections,
 * we avoid the stream timeout issue entirely.
 */

import { v } from "convex/values";
import { action, mutation, query, internalMutation, internalQuery, internalAction, ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";

// Agent config defaults (used when no model config is provided via args)
// These are fallback defaults - the parent app should pass model config from unified settings
const DEFAULT_AGENT_CONFIG = {
  provider: "openrouter",
  primaryModel: "anthropic/claude-sonnet-4",
  models: ["anthropic/claude-sonnet-4", "anthropic/claude-3.5-sonnet"],
  providerPreferences: { quantizations: ["bf16", "fp16"] },
  parameters: { reasoning: true },
  maxTokens: 16384,
};

/**
 * Get agent config from args (unified settings) or fallback to defaults
 */
function getAgentConfig(config: any = {}): typeof DEFAULT_AGENT_CONFIG {
  if (config.model) {
    // Build fallback models array: explicitly provided or construct from primary
    const fallbackModels = config.fallbackModels || [];
    const models = [config.model, ...fallbackModels];

    return {
      provider: "openrouter",
      primaryModel: config.model,
      models,
      providerPreferences: DEFAULT_AGENT_CONFIG.providerPreferences,
      parameters: DEFAULT_AGENT_CONFIG.parameters,
      maxTokens: config.maxTokens || DEFAULT_AGENT_CONFIG.maxTokens,
    };
  }
  return DEFAULT_AGENT_CONFIG;
}

// ============================================
// Metrics & Timing
// ============================================

interface TimingMetrics {
  startTime: number;
  steps: Array<{ name: string; startMs: number; durationMs: number }>;
  totals: {
    sandboxCreate?: number;
    serverStartup?: number;
    authConfig?: number;
    sessionCreate?: number;
    promptSend?: number;
    totalSetup?: number;
    agentExecution?: number;
    resultCollection?: number;
    totalDuration?: number;
  };
}

function createMetrics(): TimingMetrics {
  return {
    startTime: Date.now(),
    steps: [],
    totals: {},
  };
}

function recordStep(metrics: TimingMetrics, name: string, startMs: number): void {
  const durationMs = Date.now() - startMs;
  metrics.steps.push({ name, startMs: startMs - metrics.startTime, durationMs });
  console.log(`⏱️ [${name}] ${durationMs}ms`);
}

function formatMetrics(metrics: TimingMetrics): string {
  const totalDuration = Date.now() - metrics.startTime;
  const lines = [
    `\n📊 TIMING REPORT (total: ${(totalDuration / 1000).toFixed(1)}s)`,
    "─".repeat(50),
  ];

  for (const step of metrics.steps) {
    const pct = totalDuration > 0 ? ((step.durationMs / totalDuration) * 100).toFixed(1) : "0";
    const bar = "█".repeat(Math.min(20, Math.round(step.durationMs / (totalDuration / 20))));
    lines.push(`${step.name.padEnd(25)} ${(step.durationMs / 1000).toFixed(2)}s ${bar} ${pct}%`);
  }

  lines.push("─".repeat(50));
  return lines.join("\n");
}

const statusType = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

// ============================================
// Session CRUD
// ============================================

export const createSession = mutation({
  args: { projectId: v.string(), config: v.optional(v.any()), secret: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentSessions", {
      projectId: args.projectId,
      status: "pending",
      config: args.config,
      secret: args.secret,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const getSession = query({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, args) => ctx.db.get(args.sessionId),
});

// Aliases for backward compatibility
export const get = getSession;
export const create = createSession;

export const getSessionDetails = query({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const logs = await ctx.db.query("agentSessionLogs")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc").take(500);
    const output = session.output as any;
    return {
      ...session,
      logs: logs.map(l => l.message),
      // Structured output fields:
      response: output?.response || output?.text || "", // Final answer for user
      thinking: output?.thinking || [], // Chain of thought / tool activity
      artifacts: output?.artifacts || [],
      toolCalls: output?.toolCalls || [],
      todos: output?.todos || [],
      diffs: output?.diffs || [],
    };
  },
});

/** Get session metrics for timing analysis */
export const getSessionMetrics = query({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const output = session.output as any;
    const metrics = output?.metrics || {};

    // Calculate totals
    const setupMs = metrics.setupMs || 0;
    const agentExecutionMs = metrics.agentExecutionMs || 0;
    const totalMs = setupMs + agentExecutionMs;

    return {
      sessionId: args.sessionId,
      status: session.status,
      createdAt: session.createdAt,
      completedAt: session.completedAt,

      // Timing breakdown
      timing: {
        totalMs,
        totalSeconds: (totalMs / 1000).toFixed(1),

        // Setup phase
        setupMs,
        setupBreakdown: {
          sandboxCreateMs: metrics.sandboxCreateMs,
          serverStartupMs: metrics.serverStartupMs,
          authConfigMs: metrics.authConfigMs,
          sessionCreateMs: metrics.sessionCreateMs,
          promptSendMs: metrics.promptSendMs,
        },

        // Execution phase
        agentExecutionMs,
        pollCount: metrics.pollCount,

        // Percentages
        setupPercent: totalMs > 0 ? ((setupMs / totalMs) * 100).toFixed(1) : "0",
        executionPercent: totalMs > 0 ? ((agentExecutionMs / totalMs) * 100).toFixed(1) : "0",
      },

      // Output stats
      stats: {
        messagesCount: metrics.messagesCount,
        toolCallsCount: metrics.toolCallsCount,
        partsCount: metrics.partsCount,
      },

      // Detailed steps (if available)
      steps: metrics.steps,
    };
  },
});

export const listSessions = query({
  args: { projectId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = ctx.db.query("agentSessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc");
    return args.limit ? q.take(args.limit) : q.collect();
  },
});

export const getActiveSessionForCard = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db.query("agentSessions")
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "running")))
      .collect();
    const session = sessions.find((s: any) => s.config?.cardId?.toString() === args.cardId);
    if (!session) return null;

    // Include logs from agentSessionLogs table
    const logs = await ctx.db.query("agentSessionLogs")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("asc")
      .take(200);

    return {
      ...session,
      logs: logs.map(l => l.message),
    };
  },
});

export const getActiveSessionsForCardInternal = internalQuery({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db.query("agentSessions")
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "running")))
      .collect();
    return sessions.filter((s: any) => s.config?.cardId?.toString() === args.cardId);
  },
});

export const updateSessionStatus = mutation({
  args: {
    sessionId: v.id("agentSessions"),
    status: statusType,
    sandboxId: v.optional(v.string()),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status, updatedAt: Date.now() };
    if (args.sandboxId) patch.sandboxId = args.sandboxId;
    if (args.output) patch.output = args.output;
    if (args.error) patch.error = args.error;
    if (args.status === "completed" || args.status === "failed") patch.completedAt = Date.now();
    await ctx.db.patch(args.sessionId, patch);
  },
});

export const appendSessionLogs = mutation({
  args: { sessionId: v.id("agentSessions"), logs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const log of args.logs) {
      await ctx.db.insert("agentSessionLogs", { sessionId: args.sessionId, message: log, createdAt: now });
    }
  },
});

export const storeSessionMetrics = internalMutation({
  args: {
    sessionId: v.id("agentSessions"),
    metrics: v.any(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    // Store metrics in the session output
    const currentOutput = (session.output as any) || {};
    await ctx.db.patch(args.sessionId, {
      output: {
        ...currentOutput,
        metrics: {
          ...((currentOutput.metrics as any) || {}),
          ...args.metrics,
        },
      },
      updatedAt: Date.now(),
    });

    // Also log as a timing entry for visibility
    await ctx.db.insert("agentSessionLogs", {
      sessionId: args.sessionId,
      message: `⏱️ SETUP: ${(args.metrics.setupMs / 1000).toFixed(1)}s (sandbox: ${(args.metrics.sandboxCreateMs / 1000).toFixed(1)}s, server: ${(args.metrics.serverStartupMs / 1000).toFixed(1)}s)`,
      createdAt: Date.now(),
    });
  },
});

export const cancelSessionMutation = mutation({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: "cancelled", updatedAt: Date.now() });
  },
});

export const getSessionStatus = internalQuery({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    return session ? { status: session.status, completedAt: session.completedAt } : null;
  },
});

// For gateway callback compatibility
export const completeSandbox = mutation({
  args: {
    sessionId: v.id("agentSessions"),
    output: v.string(),
    artifacts: v.optional(v.array(v.any())),
    toolCalls: v.optional(v.array(v.any())),
    todos: v.optional(v.array(v.any())),
    diffs: v.optional(v.array(v.any())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      status: args.error ? "failed" : "completed",
      output: { text: args.output, artifacts: args.artifacts, toolCalls: args.toolCalls, todos: args.todos },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Called by the event forwarder when session completes.
 * This bypasses the polling entirely for faster completion.
 */
export const completeFromForwarder = mutation({
  args: {
    sessionId: v.string(),
    sandboxId: v.string(),
    output: v.string(),
    toolCalls: v.array(v.object({ name: v.string(), status: v.optional(v.string()) })),
    todos: v.array(v.any()),
    messagesCount: v.number(),
  },
  handler: async (ctx, args) => {
    // Find the session by string ID (forwarder sends string, not Id type)
    const sessions = await ctx.db
      .query("agentSessions")
      .filter((q) => q.eq(q.field("status"), "running"))
      .collect();

    const session = sessions.find(
      (s) => s._id.toString() === args.sessionId || s.sandboxId === args.sandboxId
    );

    if (!session) {
      console.log(`[completeFromForwarder] Session not found: ${args.sessionId}`);
      return { success: false, error: "Session not found" };
    }

    // Check if already completed
    if (session.status === "completed" || session.status === "failed") {
      console.log(`[completeFromForwarder] Session already ${session.status}`);
      return { success: true, alreadyComplete: true };
    }

    // Update session with results
    await ctx.db.patch(session._id, {
      status: "completed",
      completedAt: Date.now(),
      updatedAt: Date.now(),
      output: {
        text: args.output,
        toolCalls: args.toolCalls,
        todos: args.todos,
      },
    });

    // Log completion
    await ctx.db.insert("agentSessionLogs", {
      sessionId: session._id,
      message: `✅ Completed via event forwarder (${args.messagesCount} messages, ${args.toolCalls.length} tools)`,
      createdAt: Date.now(),
    });

    console.log(`[completeFromForwarder] ✅ Session ${session._id} completed`);

    // Kill the sandbox (schedule async to not block)
    // The polling action will notice the session is complete and skip processing
    return { success: true, sessionId: session._id.toString() };
  },
});

export const markSessionRunning = internalMutation({
  args: {
    sessionId: v.id("agentSessions"),
    sandboxId: v.string(),
    sandboxHost: v.optional(v.string()),
    openCodeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      status: "running",
      sandboxId: args.sandboxId,
      updatedAt: Date.now(),
    };
    if (args.sandboxHost) patch.sandboxHost = args.sandboxHost;
    if (args.openCodeSessionId) patch.openCodeSessionId = args.openCodeSessionId;
    await ctx.db.patch(args.sessionId, patch);
  },
});

// ============================================
// Sandbox Actions
// ============================================

/** Start a new agent session and run it */
export const startSession = action({
  args: { projectId: v.string(), prompt: v.string(), config: v.optional(v.any()) },
  handler: async (ctx, args) => {
    if (args.config?.cardId) {
      const existing = await ctx.runQuery(api.workflows.lifecycleSandbox.getActiveSessionForCard, {
        cardId: args.config.cardId.toString(),
      });
      if (existing) {
        await ctx.runMutation(api.workflows.lifecycleSandbox.cancelSessionMutation, { sessionId: existing._id });
      }
    }

    const sessionId = await ctx.runMutation(api.workflows.lifecycleSandbox.createSession, {
      projectId: args.projectId,
      config: { prompt: args.prompt, ...args.config },
    });

    const result = await ctx.runAction(internal.workflows.lifecycleSandbox.runSandbox, {
      sessionId,
      prompt: args.prompt,
      tools: args.config?.tools,
      cardId: args.config?.cardId?.toString(),
      // Pass model config from unified settings (if provided by parent app)
      modelConfig: args.config?.model ? {
        model: args.config.model,
        fallbackModels: args.config.fallbackModels,
        maxTokens: args.config.maxTokens,
      } : undefined,
    });

    return { sessionId, ...result };
  },
});

/** Spawn sandbox for an existing session (used by workflow callers) */
export const spawnSandbox = action({
  args: {
    sessionId: v.id("agentSessions"),
    projectId: v.string(),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    cardId: v.optional(v.string()),
    runId: v.optional(v.string()),
    boardId: v.optional(v.string()),
    deliverables: v.optional(v.array(v.any())),
    tools: v.optional(v.array(v.string())),
    useOpenCode: v.optional(v.boolean()),
    // Model config from unified settings
    model: v.optional(v.string()),
    fallbackModels: v.optional(v.array(v.string())),
    maxTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let fullPrompt = args.prompt;
    if (args.systemPrompt) {
      fullPrompt = `${args.systemPrompt}\n\n${args.prompt}`;
    }

    const result = await ctx.runAction(internal.workflows.lifecycleSandbox.runSandbox, {
      sessionId: args.sessionId,
      prompt: fullPrompt,
      tools: args.tools,
      cardId: args.cardId,
      // Pass model config from unified settings
      modelConfig: args.model ? {
        model: args.model,
        fallbackModels: args.fallbackModels,
        maxTokens: args.maxTokens,
      } : undefined,
    });

    // Check if we're in polling mode (non-blocking)
    // If so, DON'T return output so runAgentStep uses the async DB polling path
    if ((result as any).status === "polling") {
      console.log(`[spawnSandbox] Sandbox started in polling mode for session ${args.sessionId}`);
      return {
        sessionId: args.sessionId,
        polling: true, // Indicator for caller
        error: result.error,
      };
    }

    // Legacy/immediate mode: return output for immediate completion
    return {
      sessionId: args.sessionId,
      output: result.output || "",
      error: result.error,
      toolCalls: result.toolCalls || [],
      todos: result.todos || [],
      artifacts: [],
    };
  },
});

/**
 * Run sandbox - NON-BLOCKING version
 *
 * This action starts the sandbox, sends the async prompt, and schedules
 * a polling action to check for completion. It returns immediately with
 * "running" status, avoiding the E2B gRPC stream timeout issue.
 *
 * The polling action uses direct HTTP to OpenCode (no E2B SDK) so each
 * poll is independent and doesn't suffer from stream timeouts.
 */
export const runSandbox = internalAction({
  args: {
    sessionId: v.id("agentSessions"),
    prompt: v.string(),
    tools: v.optional(v.array(v.string())),
    cardId: v.optional(v.string()),
    // Model config from unified settings (passed by parent app)
    modelConfig: v.optional(v.object({
      model: v.string(),
      fallbackModels: v.optional(v.array(v.string())),
      maxTokens: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    // Get agent config from args (unified settings) or use defaults
    const agentConfig = getAgentConfig(args.modelConfig);
    // Helper to restore previous stage state (VFS + Beads)
    async function restorePreviousState(
      sandbox: any,
      cardId: string,
      recordStepFn: typeof recordStep,
      metricsFn: TimingMetrics
    ) {
      const stepStart = Date.now();
      let filesRestored = 0;
      let beadsRestored = false;

      try {
        // 1. Get previous artifacts from Convex
        const artifacts = await ctx.runQuery(api.features.kanban.file_sync.getCardFiles, {
          cardId: cardId as any, // TypeScript will validate at runtime
        });

        // 2. Write artifacts to sandbox VFS
        if (artifacts && artifacts.length > 0) {
          console.log(`[Sandbox] 📂 Restoring ${artifacts.length} files from previous stages...`);

          for (const artifact of artifacts) {
            const targetPath = artifact.path?.startsWith('/home/user/workspace')
              ? artifact.path
              : `/home/user/workspace/${artifact.path || artifact.name}`;

            // Ensure parent directory exists
            const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
            await sandbox.commands.run(`mkdir -p "${parentDir}"`);

            // Write file content
            // Handle binary files (PDFs) vs text
            if (artifact.type === 'pdf' && artifact.content.startsWith('JVBERi')) {
              // PDF is base64 - decode and write
              await sandbox.commands.run(`echo "${artifact.content}" | base64 -d > "${targetPath}"`);
            } else {
              // Text file - escape for shell and write
              // Use heredoc for safer handling of special chars
              const escapedContent = artifact.content
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "'\\''");
              await sandbox.commands.run(`cat > "${targetPath}" << 'ARTIFACT_EOF'
${artifact.content}
ARTIFACT_EOF`);
            }

            filesRestored++;
          }
          console.log(`[Sandbox] ✅ Restored ${filesRestored} files to VFS`);
        }

        // 3. Get and restore Beads state
        const beadsState = await ctx.runQuery(api.workflows.crudLorobeads.getLatestSnapshot, {
          cardId: cardId as any,
        });

        if (beadsState && beadsState.beadsState) {
          console.log(`[Sandbox] 🧠 Restoring Beads state from previous stage...`);
          const beadsJson = typeof beadsState.beadsState === 'string'
            ? beadsState.beadsState
            : JSON.stringify(beadsState.beadsState);

          // Write beads.json with previous state
          await sandbox.commands.run(`cat > /home/user/beads.json << 'BEADS_EOF'
${beadsJson}
BEADS_EOF`);
          beadsRestored = true;
          console.log(`[Sandbox] ✅ Beads state restored`);
        }
      } catch (e) {
        console.warn(`[Sandbox] ⚠️ State restoration error (non-fatal): ${e}`);
      }

      recordStepFn(metricsFn, "state_restore", stepStart);
      return { filesRestored, beadsRestored };
    }
    const metrics = createMetrics();
    let stepStart = Date.now();

    const { Sandbox } = await import("@e2b/code-interpreter");
    const jose = await import("jose");
    recordStep(metrics, "import_modules", stepStart);

    let sandbox: InstanceType<typeof Sandbox> | null = null;

    try {
      stepStart = Date.now();
      // Generate JWT for sandbox → Convex callbacks
      const secret = process.env.SANDBOX_JWT_SECRET;
      if (!secret) throw new Error("SANDBOX_JWT_SECRET not configured");

      const jwt = await new jose.SignJWT({ sessionId: args.sessionId, cardId: args.cardId })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(secret));
      recordStep(metrics, "jwt_generation", stepStart);

      // Convex site URL for callbacks
      const convexUrl =
        process.env.CONVEX_CLOUD_URL?.replace(".convex.cloud", ".convex.site") ||
        process.env.CONVEX_URL?.replace(".convex.cloud", ".convex.site") ||
        "";

      // 1. Create sandbox with 10 min timeout
      stepStart = Date.now();
      sandbox = await Sandbox.create("project-social-sandbox", {
        timeoutMs: 600000, // 10 minutes
        envs: {
          HOME: "/home/user",
          PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
          OPENCODE_CONFIG: "/home/user/.opencode/opencode.json",
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
          CONVEX_URL: convexUrl,
          SANDBOX_JWT: jwt,
          CARD_ID: args.cardId || "",
          SESSION_ID: args.sessionId,
        },
      });
      recordStep(metrics, "sandbox_create", stepStart);
      metrics.totals.sandboxCreate = Date.now() - stepStart;

      const sandboxId = sandbox.sandboxId;
      const port = 4096;
      const sandboxHost = sandbox.getHost(port);
      const baseUrl = `https://${sandboxHost}`;

      // 1.5. Restore previous stage state (VFS files + Beads)
      // This runs BEFORE OpenCode starts so files are in place
      if (args.cardId) {
        const restoreResult = await restorePreviousState(sandbox, args.cardId, recordStep, metrics);
        if (restoreResult.filesRestored > 0 || restoreResult.beadsRestored) {
          console.log(`[Sandbox] 🔄 State restored: ${restoreResult.filesRestored} files, beads=${restoreResult.beadsRestored}`);
        }
      }

      // 2. Start OpenCode server (don't await - start polling immediately)
      stepStart = Date.now();
      sandbox.commands.run(
        `cd /home/user && /home/user/.bun/bin/opencode serve --port ${port} --hostname 0.0.0.0`,
        { background: true }
      ); // Fire and forget - server starts in background

      // 3. Wait for server to be ready - ULTRA-AGGRESSIVE POLLING
      // Poll immediately (no initial delay), short timeout, tight loop
      let serverReadyLoops = 0;
      const maxAttempts = 150; // 15 seconds max
      let serverReady = false;
      for (let i = 0; i < maxAttempts; i++) {
        serverReadyLoops++;
        try {
          // Very short timeout - we just want to know if it's up
          const res = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(200) });
          if (res.ok) {
            serverReady = true;
            break;
          }
        } catch {
          /* not ready */
        }
        // Ultra-aggressive: 50ms for first 40 attempts (2s), then 100ms
        if (i < 40) {
          await new Promise((r) => setTimeout(r, 50));
        } else {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (!serverReady) throw new Error("OpenCode server failed to start");
      recordStep(metrics, "server_startup", stepStart);
      metrics.totals.serverStartup = Date.now() - stepStart;
      console.log(`⏱️ [server_startup] Ready after ${serverReadyLoops} polls (${((Date.now() - stepStart) / 1000).toFixed(2)}s)`);

      // 4. Configure auth + create session IN PARALLEL
      stepStart = Date.now();
      const [authRes, sessionRes] = await Promise.all([
        fetch(`${baseUrl}/auth/openrouter`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "api", key: process.env.OPENROUTER_API_KEY }),
        }),
        fetch(`${baseUrl}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Agent Task" }),
        }),
      ]);

      if (!authRes.ok) {
        const authErr = await authRes.text();
        throw new Error(`Auth config failed: ${authRes.status} - ${authErr}`);
      }
      const authBody = await authRes.text();
      console.log(`[Sandbox] Auth response: ${authBody.slice(0, 200)}`);
      console.log(`[Sandbox] OpenRouter key present: ${!!process.env.OPENROUTER_API_KEY}, length: ${process.env.OPENROUTER_API_KEY?.length || 0}`);
      recordStep(metrics, "auth_config", stepStart);
      metrics.totals.authConfig = Date.now() - stepStart;

      if (!sessionRes.ok) throw new Error(`Session creation failed: ${sessionRes.status}`);
      const ocSession = await sessionRes.json();
      const openCodeSessionId = ocSession.id;
      recordStep(metrics, "opencode_session", stepStart);
      metrics.totals.sessionCreate = Date.now() - stepStart;

      // 6. Build prompt (pure JS, instant)
      let fullPrompt = args.prompt;
      if (args.tools?.length) {
        fullPrompt += `\n\n## ALLOWED TOOLS\nYou may ONLY use: ${args.tools.join(", ")}`;
      }

      // Log prompt size for debugging latency issues
      const promptChars = fullPrompt.length;
      const estimatedTokens = Math.round(promptChars / 4); // ~4 chars per token estimate
      console.log(`📝 [Prompt] ${promptChars} chars, ~${estimatedTokens} tokens estimated`);

      // 7. Update convex with session status
      stepStart = Date.now();
      const forwarderPath = "/home/user/scripts/event-forwarder.ts";
      console.log(`[Sandbox] JWT length: ${jwt.length}, first 20 chars: ${jwt.slice(0, 20)}...`);
      console.log(`[Sandbox] CONVEX_URL in sandbox: ${convexUrl}`);

      await ctx.runMutation(internal.workflows.lifecycleSandbox.markSessionRunning, {
        sessionId: args.sessionId,
        sandboxId,
        sandboxHost,
        openCodeSessionId,
      });
      recordStep(metrics, "convex_update", stepStart);

      // 8. Send async prompt FIRST (before forwarder)
      // This ensures OpenCode is processing when the forwarder connects
      stepStart = Date.now();
      const asyncRes = await fetch(`${baseUrl}/session/${openCodeSessionId}/prompt_async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: {
            providerID: agentConfig.provider,
            modelID: agentConfig.primaryModel,
          },
          // Fallback models from config
          route: "fallback",
          models: agentConfig.models,
          // Provider preferences (@preset/fastbutgood)
          provider: agentConfig.providerPreferences,
          // Parameters (reasoning enabled)
          ...agentConfig.parameters,
          parts: [{ type: "text", text: fullPrompt }],
          max_tokens: agentConfig.maxTokens,
          maxTokens: agentConfig.maxTokens,
        }),
      });

      if (!asyncRes.ok) {
        const errBody = await asyncRes.text();
        throw new Error(`Async message failed: ${asyncRes.status} ${errBody.slice(0, 200)}`);
      }
      const promptBody = await asyncRes.text();
      console.log(`[Sandbox] Prompt response: ${promptBody.slice(0, 300)}`);
      console.log(`[Sandbox] Model: ${agentConfig.primaryModel}, Provider: ${agentConfig.provider}`);
      recordStep(metrics, "prompt_send", stepStart);
      metrics.totals.promptSend = Date.now() - stepStart;

      // 9. NOW start event forwarder (after prompt is sent)
      // This prevents race condition where forwarder sees "idle" before prompt starts
      stepStart = Date.now();
      sandbox.commands.run(
        `SESSION_ID="${args.sessionId}" E2B_SANDBOX_ID="${sandboxId}" SANDBOX_JWT="${jwt}" /home/user/.bun/bin/bun run ${forwarderPath} "${openCodeSessionId}" > /tmp/forwarder.log 2>&1 &`,
        { background: true }
      );
      recordStep(metrics, "event_forwarder", stepStart);
      console.log(`[Sandbox] Started event forwarder for session ${openCodeSessionId}`);

      // Calculate total setup time
      metrics.totals.totalSetup = Date.now() - metrics.startTime;

      // Log timing report
      console.log(formatMetrics(metrics));
      console.log(`[Sandbox] ✅ Async prompt sent, scheduling polling action`);

      // Store metrics in session for later analysis
      await ctx.runMutation(internal.workflows.lifecycleSandbox.storeSessionMetrics, {
        sessionId: args.sessionId,
        metrics: {
          setupMs: metrics.totals.totalSetup,
          sandboxCreateMs: metrics.totals.sandboxCreate,
          serverStartupMs: metrics.totals.serverStartup,
          authConfigMs: metrics.totals.authConfig,
          sessionCreateMs: metrics.totals.sessionCreate,
          promptSendMs: metrics.totals.promptSend,
          steps: metrics.steps,
        },
      });

      // 10. Schedule timeout watchdog (10 minutes)
      // The event forwarder handles real-time streaming and completion.
      // This is just a safety net in case the forwarder dies.
      await ctx.scheduler.runAfter(600000, internal.workflows.lifecycleSandbox.timeoutWatchdog, {
        sessionId: args.sessionId,
        sandboxId,
        startTime: Date.now(),
      });

      // Return immediately - polling action will complete the session
      return { success: true, output: "", toolCalls: [], todos: [], status: "polling" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Sandbox] ❌ Error during setup: ${message}`);
      await ctx.runMutation(api.workflows.lifecycleSandbox.updateSessionStatus, {
        sessionId: args.sessionId,
        status: "failed",
        error: message,
      });

      // Kill sandbox on error
      if (sandbox) {
        try {
          await sandbox.kill();
        } catch {
          /* ignore */
        }
      }

      return { success: false, error: message, output: "" };
    }
    // NOTE: We do NOT kill the sandbox here - the polling action will do that when done
  },
});

/**
 * Timeout Watchdog
 *
 * Simple safety net that runs after 10 minutes. If the session is still running
 * (event forwarder failed), it marks it as timed out and kills the sandbox.
 */
export const timeoutWatchdog = internalAction({
  args: {
    sessionId: v.id("agentSessions"),
    sandboxId: v.string(),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if session is already completed
    const session = await ctx.runQuery(internal.workflows.lifecycleSandbox.getSessionStatus, {
      sessionId: args.sessionId,
    });

    if (session?.status === "completed" || session?.status === "failed" || session?.status === "cancelled") {
      console.log(`[Watchdog] Session ${args.sessionId} already ${session.status}, cleaning up sandbox`);
    } else {
      // Session still running after 10 minutes - mark as timed out
      const elapsed = Math.round((Date.now() - args.startTime) / 1000);
      console.log(`[Watchdog] Session ${args.sessionId} timed out after ${elapsed}s`);

      await ctx.runMutation(api.workflows.lifecycleSandbox.updateSessionStatus, {
        sessionId: args.sessionId,
        status: "failed",
        error: `Timeout: Session did not complete within 10 minutes`,
      });
    }

    // Always try to kill the sandbox
    try {
      const { Sandbox } = await import("@e2b/code-interpreter");
      const sandbox = await Sandbox.connect(args.sandboxId);
      await sandbox.kill();
      console.log(`[Watchdog] Killed sandbox ${args.sandboxId}`);
    } catch (e) {
      console.log(`[Watchdog] Sandbox cleanup: ${e}`);
    }
  },
});

/**
 * Poll for sandbox completion (LEGACY - kept for backward compatibility)
 *
 * The event forwarder now handles real-time streaming and completion.
 * This polling action is only used if explicitly scheduled.
 */
export const pollSandboxCompletion = internalAction({
  args: {
    sessionId: v.id("agentSessions"),
    sandboxId: v.string(),
    sandboxHost: v.string(),
    openCodeSessionId: v.string(),
    pollCount: v.number(),
    startTime: v.number(),
    lastMessageCount: v.optional(v.number()), // Track seen messages for streaming
    lastPartsCount: v.optional(v.number()), // Track total parts seen (messages update in-place)
  },
  handler: async (ctx, args) => {
    const baseUrl = `https://${args.sandboxHost}`;
    const maxPolls = 20; // 10 minutes at 30s intervals (safety net only)
    const pollInterval = 30000; // 30 seconds - event forwarder handles real-time
    const lastMessageCount = args.lastMessageCount || 0;
    const lastPartsCount = args.lastPartsCount || 0;

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // CHECK IF ALREADY COMPLETED BY EVENT FORWARDER
      // ═══════════════════════════════════════════════════════════════════════
      const session = await ctx.runQuery(internal.workflows.lifecycleSandbox.getSessionStatus, {
        sessionId: args.sessionId,
      });

      if (session?.status === "completed" || session?.status === "failed") {
        console.log(`[Poll ${args.pollCount}] Session already ${session.status} (via forwarder), cleaning up`);

        // Kill the sandbox
        try {
          const { Sandbox } = await import("@e2b/code-interpreter");
          const sandbox = await Sandbox.connect(args.sandboxId);
          await sandbox.kill();
          console.log(`[Poll] Killed sandbox ${args.sandboxId}`);
        } catch (e) {
          console.log(`[Poll] Sandbox cleanup: ${e}`);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LIVE MESSAGE STREAMING - Fetch and forward new messages each poll
      // (backup for when event forwarder misses events)
      // ═══════════════════════════════════════════════════════════════════════
      let newMessageCount = lastMessageCount;
      let newPartsCount = lastPartsCount;
      try {
        const msgRes = await fetch(`${baseUrl}/session/${args.openCodeSessionId}/message`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (msgRes.ok) {
          const msgText = await msgRes.text();
          const messages = msgText ? JSON.parse(msgText) : [];
          newMessageCount = messages.length;

          // Count total parts across all messages
          let totalParts = 0;
          const allParts: Array<{ role: string; part: any; partIndex: number }> = [];
          for (const msg of messages) {
            const role = msg.info?.role || msg.role || "unknown";
            for (const part of msg.parts || []) {
              allParts.push({ role, part, partIndex: totalParts });
              totalParts++;
            }
          }
          newPartsCount = totalParts;

          // Debug: Log progress
          if (args.pollCount % 3 === 0 || totalParts > lastPartsCount) {
            console.log(`[Poll ${args.pollCount}] 📬 Messages: ${messages.length}, Parts: ${totalParts} (last seen: ${lastPartsCount})`);
          }

          // Stream new parts to Convex (parts we haven't seen before)
          if (totalParts > lastPartsCount) {
            const newParts = allParts.slice(lastPartsCount);
            const logsToAdd: string[] = [];

            // Helper to make tool names human-readable
            const formatToolName = (name: string): string => {
              if (!name || name === "unknown") return "Tool";
              // Handle namespaced tools like "automation.saveArtifact" -> "Save Artifact"
              if (name.includes(".")) {
                name = name.split(".").pop() || name;
              }
              // Convert camelCase/snake_case to readable
              name = name.replace(/_/g, " ");
              name = name.replace(/([A-Z])/g, " $1").trim();
              return name.charAt(0).toUpperCase() + name.slice(1);
            };
            console.log(`[Poll ${args.pollCount}] 📝 Processing ${newParts.length} new parts`);

            for (const { role, part } of newParts) {
              // Only log meaningful events:
              // - Tool calls (starting and completed)
              // - Stage completion signals
              // - Artifact saves
              // - Bead operations
              // Skip: reasoning, user echoes, step markers, patches, verbose text

              if (part.type === "tool" || part.type === "tool-invocation" || part.toolInvocation) {
                // Tool call starting
                const rawName = part.tool || part.toolInvocation?.toolName || part.toolName || "";
                if (!rawName) continue; // Skip if no tool name

                const toolName = formatToolName(rawName);
                const state = part.state?.status || part.toolInvocation?.state?.status || "calling";

                // Special handling for specific tools
                if (rawName.includes("saveArtifact")) {
                  logsToAdd.push(`📄 Saving artifact...`);
                } else if (rawName.includes("completeStage")) {
                  logsToAdd.push(`🏁 Completing stage...`);
                } else if (rawName.includes("beads.create") || rawName.includes("beads.close") || rawName.includes("beads.update")) {
                  const action = rawName.includes("create") ? "Creating" : rawName.includes("close") ? "Completing" : "Updating";
                  logsToAdd.push(`📋 ${action} task...`);
                } else if (state === "calling" || state === "pending") {
                  logsToAdd.push(`🔧 ${toolName}...`);
                }
              } else if (part.type === "tool-result" || part.toolResult) {
                // Tool completed
                const rawName = part.toolName || part.toolResult?.toolName || "";
                const toolName = formatToolName(rawName);

                // Check for errors in result
                const hasError = part.toolResult?.error || part.state?.error;
                if (hasError) {
                  logsToAdd.push(`❌ ${toolName} failed`);
                } else if (rawName.includes("saveArtifact")) {
                  // Get artifact name from result if available
                  const result = part.toolResult?.result || part.result;
                  const name = result?.saved || result?.name || "artifact";
                  logsToAdd.push(`✅ Saved: ${name}`);
                } else if (rawName.includes("completeStage")) {
                  logsToAdd.push(`✅ Stage completed`);
                } else if (rawName.includes("beads.create")) {
                  const result = part.toolResult?.result || part.result;
                  const title = result?.title || "task";
                  logsToAdd.push(`✅ Created: ${title}`);
                } else if (rawName.includes("beads.close")) {
                  logsToAdd.push(`✅ Task completed`);
                } else {
                  // Generic tool completion
                  logsToAdd.push(`✅ ${toolName}`);
                }
              }
              // Skip: text, reasoning, step-start, step-finish, patch, unknown
            }

            if (logsToAdd.length > 0) {
              console.log(`[Poll ${args.pollCount}] 📨 Streaming ${logsToAdd.length} new log entries`);
              await ctx.runMutation(api.workflows.lifecycleSandbox.appendSessionLogs, {
                sessionId: args.sessionId,
                logs: logsToAdd,
              });
            }
          }
        }
      } catch (e) {
        // Don't fail the poll if message streaming fails
        console.log(`[Poll ${args.pollCount}] ⚠️ Message fetch error: ${e}`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STATUS CHECK - Is the LLM still processing?
      // ═══════════════════════════════════════════════════════════════════════
      const statusRes = await fetch(`${baseUrl}/session/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000), // 10s timeout for the fetch itself
      });

      if (!statusRes.ok) {
        // Check if sandbox is dead (E2B returns 502 with specific messages)
        const errorBody = await statusRes.text().catch(() => "");
        console.log(`[Poll ${args.pollCount}] Status fetch failed: ${statusRes.status}, body: ${errorBody.slice(0, 200)}`);

        // If sandbox is dead or port not open, fail fast
        if (errorBody.includes("not found") || errorBody.includes("not open") || statusRes.status === 502) {
          throw new Error(`Sandbox is no longer reachable: ${errorBody.slice(0, 100)}`);
        }

        // Schedule retry if not too many polls
        if (args.pollCount < maxPolls) {
          await ctx.scheduler.runAfter(pollInterval, internal.workflows.lifecycleSandbox.pollSandboxCompletion, {
            ...args,
            pollCount: args.pollCount + 1,
            lastMessageCount: newMessageCount,
              lastPartsCount: newPartsCount,
          });
        } else {
          throw new Error("Max polls reached, status endpoint not responding");
        }
        return;
      }

      const allStatuses = await statusRes.json();
      const sessionStatus = allStatuses[args.openCodeSessionId];

      // Log every poll
      const elapsed = Math.round((Date.now() - args.startTime) / 1000);

      // IMPORTANT: When OpenCode finishes a session, it REMOVES it from the status list!
      // So if sessionStatus is undefined but we had a valid session, it means completion.
      if (sessionStatus === undefined) {
        // Session not in status list - check if it's because it completed
        // by verifying we have messages (meaning the session existed and ran)
        console.log(`[Poll ${args.pollCount}] ${elapsed}s elapsed - session not in status list, checking for completion...`);

        // Quick check: try to fetch messages to see if session existed
        const msgCheckRes = await fetch(`${baseUrl}/session/${args.openCodeSessionId}/message`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (msgCheckRes.ok) {
          const msgText = await msgCheckRes.text();
          const messages = msgText ? JSON.parse(msgText) : [];

          if (messages.length > 0) {
            // We have messages, so the session ran and completed (removed from status)
            console.log(`[Poll ${args.pollCount}] ✅ Session completed (removed from status list, has ${messages.length} messages)`);
            // Fall through to result collection below
          } else if (args.pollCount < 5) {
            // No messages yet and early in polling - maybe still initializing
            console.log(`[Poll ${args.pollCount}] No messages yet, scheduling retry...`);
            await ctx.scheduler.runAfter(pollInterval, internal.workflows.lifecycleSandbox.pollSandboxCompletion, {
              ...args,
              pollCount: args.pollCount + 1,
              lastMessageCount: newMessageCount,
              lastPartsCount: newPartsCount,
            });
            return;
          } else {
            // No messages after several polls - something is wrong
            throw new Error("Session has no messages after multiple polls");
          }
        } else {
          throw new Error(`Failed to check session messages: ${msgCheckRes.status}`);
        }
      } else {
        // OpenCode returns {type: "busy"} or {type: "idle"}, not {status: ...}
        const status = sessionStatus?.type || sessionStatus?.status || "unknown";
        console.log(`[Poll ${args.pollCount}] ${elapsed}s elapsed, type=${status}, raw=${JSON.stringify(sessionStatus).slice(0, 100)}`);

        // Check if still processing
        if (status === "busy" || status === "processing") {
          if (args.pollCount < maxPolls) {
            // Schedule next poll
            await ctx.scheduler.runAfter(pollInterval, internal.workflows.lifecycleSandbox.pollSandboxCompletion, {
              ...args,
              pollCount: args.pollCount + 1,
              lastMessageCount: newMessageCount,
              lastPartsCount: newPartsCount,
            });
          } else {
            throw new Error(`Timeout: OpenCode still processing after ${elapsed}s`);
          }
          return;
        }

        // Check for error
        if (status === "error" || status === "failed") {
          throw new Error(`OpenCode error: ${JSON.stringify(sessionStatus)}`);
        }

        // type === "idle" || type === "ready" - session is done
        console.log(`[Poll ${args.pollCount}] ✅ OpenCode completed in ${elapsed}s (status: ${status})`);
      }

      // Collect results via direct HTTP
      const [messagesRes, todosRes, diffsRes] = await Promise.all([
        fetch(`${baseUrl}/session/${args.openCodeSessionId}/message`, { headers: { Accept: "application/json" } }),
        fetch(`${baseUrl}/session/${args.openCodeSessionId}/todo`, { headers: { Accept: "application/json" } }),
        fetch(`${baseUrl}/session/${args.openCodeSessionId}/diff`, { headers: { Accept: "application/json" } }),
      ]);

      // Safe JSON parse helper
      const safeJsonParse = (text: string, name: string): any[] => {
        if (!text || text.trim() === "") return [];
        try {
          return JSON.parse(text);
        } catch (e: any) {
          console.error(`[Sandbox] Failed to parse ${name}: ${e.message}`);
          return [];
        }
      };

      const messages = safeJsonParse(await messagesRes.text(), "messages");
      const todos = safeJsonParse(await todosRes.text(), "todos");
      const diffs = safeJsonParse(await diffsRes.text(), "diffs");

      console.log(`[Sandbox] Collected: ${messages.length} messages, ${todos.length} todos, ${diffs.length} diffs`);

      // Extract assistant responses with structured output:
      // - thinking: All reasoning and intermediate activity (for progress UI)
      // - response: Final answer for the user (last text from last assistant message)
      // - toolCalls: Tool invocations for audit trail
      const thinkingParts: string[] = [];
      const toolCalls: Array<{ name: string; status: string; args?: any; result?: string }> = [];
      let finalResponse = "";

      // Process messages in order, but we need the LAST assistant text for final response
      const assistantMessages = messages.filter((m: any) => m.role !== "user");

      for (let i = 0; i < assistantMessages.length; i++) {
        const msg = assistantMessages[i];
        const isLastMessage = i === assistantMessages.length - 1;
        const parts = msg.parts || [];

        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];
          const isLastPart = j === parts.length - 1;

          if (part.type === "text" && part.text) {
            // Skip if it looks like the system prompt being echoed
            if (part.text.startsWith("# ") && part.text.includes("## Context") && part.text.includes("## Rules")) {
              console.log(`[Sandbox] Skipping system prompt echo (${part.text.length} chars)`);
              continue;
            }

            if (isLastMessage && isLastPart) {
              // Last text in last message = final response
              finalResponse = part.text;
            } else {
              // Earlier text = part of thinking/progress
              thinkingParts.push(part.text);
            }
          } else if (part.type === "reasoning" && part.text) {
            // Chain of thought reasoning
            thinkingParts.push(`💭 ${part.text}`);
          } else if (part.type === "tool-invocation" || part.type === "tool") {
            const toolName = part.toolInvocation?.toolName || part.toolName || part.callID?.match(/tool_([^_]+_[^_]+)/)?.[1]?.replace("_", ".") || "unknown";
            const status = part.toolInvocation?.state?.status || part.state || "calling";
            const args = part.toolInvocation?.args || part.args;
            toolCalls.push({ name: toolName, status, args });
            thinkingParts.push(`🔧 ${toolName}(${JSON.stringify(args || {}).slice(0, 100)})`);
          } else if (part.type === "tool-result") {
            const toolName = part.toolName || part.toolResult?.toolName || "unknown";
            const result = typeof part.result === "string" ? part.result : JSON.stringify(part.result || {});
            // Update the last matching tool call with result
            const lastCall = [...toolCalls].reverse().find(t => t.name === toolName);
            if (lastCall) lastCall.result = result.slice(0, 500);
            thinkingParts.push(`✅ ${toolName} → ${result.slice(0, 100)}`);
          }
        }
      }

      // Fallback: if no final response identified, use the last thinking part
      if (!finalResponse && thinkingParts.length > 0) {
        // Find last non-tool, non-reasoning text
        finalResponse = thinkingParts.pop() || "";
      }

      console.log(`[Sandbox] Extracted: thinking=${thinkingParts.length} parts, response=${finalResponse.length} chars, tools=${toolCalls.length}`);

      // Calculate final timing metrics
      const totalExecutionMs = Date.now() - args.startTime;
      const executionMetrics = {
        agentExecutionMs: totalExecutionMs,
        pollCount: args.pollCount,
        messagesCount: messages.length,
        toolCallsCount: toolCalls.length,
        partsCount: newPartsCount,
      };

      // Log final timing report
      console.log(`\n📊 EXECUTION COMPLETE`);
      console.log(`─`.repeat(50));
      console.log(`Total execution:     ${(totalExecutionMs / 1000).toFixed(1)}s`);
      console.log(`Poll count:          ${args.pollCount}`);
      console.log(`Messages:            ${messages.length}`);
      console.log(`Tool calls:          ${toolCalls.length}`);
      console.log(`─`.repeat(50));

      // Update session with results and metrics
      // Output structure:
      // - response: Final answer for the user (what they should see)
      // - thinking: Chain of thought and tool activity (for progress/debug UI)
      // - text: Legacy field (now just the response for backwards compat)
      // - toolCalls, todos, diffs: Structured data for processing
      await ctx.runMutation(api.workflows.lifecycleSandbox.updateSessionStatus, {
        sessionId: args.sessionId,
        status: "completed",
        output: {
          response: finalResponse,
          thinking: thinkingParts,
          text: finalResponse, // Legacy compat - now just the response
          toolCalls,
          todos,
          diffs: diffs.map((d: any) => d.path),
        },
      });

      // Store execution metrics
      await ctx.runMutation(internal.workflows.lifecycleSandbox.storeSessionMetrics, {
        sessionId: args.sessionId,
        metrics: executionMetrics,
      });

      // Add final timing log entry
      await ctx.runMutation(api.workflows.lifecycleSandbox.appendSessionLogs, {
        sessionId: args.sessionId,
        logs: [`⏱️ EXECUTION: ${(totalExecutionMs / 1000).toFixed(1)}s (${args.pollCount} polls, ${toolCalls.length} tools)`],
      });

      // Capture workspace files before killing sandbox
      if (args.cardId && diffs.length > 0) {
        try {
          const { Sandbox } = await import("@e2b/code-interpreter");
          const sandbox = await Sandbox.connect(args.sandboxId);
          
          const filesToSync: Array<{ path: string; name: string; content: string; type: string }> = [];
          
          for (const diff of diffs) {
            const filePath = diff.path || diff;
            if (!filePath || typeof filePath !== "string") continue;
            
            try {
              // Read file content from sandbox
              const result = await sandbox.commands.run(`cat "${filePath}" 2>/dev/null || echo ""`);
              const content = result.stdout || "";
              if (!content) continue;
              
              // Determine file type from extension
              const ext = filePath.split(".").pop()?.toLowerCase() || "";
              const typeMap: Record<string, string> = {
                ts: "code", js: "code", tsx: "code", jsx: "code",
                py: "code", rs: "code", go: "code", java: "code",
                json: "json", yaml: "json", yml: "json",
                md: "markdown", mdx: "markdown",
                html: "html", css: "code", scss: "code",
                txt: "text", csv: "csv",
              };
              
              filesToSync.push({
                path: filePath,
                name: filePath.split("/").pop() || "file",
                content,
                type: typeMap[ext] || "text",
              });
            } catch {
              // Skip files that can't be read
            }
          }
          
          if (filesToSync.length > 0) {
            console.log(`[Sandbox] 📦 Capturing ${filesToSync.length} workspace files...`);
            await ctx.runMutation(api.features.kanban.file_sync.batchFileSync, {
              cardId: args.cardId as any,
              files: filesToSync,
            });
            console.log(`[Sandbox] ✅ Workspace captured`);
          }
          
          // Kill the sandbox after capture
          await sandbox.kill();
          console.log(`[Sandbox] Killed sandbox ${args.sandboxId}`);
        } catch (e) {
          console.log(`[Sandbox] Workspace capture/kill error: ${e}`);
        }
      } else {
        // No cardId or no diffs - just kill the sandbox
        try {
          const { Sandbox } = await import("@e2b/code-interpreter");
          const sandbox = await Sandbox.connect(args.sandboxId);
          await sandbox.kill();
          console.log(`[Sandbox] Killed sandbox ${args.sandboxId}`);
        } catch (e) {
          console.log(`[Sandbox] Failed to kill sandbox (may already be dead): ${e}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Poll ${args.pollCount}] ❌ Error: ${message}`);

      await ctx.runMutation(api.workflows.lifecycleSandbox.updateSessionStatus, {
        sessionId: args.sessionId,
        status: "failed",
        error: message,
      });

      // Try to kill sandbox on error
      try {
        const { Sandbox } = await import("@e2b/code-interpreter");
        const sandbox = await Sandbox.connect(args.sandboxId);
        await sandbox.kill();
      } catch {
        /* ignore */
      }
    }
  },
});

/** Cancel a running session */
export const cancelSession = action({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.workflows.lifecycleSandbox.getSession, { sessionId: args.sessionId });
    if (!session) throw new Error("Session not found");

    await ctx.runMutation(api.workflows.lifecycleSandbox.updateSessionStatus, {
      sessionId: args.sessionId,
      status: "cancelled",
    });

    if (session.sandboxId) {
      try {
        const { Sandbox } = await import("@e2b/code-interpreter");
        const sandbox = await Sandbox.connect(session.sandboxId);
        await sandbox.kill();
      } catch { /* already dead */ }
    }
  },
});
