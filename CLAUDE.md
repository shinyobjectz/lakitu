# Lakitu - AI Instructions

> **AUDIENCE**: This document is for YOU, the AI agent (Claude Code, Cursor, etc.) working on this codebase.
> Read this BEFORE writing any code.

## The Architecture (DO NOT DEVIATE)

Lakitu uses **code execution**, NOT JSON tool calls.

```
CORRECT: Agent writes TypeScript → E2B executes it → Results
WRONG:   Agent makes JSON tool call → Executor parses it → Results
```

### What This Means For You

When working on this codebase:

| If you see... | It is... | Do NOT... |
|---------------|----------|-----------|
| `convex/tools/*.ts` | LEGACY - being migrated | Add more tool() definitions |
| `import { tool } from 'ai'` | LEGACY - being migrated | Use this pattern |
| `skills/*.ts` | CORRECT - plain functions | Convert to tool() format |
| System prompt with code examples | CORRECT | Add JSON tool schemas |

## STOP: Read Before Touching Agent Code

### The Wrong Pattern (DO NOT ADD)

```typescript
// ❌ WRONG - JSON tool calling pattern
import { tool } from 'ai';

export const searchTool = tool({
  description: 'Search the web',
  parameters: z.object({ query: z.string() }),
  execute: async (args) => { ... }
});

// Then sending to LLM:
const response = await llm.chat({
  tools: [searchTool],  // ❌ Sending tool schemas
});

// Then parsing tool calls:
if (response.tool_calls) {  // ❌ JSON tool call parsing
  for (const tc of response.tool_calls) {
    await executeTool(tc.name, tc.args);
  }
}
```

### The Right Pattern (ADD THIS)

```typescript
// ✅ CORRECT - Code execution pattern

// Skills are plain TypeScript functions in skills/*.ts
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
├── skills/                 # ✅ CORRECT: Plain TypeScript functions
│   ├── web.ts              #    Agent imports these
│   ├── file.ts
│   ├── pdf.ts
│   └── beads.ts
│
├── convex/tools/           # ⚠️  LEGACY: Being migrated to skills/
│   └── *.ts                #    DO NOT add new tool() definitions
│
├── convex/agent/           # Agent loop implementation
│   └── index.ts            #    Should NOT send tool schemas to LLM
│
└── runtime/                # CLI commands for bash
    └── generate-pdf        #    Called via: bash: generate-pdf "name"
```

## When Adding New Capabilities

### Option A: Add a Skill (Preferred)

1. Create `skills/myskill.ts`:
```typescript
/**
 * Description of what this skill does.
 */

export interface MyResult {
  // Types
}

/**
 * Function description with @example
 */
export async function myFunction(arg: string): Promise<MyResult> {
  // Implementation
}
```

2. The agent uses it by writing code:
```typescript
import { myFunction } from './skills/myskill';
const result = await myFunction('input');
```

### Option B: Add a CLI Command (For File Output)

1. Create `runtime/my-command.ts`
2. Copy to `/usr/local/bin/` in `template/build.ts`
3. Agent uses via: `bash: my-command "args"`

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

## Why This Architecture

1. **Token Efficiency** - No tool schemas every request
2. **Model Agnostic** - Any LLM that generates code works
3. **Composable** - Agent chains operations naturally
4. **Debuggable** - You can read exactly what code ran
5. **Extensible** - Add skills by adding TypeScript files

## Migration Status

The codebase is transitioning from JSON tool calls to code execution:

- [x] Created `skills/` directory structure
- [x] Created `skills/web.ts`, `skills/file.ts`, `skills/pdf.ts`, `skills/beads.ts`, `skills/browser.ts`
- [x] Created `convex/actions/codeExec.ts` - Code execution runtime
- [x] Created `convex/agent/codeExecLoop.ts` - New agent loop (no tool schemas)
- [x] Created `convex/prompts/codeExec.ts` - System prompt for code execution
- [x] Added `startCodeExecThread` action to agent index
- [ ] Switch cloud orchestrator to use `startCodeExecThread` instead of `startThread`
- [ ] Update E2B template to copy `skills/` to `/home/user/skills/`
- [ ] Test code execution end-to-end
- [ ] Remove legacy `convex/tools/*.ts` and `createAllTools()` pattern

## Quick Reference

| Task | Do This | NOT This |
|------|---------|----------|
| Add web capability | `skills/web.ts` with export function | `convex/tools/web.ts` with tool() |
| Add file capability | `skills/file.ts` with export function | `convex/tools/file.ts` with tool() |
| Add CLI command | `runtime/cmd` + bash | New tool() definition |
| Call LLM | `await llm.chat({ messages })` | `await llm.chat({ messages, tools })` |
| Parse response | Extract code blocks, execute | Parse tool_calls JSON |

## See Also

- `ARCHITECTURE.md` - Detailed architecture explanation
- `skills/README.md` - How to use skills
- `skills/*.ts` - Example skill implementations
