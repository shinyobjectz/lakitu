/**
 * Lakitu Cloud Component
 *
 * Convex component for the cloud-side agent orchestration.
 * This component manages:
 * - Agent sessions and sandboxes
 * - Chat threads and messages
 * - Skills and custom tools
 * - Sandbox pool and lifecycle
 *
 * Used by the main app via: app.use(lakitu)
 */

import { defineComponent } from "convex/server";

export default defineComponent("lakitu");
