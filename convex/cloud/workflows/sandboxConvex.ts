/**
 * Sandbox Convex Lifecycle
 *
 * Manages E2B sandboxes running self-hosted Convex with the Agent SDK.
 *
 * Key differences from lifecycleSandbox.ts:
 * - Uses self-hosted Convex backend instead of OpenCode
 * - Native Convex streaming (no SSE/event forwarder)
 * - Direct Convex client communication
 * - Checkpoint-based chaining for long tasks
 *
 * Flow:
 * 1. Create session in cloud Convex
 * 2. Spawn E2B sandbox with self-hosted Convex
 * 3. Wait for Convex backend to be ready
 * 4. Deploy sandbox-agent functions
 * 5. Start agent thread with prompt
 * 6. Poll stream deltas for real-time UI
 * 7. Collect results on completion
 * 8. Checkpoint if timeout (for chaining)
 */

import { v } from "convex/values";
import {
    action,
    mutation,
    query,
    internalMutation,
    internalQuery,
    internalAction,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import * as jose from "jose";
import { getServicePathsForKSAs, getDefaultKSAs, validateKSAs } from "../ksaPolicy";

// =============================================================================
// LOCAL E2B HELPERS (avoid calling parent app's internal functions)
// =============================================================================

/**
 * Call a Lakitu sandbox action using Convex client
 * Local implementation to avoid parent app dependency
 */
async function callLakituAction(
    sandboxUrl: string,
    functionPath: string,
    functionArgs: any,
    timeoutMs?: number
): Promise<{ success: boolean; data?: any; error?: string; durationMs: number }> {
    const start = Date.now();
    const { ConvexHttpClient } = await import("convex/browser");

    try {
        const client = new ConvexHttpClient(sandboxUrl);

        const [modulePath, funcName] = functionPath.split(":");
        if (!modulePath || !funcName) {
            throw new Error(`Invalid function path: ${functionPath}`);
        }

        console.log(`[callLakituAction] Calling ${functionPath}`);

        const { anyApi } = await import("convex/server");

        const pathParts = modulePath.split("/");
        let funcRef: any = anyApi;
        for (const part of pathParts) {
            funcRef = funcRef[part];
        }
        funcRef = funcRef[funcName];

        const result = await client.action(funcRef, functionArgs);

        return {
            success: true,
            data: result,
            durationMs: Date.now() - start,
        };
    } catch (e: any) {
        console.error(`[callLakituAction] Error:`, e);
        return {
            success: false,
            error: e.message,
            durationMs: Date.now() - start,
        };
    }
}

/**
 * Sandbox cleanup - handled by parent app or natural timeout
 * Components can't use E2B SDK (requires Node.js), so we just log.
 * Sandboxes have automatic 10-minute timeouts in E2B.
 */
function logSandboxCleanup(sandboxId: string): void {
    console.log(`[sandboxConvex] Sandbox ${sandboxId} will be cleaned up by timeout or parent app`);
}

// Cloud Convex URL for gateway calls
const CLOUD_CONVEX_URL =
    process.env.CONVEX_URL || "https://earnest-shrimp-308.convex.cloud";

// Gateway URL (HTTP actions endpoint) - .convex.site for HTTP routes
const GATEWAY_URL = (process.env.CONVEX_URL || "https://earnest-shrimp-308.convex.cloud")
    .replace(".convex.cloud", ".convex.site");

/**
 * Generate a JWT for sandbox -> cloud gateway auth
 * @param sessionId - Session ID to encode in JWT
 * @param providedJwt - Optional pre-generated JWT (for when env var isn't accessible)
 */
async function generateSandboxJwt(sessionId: string, providedJwt?: string): Promise<string> {
    // If a JWT was provided (e.g., by the parent app wrapper), use it
    if (providedJwt) {
        return providedJwt;
    }

    const secret = process.env.SANDBOX_JWT_SECRET;
    if (!secret) {
        throw new Error("SANDBOX_JWT_SECRET not configured");
    }

    const jwt = await new jose.SignJWT({ sessionId })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(new TextEncoder().encode(secret));

    return jwt;
}

// ============================================
// Types
// ============================================

const sessionStatusType = v.union(
    v.literal("pending"),
    v.literal("starting"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
    v.literal("checkpointed"),
);

// ============================================
// Session CRUD
// ============================================

/**
 * Create a new Convex sandbox session
 */
export const createSession = mutation({
    args: {
        projectId: v.string(),
        prompt: v.string(),
        config: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("convexSandboxSessions", {
            projectId: args.projectId,
            prompt: args.prompt,
            status: "pending",
            config: args.config,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            iteration: 0,
        });
    },
});

/**
 * Get session by ID
 */
export const getSession = query({
    args: { sessionId: v.id("convexSandboxSessions") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.sessionId);
    },
});

/**
 * Get session with logs
 */
export const getSessionWithLogs = query({
    args: { sessionId: v.id("convexSandboxSessions") },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) return null;

        const logs = await ctx.db
            .query("convexSandboxLogs")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .order("asc")
            .take(500);

        return {
            ...session,
            logs: logs.map((l) => ({
                message: l.message,
                level: l.level,
                timestamp: l.timestamp,
            })),
        };
    },
});

/**
 * Get active session for a card (projectId = cardId)
 * Used by frontend to subscribe to real-time logs
 */
export const getActiveSessionForCard = query({
    args: { cardId: v.string() },
    handler: async (ctx, args) => {
        // Find the most recent running/pending session for this card
        const sessions = await ctx.db
            .query("convexSandboxSessions")
            .withIndex("by_project", (q) => q.eq("projectId", args.cardId))
            .order("desc")
            .take(5);

        // Find active session (running, starting, or pending)
        const activeSession = sessions.find(
            (s) => s.status === "running" || s.status === "starting" || s.status === "pending"
        );

        const sessionToUse = activeSession || sessions[0];
        if (!sessionToUse) return null;

        // Get logs for session
        const rawLogs = await ctx.db
            .query("convexSandboxLogs")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionToUse._id))
            .order("asc")
            .take(500);

        // Parse logs - return structured format
        const logs = rawLogs.map((l) => {
            // Try to parse as JSON (structured log)
            if (l.stepType) {
                try {
                    return JSON.parse(l.message);
                } catch {
                    return { type: "text", label: l.message };
                }
            }
            // Plain string log - wrap in basic structure
            return { type: "text", label: l.message };
        });

        return {
            ...sessionToUse,
            logs, // Now returns array of structured objects
        };
    },
});

/**
 * Get active session for a thread (projectId = "thread-{threadId}")
 * Used by frontend to subscribe to real-time chain of thought
 */
export const getActiveSessionForThread = query({
    args: { threadId: v.string() },
    handler: async (ctx, args) => {
        const projectId = `thread-${args.threadId}`;

        // Find the most recent running/pending session for this thread
        const sessions = await ctx.db
            .query("convexSandboxSessions")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .order("desc")
            .take(5);

        // Find active session (running, starting, or pending)
        const activeSession = sessions.find(
            (s) => s.status === "running" || s.status === "starting" || s.status === "pending"
        );

        const sessionToUse = activeSession || sessions[0];
        if (!sessionToUse) return null;

        // Get logs for session
        const rawLogs = await ctx.db
            .query("convexSandboxLogs")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionToUse._id))
            .order("asc")
            .take(500);

        // Patterns that indicate raw console/code output (filter these out)
        const rawPatterns = [
            /^\d+\s*\|/, // Line numbers like "42 |"
            /JSON\.stringify|JSON\.parse/, // Code snippets
            /\.(ts|js|json|svelte):\d+/, // File:line references
            /at\s+\w+\s+\(/, // Stack traces
            /Error:|Exception:|throw\s+new/, // Error traces
            /Task IDs:|task-\d+/, // Internal task IDs
            /Bun v\d+|Node v\d+/, // Runtime info
            /Local Convex (error|exception)/i, // Internal Convex errors
            /body:\s*JSON|response\.(status|text)/, // HTTP code
            /await\s+\w+|async\s+function/, // Async code
            /^\[.*\]$/, // Bracketed debug prefixes like [agentThread]
        ];

        // Valid log types to show in UI
        const validTypes = ['plan', 'thinking', 'task', 'search', 'source', 'file', 'tool', 'text', 'error'];

        // Parse and filter logs
        const logs = rawLogs
            .map((l) => {
                // Try to parse as JSON (structured log)
                if (l.stepType) {
                    try {
                        return JSON.parse(l.message);
                    } catch {
                        return { type: l.stepType || "text", label: l.message };
                    }
                }
                // Plain string log - infer type from emoji/content
                const msg = l.message;
                let type = "text";
                if (msg.startsWith("🚀") || msg.startsWith("📦") || msg.startsWith("🤖") || msg.startsWith("✅") || msg.startsWith("🎯")) {
                    type = "task";
                } else if (msg.startsWith("🔒") || msg.startsWith("📋")) {
                    type = "tool";
                } else if (msg.startsWith("❌") || msg.startsWith("⏱️")) {
                    type = "error";
                }
                return { type, label: msg };
            })
            .filter((log) => {
                // Must have valid type and label
                if (!log.type || !log.label) return false;
                if (!validTypes.includes(log.type)) return false;
                
                // Filter out raw console/code output
                const label = log.label;
                for (const pattern of rawPatterns) {
                    if (pattern.test(label)) return false;
                }
                
                return true;
            });

        return {
            ...sessionToUse,
            logs, // Pre-filtered, ready for display
        };
    },
});

/**
 * List sessions for a project
 */
export const listSessions = query({
    args: {
        projectId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("convexSandboxSessions")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});

/**
 * Update session status
 */
export const updateSession = internalMutation({
    args: {
        sessionId: v.id("convexSandboxSessions"),
        status: v.optional(sessionStatusType),
        sandboxId: v.optional(v.string()),
        sandboxUrl: v.optional(v.string()),
        threadId: v.optional(v.string()),
        output: v.optional(v.any()),
        error: v.optional(v.string()),
        checkpointId: v.optional(v.string()),
        metrics: v.optional(v.any()),
        config: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const { sessionId, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([_, v]) => v !== undefined),
        );

        await ctx.db.patch(sessionId, {
            ...filtered,
            updatedAt: Date.now(),
            ...(args.status === "completed" || args.status === "failed"
                ? { completedAt: Date.now() }
                : {}),
        });
    },
});

/**
 * Append log to session
 */
export const appendLog = internalMutation({
    args: {
        sessionId: v.id("convexSandboxSessions"),
        message: v.string(),
        level: v.optional(
            v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
        ),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("convexSandboxLogs", {
            sessionId: args.sessionId,
            message: args.message,
            level: args.level ?? "info",
            timestamp: Date.now(),
        });
    },
});

/**
 * Append multiple logs - supports both string and structured formats
 */
export const appendLogs = mutation({
    args: {
        sessionId: v.id("convexSandboxSessions"),
        logs: v.array(v.union(
            v.string(),
            v.object({
                type: v.string(), // thinking, tool, search, file, text
                label: v.string(),
                status: v.optional(v.string()), // active, complete, error
                icon: v.optional(v.string()),
                details: v.optional(v.string()),
            })
        )),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        for (const log of args.logs) {
            if (typeof log === "string") {
                // Legacy string format
                await ctx.db.insert("convexSandboxLogs", {
                    sessionId: args.sessionId,
                    message: log,
                    level: "info",
                    timestamp: now,
                });
            } else {
                // Structured format - store as JSON in message field
                await ctx.db.insert("convexSandboxLogs", {
                    sessionId: args.sessionId,
                    message: JSON.stringify(log),
                    level: "info",
                    timestamp: now,
                    // Store type separately for filtering
                    stepType: log.type,
                });
            }
        }
    },
});

// ============================================
// Sandbox Actions
// ============================================

/**
 * Start a Convex sandbox session
 */
export const startSession = action({
    args: {
        projectId: v.string(),
        prompt: v.string(),
        config: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        // Create session
        const sessionId = await ctx.runMutation(
            api.workflows.sandboxConvex.createSession,
            {
                projectId: args.projectId,
                prompt: args.prompt,
                config: args.config,
            },
        );

        // Run sandbox
        const result = await ctx.runAction(
            internal.workflows.sandboxConvex.runConvexSandbox,
            {
                sessionId,
                prompt: args.prompt,
                config: args.config,
            },
        );

        return { sessionId, ...result };
    },
});

/**
 * Run the Convex sandbox - OPTIMIZED
 *
 * Key optimizations:
 * 1. Single E2B action for create+start+waitReady (was 3 actions + 4 log mutations)
 * 2. Fire-and-forget logs via scheduler (non-blocking)
 * 3. Minimal awaits in critical path
 */
export const runConvexSandbox = internalAction({
    args: {
        sessionId: v.id("convexSandboxSessions"),
        prompt: v.string(),
        config: v.optional(v.any()),
        checkpointId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const startTime = Date.now();
        let sandboxId: string | null = null;

        // Helper: fire-and-forget log (non-blocking)
        const logAsync = (message: string) => {
            ctx.scheduler.runAfter(0, internal.workflows.sandboxConvex.appendLog, {
                sessionId: args.sessionId,
                message,
            });
        };

        // Single mutation: update status + log in one call
        await ctx.runMutation(
            internal.workflows.sandboxConvex.updateSession,
            {
                sessionId: args.sessionId,
                status: "starting",
            },
        );
        logAsync("🚀 Starting Convex sandbox...");

        // Extract and validate allowedKSAs early for file-system policy enforcement
        const configObj = (args.config || {}) as {
            allowedKSAs?: string[];
            skillConfigs?: Record<string, Record<string, unknown>>;
            [key: string]: any;
        };
        let allowedKSAs = configObj.allowedKSAs;
        const skillConfigs = configObj.skillConfigs || {};

        // Default to all KSAs if not specified
        if (!allowedKSAs || allowedKSAs.length === 0) {
            allowedKSAs = getDefaultKSAs("all");
            console.log(`[sandboxConvex] No allowedKSAs specified, using defaults: ${allowedKSAs.join(", ")}`);
        } else {
            // Validate the KSA names
            const { valid, invalid } = validateKSAs(allowedKSAs);
            if (invalid.length > 0) {
                console.warn(`[sandboxConvex] Unknown KSAs ignored: ${invalid.join(", ")}`);
            }
            allowedKSAs = valid;
        }

        try {
            // Generate JWT FIRST - needed as sandbox env var for KSAs
            // Accept pre-generated JWT from config (for when component can't access env var)
            const sandboxJwt = await generateSandboxJwt(args.sessionId, configObj.sandboxJwt);

            // Get session to check if it's a thread-based session
            const session = await ctx.runQuery(api.workflows.sandboxConvex.getSession, {
                sessionId: args.sessionId,
            });
            const projectId = session?.projectId || "";
            const isThreadSession = projectId.startsWith("thread-");
            const envThreadId = isThreadSession ? projectId.replace("thread-", "") : undefined;

            // Build env vars - include THREAD_ID for thread-based sessions
            const envs: Record<string, string> = {
                GATEWAY_URL: GATEWAY_URL,
                SANDBOX_JWT: sandboxJwt,
            };
            if (envThreadId) {
                envs.THREAD_ID = envThreadId;
            }
            // Also pass CARD_ID if provided in config (for kanban workflows)
            if (configObj.cardId) {
                envs.CARD_ID = configObj.cardId;
            }
            // Pass WORKSPACE_ID if provided (for workspace-scoped threads)
            if (configObj.workspaceId) {
                envs.WORKSPACE_ID = configObj.workspaceId;
            }

            // Check if sandbox was pre-created by parent app (preferred for component isolation)
            let sandboxUrl: string;
            let timings: Record<string, number>;
            let fromPool: boolean;
            let deletedKSAs: string[] = [];

            if (configObj.preCreatedSandbox) {
                // Use pre-created sandbox from parent app
                const preSandbox = configObj.preCreatedSandbox;
                sandboxId = preSandbox.sandboxId;
                sandboxUrl = preSandbox.sandboxUrl;
                timings = preSandbox.timings || { totalMs: 0 };
                fromPool = preSandbox.fromPool || false;
                deletedKSAs = preSandbox.deletedKSAs || [];
                console.log(`[sandboxConvex] Using pre-created sandbox: ${sandboxId}`);
            } else {
                // No pre-created sandbox - this is an error in component context
                // The parent app wrapper (api.lakitu.startSession) should always provide preCreatedSandbox
                throw new Error(
                    "preCreatedSandbox not provided. Use api.lakitu.startSession wrapper instead of calling component directly."
                );
            }

            // Fire-and-forget: log timing details
            if (fromPool) {
                logAsync(`📦 Sandbox ready in ${timings.totalMs}ms (from pool: claim=${timings.claimMs}ms, connect=${timings.connectMs}ms, policy=${timings.policyMs || 0}ms)`);
            } else {
                logAsync(`📦 Sandbox ready in ${timings.totalMs}ms (new: create=${timings.createMs}ms, policy=${timings.policyMs || 0}ms)`);
            }

            // Update session with sandbox info (single mutation)
            await ctx.runMutation(
                internal.workflows.sandboxConvex.updateSession,
                {
                    sessionId: args.sessionId,
                    status: "running",
                    sandboxId,
                    sandboxUrl,
                },
            );

            logAsync("🤖 Starting agent thread...");

            // Convert KSA names to service paths for gateway enforcement
            // (allowedKSAs already validated above, before sandbox creation)
            const allowedServices = getServicePathsForKSAs(allowedKSAs);
            console.log(`[sandboxConvex] KSAs: [${allowedKSAs.join(", ")}] => Services: [${allowedServices.join(", ")}]`);
            if (deletedKSAs && deletedKSAs.length > 0) {
                logAsync(`🔒 KSA policy: removed ${deletedKSAs.join(", ")} from sandbox`);
            }

            // Update session with allowed services for gateway policy
            await ctx.runMutation(
                internal.workflows.sandboxConvex.updateSession,
                {
                    sessionId: args.sessionId,
                    // Store allowedServices in session config for gateway to check
                    config: {
                        ...configObj,
                        allowedKSAs,
                        allowedServices,
                    } as any,
                },
            );

            // Build context with gateway config and sessionId for real-time logs
            // Model config is passed from parent app via configObj.model (from unified settings)
            const agentContext = {
                ...configObj,
                allowedKSAs, // Pass to agent so it knows what's available
                skillConfigs, // KSA-specific configurations from stage
                sessionId: args.sessionId, // For real-time chain of thought forwarding
                // Pass cloud thread ID for artifact uploads (different from sandbox-local threadId)
                cloudThreadId: envThreadId,
                // Model config from unified settings (passed by parent app)
                model: configObj.model,
                fallbackModels: configObj.fallbackModels,
                maxTokens: configObj.maxTokens,
                temperature: configObj.temperature,
                gatewayConfig: {
                    // IMPORTANT: Use GATEWAY_URL (.convex.site) not CLOUD_CONVEX_URL (.convex.cloud)
                    // HTTP actions are served from .convex.site, not .convex.cloud
                    convexUrl: GATEWAY_URL,
                    jwt: sandboxJwt,
                },
            };

            // Log skill configs if any have custom instructions
            const skillsWithInstructions = Object.entries(skillConfigs)
                .filter(([_, cfg]) => cfg.instructions)
                .map(([name]) => name);
            if (skillsWithInstructions.length > 0) {
                logAsync(`📋 Custom instructions for: ${skillsWithInstructions.join(", ")}`);
            }

            // Log intent schema if present (generated by agentThread for guidance)
            const intentSchema = configObj.intentSchema as {
                intent?: { summary?: string };
                ksas?: { priority?: string[] };
                meta?: { confidence?: string; latencyMs?: number };
            } | undefined;
            if (intentSchema?.intent?.summary) {
                const priorityKSAs = intentSchema.ksas?.priority?.slice(0, 3).join(", ") || "none";
                const confidence = intentSchema.meta?.confidence || "unknown";
                logAsync(`🎯 Intent: "${intentSchema.intent.summary}" (${confidence} confidence, priority KSAs: ${priorityKSAs})`);
            }

            console.log(
                `[sandboxConvex] Calling agent with gatewayConfig.convexUrl=${GATEWAY_URL}, jwt length=${sandboxJwt.length}`,
            );

            // Call the sandbox Convex to start the agent using Convex client
            // Uses code execution mode with single execute_code tool
            const agentResult = await callLakituAction(
                sandboxUrl,
                "agent/index:startCodeExecThread",
                {
                    prompt: args.prompt,
                    context: agentContext,
                },
                180000, // 3 minutes for agent to complete
            );

            if (!agentResult.success) {
                throw new Error(`Agent start failed: ${agentResult.error}`);
            }

            const threadId = agentResult.data?.threadId;
            const agentText = agentResult.data?.text;
            // Agent returns codeExecutions, not toolCalls
            const agentCodeExecutions = agentResult.data?.codeExecutions || [];

            // Validate threadId was returned
            if (!threadId) {
                throw new Error(
                    `Agent did not return threadId. Response: ${JSON.stringify(agentResult.data)}`,
                );
            }

            await ctx.runMutation(
                internal.workflows.sandboxConvex.updateSession,
                {
                    sessionId: args.sessionId,
                    threadId,
                },
            );

            await ctx.runMutation(
                internal.workflows.sandboxConvex.appendLog,
                {
                    sessionId: args.sessionId,
                    message: `✅ Agent thread started: ${threadId}`,
                },
            );

            // Check if agent completed synchronously (Lakitu returns full result)
            if (agentText !== undefined) {
                // Agent completed - extract output and finalize
                const elapsed = Date.now() - startTime;
                const output = {
                    response: agentText,
                    codeExecutions: agentCodeExecutions,
                    messageCount: agentCodeExecutions.length + 1,
                };

                // OPTIMIZED: Single mutation for completion, fire-and-forget log + sandbox kill
                await ctx.runMutation(
                    internal.workflows.sandboxConvex.updateSession,
                    {
                        sessionId: args.sessionId,
                        status: "completed",
                        output,
                        metrics: {
                            totalMs: elapsed,
                            pollCount: 0,
                            synchronous: true,
                        },
                    },
                );

                // Fire-and-forget: log + sandbox cleanup (don't await)
                logAsync(`✅ Completed synchronously in ${(elapsed / 1000).toFixed(1)}s`);
                logSandboxCleanup(sandboxId);

                return {
                    success: true,
                    status: "completed",
                    sandboxId,
                    threadId,
                    output,
                };
            }

            // OPTIMIZED: Schedule both in parallel (fire-and-forget)
            ctx.scheduler.runAfter(5000, internal.workflows.sandboxConvex.pollCompletion, {
                sessionId: args.sessionId,
                sandboxId,
                sandboxUrl,
                threadId,
                pollCount: 0,
                startTime,
            });
            ctx.scheduler.runAfter(540000, internal.workflows.sandboxConvex.timeoutWatchdog, {
                sessionId: args.sessionId,
                sandboxId,
                startTime,
            });

            return {
                success: true,
                status: "running",
                sandboxId,
                threadId,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            // OPTIMIZED: Single await for critical update, fire-and-forget the rest
            await ctx.runMutation(
                internal.workflows.sandboxConvex.updateSession,
                {
                    sessionId: args.sessionId,
                    status: "failed",
                    error: message,
                },
            );

            // Fire-and-forget: log + sandbox cleanup
            logAsync(`❌ Error: ${message}`);
            if (sandboxId) {
                logSandboxCleanup(sandboxId);
            }

            return { success: false, error: message };
        }
    },
});

/**
 * Poll for agent completion - OPTIMIZED
 *
 * Key optimizations:
 * 1. Parallel HTTP fetches for deltas + status
 * 2. Fire-and-forget logs and sandbox cleanup
 * 3. Reduced polling interval (2s instead of 5s)
 */
export const pollCompletion = internalAction({
    args: {
        sessionId: v.id("convexSandboxSessions"),
        sandboxId: v.string(),
        sandboxUrl: v.string(),
        threadId: v.string(),
        pollCount: v.number(),
        startTime: v.number(),
    },
    handler: async (ctx, args) => {
        const maxPolls = 150; // ~5 minutes at 2s intervals
        const pollInterval = 2000; // Reduced from 5s to 2s

        // Helper for fire-and-forget log
        const logAsync = (message: string) => {
            ctx.scheduler.runAfter(0, internal.workflows.sandboxConvex.appendLog, {
                sessionId: args.sessionId,
                message,
            });
        };

        try {
            // Check if session is already completed
            const session = await ctx.runQuery(
                api.workflows.sandboxConvex.getSession,
                { sessionId: args.sessionId },
            );

            if (
                session?.status === "completed" ||
                session?.status === "failed" ||
                session?.status === "cancelled"
            ) {
                // Already done, fire-and-forget cleanup
                logSandboxCleanup(args.sandboxId);
                return;
            }

            // OPTIMIZED: Parallel fetches for deltas + status
            const [deltasRes, statusRes] = await Promise.all([
                fetch(`${args.sandboxUrl}/api/run/agent/index/getStreamDeltas`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ args: { threadId: args.threadId } }),
                    signal: AbortSignal.timeout(5000),
                }).catch(() => null),
                fetch(`${args.sandboxUrl}/api/run/agent/index/getThreadMessages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ args: { threadId: args.threadId } }),
                    signal: AbortSignal.timeout(5000),
                }),
            ]);

            // Process deltas (fire-and-forget log append)
            if (deltasRes?.ok) {
                const deltas = await deltasRes.json();
                if (deltas?.length > 0) {
                    const logs = deltas.map((d: any) => formatDelta(d)).filter(Boolean);
                    if (logs.length > 0) {
                        // Fire-and-forget
                        ctx.scheduler.runAfter(0, api.workflows.sandboxConvex.appendLogs, {
                            sessionId: args.sessionId,
                            logs,
                        });
                    }
                }
            }

            if (!statusRes.ok) {
                throw new Error(`Status fetch failed: ${statusRes.status}`);
            }

            const messages = await statusRes.json();
            const lastMessage = messages?.[messages.length - 1];

            // Check if the last message indicates completion
            const isComplete =
                lastMessage?.role === "assistant" &&
                !lastMessage?.inProgress &&
                messages.length > 1;

            if (isComplete) {
                const elapsed = Date.now() - args.startTime;
                const output = extractOutput(messages);

                // Critical: update session status (must await)
                await ctx.runMutation(
                    internal.workflows.sandboxConvex.updateSession,
                    {
                        sessionId: args.sessionId,
                        status: "completed",
                        output,
                        metrics: {
                            totalMs: elapsed,
                            pollCount: args.pollCount,
                            messageCount: messages.length,
                        },
                    },
                );

                // Fire-and-forget: log + sandbox cleanup
                logAsync(`✅ Completed in ${(elapsed / 1000).toFixed(1)}s`);
                logSandboxCleanup(args.sandboxId);
                return;
            }

            // Not done, schedule next poll (fire-and-forget)
            if (args.pollCount < maxPolls) {
                ctx.scheduler.runAfter(pollInterval, internal.workflows.sandboxConvex.pollCompletion, {
                    ...args,
                    pollCount: args.pollCount + 1,
                });
            } else {
                throw new Error(`Timeout: Agent still running after ${maxPolls} polls`);
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            // Critical: update session status (must await)
            await ctx.runMutation(
                internal.workflows.sandboxConvex.updateSession,
                {
                    sessionId: args.sessionId,
                    status: "failed",
                    error: message,
                },
            );

            // Fire-and-forget: log + cleanup
            logAsync(`❌ Poll error: ${message}`);
            logSandboxCleanup(args.sandboxId);
        }
    },
});

/**
 * Timeout watchdog - OPTIMIZED
 */
export const timeoutWatchdog = internalAction({
    args: {
        sessionId: v.id("convexSandboxSessions"),
        sandboxId: v.string(),
        startTime: v.number(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.runQuery(
            api.workflows.sandboxConvex.getSession,
            { sessionId: args.sessionId },
        );

        if (
            session?.status === "completed" ||
            session?.status === "failed" ||
            session?.status === "cancelled"
        ) {
            return;
        }

        const elapsed = Date.now() - args.startTime;

        // Critical: update session status (must await)
        await ctx.runMutation(
            internal.workflows.sandboxConvex.updateSession,
            {
                sessionId: args.sessionId,
                status: "failed",
                error: `Timeout after ${(elapsed / 1000 / 60).toFixed(1)} minutes`,
            },
        );

        // Fire-and-forget: log + cleanup
        ctx.scheduler.runAfter(0, internal.workflows.sandboxConvex.appendLog, {
            sessionId: args.sessionId,
            message: `⏱️ Session timed out after ${(elapsed / 1000 / 60).toFixed(1)} minutes`,
        });
        logSandboxCleanup(args.sandboxId);
    },
});

/**
 * Cancel a session
 */
export const cancelSession = action({
    args: { sessionId: v.id("convexSandboxSessions") },
    handler: async (ctx, args) => {
        const session = await ctx.runQuery(
            api.workflows.sandboxConvex.getSession,
            { sessionId: args.sessionId },
        );

        if (!session) {
            throw new Error("Session not found");
        }

        await ctx.runMutation(
            internal.workflows.sandboxConvex.updateSession,
            {
                sessionId: args.sessionId,
                status: "cancelled",
            },
        );

        if (session.sandboxId) {
            logSandboxCleanup(session.sandboxId);
        }
    },
});

// ============================================
// Helpers
// ============================================

function formatDelta(delta: any): string | null {
    if (!delta) return null;

    if (delta.type === "text" && delta.text) {
        return delta.text.slice(0, 200);
    }

    if (delta.type === "tool-call") {
        return `🔧 ${delta.toolName}...`;
    }

    if (delta.type === "tool-result") {
        const success = delta.result?.success !== false;
        return `${success ? "✅" : "❌"} ${delta.toolName}`;
    }

    return null;
}

function extractOutput(messages: any[]): any {
    const toolCalls: any[] = [];
    let response = "";

    for (const msg of messages) {
        if (msg.role === "assistant") {
            if (msg.content) {
                response = msg.content;
            }
            if (msg.toolCalls) {
                toolCalls.push(...msg.toolCalls);
            }
        }
    }

    return {
        response,
        toolCalls,
        messageCount: messages.length,
    };
}
