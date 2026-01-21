/**
 * Sandbox HTTP Endpoints
 *
 * Provides observability endpoints for the E2B sandbox.
 * These run on port 3211 (site port) alongside Convex backend.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Metrics endpoint - returns sandbox health and resource usage.
 * Used by pool health checks and Claude Code observability.
 *
 * GET /metrics
 *
 * Response:
 * {
 *   uptime: number,           // Process uptime in seconds
 *   cpu: { usage: number, cores: number },
 *   memory: { total, free, used, heapUsed, heapTotal },
 *   timestamp: number
 * }
 */
http.route({
  path: "/metrics",
  method: "GET",
  handler: httpAction(async () => {
    // Dynamic imports for Node.js APIs (required for Convex bundling)
    const os = await import("os");

    const metrics = {
      uptime: process.uptime(),
      cpu: {
        usage: os.loadavg()[0], // 1-minute load average
        cores: os.cpus().length,
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
      },
      services: {
        convex: "running", // We're responding, so Convex is up
      },
      timestamp: Date.now(),
    };

    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

/**
 * Health check endpoint - simple ping for pool management.
 * Used by E2B pool to verify sandbox is responsive.
 *
 * GET /health
 */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * Version endpoint - returns SDK version for debugging.
 * Used by pool health checks.
 *
 * GET /version
 */
http.route({
  path: "/version",
  method: "GET",
  handler: httpAction(async () => {
    // Read version from package.json at runtime
    const fs = await import("fs/promises");
    let version = "unknown";
    try {
      const pkg = JSON.parse(await fs.readFile("/home/user/lakitu/package.json", "utf-8"));
      version = pkg.version || "unknown";
    } catch {
      // Fallback if file not found
    }

    return new Response(JSON.stringify({ version, timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
