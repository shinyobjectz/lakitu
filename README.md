<p align="center">
  <img src="assets/laki2-banner.jpeg" alt="Lakitu Banner" width="100%">
</p>

# @lakitu/sdk

> **The Professional OS for Autonomous AI Agents**

Lakitu is a framework for building AI agents that actually finish what they start. While most agents suffer from "agentic amnesia"—forgetting their plan halfway through complex tasks—Lakitu provides the execution environment, structured memory, and competency system that transforms unreliable chatbots into autonomous professionals.

```bash
npx @lakitu/sdk init
```

---

## The Problem with Current AI Agents

Today's coding agents fail in predictable ways:

| Failure Mode | What Happens | Root Cause |
|--------------|--------------|------------|
| **Agentic Amnesia** | Agent completes 30% of work, declares victory | Context window fills with noise, plan is forgotten |
| **Environment Corruption** | Agent breaks the host system | No execution isolation |
| **Behavioral Drift** | Agent ignores instructions over time | Competencies buried in monolithic prompts |
| **State Blindness** | Agent hallucinates progress | No structured state to verify against |

Lakitu solves each of these with four integrated systems:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LAKITU FRAMEWORK                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│   │  E2B Sandbox │  │  KSA Files   │  │    Beads     │  │ Convex │ │
│   │  (Security)  │  │ (Competency) │  │   (Memory)   │  │(State) │ │
│   └──────────────┘  └──────────────┘  └──────────────┘  └────────┘ │
│         │                  │                  │              │      │
│         ▼                  ▼                  ▼              ▼      │
│   Hardware-level      Structured         Git-backed       Real-time │
│   isolation via       behavioral         task graph       reactive  │
│   Firecracker         configuration      with decay       database  │
│   microVMs            & modular skills   & forensics                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Code Execution Model

Traditional agents use JSON tool calls. Lakitu agents write and execute code:

```
Traditional Agent:              Lakitu Agent:
┌───────────────────┐           ┌───────────────────┐
│  LLM Response     │           │  LLM Response     │
│  {                │           │  ```typescript    │
│    "tool": "x",   │    vs     │  import { x }     │
│    "args": {...}  │           │  await x(...)     │
│  }                │           │  ```              │
└────────┬──────────┘           └────────┬──────────┘
         │                               │
    Parse JSON                    Execute TypeScript
    Route to executor             in E2B sandbox
         │                               │
    ┌────▼────┐                  ┌───────▼───────┐
    │ Limited │                  │ Full Computer │
    │ Actions │                  │ File, Shell,  │
    └─────────┘                  │ Browser, etc. │
                                 └───────────────┘
```

**Why code execution?**

- **Token Efficient** — No tool schemas sent every request (saves 40-60% tokens)
- **Composable** — Chain operations naturally: `const data = await fetch(); await process(data);`
- **Debuggable** — See exactly what code ran, not just tool call logs
- **Model Agnostic** — Any LLM that generates code works

---

## The Four Pillars

### 1. E2B Sandbox — Hardware-Level Security

Agents need filesystem access and terminal commands. Running this on your machine is dangerous. Lakitu uses [E2B](https://e2b.dev) sandboxes powered by **Firecracker microVMs**—the same technology AWS uses for Lambda.

| Metric | Docker | E2B Firecracker |
|--------|--------|-----------------|
| Startup | 500ms - 2s | **~150ms** |
| Isolation | OS-level (namespaces) | **Hardware-level (KVM)** |
| Security | Process boundaries | **Full VM isolation** |
| Persistence | Ephemeral | **Up to 14 days** |

The agent gets its own cloud computer where it can install packages, run tests, and verify actions—without any risk to your environment.

```typescript
// Agent writes code that executes in the sandbox
import { file, shell } from './ksa';

await file.write('app.ts', code);
const result = await shell.exec('bun test');

if (result.exitCode !== 0) {
  // Agent can read errors and self-correct
  const errors = await file.read('test-output.log');
  // ... fix and retry
}
```

### 2. KSA Files — Structured Competency

The "monolithic prompt" problem: instructions, persona, and tool definitions crammed into one system message leads to behavioral drift. Lakitu introduces **KSA (Knowledge, Skills, and Abilities) files**—a framework borrowed from industrial-organizational psychology.

| Component | Definition | Agent Example |
|-----------|------------|---------------|
| **Knowledge** | Theoretical understanding | "TypeScript generics", "REST API design" |
| **Skills** | Practical application | "Writing unit tests", "Database migrations" |
| **Abilities** | Underlying capabilities | "Multi-step reasoning", "Self-correction" |

Instead of prose prompts, you define machine-readable competency files:

```typescript
import { defineKSA, fn, service } from "@lakitu/sdk";

export const migrationKSA = defineKSA("database-migrations")
  .description("Perform zero-downtime database migrations")
  .category("skills")
  
  .fn("planMigration", fn()
    .description("Analyze schema changes and create migration plan")
    .param("currentSchema", { type: "string", required: true })
    .param("targetSchema", { type: "string", required: true })
    .impl(service("services.Migration.internal.plan"))
  )
  
  .fn("executeMigration", fn()
    .description("Run migration with rollback capability")
    .param("plan", { type: "object", required: true })
    .param("dryRun", { type: "boolean", default: true })
    .impl(service("services.Migration.internal.execute"))
  )
  
  .build();
```

This achieves **behavioral firmware**—stable, testable, version-controlled agent capabilities.

### 3. Beads — Git-Backed Task Memory

Markdown todo lists fail because they're unstructured and fall out of sync. Agents using them complete a subtask, forget the six-phase plan, and declare victory at 30%.

**Beads** is a git-backed graph issue tracker designed for AI agents:

```bash
bd init                    # Initialize task database
bd create "Migrate to Riverpod" -t epic
bd create "Setup dependencies" --parent bd-a1b2
bd ready                   # List unblocked tasks
bd update bd-c3d4 --status in_progress
bd close bd-c3d4 --reason "Migration complete"
bd compact                 # Summarize old tasks, preserve context
```

**Key features:**

- **Dependency-aware**: `bd ready` returns only unblocked tasks
- **Hash-based IDs**: No merge conflicts in multi-agent workflows
- **Semantic decay**: `bd compact` summarizes 100 lines of history into 5 lines of context
- **Forensic audit**: Every task change is tracked in git

```
┌─────────────────────────────────────────────────────────────────┐
│                    BEADS TASK GRAPH                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   [Epic: Migrate App]                                           │
│         │                                                        │
│    ┌────┴────┐                                                  │
│    ▼         ▼                                                  │
│ [Setup]   [Core Migration]                                      │
│    │         │                                                   │
│    ▼    ┌────┴────┐                                             │
│   ✓    [Service A] [Service B]  ← blocked by Service A          │
│              │                                                   │
│              ▼                                                   │
│         [discovered: memory leak] ← auto-created during work    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Convex — Localized Real-Time State

For agents to work as collaborative partners, they need more than files—they need a **reactive state layer**. Lakitu deploys a localized [Convex](https://convex.dev) backend inside the sandbox.

**Why this matters:**

- **State Persistence**: Complex application state survives process restarts
- **Reactive Orchestration**: Database changes trigger functions—coordinate multi-agent swarms
- **Verification**: Agent can check actual state vs. claimed progress (prevents hallucinated completion)
- **Full-Stack Autonomy**: Agent can develop, deploy, and manage entire applications

```typescript
// Agent stores structured state, not just files
await ctx.runMutation(api.tasks.complete, { 
  taskId: "bd-a1b2",
  result: { filesChanged: 3, testsPass: true }
});

// Other agents (or humans) see updates instantly
const status = await ctx.runQuery(api.project.status);
// { completed: 23, remaining: 4, blocked: 1 }
```

---

## Quick Start

### Installation

```bash
npm install @lakitu/sdk
# or
bun add @lakitu/sdk
```

### Initialize in Your Convex Project

```bash
npx @lakitu/sdk init
```

This creates:
```
convex/
└── lakitu/
    ├── config.ts      # Framework configuration
    └── example.ts     # Example KSA to get started
```

### Build Your Sandbox Template

```bash
npx @lakitu/sdk build
```

This:
1. Starts a local Convex backend
2. Pre-deploys your functions
3. Builds an E2B template with everything baked in
4. Sandboxes boot in ~150ms with functions ready

### Configure

Edit `convex/lakitu/config.ts`:

```typescript
import { Lakitu } from "@lakitu/sdk";

export default Lakitu.configure({
  template: "lakitu",
  model: "anthropic/claude-sonnet-4-20250514",
  
  ksas: [
    // Core capabilities
    "file", "shell", "browser", "beads",
    
    // Your custom KSAs
    "./migrations",
    "./testing",
  ],
  
  pool: {
    min: 0,
    max: 5,
    idleTimeout: 300_000,
  },
});
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `npx @lakitu/sdk init` | Initialize Lakitu in your Convex project |
| `npx @lakitu/sdk init --dir ./convex` | Specify custom Convex directory |
| `npx @lakitu/sdk build` | Build E2B template (base + custom) |
| `npx @lakitu/sdk build --base` | Build base template only |
| `npx @lakitu/sdk build --custom` | Build custom template only |
| `npx @lakitu/sdk publish` | Manage E2B templates |

---

## KSA SDK Reference

### Defining a KSA

```typescript
import { defineKSA, fn, service, primitive, composite } from "@lakitu/sdk";

export const myKSA = defineKSA("name")
  .description("What this KSA enables")
  .category("skills")      // "core" | "skills" | "deliverables"
  .group("subcategory")    // Optional grouping
  .icon("mdi-icon-name")   // Optional MDI icon
  
  .fn("functionName", fn()
    .description("What this function does")
    .param("input", { type: "string", required: true })
    .param("limit", { type: "number", default: 10 })
    .returns<ResultType>()
    .impl(/* implementation */)
  )
  
  .build();
```

### Implementation Types

**Service** — Call cloud Convex functions:
```typescript
.impl(service("services.MyService.internal.action")
  .mapArgs(({ input }) => ({ data: input }))
  .mapResult(r => r.value)
)
```

**Primitive** — Local sandbox operations:
```typescript
.impl(primitive("file.read"))
.impl(primitive("shell.exec"))
.impl(primitive("browser.screenshot"))
```

**Composite** — Chain multiple operations:
```typescript
.impl(composite()
  .call("file.read", { path: "./config.json" }, "config")
  .call("myKsa.process", ctx => ({ data: ctx.vars.config }), "result")
  .return(ctx => ctx.vars.result)
)
```

### Available Primitives

| Category | Operations |
|----------|------------|
| **file** | `read`, `write`, `edit`, `glob`, `grep`, `ls`, `exists`, `stat` |
| **shell** | `exec` |
| **browser** | `open`, `screenshot`, `click`, `type`, `getHtml`, `getText`, `close` |

### Parameter Types

```typescript
.param("name", { type: "string", required: true })
.param("count", { type: "number", default: 10 })
.param("enabled", { type: "boolean", default: false })
.param("items", { type: "array" })
.param("config", { type: "object" })
```

---

## Built-in KSAs

| Category | KSA | Capabilities |
|----------|-----|--------------|
| **Core** | `file` | Filesystem CRUD, glob, grep |
| | `shell` | Terminal command execution |
| | `browser` | Playwright-based web automation |
| | `beads` | Task tracking and memory management |
| **Skills** | `web` | Search, scrape, content extraction |
| | `news` | News monitoring and sentiment |
| | `social` | Social media data extraction |
| | `companies` | Company enrichment and tech stacks |
| **Deliverables** | `pdf` | PDF generation from markdown |
| | `email` | Email composition and sending |

---

## The Lakitu Workflow

A complete example of how the four pillars work together:

### Phase 1: Planning & Competency Loading

```bash
# Developer initializes project
bd init
bd create "Migrate Flutter app from Provider to Riverpod" -t epic
```

Agent loads relevant KSAs: `flutter-widgets`, `riverpod-state`, `testing`.

### Phase 2: Execution in Secure Sandbox

```typescript
// Agent queries for unblocked work
const tasks = await beads.getReady();
// → [{ id: "bd-a1b2", title: "Setup Riverpod dependencies" }]

// Works in isolated E2B environment
await shell.exec("flutter pub add flutter_riverpod");
await file.edit("pubspec.yaml", oldDeps, newDeps);

// Runs tests to verify
const result = await shell.exec("flutter test");
if (result.exitCode !== 0) {
  // Self-corrects based on error output
}
```

### Phase 3: Continuous Memory Management

```typescript
// Agent completes task
await beads.close("bd-a1b2", "Dependencies configured");

// Discovers secondary issue during work
await beads.create({
  title: "Memory leak in Widget #22",
  type: "bug",
  discoveredFrom: "bd-a1b2"
});

// Periodic compaction keeps context fresh
await beads.compact(); // 100 lines → 5 line summary
```

### Phase 4: Session Handoff

```bash
# End of session
bd sync                    # Sync to git
git push

# Next session (human or agent)
bd sync                    # Pull latest state
bd ready                   # Immediately oriented to project state
```

---

## Architecture Deep Dive

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              E2B SANDBOX                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         KSA MODULES                              │    │
│  │  /home/user/ksa/                                                 │    │
│  │  ┌──────┐ ┌──────┐ ┌───────┐ ┌─────────┐ ┌───────┐ ┌─────────┐ │    │
│  │  │ file │ │ web  │ │ news  │ │ social  │ │ email │ │companies│ │    │
│  │  └──────┘ └──────┘ └───────┘ └─────────┘ └───────┘ └─────────┘ │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                          Local ops │ Gateway calls                       │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      CLOUD GATEWAY                               │    │
│  │  HTTP → Convex Services (LLMs, APIs, External Data)              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐     │
│  │ /workspace/     │  │ /artifacts/     │  │ .beads/             │     │
│  │ Working files   │  │ PDFs, images    │  │ Task graph (JSONL)  │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    LOCALIZED CONVEX                              │    │
│  │  Real-time state • Reactive triggers • Multi-agent coordination  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `E2B_API_KEY` | Your E2B API key (or run `e2b auth login`) |

---

## Comparison with Other Frameworks

| Framework | Focus | Lakitu Synergy |
|-----------|-------|----------------|
| **CrewAI** | Role-based agent collaboration | Lakitu provides secure execution environment |
| **LangGraph** | Deterministic state flows | Lakitu provides persistent memory across nodes |
| **AutoGen** | Multi-agent conversation | Lakitu provides structured task coordination |
| **Lakitu** | **Infrastructure & Memory** | Foundation layer for reliable autonomy |

While orchestration frameworks manage *how* agents talk, Lakitu manages *where* they work, *what* they remember, and *how* they verify their progress.

---

## The Future: Agent Villages

Lakitu is designed for the "Agent Village"—coordinated swarms working toward massive goals. In this model:

- **State lives in Convex**: Agents don't need leaders; they query `bd ready`
- **Memory lives in Beads**: Blockers auto-propagate across the swarm
- **Execution lives in E2B**: Each agent has isolated, secure compute

The human role shifts from "manager of minutiae" to "strategist of epics."

---

## Links

- [npm package](https://www.npmjs.com/package/@lakitu/sdk)
- [GitHub](https://github.com/shinyobjectz/lakitu)
- [E2B Documentation](https://e2b.dev/docs)
- [Convex Documentation](https://docs.convex.dev)
- [Beads Issue Tracker](https://github.com/steveyegge/beads)

---

## License

MIT

---

<p align="center">
  <i>The future of AI is not a better chatbot—it's a system that lands the plane every time.</i>
</p>
