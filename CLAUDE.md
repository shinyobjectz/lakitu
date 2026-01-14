# Lakitu - Self-Hosted Agent Runtime

Lakitu is the AI agent runtime that executes inside E2B sandboxes. It provides a fully autonomous development environment with its own Convex backend, file system, and tool suite.

> **Name origin**: Named after the cloud-riding Lakitu character from Super Mario - fitting for a cloud orchestration system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│     Cloud Convex (convex/agent/)                            │
│     - Orchestrates sandbox lifecycle                        │
│     - Proxies LLM calls (protects API keys)                 │
│     - Receives stream deltas and artifacts                  │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP + JWT Auth
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    E2B SANDBOX                              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Convex Local Backend (port 3210)                      │ │
│  │  - 14-table schema (beads, files, decisions, etc.)    │ │
│  │  - Real-time subscriptions                            │ │
│  │  - Agent SDK components                               │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ↓                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Agent Loop (agent/index.ts)                           │ │
│  │  - Multi-turn execution                               │ │
│  │  - Tool calling with streaming                        │ │
│  │  - Checkpoint/resume on timeout                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                   Tools Layer                         │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ file_* │ bash │ beads_* │ artifact_* │ web_* │ pdf_* │ │
│  │ lsp_* │ browser_* │ subagent_*                        │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Runtime Services                                      │ │
│  │  - LSP servers (TypeScript, Python, Rust)             │ │
│  │  - File watcher (Chokidar)                            │ │
│  │  - Browser automation                                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  /home/user/workspace/  ← User's code (mounted)            │
│  /home/user/artifacts/  ← Persistent outputs               │
└─────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
packages/lakitu/
├── convex/                    # CONVEX BACKEND (runs in sandbox)
│   ├── schema.ts              # 14-table database schema
│   ├── index.ts               # Main exports
│   ├── agent/                 # Agent orchestration
│   │   ├── index.ts           # startThread, continueThread, runWithTimeout
│   │   ├── decisions.ts       # Decision logging
│   │   └── subagents.ts       # Child agent management
│   ├── tools/                 # Tool definitions (AI SDK format)
│   │   ├── index.ts           # createAllTools() factory
│   │   ├── file.ts            # file_read, file_write, file_edit
│   │   ├── bash.ts            # Shell execution
│   │   ├── beads.ts           # Task tracking
│   │   ├── artifacts.ts       # Persistent outputs
│   │   ├── web.ts             # Web search/fetch
│   │   ├── pdf.ts             # PDF generation
│   │   ├── lsp.ts             # Language server ops
│   │   ├── browser.ts         # Browser automation
│   │   └── subagent.ts        # Subagent coordination
│   ├── actions/               # Tool implementations
│   │   ├── file.ts            # fs/promises operations
│   │   ├── bash.ts            # child_process execution
│   │   ├── pdf.ts             # pdfkit rendering
│   │   ├── lsp.ts             # LSP client management
│   │   └── browser.ts         # agent-browser CLI
│   ├── state/                 # State tracking
│   │   ├── files.ts           # File access tracking
│   │   ├── artifacts.ts       # Artifact storage
│   │   ├── checkpoints.ts     # Checkpoint/resume
│   │   └── verification.ts    # Test/lint results
│   ├── planning/              # Task management
│   │   ├── beads.ts           # CRUD for tasks
│   │   └── sync.ts            # Cloud sync queue
│   ├── context/               # Context orchestration
│   │   └── session.ts         # Memory, cache, dependencies
│   └── prompts/               # System prompts
│       ├── system.ts          # Base system prompt
│       └── modes.ts           # Mode-specific prompts
│
├── runtime/                   # SANDBOX RUNTIME (Node.js)
│   ├── entrypoint.ts          # Main startup script
│   ├── browser/               # Browser automation wrapper
│   ├── lsp/                   # LSP server management
│   └── services/              # File watcher, etc.
│
├── shared/                    # SHARED CODE (host & sandbox)
│   ├── types.ts               # 20+ TypeScript interfaces
│   ├── schemas/               # Zod validation schemas
│   └── constants.ts           # Paths, limits, error codes
│
├── services/                  # External integrations
│   └── pdf/                   # PDF rendering logic
│
└── template/                  # E2B template builder
    └── build.ts               # Build and push template
```

## Key Modules

### Agent Loop (`convex/agent/index.ts`)

The core execution engine:

```typescript
// Start new agent thread
startThread(prompt, context)

// Continue existing thread
continueThread(threadId, prompt)

// Execute with timeout + checkpoint
runWithTimeout(prompt, timeoutMs)
```

**LLM calls route through cloud gateway** - the sandbox makes HTTP requests to the cloud Convex backend, which proxies to OpenRouter/Claude. This protects API keys.

### Tools System

Tools are **dual-layer**:

1. **Definitions** (`tools/*.ts`) - Schema, parameters, descriptions (AI SDK format)
2. **Implementations** (`actions/*.ts`) - Actual execution logic

Available tool categories:

| Category | Tools |
|----------|-------|
| **File** | `file_read`, `file_write`, `file_edit` |
| **Shell** | `bash` (with timeout protection) |
| **Tasks** | `beads_create`, `beads_update`, `beads_close`, `beads_list` |
| **Output** | `artifact_save`, `artifact_read` |
| **Web** | `web_search`, `web_fetch` |
| **PDF** | `pdf_generate` |
| **LSP** | `lsp_diagnostics`, `lsp_completions`, `lsp_hover` |
| **Browser** | `browser_open`, `browser_snapshot`, `browser_click`, `browser_type` |
| **Agents** | `subagent_spawn`, `subagent_status`, `subagent_result` |

### State Management (`convex/state/`)

Tracks everything the agent does:

- **files.ts** - File access patterns, content hashes
- **artifacts.ts** - Persistent outputs (saved to cloud)
- **checkpoints.ts** - State snapshots for resume after timeout
- **verification.ts** - Test/lint results

### Planning (`convex/planning/`)

Task tracking via Beads:

```typescript
// Create task
beads.create({ title, type, priority, description })

// Update status
beads.update(id, { status: 'in_progress' })

// Close with reason
beads.close(id, { reason: 'Completed implementation' })
```

### Context Management (`convex/context/`)

Surgical context injection:

- **Session memory** - Key-value storage with TTL
- **Context cache** - Cache by task hash for reuse
- **Dependency graph** - Track file relationships (import, reference, test)
- **Relevant files** - BFS to find related files

## Database Schema

14 tables in `convex/schema.ts`:

| Table | Purpose |
|-------|---------|
| `beads` | Tasks with status, priority, dependencies |
| `fileState` | Track file access and content hashes |
| `editHistory` | All file edits with diffs (for rollback) |
| `verificationResults` | Test/lint pass/fail |
| `testBaselines` | Baseline test results |
| `agentDecisions` | All reasoning and tool selections |
| `toolExecutions` | Individual tool runs with timing |
| `artifacts` | Persistent outputs |
| `sessionMemory` | Key-value session storage |
| `contextCache` | Cached task context |
| `dependencyGraph` | File relationships |
| `checkpoints` | Saved state for resume |
| `subagents` | Child agent tracking |
| `syncQueue` | Items pending cloud sync |

## Runtime Services

Started by `runtime/entrypoint.ts`:

1. **Convex backend** - Port 3210, real-time database
2. **LSP servers** - On-demand for TypeScript, Python, Rust
3. **File watcher** - Chokidar-based change detection

## Configuration & Limits

From `shared/constants.ts`:

| Category | Limits |
|----------|--------|
| **Files** | Max 10MB read, 1MB edits |
| **Commands** | Default 2min timeout, max 10min |
| **Checkpoints** | Max 50 messages, 1000 files |
| **Beads** | Max 100 per query, 200 char titles |
| **Output** | Truncate at 50KB stdout/stderr |

Paths:
- `/home/user/workspace/` - User's code
- `/home/user/artifacts/` - Persistent outputs
- `/home/user/.convex/` - Convex data

## Key Design Patterns

### Cloud Gateway Pattern

All external API calls route through cloud Convex:

```typescript
// In sandbox
const response = await callCloudLLM({
  messages,
  model: 'gemini-2.0-flash',
  jwt: sessionJwt
})

// Cloud gateway proxies to OpenRouter
// API keys never exposed in sandbox
```

### Checkpoint-Resume

Long tasks survive timeouts:

```typescript
// Create checkpoint on timeout
await checkpoints.create({
  threadId,
  reason: 'timeout',
  state: { messages, files, tasks },
  nextTask: 'Continue from step 3...'
})

// Resume later
const checkpoint = await checkpoints.getLatest(threadId)
await continueThread(threadId, checkpoint.nextTask)
```

### Decision Logging

Every agent decision tracked:

```typescript
await decisions.log({
  type: 'tool_selection',
  tool: 'file_edit',
  reasoning: 'Need to fix the import statement',
  alternatives: ['file_write', 'bash sed'],
  confidence: 0.9
})
```

## Building the Template

```bash
# From packages/lakitu/
bun run template/build.ts --base    # Build base image (~5 min)
bun run template/build.ts --custom  # Build custom layer (~1 min)
bun run template/build.ts --push    # Push to E2B registry
```

Or from project root:
```bash
bun sandbox              # Full rebuild (base + custom)
bun sandbox:custom       # Quick rebuild (custom only)
```

## Exports

Main exports from `convex/index.ts`:

```typescript
// Agent operations
export { startThread, continueThread, runWithTimeout } from './agent'

// State management
export * as state from './state'

// Planning
export * as planning from './planning'

// Context
export * as context from './context'

// Tools
export { createAllTools } from './tools'

// Prompts
export * as prompts from './prompts'
```

## Related Packages

- **convex/agent/** - Cloud-side orchestration that spawns and manages Lakitu sandboxes
- **packages/primitives/agent/** - Tool/skill metadata shared between cloud and sandbox
