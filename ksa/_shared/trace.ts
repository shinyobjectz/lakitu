/**
 * KSA Tracing Module
 *
 * Provides tracing utilities for KSA gateway calls.
 * Enables per-step call tracing for observability into agent execution.
 *
 * Usage:
 * 1. Agent loop calls setStepContext() at start of each step
 * 2. KSAs use tracedGatewayCall() instead of callGateway()
 * 3. Agent loop calls flushTraces() after step completion
 */

import { callGateway, fireAndForget } from "./gateway";

// =============================================================================
// Types
// =============================================================================

export interface TraceEntry {
  traceId: string;
  stepId: string | null;
  event: "ksa_call_start" | "ksa_call_end";
  path: string;
  timestamp: number;
  durationMs?: number;
  success?: boolean;
  error?: string;
}

export interface StepContext {
  stepId: string;
  sessionId?: string;
  stepNumber?: number;
}

// =============================================================================
// Tracing State (per-sandbox)
// =============================================================================

let currentStepContext: StepContext | null = null;
let traceBuffer: TraceEntry[] = [];

/**
 * Generate a unique trace ID for KSA calls.
 * Format: ksa-{timestamp}-{random} for easy identification.
 */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `ksa-${timestamp}-${random}`;
}

// =============================================================================
// Context Management
// =============================================================================

/**
 * Set the current step context for tracing.
 * Call this at the start of each agent step.
 *
 * @param context - Step context with stepId and optional metadata
 *
 * @example
 * setStepContext({ stepId: 'step-001', sessionId: 'sess-123', stepNumber: 1 });
 */
export function setStepContext(context: StepContext): void {
  currentStepContext = context;
}

/**
 * Clear the current step context.
 * Call this after step completion.
 */
export function clearStepContext(): void {
  currentStepContext = null;
}

/**
 * Get the current step context (for debugging).
 */
export function getStepContext(): StepContext | null {
  return currentStepContext;
}

// =============================================================================
// Traced Gateway Calls
// =============================================================================

/**
 * Make a traced gateway call.
 * Records start/end events with timing for observability.
 *
 * @param path - Service path (e.g., 'services.Valyu.internal.search')
 * @param args - Arguments to pass to the service
 * @param type - Operation type (query, mutation, action)
 * @returns Service response data
 *
 * @example
 * const data = await tracedGatewayCall('features.brands.core.crud.get', { id: 'abc123' });
 */
export async function tracedGatewayCall<T = unknown>(
  path: string,
  args: Record<string, unknown>,
  type?: "query" | "mutation" | "action"
): Promise<T> {
  const traceId = generateTraceId();
  const startTime = Date.now();
  const stepId = currentStepContext?.stepId ?? null;

  // Record start event
  traceBuffer.push({
    traceId,
    stepId,
    event: "ksa_call_start",
    path,
    timestamp: startTime,
  });

  try {
    const result = await callGateway<T>(path, args, type);

    // Record success event
    traceBuffer.push({
      traceId,
      stepId,
      event: "ksa_call_end",
      path,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      success: true,
    });

    return result;
  } catch (error: unknown) {
    const err = error as { message?: string };

    // Record failure event
    traceBuffer.push({
      traceId,
      stepId,
      event: "ksa_call_end",
      path,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      success: false,
      error: err.message || String(error),
    });

    throw error;
  }
}

// =============================================================================
// Trace Buffer Management
// =============================================================================

/**
 * Get all traces in the buffer without clearing.
 * Useful for debugging.
 */
export function getTraces(): TraceEntry[] {
  return [...traceBuffer];
}

/**
 * Flush traces from the buffer and return them.
 * Call this after each step to collect traces.
 *
 * @returns Array of trace entries
 *
 * @example
 * const traces = flushTraces();
 * console.log(`Step had ${traces.length} KSA calls`);
 */
export function flushTraces(): TraceEntry[] {
  const traces = [...traceBuffer];
  traceBuffer = [];
  return traces;
}

/**
 * Flush traces to the cloud via fire-and-forget.
 * Use this for real-time observability without blocking.
 *
 * @param cloudPath - Path to send traces (default: 'components.lakitu.workflows.sandboxConvex.appendTraces')
 *
 * @example
 * flushTracesToCloud();
 */
export function flushTracesToCloud(
  cloudPath = "components.lakitu.workflows.sandboxConvex.appendTraces"
): void {
  const traces = flushTraces();
  if (traces.length === 0) return;

  const sessionId = currentStepContext?.sessionId;
  if (!sessionId) {
    console.warn("[trace] Cannot flush traces: no sessionId in context");
    return;
  }

  fireAndForget(cloudPath, {
    sessionId,
    traces,
  });
}

/**
 * Get trace statistics for the current buffer.
 * Useful for debugging and observability.
 */
export function getTraceStats(): {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgDurationMs: number;
  callsByPath: Record<string, number>;
} {
  const endTraces = traceBuffer.filter((t) => t.event === "ksa_call_end");

  const successfulCalls = endTraces.filter((t) => t.success).length;
  const failedCalls = endTraces.filter((t) => !t.success).length;

  const durations = endTraces.filter((t) => t.durationMs !== undefined).map((t) => t.durationMs!);
  const avgDurationMs =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const callsByPath: Record<string, number> = {};
  for (const trace of endTraces) {
    callsByPath[trace.path] = (callsByPath[trace.path] || 0) + 1;
  }

  return {
    totalCalls: endTraces.length,
    successfulCalls,
    failedCalls,
    avgDurationMs,
    callsByPath,
  };
}
