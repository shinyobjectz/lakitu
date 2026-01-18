# Agent Orchestration System

This folder contains the agent orchestration layer that coordinates AI agents running in E2B sandboxes. It bridges the Jibe frontend with the Lakitu agent runtime.

## Architecture Overview

```
Frontend Request
       ↓
┌──────────────────────────────────────────────────┐
│  convex/agent/                                   │
│                                                  │
│  ┌─────────────────┐    ┌─────────────────────┐ │
│  │ agentThread.ts  │    │ agentPrompt.ts      │ │
│  │ (Chat UI)       │    │ (Simple prompts)    │ │
│  └────────┬────────┘    └──────────┬──────────┘ │
│           │                        │            │
│           └────────┬───────────────┘            │
│                    ↓                            │
│           ┌────────────────┐                    │
│           │ agentBoard.ts  │ ← Durable Workflow │
│           │ (Card Pipeline)│                    │
│           └───────┬────────┘                    │
│                   ↓                             │
│  ┌────────────────────────────────────────────┐ │
│  │ sandboxConvex.ts / lifecycleSandbox.ts    │ │
│  │ (Sandbox Lifecycle Management)            │ │
│  └────────────────────────────────────────────┘ │
└───────────────────────┬──────────────────────────┘
                        ↓
              ┌─────────────────────┐
              │   E2B Sandbox       │
              │   (Lakitu Runtime)  │
              └─────────────────────┘
```

## File Reference

| File | Purpose |
|------|---------|
| `index.ts` | Main exports - re-exports all CRUD modules and workflows |
| `mail.ts` | Inter-agent async messaging system |
| `workflows/agentBoard.ts` | **Core** - Durable workflow for card execution pipeline |
| `workflows/agentThread.ts` | Multi-turn chat interface with agents |
| `workflows/agentPrompt.ts` | One-off prompt execution (board planning, research) |
| `workflows/sandboxConvex.ts` | E2B sandbox + self-hosted Convex (current approach) |
| `workflows/lifecycleSandbox.ts` | E2B sandbox + OpenCode (legacy) |
| `workflows/crudThreads.ts` | Thread/conversation CRUD operations |
| `workflows/crudSkills.ts` | Skill definitions (tool bundles + prompts) |
| `workflows/crudBoard.ts` | AI-assisted board creation workflow |
| `workflows/crudLorobeads.ts` | Loro CRDT state sync and Beads issue tracking |
| `workflows/compileSandbox.ts` | Compilation manifest management |

## Key Workflows

### Card Execution (`agentBoard.ts`)

The main 5-step durable workflow for executing kanban cards:

1. **Setup** - Load card, board, task; validate stage type
2. **Run Agent** - Execute in Lakitu sandbox (poll for completion)
3. **Save Artifacts** - Persist files to Convex storage
4. **QA Check** - Verify deliverables are met
5. **Advance/Block** - Move card to next stage or handle errors

```typescript
// Entry point
agentBoard.startCardExecution({ cardId, userId })

// Cancel running workflow
agentBoard.stopCardExecution({ cardId, userId })
```

### Chat Threads (`agentThread.ts`)

Multi-turn conversations outside board workflows:

```typescript
// Start new chat
agentThread.startThread({ prompt, userId })

// Continue conversation
agentThread.continueThread({ threadId, prompt })
```

### Simple Prompts (`agentPrompt.ts`)

One-off executions for quick tasks:

```typescript
// Run any prompt
agentPrompt.runPrompt({ prompt, systemPrompt?, tools? })

// Board planning
agentPrompt.generateBoardPlan({ description })
agentPrompt.executeBoardPlan({ plan })

// Research queries
agentPrompt.runResearch({ query, depth: 'quick' | 'thorough' })
```

## Sandbox Management

### Current: `sandboxConvex.ts`

Spawns E2B sandbox running self-hosted Convex backend:

1. Creates session record in cloud Convex
2. Spawns E2B sandbox with Lakitu template
3. Deploys agent functions to sandbox Convex
4. Starts agent thread via Convex client
5. Polls stream deltas for real-time updates
6. JWT auth for sandbox → cloud communication

### Legacy: `lifecycleSandbox.ts`

Uses OpenCode HTTP API instead of self-hosted Convex. Kept for reference.

## State Synchronization

### Loro CRDT (`crudLorobeads.ts`)

Multi-agent state sync using Loro (conflict-free replicated data type):

- **Updates**: Incremental changes (push/get)
- **Snapshots**: Compacted state checkpoints
- **VFS Manifest**: Track sandbox file state

### Beads Integration

Issue tracking synced between sandbox and cloud:

```typescript
// Sync issue from sandbox
lorobeads.syncIssue({ cardId, issue })

// Get all issues for a card
lorobeads.getCardIssues({ cardId })
```

## Skills (`crudSkills.ts`)

Bundles of tools + prompts for specific capabilities:

- Custom skills per user/org stored in database
- Skills determine which tools an agent can use

## Database Tables

| Table | Purpose |
|-------|---------|
| `cards` | Work items with context |
| `cardRuns` | Execution history per card |
| `boards` | Kanban boards |
| `boardTasks` | Workflow stages (agent/human) |
| `convexSandboxSessions` | Session records (sandboxConvex) |
| `convexSandboxLogs` | Real-time logs |
| `agentSessions` | Session records (legacy) |
| `agentSessionLogs` | Activity logs (legacy) |
| `threads` | Chat sessions per user |
| `threadMessages` | Message history |
| `agentConversations` | Project-level conversations |
| `skills` | Skill definitions |
| `customTools` | Custom tool implementations |
| `beadsLoroUpdates` | CRDT incremental updates |
| `beadsSnapshots` | Compacted state |
| `beadsIssues` | Synced issues |
| `compiledSandbox` | Compilation manifests |
| `agentMail` | Inter-agent messages |

## Common Patterns

### Polling for Completion

Sandboxes run async; we poll for completion:

```typescript
// sandboxConvex.ts pattern
for (let i = 0; i < MAX_POLLS; i++) {
  const session = await ctx.runQuery(internal.sessions.get, { sessionId })
  if (session.status === 'completed') return session
  if (session.status === 'failed') throw new Error(session.error)
  await sleep(POLL_INTERVAL)
}
```

### Durable Workflows

Uses Convex Workflow for failure recovery:

```typescript
// agentBoard.ts
export const cardExecutionWorkflow = workflow.define({
  args: { cardId, userId },
  handler: async (step, args) => {
    // Step 1: Setup
    const card = await step.runQuery(...)
    
    // Step 2: Run Agent (survives function restarts)
    const result = await step.runAction(...)
    
    // Step 3: Save Artifacts
    await step.runMutation(...)
  }
})
```

### JWT Authentication

Sandbox authenticates to cloud via JWT:

```typescript
// Generate JWT for sandbox
const jwt = signJwt({ sessionId, userId }, SANDBOX_JWT_SECRET)

// Sandbox includes JWT in requests to cloud gateway
fetch(`${CLOUD_URL}/agent/call`, {
  headers: { Authorization: `Bearer ${jwt}` }
})
```

## Entry Points

**From Frontend** (via Convex API):
- `agentThread.sendMessage()` - Chat interface
- `agentPrompt.runPrompt()` - Direct execution
- `agentBoard.startCardExecution()` - Card workflows
- `crudBoard.generatePlan()` - Board planning

**From Gateway** (`convex/gateway.ts`):
- HTTP callbacks from sandboxes
- Stream delta forwarding
- LLM call proxying

## Related Packages

- **packages/lakitu** - The agent runtime that runs inside E2B sandboxes
- **packages/primitives/agent** - Tool/skill metadata and sandbox template builder
