# Lakitu - AI Instructions

> **AUDIENCE**: This document is for YOU, the AI agent (Claude Code, Cursor, etc.) working on this codebase.
> Read this BEFORE writing any code.

## Package Structure & Git Workflow

**Lakitu is a git submodule AND an npm package.** Understanding this is critical.

```
project.social/
├── packages/lakitu/          # ← Git SUBMODULE (separate repo)
│   ├── .git/                 #   Has its own git history
│   ├── package.json          #   Published as @lakitu/sdk
│   └── .github/workflows/    #   Auto-publishes to npm
└── .gitmodules               # ← References packages/lakitu
```

### Git Workflow for Lakitu Changes

```bash
# 1. Make changes in packages/lakitu/
cd packages/lakitu
# edit files...

# 2. Commit to the SUBMODULE (not parent repo)
git add -A
git commit -m "feat: add new KSA"

# 3. Push SUBMODULE to its remote (triggers npm publish if version bumped)
git push origin main

# 4. Go back to parent repo and update submodule reference
cd ../..
git add packages/lakitu
git commit -m "chore: update lakitu submodule"
git push

# 5. Rebuild sandbox template to use new code
bun sandbox:custom
```

### NPM Publish Workflow

The `@lakitu/sdk` package publishes automatically via GitHub Actions:

1. **Trigger**: Push to `packages/lakitu` with version bump in `package.json`
2. **Action**: `.github/workflows/publish.yml` builds and publishes
3. **Check**: `npm view @lakitu/sdk version` to verify

To bump version:
```bash
cd packages/lakitu
# Edit package.json version (e.g., 0.1.17 → 0.1.18)
git add package.json && git commit -m "chore: bump version"
git push origin main  # Triggers npm publish
```

### Dogfooding in project.social

The parent app uses `@lakitu/sdk` from npm (not the local submodule) for CLI commands:

```json
// package.json scripts
"sandbox": "npx @lakitu/sdk -- build",
"sandbox:base": "npx @lakitu/sdk -- build --base",
"sandbox:custom": "npx @lakitu/sdk -- build --custom"
```

This ensures we're always using the published version, catching issues before users do.

---

## ⚠️ CRITICAL: Sandbox Rebuild Required After Changes

**Any changes to files in `packages/lakitu/` require a sandbox rebuild!**

The agent code runs inside an E2B sandbox template. Your changes are NOT automatically deployed - you must rebuild the template for changes to take effect.

### Files That Require Rebuild

| Path | What It Contains |
|------|------------------|
| `ksa/*.ts` | KSA modules (brandLibrary, frames, artifacts, etc.) |
| `ksa/_shared/*.ts` | Gateway, config readers |
| `ksa/_generated/*.ts` | Registry, reference docs |
| `runtime/*.ts` | CLI commands |
| `template/*.ts` | Template builder |
| `loro/*.ts` | CRDT utilities (LoroFS, LoroBeads) |

### Rebuild Commands

```bash
bun sandbox:custom       # Quick rebuild (~1 min) - USE THIS for KSA changes
bun sandbox              # Full rebuild (~5 min) - only if base dependencies changed
```

### Common Mistake

You edit a KSA file but forget to rebuild. The agent continues using the OLD code and your fix doesn't work. **Always rebuild after changes!**

---

## Taxonomy Warning

> **CRITICAL**: The terms "tools" and "skills" are OVERLOADED in AI codebases.
> This project uses **KSA** (Knowledge, Skills, and Abilities) to avoid confusion.

| Term | In This Codebase | NOT This |
|------|------------------|----------|
| **KSA** | Plain TypeScript modules in `ksa/` | AI SDK tools, MCP tools, Claude skills |
| **tools** | LEGACY code being removed | Do not use this term |
| **skills** | Do not use | Overloaded term |

## The Architecture (DO NOT DEVIATE)

Lakitu uses **code execution**, NOT JSON tool calls.

```
CORRECT: Agent writes TypeScript → imports from ksa/ → E2B executes it
WRONG:   Agent makes JSON tool call → Executor parses JSON → Runs function
```

### What is a KSA?

A **KSA (Knowledge, Skills, and Abilities)** is a comprehensive capability module:

- **Knowledge**: JSDoc documentation explaining what it does
- **Skills**: Executable TypeScript functions
- **Abilities**: What the agent can accomplish with it

KSAs are designed for **code execution** - the agent imports and calls them directly.

### What This Means For You

When working on this codebase:

| If you see... | It is... | Do NOT... |
|---------------|----------|-----------|
| `ksa/*.ts` | ✅ CORRECT - KSA modules | Convert to tool() format |
| `convex/tools/*.ts` | ⚠️ LEGACY - being removed | Add more tool() definitions |
| `import { tool } from 'ai'` | ⚠️ LEGACY | Use this pattern |
| System prompt with code examples | ✅ CORRECT | Add JSON tool schemas |

## STOP: Read Before Touching Agent Code

### The Wrong Pattern (DO NOT ADD)

```typescript
// ❌ WRONG - JSON tool calling pattern (AI SDK, MCP, etc.)
import { tool } from 'ai';

export const searchTool = tool({
  description: 'Search the web',
  parameters: z.object({ query: z.string() }),
  execute: async (args) => { ... }
});

// Sending tool schemas to LLM:
const response = await llm.chat({
  tools: [searchTool],  // ❌ NO - don't send tool schemas
});

// Parsing tool calls:
if (response.tool_calls) {  // ❌ NO - don't parse JSON tool calls
  for (const tc of response.tool_calls) {
    await executeTool(tc.name, tc.args);
  }
}
```

### The Right Pattern (ADD THIS)

```typescript
// ✅ CORRECT - Code execution with KSAs

// KSAs are plain TypeScript functions in ksa/*.ts
export async function search(query: string): Promise<SearchResult[]> {
  // Implementation
}

// Agent loop does NOT send tool schemas
const response = await llm.chat({
  messages,  // No 'tools' property!
});

// Agent generates code, we execute it
const codeBlocks = extractCodeBlocks(response.content);
for (const code of codeBlocks) {
  await sandbox.execute(code);  // E2B runs the TypeScript
}
```

## Directory Structure

```
packages/lakitu/
├── ksa/                    # ✅ KSA MODULES (Knowledge, Skills, Abilities)
│   ├── _shared/            #    Gateway, localDb, config
│   ├── web.ts              #    Agent imports: from './ksa/web'
│   ├── file.ts
│   ├── pdf.ts
│   ├── beads.ts
│   └── browser.ts
│
├── loro/                   # ✅ CRDT utilities for persistence
│   ├── fs.ts               #    LoroFS - workspace filesystem tree
│   ├── beads.ts            #    LoroBeads - task tracking CRDT
│   └── index.ts            #    Exports: @lakitu/sdk/loro
│
├── convex/                 # Sandbox-local Convex backend
│   ├── cloud/              #    Cloud orchestration (lifecycleSandbox)
│   └── tools/              #    ⚠️ LEGACY - being removed
│
├── runtime/                # CLI commands for bash
│   └── generate-pdf        #    Called via: bash: generate-pdf "name"
│
├── template/               # E2B sandbox template builder
│   └── build.ts            #    Run: bun sandbox:custom
│
└── .github/workflows/      # CI/CD
    └── publish.yml         #    Auto-publish to npm on version bump
```

## When Adding New Capabilities

### Option A: Add a KSA (Preferred)

1. Create `ksa/mycapability.ts`:
```typescript
/**
 * MyCapability KSA - Knowledge, Skills, and Abilities
 *
 * Description of what this KSA enables.
 */

// Knowledge: Type definitions
export interface MyResult {
  // Types help the agent understand data structures
}

// Skills: Executable functions
/**
 * Function description with @example
 *
 * @example
 * const result = await myFunction('input');
 */
export async function myFunction(arg: string): Promise<MyResult> {
  // Abilities: The implementation
}
```

2. The agent uses it by writing code:
```typescript
import { myFunction } from './ksa/mycapability';
const result = await myFunction('input');
console.log(result);
```

3. **⚠️ REBUILD SANDBOX**: `bun sandbox:custom` from project root!

### Option B: Add a CLI Command (For File Output)

1. Create `runtime/my-command.ts`
2. Copy to `/usr/local/bin/` in `template/build.ts`
3. **⚠️ REBUILD SANDBOX**: `bun sandbox:custom`
4. Agent uses via: `bash: my-command "args"`

> **IMPORTANT**: Changes to ANY file in `packages/lakitu/` require `bun sandbox:custom` to take effect!

### NEVER Do This

```typescript
// ❌ NEVER add tool() definitions
import { tool } from 'ai';
export const myTool = tool({ ... });

// ❌ NEVER add to createAllTools()
export function createAllTools(ctx) {
  return {
    ...createMyTools(ctx),  // NO
  };
}

// ❌ NEVER send tool schemas to LLM
await llm.chat({ tools: [...] });
```

## Why KSAs + Code Execution

1. **No Confusion** - "KSA" won't be mistaken for AI SDK tools, MCP, or Claude skills
2. **Token Efficiency** - No tool schemas sent every request
3. **Model Agnostic** - Any LLM that generates code works
4. **Composable** - Agent chains operations naturally in code
5. **Debuggable** - You can read exactly what code ran
6. **Extensible** - Add KSAs by adding TypeScript files

## Quick Reference

| Task | Do This | NOT This |
|------|---------|----------|
| Add capability | `ksa/mycap.ts` with export function | `convex/tools/` with tool() |
| Add CLI command | `runtime/cmd` + bash | New tool() definition |
| Add CRDT util | `loro/mycap.ts` | Separate package |
| Update submodule | `cd packages/lakitu && git commit && git push` | Edit from parent |
| Bump version | Edit `package.json` version, push | Manual npm publish |
| Rebuild sandbox | `bun sandbox:custom` from project root | Forget to rebuild |

## Common Operations

```bash
# Check current npm version
npm view @lakitu/sdk version

# See what's in the submodule
cd packages/lakitu && git log --oneline -5

# Update submodule to latest
cd packages/lakitu && git pull origin main
cd ../.. && git add packages/lakitu && git commit -m "chore: update lakitu"

# Rebuild sandbox after changes
bun sandbox:custom
```

## See Also

- `ksa/README.md` - KSA documentation and examples
- `loro/index.ts` - CRDT exports (LoroFS, LoroBeads)
- `.github/workflows/publish.yml` - NPM publish automation
