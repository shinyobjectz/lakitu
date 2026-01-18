<p align="center">
  <img src="assets/laki2-banner.jpeg" alt="Lakitu Banner" width="100%">
</p>

# @lakitu/sdk

> Self-hosted AI agent framework for [Convex](https://convex.dev) + [E2B](https://e2b.dev) with **code execution**.

Lakitu runs AI agents in secure E2B sandboxes where they write and execute TypeScript code. Instead of JSON tool calls, agents import from **KSAs** (Knowledge, Skills, and Abilities) — plain TypeScript modules.

## Quick Start

```bash
# In your Convex project
npx @lakitu/sdk init

# Build your E2B sandbox template
npx @lakitu/sdk build

# Publish template to E2B
npx @lakitu/sdk publish
```

## Installation

```bash
npm install @lakitu/sdk
# or
bun add @lakitu/sdk
```

## CLI Commands

### `npx @lakitu/sdk init`

Initialize Lakitu in your Convex project:

```bash
npx @lakitu/sdk init
npx @lakitu/sdk init --dir ./convex  # Custom convex directory
npx @lakitu/sdk init --skip-install  # Skip npm install
```

This creates:
```
convex/
└── lakitu/
    ├── config.ts      # Lakitu configuration
    └── example.ts     # Example KSA to get started
```

### `npx @lakitu/sdk build`

Build your E2B sandbox template with pre-deployed Convex functions:

```bash
npx @lakitu/sdk build           # Build both base + custom templates
npx @lakitu/sdk build --base    # Build base template only
npx @lakitu/sdk build --custom  # Build custom template only
```

### `npx @lakitu/sdk publish`

Manage your E2B templates:

```bash
npx @lakitu/sdk publish
```

## The Code Execution Model

Traditional agents use JSON tool calls. Lakitu agents write code:

```
Traditional Agent:          Lakitu Agent:
┌─────────────────┐         ┌─────────────────┐
│  LLM Response   │         │  LLM Response   │
│  {              │         │  ```typescript  │
│    "tool": "x", │   vs    │  import { x }   │
│    "args": {}   │         │  await x(...)   │
│  }              │         │  ```            │
└────────┬────────┘         └────────┬────────┘
         │                           │
    Parse JSON               Execute TypeScript
    Route to tool            (E2B sandbox)
         │                           │
    ┌────▼────┐              ┌───────▼───────┐
    │ Executor │              │  KSA Modules  │
    └─────────┘              └───────────────┘
```

**Why code execution?**
- **Token efficient** — No tool schemas sent every request
- **Composable** — Chain operations naturally in code
- **Debuggable** — See exactly what code ran
- **Model agnostic** — Any LLM that generates code works

---

## KSA SDK

KSAs (Knowledge, Skills, and Abilities) are capability modules that agents use via code execution. The SDK provides a type-safe builder API for defining KSAs.

### Defining a KSA

```typescript
import { defineKSA, fn, service, primitive } from "@lakitu/sdk";

export const myKSA = defineKSA("myKsa")
  .description("Description of what this KSA does")
  .category("skills")  // "core" | "skills" | "deliverables"
  .group("research")   // Optional subcategory
  .icon("mdi-search")  // Optional MDI icon

  // Add functions
  .fn("search", fn()
    .description("Search for something")
    .param("query", { type: "string", required: true })
    .param("limit", { type: "number", default: 10 })
    .returns<SearchResult[]>()
    .impl(service("services.Search.internal.query")
      .mapArgs(({ query, limit }) => ({ q: query, max: limit }))
      .mapResult(r => r.results)
    )
  )

  .fn("readFile", fn()
    .description("Read a local file")
    .param("path", { type: "string", required: true })
    .impl(primitive("file.read"))
  )

  .build();
```

### SDK Exports

```typescript
import {
  // Builders
  defineKSA,     // Create a KSA definition
  fn,            // Create a function definition
  service,       // Service implementation (calls cloud Convex)
  primitive,     // Primitive implementation (local sandbox ops)
  composite,     // Composite implementation (chain operations)

  // Registry utilities
  createRegistry,
  getFunction,

  // Types
  type KSADef,
  type FunctionDef,
  type ParamDef,
  type Implementation,
} from "@lakitu/sdk";
```

### Implementation Types

#### Service Implementation
Calls a Convex function via the cloud gateway:

```typescript
.impl(service("services.MyService.internal.action")
  .mapArgs(({ input }) => ({ data: input }))  // Transform args
  .mapResult(r => r.value)                     // Transform result
)
```

#### Primitive Implementation
Uses local sandbox capabilities (file, shell, browser):

```typescript
.impl(primitive("file.read"))
.impl(primitive("shell.exec"))
.impl(primitive("browser.screenshot"))
```

Available primitives:
- `file.read`, `file.write`, `file.edit`, `file.glob`, `file.grep`, `file.ls`, `file.exists`, `file.stat`
- `shell.exec`
- `browser.open`, `browser.screenshot`, `browser.click`, `browser.type`, `browser.getHtml`, `browser.getText`, `browser.close`

#### Composite Implementation
Chain multiple operations:

```typescript
.impl(composite()
  .call("file.read", { filePath: "./config.json" }, "config")
  .call("myKsa.process", ctx => ({ data: ctx.vars.config }), "result")
  .return(ctx => ctx.vars.result)
)
```

### Parameter Types

```typescript
.param("name", { type: "string", required: true })
.param("count", { type: "number", default: 10 })
.param("enabled", { type: "boolean", default: false })
.param("tags", { type: "array" })
.param("options", { type: "object" })
```

---

## Configuration

After running `init`, configure Lakitu in `convex/lakitu/config.ts`:

```typescript
import { Lakitu } from "@lakitu/sdk";

export default Lakitu.configure({
  // E2B template name (build with: npx lakitu build)
  template: "lakitu",

  // Default model for agent
  model: "anthropic/claude-sonnet-4-20250514",

  // KSA modules to enable
  ksas: [
    // Built-in KSAs
    "file",
    "shell", 
    "browser",
    "beads",

    // Custom KSAs
    "./myCustomKsa",
  ],

  // Sandbox pool settings
  pool: {
    min: 0,
    max: 5,
    idleTimeout: 300_000,
  },
});
```

---

## Built-in KSAs

| Category | KSA | Functions |
|----------|-----|-----------|
| **Core** | `file` | `read`, `write`, `edit`, `glob`, `grep`, `ls` |
| | `shell` | `exec` |
| | `browser` | `open`, `screenshot`, `click`, `type`, `getText` |
| | `beads` | `create`, `update`, `close`, `list`, `getReady` |
| **Skills** | `web` | `search`, `scrape` |
| | `news` | `trending`, `search`, `analyze` |
| | `social` | `tiktok`, `instagram`, `twitter`, `search` |
| | `companies` | `enrich`, `search`, `techStack` |
| **Deliverables** | `pdf` | `generate` |
| | `email` | `send`, `sendBulk` |

---

## Architecture

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
│  │  HTTP → Convex Services (OpenRouter, external APIs)              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  /home/user/workspace/    Working files                          │    │
│  │  /home/user/artifacts/    Persistent outputs (PDFs, screenshots) │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Example: Custom KSA

Create `convex/lakitu/weather.ts`:

```typescript
import { defineKSA, fn, service } from "@lakitu/sdk";

export const weatherKSA = defineKSA("weather")
  .description("Weather data and forecasts")
  .category("skills")
  .group("data")

  .fn("current", fn()
    .description("Get current weather for a location")
    .param("location", { type: "string", required: true, description: "City name or coordinates" })
    .impl(service("services.Weather.internal.getCurrent"))
  )

  .fn("forecast", fn()
    .description("Get weather forecast")
    .param("location", { type: "string", required: true })
    .param("days", { type: "number", default: 7 })
    .impl(service("services.Weather.internal.getForecast"))
  )

  .build();

export default weatherKSA;
```

The agent can then use it:

```typescript
import { current, forecast } from './ksa/weather';

const weather = await current("San Francisco");
console.log(`Current: ${weather.temp}°F, ${weather.condition}`);

const nextWeek = await forecast("San Francisco", 7);
for (const day of nextWeek) {
  console.log(`${day.date}: ${day.high}°F / ${day.low}°F`);
}
```

---

## Environment Variables

For `build` command:
- `E2B_API_KEY` — Your E2B API key (or run `e2b auth login`)

---

## Requirements

- [Convex](https://convex.dev) project
- [E2B](https://e2b.dev) account (for sandbox hosting)
- Node.js 18+ or Bun

---

## Links

- [npm package](https://www.npmjs.com/package/@lakitu/sdk)
- [GitHub](https://github.com/shinyobjectz/lakitu)
- [E2B Documentation](https://e2b.dev/docs)
- [Convex Documentation](https://docs.convex.dev)

---

## License

MIT
