/**
 * Convex Config for Sandbox Agent
 *
 * This is the configuration for the self-hosted Convex backend
 * that runs inside the E2B sandbox. It uses the Convex Agent SDK
 * for native LLM orchestration and streaming.
 */

import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();

// Convex Agent SDK component for LLM orchestration
app.use(agent);

export default app;
