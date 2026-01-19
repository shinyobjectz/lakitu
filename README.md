<p align="center">
  <img src="assets/laki2-banner.jpeg" alt="Lakitu Banner" width="100%">
</p>

# @lakitu/sdk

> Self-hosted AI agent runtime for [Convex](https://convex.dev) + [E2B](https://e2b.dev)

Lakitu is a framework for AI agents that execute code instead of making tool calls. The agent writes TypeScript, imports capabilities from KSA modules, and runs in an isolated E2B sandbox with its own filesystem, terminal, and database.

```bash
npx @lakitu/sdk init
```

---

## Why Lakitu?

**The core problem:** AI coding agents forget their plan halfway through complex tasks, corrupt the host environment, and hallucinate progress they haven't made.

**Lakitu's solution:** Give the agent an isolated computer (E2B sandbox), structured capabilities (KSA files), persistent memory (Beads task graph), and verifiable state (Convex database).

| Component | What it solves |
|-----------|----------------|
| **E2B Sandbox** | Agent gets its own VM—can't break your machine. Boots in 150ms. |
| **KSA Files** | Agent capabilities defined in code, not buried in prompts. Testable, version-controlled. |
| **Beads** | Git-backed task graph. Agent always knows what's done, what's blocked, what's next. |
| **Convex** | Real-time database in the sandbox. Agent can verify actual state, not just claim progress. |

---

## Code Execution vs Tool Calls

Most agent frameworks use JSON tool calls:
```json
{ "tool": "readFile", "args": { "path": "app.ts" } }
```

Lakitu agents write code:
```typescript
import { file, shell } from './ksa';

const code = await file.read('app.ts');
await file.write('app.ts', fixedCode);
const result = await shell.exec('bun test');
```

**Why this is better:**
- No tool schemas sent every request (saves 40-60% tokens)
- Natural composition—chain operations like normal code
- See exactly what ran, not just "tool was called"
- Works with any LLM that generates code

---

## Quick Start

### 1. Initialize

```bash
npx @lakitu/sdk init
```

Creates `convex/lakitu/config.ts` and an example KSA.

### 2. Build sandbox template

```bash
npx @lakitu/sdk build
```

Pre-deploys Convex functions into an E2B template. Sandboxes boot instantly with everything ready.

### 3. Configure

```typescript
// convex/lakitu/config.ts
import { Lakitu } from "@lakitu/sdk";

export default Lakitu.configure({
  template: "lakitu",
  model: "anthropic/claude-sonnet-4-20250514",
  ksas: ["file", "shell", "browser", "beads"],
});
```

---

## Defining KSAs

KSAs (Knowledge, Skills, Abilities) are capability modules. Instead of prompt engineering, you define what the agent can do in TypeScript:

```typescript
import { defineKSA, fn, service, primitive } from "@lakitu/sdk";

export const dbKSA = defineKSA("database")
  .description("Database operations")
  .category("skills")
  
  .fn("migrate", fn()
    .description("Run database migration")
    .param("version", { type: "string", required: true })
    .impl(service("services.Database.internal.migrate"))
  )
  
  .fn("backup", fn()
    .description("Create database backup")
    .impl(primitive("shell.exec"))
  )
  
  .build();
```

### Implementation types

**Service** — calls your Convex backend:
```typescript
.impl(service("services.MyApi.internal.doThing"))
```

**Primitive** — local sandbox operation:
```typescript
.impl(primitive("file.read"))
.impl(primitive("shell.exec"))
.impl(primitive("browser.screenshot"))
```

### Built-in primitives

| Category | Functions |
|----------|-----------|
| `file` | `read`, `write`, `edit`, `glob`, `grep`, `ls`, `exists`, `stat` |
| `shell` | `exec` |
| `browser` | `open`, `screenshot`, `click`, `type`, `getHtml`, `getText`, `close` |

---

## Built-in KSAs

| KSA | What it does |
|-----|--------------|
| `file` | Filesystem operations |
| `shell` | Terminal commands |
| `browser` | Web automation via Playwright |
| `beads` | Task tracking (`bd ready`, `bd close`, etc.) |
| `web` | Search and scrape |
| `pdf` | Generate PDFs from markdown |
| `email` | Send emails |

---

## CLI Commands

```bash
npx @lakitu/sdk init              # Setup in Convex project
npx @lakitu/sdk init --dir ./convex  # Custom directory
npx @lakitu/sdk build             # Build E2B template
npx @lakitu/sdk build --base      # Base template only
npx @lakitu/sdk build --custom    # Custom template only  
npx @lakitu/sdk publish           # Template management
```

---

## How the pieces fit together

1. **Agent receives task** → loads relevant KSAs
2. **Queries Beads** → `bd ready` returns unblocked work
3. **Executes in sandbox** → writes code using KSA functions
4. **Verifies via Convex** → checks actual state matches expected
5. **Updates Beads** → marks tasks done, creates follow-ups
6. **Session ends** → `bd sync` persists everything to git

The agent can pick up exactly where it left off, even across sessions or handoffs to other agents.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `E2B_API_KEY` | Your E2B API key (or `e2b auth login`) |

---

## Benchmarks

Real-world agent task benchmarks across different models. All tests run in isolated E2B sandboxes with full code execution.

### Code Generation Tasks

| Model | Pass Rate | Avg Latency | Tasks |
|-------|-----------|-------------|-------|
| **Claude Sonnet 4.5** | 100% | 27.9s | fibonacci, palindrome, array_sum, prime_check, reverse_string |
| **Claude Haiku 4.5** | 80% | 12.7s | 4/5 passed |
| **Gemini 3 Flash** | 80% | 16.0s | 4/5 passed |

### File Operations

| Model | Pass Rate | Avg Latency | Tasks |
|-------|-----------|-------------|-------|
| **Claude Sonnet 4.5** | 100% | 20.7s | write_and_read, create_json, list_directory |

### What's Being Measured

Each benchmark:
1. Spins up fresh E2B sandbox (~150ms)
2. Agent writes TypeScript code importing KSAs
3. Code executes in sandbox
4. Results verified against expected output

**Example task (fibonacci):**
```
Prompt: "Write a TypeScript function that returns the nth Fibonacci number. Test it with n=10."
Expected: Agent writes function, executes it, outputs 55
```

### Run Your Own

```bash
# Quick sanity check
bun convex run utils/dev/benchmarks/lakitu:runQuick

# Full code generation suite
bun convex run utils/dev/benchmarks/lakitu:runCodeGen

# All benchmarks
bun convex run utils/dev/benchmarks/lakitu:runAll

# Specific model
bun convex run utils/dev/benchmarks/lakitu:runAll '{"model": "anthropic/claude-haiku-4.5"}'
```

---

## Links

- [npm](https://www.npmjs.com/package/@lakitu/sdk)
- [GitHub](https://github.com/shinyobjectz/lakitu)
- [E2B](https://e2b.dev/docs)
- [Convex](https://docs.convex.dev)
- [Beads](https://github.com/steveyegge/beads)

## License

MIT
