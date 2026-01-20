# Lakitu SDK API Reference

Complete API documentation for `@lakitu/sdk`.

## Table of Contents

- [Gateway API](#gateway-api)
- [Local Database API](#local-database-api)
- [KSA Builders](#ksa-builders)
- [Primitives](#primitives)
- [Model Presets](#model-presets)
- [Context Identifiers](#context-identifiers)
- [CRDT Utilities](#crdt-utilities)

---

## Gateway API

Import from `@lakitu/sdk` or `@lakitu/sdk/gateway`.

### callGateway

Call a Convex function from the sandbox.

```typescript
function callGateway<T = unknown>(
  path: string,
  args: Record<string, unknown>,
  type?: "query" | "mutation" | "action"
): Promise<T>
```

**Parameters:**
- `path` - Convex function path (e.g., `"features.users.list"`)
- `args` - Arguments object
- `type` - Optional operation type (auto-detected if omitted)

**Examples:**

```typescript
// Query (default for public paths)
const users = await callGateway<User[]>("features.users.list", { limit: 10 });

// Mutation
const id = await callGateway<string>(
  "internal.features.users.create",
  { name: "John" },
  "mutation"
);

// Action (default for internal paths)
const result = await callGateway(
  "internal.services.Email.send",
  { to: "user@example.com", subject: "Hello" }
);
```

### callGatewayBatch

Execute multiple calls in a single HTTP request.

```typescript
function callGatewayBatch<T extends unknown[] = unknown[]>(
  calls: BatchCall[]
): Promise<BatchResult<T[number]>[]>

interface BatchCall {
  path: string;
  args?: Record<string, unknown>;
  type?: "query" | "mutation" | "action";
}

interface BatchResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

**Example:**

```typescript
const [users, posts, settings] = await callGatewayBatch([
  { path: "features.users.list", args: { limit: 10 } },
  { path: "features.posts.recent", args: {} },
  { path: "features.settings.get", args: { key: "theme" } },
]);

users.forEach(result => {
  if (result.ok) {
    console.log(result.data);
  } else {
    console.error(result.error);
  }
});
```

### fireAndForget

Non-blocking call that doesn't wait for response.

```typescript
function fireAndForget(
  path: string,
  args: Record<string, unknown>,
  type?: "query" | "mutation" | "action"
): void
```

**Example:**

```typescript
// Log analytics without blocking
fireAndForget("services.Analytics.track", { event: "page_view", page: "/home" });

// Continue immediately - doesn't wait for response
console.log("Logged!");
```

### getGatewayConfig

Get current gateway configuration for debugging.

```typescript
function getGatewayConfig(): { url: string; hasJwt: boolean }
```

---

## Local Database API

Import from `@lakitu/sdk` or `@lakitu/sdk/db`.

### localDb

Client for the sandbox-local Convex database.

```typescript
const localDb = {
  query<T>(path: string, args?: Record<string, unknown>): Promise<T>;
  mutate<T>(path: string, args?: Record<string, unknown>): Promise<T>;
  action<T>(path: string, args?: Record<string, unknown>): Promise<T>;
  fire(path: string, args?: Record<string, unknown>): void;
  fireQuery(path: string, args?: Record<string, unknown>): void;
}
```

**Examples:**

```typescript
// Query - blocking
const files = await localDb.query("state/files.getByPath", { path: "/workspace" });

// Mutation - blocking
const id = await localDb.mutate("planning/beads.create", { 
  title: "New task",
  type: "task",
});

// Action - blocking
const result = await localDb.action("agent/decisions.evaluate", { context });

// Fire-and-forget mutation - non-blocking
localDb.fire("state/files.trackAccess", { path: "/workspace", operation: "read" });
```

**Path Format:**

Paths use dot notation converted to Convex format:
- `"state/files.getByPath"` → `state/files:getByPath`
- `"planning.beads.create"` → `planning/beads:create`

### Session Helpers

```typescript
function getSessionId(): string       // Current session ID
function getThreadId(): string | undefined   // Thread ID if available
function getCardId(): string | undefined     // Kanban card ID if available
function isLocalDbAvailable(): Promise<boolean>  // Check if local DB is ready
function getLocalDbConfig(): {
  url: string;
  sessionId: string;
  threadId?: string;
  cardId?: string;
}
```

### Cache Helpers

```typescript
function cacheKey(ksaName: string, funcName: string, args: unknown[]): string
function simpleHash(str: string): string
```

---

## KSA Builders

Import from `@lakitu/sdk` or `@lakitu/sdk/builders`.

### defineKSA

Create a new KSA definition.

```typescript
function defineKSA(name: string): KSABuilder
```

**KSABuilder methods:**

```typescript
class KSABuilder {
  description(desc: string): this
  category(cat: "knowledge" | "skills" | "abilities"): this
  fn(name: string, definition: FunctionDef): this
  build(): KSADefinition
}
```

**Example:**

```typescript
export const myKSA = defineKSA("myKsa")
  .description("My custom KSA")
  .category("skills")
  .fn("action1", fn()
    .description("Does action 1")
    .param("input", { type: "string", required: true })
    .impl(service("services.MyService.action1"))
  )
  .fn("action2", fn()
    .description("Does action 2")
    .impl(primitive("shell.exec"))
  )
  .build();
```

### fn

Create a function definition.

```typescript
function fn(): FunctionBuilder
```

**FunctionBuilder methods:**

```typescript
class FunctionBuilder {
  description(desc: string): this
  param(name: string, def: ParamDef): this
  returns(type: ParamType): this
  impl(implementation: Implementation): this
  build(): FunctionDef
}

interface ParamDef {
  type: ParamType;
  required?: boolean;
  description?: string;
  default?: unknown;
}

type ParamType = "string" | "number" | "boolean" | "object" | "array" | "any";
```

### service

Create a service implementation (calls Convex backend).

```typescript
function service(path: string): ServiceBuilder
```

**ServiceBuilder methods:**

```typescript
class ServiceBuilder {
  mapArgs(mapper: (args: any) => any): this
  mapResult(mapper: (result: any) => any): this
}
```

**Example:**

```typescript
.impl(service("internal.features.users.create")
  .mapArgs(({ name, email }) => ({ userData: { name, email } }))
  .mapResult(result => result.userId)
)
```

### primitive

Create a primitive implementation (local sandbox operation).

```typescript
function primitive(name: string): PrimitiveImpl
```

**Available primitives:**
- `file.read`, `file.write`, `file.edit`, `file.glob`, `file.grep`, `file.ls`, `file.exists`, `file.stat`
- `shell.exec`
- `browser.open`, `browser.screenshot`, `browser.click`, `browser.type`, `browser.getHtml`, `browser.getText`, `browser.close`

### composite

Create a composite implementation (multi-step operation).

```typescript
function composite(): CompositeBuilder
```

**CompositeBuilder methods:**

```typescript
class CompositeBuilder {
  step(name: string, impl: Implementation): this
  build(): CompositeImpl
}
```

---

## Primitives

Import from `@lakitu/sdk` or `@lakitu/sdk/primitives`.

### file

```typescript
const file = {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  edit(path: string, edits: Edit[]): Promise<void>;
  glob(pattern: string, options?: GlobOptions): Promise<string[]>;
  grep(pattern: string, path: string): Promise<GrepResult[]>;
  ls(path: string): Promise<FileInfo[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat>;
}
```

### shell

```typescript
const shell = {
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
}

interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

### browser

```typescript
const browser = {
  open(url: string): Promise<void>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  getHtml(selector?: string): Promise<string>;
  getText(selector?: string): Promise<string>;
  close(): Promise<void>;
}
```

---

## Model Presets

Model presets for LLM calls:

| Preset | Model | Use Case |
|--------|-------|----------|
| `fast` | `groq/llama-3.1-70b-versatile` | Quick responses, intent analysis |
| `balanced` | `anthropic/claude-sonnet-4` | General tasks |
| `capable` | `anthropic/claude-sonnet-4` | Complex reasoning |
| `vision` | `anthropic/claude-sonnet-4` | Image analysis |

Configure in `convex/lakitu/config.ts`:

```typescript
export default Lakitu.configure({
  model: "balanced",  // Use preset
  // or
  model: "anthropic/claude-sonnet-4",  // Direct model name
});
```

---

## Context Identifiers

Available from gateway and db modules:

```typescript
import { THREAD_ID, CARD_ID, WORKSPACE_ID, SESSION_ID } from "@lakitu/sdk";

// THREAD_ID - Current agent thread
// CARD_ID - Kanban card being processed
// WORKSPACE_ID - Design workspace context
// SESSION_ID - Sandbox session identifier
```

---

## CRDT Utilities

Import from `@lakitu/sdk/loro`.

### LoroFS

Filesystem CRDT for collaborative file editing.

```typescript
import { LoroFS } from "@lakitu/sdk/loro";

const fs = new LoroFS();
fs.writeFile("/path/to/file.ts", "content");
const content = fs.readFile("/path/to/file.ts");
const snapshot = fs.export();
```

### LoroBeads

Task graph CRDT for distributed task tracking.

```typescript
import { LoroBeads } from "@lakitu/sdk/loro";

const beads = new LoroBeads();
const id = beads.create({ title: "Task", type: "task" });
beads.update(id, { status: "in_progress" });
beads.close(id, "Completed");
```

---

## TypeScript Types

Import from `@lakitu/sdk/types` for type-only imports:

```typescript
import type {
  KSADefinition,
  FunctionDef,
  ParamDef,
  ParamType,
  Implementation,
  ServiceImpl,
  PrimitiveImpl,
  CompositeImpl,
  ExecutionContext,
  ExecutionResult,
  KSARegistry,
  BatchCall,
  BatchResult,
} from "@lakitu/sdk/types";
```
