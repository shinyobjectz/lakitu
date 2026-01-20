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

## Table of Contents

- [Why Lakitu?](#why-lakitu)
- [Quick Start](#quick-start)
- [Import Reference](#import-reference)
- [Configuration](#configuration)
- [Defining KSAs](#defining-ksas)
- [Built-in KSAs](#built-in-ksas)
- [Gateway API](#gateway-api)
- [Local Database](#local-database)
- [Template Customization](#template-customization)
- [CLI Commands](#cli-commands)
- [Benchmarks](#benchmarks)
- [Contributing](#contributing)

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

### Code Execution vs Tool Calls

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

### 3. Configure Convex

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import lakitu from "@lakitu/sdk/convex.config";

const app = defineApp();
app.use(lakitu);

export default app;
```

---

## Import Reference

Lakitu provides clean, tree-shakeable imports:

```typescript
// Main entry - everything in one import
import { 
  defineKSA, fn, service, primitive,  // KSA builders
  callGateway, fireAndForget,          // Cloud gateway
  localDb, getSessionId,               // Local database
  THREAD_ID, CARD_ID, WORKSPACE_ID,    // Context identifiers
} from '@lakitu/sdk';

// Tree-shakeable imports for smaller bundles
import { callGateway, THREAD_ID } from '@lakitu/sdk/gateway';
import { localDb, getSessionId } from '@lakitu/sdk/db';
import { defineKSA, fn, service } from '@lakitu/sdk/builders';
import { file, shell, browser } from '@lakitu/sdk/primitives';
```

### Export Summary

| Export | Description |
|--------|-------------|
| `@lakitu/sdk` | Everything - builders, gateway, db, primitives |
| `@lakitu/sdk/gateway` | Cloud Convex access (`callGateway`, `fireAndForget`) |
| `@lakitu/sdk/db` | Local sandbox Convex (`localDb`) |
| `@lakitu/sdk/builders` | KSA definition (`defineKSA`, `fn`, `service`) |
| `@lakitu/sdk/primitives` | Sandbox operations (`file`, `shell`, `browser`) |
| `@lakitu/sdk/types` | TypeScript types only |
| `@lakitu/sdk/loro` | CRDT utilities (LoroFS, LoroBeads) |
| `@lakitu/sdk/convex.config` | Convex component config |

---

## Configuration

### Lakitu Configuration

```typescript
// convex/lakitu/config.ts
import { Lakitu } from "@lakitu/sdk";

export default Lakitu.configure({
  // E2B template name (default: "lakitu")
  template: "lakitu",
  
  // Model presets: "fast", "balanced", "capable", "vision"
  model: "balanced",
  
  // Or specify model directly
  // model: "anthropic/claude-sonnet-4",
  
  // KSAs to enable
  ksas: ["file", "shell", "browser", "beads", "web"],
  
  // Gateway configuration
  gateway: {
    // Additional allowed paths beyond defaults
    allowedPaths: [
      "features.myFeature.internal.*",
      "services.MyService.action",
    ],
  },
});
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `E2B_API_KEY` | E2B API key | Yes |
| `CONVEX_DEPLOYMENT` | Convex deployment URL | Yes |
| `SANDBOX_JWT_SECRET` | JWT secret for sandbox auth | Yes |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM | Yes |

---

## Defining KSAs

KSAs (Knowledge, Skills, Abilities) are capability modules. Define what the agent can do in TypeScript:

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

### Implementation Types

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

### Writing Project KSAs

Project KSAs live in `convex/lakitu/ksa/` and use the gateway to call your Convex backend:

```typescript
// convex/lakitu/ksa/myFeature.ts
import { callGateway } from "@lakitu/sdk/gateway";

export interface Item { id: string; name: string; }

/** List all items */
export const list = () => 
  callGateway<Item[]>("features.myFeature.list", {});

/** Get item by ID */
export const get = (id: string) => 
  callGateway<Item>("features.myFeature.get", { id });

/** Create new item */
export const create = (name: string) => 
  callGateway<{ id: string }>("internal.features.myFeature.create", { name }, "mutation");
```

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

### Built-in Primitives

| Category | Functions |
|----------|-----------|
| `file` | `read`, `write`, `edit`, `glob`, `grep`, `ls`, `exists`, `stat` |
| `shell` | `exec` |
| `browser` | `open`, `screenshot`, `click`, `type`, `getHtml`, `getText`, `close` |

---

## Gateway API

The gateway enables sandbox code to call your cloud Convex backend securely.

### callGateway

```typescript
import { callGateway } from "@lakitu/sdk/gateway";

// Basic usage
const data = await callGateway("features.users.list", { limit: 10 });

// With type annotation
const user = await callGateway<User>("features.users.get", { id: "123" });

// Specify operation type (query/mutation/action)
const result = await callGateway(
  "internal.features.users.create",
  { name: "John" },
  "mutation"
);
```

### callGatewayBatch

Execute multiple calls in a single HTTP request:

```typescript
import { callGatewayBatch } from "@lakitu/sdk/gateway";

const [users, posts] = await callGatewayBatch([
  { path: "features.users.list", args: { limit: 10 } },
  { path: "features.posts.recent", args: {} },
]);

if (users.ok) console.log(users.data);
```

### fireAndForget

Non-blocking calls for logging/analytics:

```typescript
import { fireAndForget } from "@lakitu/sdk/gateway";

// Won't block execution
fireAndForget("services.Analytics.track", { event: "page_view" });
```

---

## Local Database

The sandbox has its own Convex instance for fast local operations.

```typescript
import { localDb, getSessionId } from "@lakitu/sdk/db";

// Query
const files = await localDb.query("state/files.getByPath", { path: "/workspace" });

// Mutation
const id = await localDb.mutate("planning/beads.create", { title: "Task" });

// Fire-and-forget (non-blocking)
localDb.fire("state/files.trackAccess", { path: "/workspace" });

// Get session context
const sessionId = getSessionId();
```

---

## Template Customization

Customize the sandbox environment with a template config:

```typescript
// convex/lakitu/template.config.ts
import { defineTemplate } from "@lakitu/sdk/template";

export default defineTemplate({
  packages: {
    apt: ["ffmpeg", "imagemagick", "poppler-utils"],
    pip: ["pandas", "numpy", "pillow"],
    npm: ["sharp", "canvas"],
  },
  services: ["redis"],
  setup: [
    "pip install -r requirements.txt",
  ],
});
```

Build with custom packages:

```bash
npx @lakitu/sdk build --custom
```

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

## How It Works

1. **Agent receives task** → loads relevant KSAs
2. **Queries Beads** → `bd ready` returns unblocked work
3. **Executes in sandbox** → writes code using KSA functions
4. **Verifies via Convex** → checks actual state matches expected
5. **Updates Beads** → marks tasks done, creates follow-ups
6. **Session ends** → `bd sync` persists everything to git

The agent can pick up exactly where it left off, even across sessions or handoffs to other agents.

---

## Benchmarks

Real-world agent task benchmarks across different models. All tests run in isolated E2B sandboxes with full code execution.

### Code Generation

| Model | Pass Rate | Avg Latency |
|-------|-----------|-------------|
| **Claude Sonnet 4.5** | 100% (5/5) | 27.9s |
| **Claude Haiku 4.5** | 80% (4/5) | 12.7s |
| **Gemini 3 Flash Preview** | 80% (4/5) | 16.0s |

### Summary

| Category | Best Model | Notes |
|----------|------------|-------|
| **Code Generation** | Claude Sonnet 4.5 | Most reliable (100%) |
| **Research Tasks** | Gemini 3 Flash | Better at multi-step reasoning |
| **Page Creation** | Gemini 3 Flash | Better output verbosity |
| **Speed** | Claude Haiku 4.5 | 2-3x faster than others |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## Links

- [npm](https://www.npmjs.com/package/@lakitu/sdk)
- [GitHub](https://github.com/shinyobjectz/lakitu)
- [API Reference](docs/API.md)
- [E2B](https://e2b.dev/docs)
- [Convex](https://docs.convex.dev)
- [Beads](https://github.com/steveyegge/beads)

## License

MIT
