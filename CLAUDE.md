# Lakitu - AI Instructions

> **AUDIENCE**: This document is for YOU, the AI agent (Claude Code, Cursor, etc.) working on this codebase.
> Read this BEFORE writing any code.

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
│   ├── web.ts              #    Agent imports: from './ksa/web'
│   ├── file.ts
│   ├── pdf.ts
│   ├── beads.ts
│   └── browser.ts
│
├── convex/tools/           # ⚠️  LEGACY: Being removed - DO NOT USE
│   └── *.ts                #    These are old tool() definitions
│
├── convex/agent/           # Agent loop implementation
│   ├── index.ts            #    Legacy loop (tool calling)
│   └── codeExecLoop.ts     #    ✅ New loop (code execution)
│
└── runtime/                # CLI commands for bash
    └── generate-pdf        #    Called via: bash: generate-pdf "name"
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

## Migration Status

The codebase is transitioning from JSON tool calls to code execution:

- [x] Created `ksa/` directory with KSA modules
- [x] Created `ksa/web.ts`, `ksa/file.ts`, `ksa/pdf.ts`, `ksa/beads.ts`, `ksa/browser.ts`
- [x] Created `convex/actions/codeExec.ts` - Code execution runtime
- [x] Created `convex/agent/codeExecLoop.ts` - New agent loop (no tool schemas)
- [x] Created `convex/prompts/codeExec.ts` - System prompt for code execution
- [x] Added `startCodeExecThread` action to agent index
- [ ] Switch cloud orchestrator to use `startCodeExecThread` instead of `startThread`
- [ ] Update E2B template to copy `ksa/` to `/home/user/ksa/`
- [ ] Test code execution end-to-end
- [ ] Remove legacy `convex/tools/*.ts` and `createAllTools()` pattern

## Quick Reference

| Task | Do This | NOT This |
|------|---------|----------|
| Add capability | `ksa/mycap.ts` with export function | `convex/tools/` with tool() |
| Add CLI command | `runtime/cmd` + bash | New tool() definition |
| Call LLM | `await llm.chat({ messages })` | `await llm.chat({ messages, tools })` |
| Parse response | Extract code blocks, execute | Parse tool_calls JSON |

## See Also

- `ARCHITECTURE.md` - Detailed architecture explanation
- `ksa/README.md` - KSA documentation and examples
- `ksa/*.ts` - KSA implementations
