/**
 * Lakitu Cloud Component
 * 
 * Exports all agent-related functionality:
 * - Component config (for app.use())
 * - CRUD operations
 * - Sandbox lifecycle management
 * - Agent workflows
 * - Sandbox compilation
 */

// Component config for convex.config.ts: app.use(lakitu)
export { default } from "./convex.config";

// CRUD Operations
export * as lorobeads from "./workflows/crudLorobeads";
export * as skills from "./workflows/crudSkills";
export * as threads from "./workflows/crudThreads";
export * as board from "./workflows/crudBoard";

// Sandbox Lifecycle
// NOTE: Sandbox modules require Node.js runtime ("use node") and cannot be re-exported.
// Access them via API references: api.workflows.sandboxConvex, api.workflows.lifecycleSandbox

// Agent Orchestration Workflows
export * as agentBoard from "./workflows/agentBoard";    // Card execution via kanban
export * as agentPrompt from "./workflows/agentPrompt";  // Direct prompt execution
export * as agentThread from "./workflows/agentThread";  // Chat thread execution

// Compilation
export * as compile from "./workflows/compileSandbox";
