# Lakitu Architecture: Code Execution Model

> **CRITICAL**: This document defines THE architecture. Any code that deviates from this is wrong.

## The One Rule

**The agent writes and executes code. It does NOT make JSON tool calls.**

```
┌─────────────────────────────────────────────────────────────────┐
│                         CORRECT                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent receives task                                            │
│       ↓                                                         │
│  Agent writes TypeScript/bash code                              │
│       ↓                                                         │
│  E2B sandbox executes the code                                  │
│       ↓                                                         │
│  Code imports from /skills/ and runs                            │
│                                                                 │
│  Example agent output:                                          │
│  ```typescript                                                  │
│  import { search } from './skills/web';                         │
│  const results = await search('AI news 2025');                  │
│  console.log(results);                                          │
│  ```                                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         WRONG                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent makes JSON tool call:                                    │
│  {                                                              │
│    "tool": "web_search",                                        │
│    "arguments": { "query": "AI news 2025" }                     │
│  }                                                              │
│                                                                 │
│  WHY THIS IS WRONG:                                             │
│  - Requires sending tool schemas every request (token waste)    │
│  - Different models handle tool calls differently               │
│  - Creates tight coupling between LLM and executor              │
│  - Not composable - can't chain operations naturally            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       E2B SANDBOX                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Agent Loop                                                │  │
│  │                                                           │  │
│  │  1. Receive prompt                                        │  │
│  │  2. Generate code (TypeScript or bash)                    │  │
│  │  3. Execute code in sandbox                               │  │
│  │  4. Return output                                         │  │
│  │  5. Repeat until task complete                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ /home/user/skills/                                        │  │
│  │                                                           │  │
│  │  web.ts     - search(), scrape(), news()                  │  │
│  │  pdf.ts     - generate()                                  │  │
│  │  file.ts    - read(), write(), edit()                     │  │
│  │  beads.ts   - create(), update(), close()                 │  │
│  │  browser.ts - open(), click(), screenshot()               │  │
│  │                                                           │  │
│  │  These are REAL TypeScript files the agent can read.      │  │
│  │  The agent imports and calls them like any library.       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Cloud Gateway (INTERNAL - agent doesn't know about this) │  │
│  │                                                           │  │
│  │  Skills internally make HTTP calls to cloud Convex.       │  │
│  │  This routes API calls (LLM, search, etc.)                │  │
│  │  The agent just imports and calls functions.              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Skills = SDK + Documentation

Skills are TypeScript files that:
1. Export functions the agent can call
2. Include JSDoc comments explaining usage
3. Handle all internal complexity (auth, HTTP, errors)

```typescript
// /home/user/skills/web.ts

/**
 * Search the web for information.
 *
 * @example
 * const results = await search('latest TypeScript features');
 * results.forEach(r => console.log(r.title, r.url));
 */
export async function search(query: string, options?: {
  maxResults?: number;
  type?: 'web' | 'news' | 'academic';
}): Promise<SearchResult[]> {
  // Implementation calls cloud gateway internally
  // Agent doesn't need to know about this
}

/**
 * Extract content from a URL.
 *
 * @example
 * const content = await scrape('https://example.com/article');
 * console.log(content.markdown);
 */
export async function scrape(url: string): Promise<ScrapedContent> {
  // ...
}
```

The agent can:
- Read the file to understand the API: `cat /home/user/skills/web.ts`
- Import and use it: `import { search } from './skills/web'`

## What Gets Sent to the LLM

**DO send:**
- System prompt explaining code execution model
- Reference to skills directory
- The user's task

**DO NOT send:**
- Tool schemas / function definitions
- JSON tool calling instructions
- Any mention of "tool_use" or "function_call"

```typescript
// CORRECT: System prompt
const systemPrompt = `
You are a coding agent. You complete tasks by writing and executing code.

## Available Skills
Skills are in /home/user/skills/. Read them to see available functions:
- web.ts - Web search and scraping
- pdf.ts - PDF generation
- file.ts - File operations
- beads.ts - Task tracking

## How to Work
1. Read the relevant skill file to understand its API
2. Write TypeScript code that imports from the skill
3. Execute the code
4. Check the output
5. Continue until task is complete

## Example
Task: "Find recent news about AI"

Your response:
\`\`\`typescript
import { search } from './skills/web';

const results = await search('AI news 2025', { type: 'news' });
for (const r of results) {
  console.log(\`- \${r.title}: \${r.url}\`);
}
\`\`\`
`;

// WRONG: Sending tool definitions
const tools = [
  {
    name: "web_search",
    description: "Search the web",
    parameters: { query: "string" }
  }
];
// ^^^ DO NOT DO THIS
```

## File Structure

```
packages/lakitu/
├── skills/                    # SKILL FILES (TypeScript SDK)
│   ├── web.ts                 # Web search, scrape, news
│   ├── pdf.ts                 # PDF generation
│   ├── file.ts                # File read/write/edit
│   ├── beads.ts               # Task tracking
│   ├── browser.ts             # Browser automation
│   └── README.md              # Index of all skills
│
├── runtime/                   # CLI COMMANDS (for bash)
│   ├── generate-pdf           # PDF CLI wrapper
│   └── ...
│
├── convex/                    # INTERNAL INFRASTRUCTURE
│   ├── agent/                 # Agent loop implementation
│   ├── gateway/               # Cloud gateway handlers
│   └── ...
│
└── template/                  # E2B template builder
```

## The Agent Loop (Implementation)

```typescript
// This is what the agent loop does internally
async function runAgentLoop(prompt: string) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },  // No tools!
    { role: 'user', content: prompt }
  ];

  while (true) {
    // 1. Call LLM (NO tool definitions sent)
    const response = await callLLM(messages);

    // 2. Extract code blocks from response
    const codeBlocks = extractCodeBlocks(response.content);

    // 3. Execute each code block in E2B
    for (const code of codeBlocks) {
      const result = await e2b.execute(code);
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: `Output:\n${result}` });
    }

    // 4. Check if task is complete
    if (isTaskComplete(response)) break;
  }
}
```

## Anti-Patterns (DO NOT DO)

### 1. JSON Tool Calls
```typescript
// WRONG
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages,
  tools: [{ type: 'function', function: { name: 'search', ... }}]
});
```

### 2. Tool Executor Pattern
```typescript
// WRONG
if (response.tool_calls) {
  for (const tc of response.tool_calls) {
    const result = await executeTool(tc.function.name, tc.function.arguments);
  }
}
```

### 3. Sending Tool Schemas
```typescript
// WRONG
const tools = Object.entries(createAllTools(ctx)).map(([name, tool]) => ({
  name,
  description: tool.description,
  parameters: tool.parameters.toJSONSchema()
}));
```

### 4. AI SDK Tool Format
```typescript
// WRONG - This is for JSON tool calling
import { tool } from 'ai';
export const searchTool = tool({
  description: 'Search the web',
  parameters: z.object({ query: z.string() }),
  execute: async (args) => { ... }
});
```

## Correct Patterns

### 1. Skills as Plain Functions
```typescript
// CORRECT - /home/user/skills/web.ts
export async function search(query: string): Promise<SearchResult[]> {
  const response = await fetch(`${GATEWAY}/search`, {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  return response.json();
}
```

### 2. Agent Writes Code
```typescript
// CORRECT - Agent generates this
import { search } from './skills/web';
const results = await search('AI news');
console.log(results);
```

### 3. E2B Executes Code
```typescript
// CORRECT - Runtime executes agent's code
const result = await sandbox.runCode(`
  import { search } from './skills/web';
  const results = await search('AI news');
  console.log(JSON.stringify(results));
`);
```

## Migration Checklist

To convert from JSON tool calls to code execution:

- [ ] Remove all `tool()` definitions from `convex/tools/`
- [ ] Create `skills/` directory with plain TypeScript functions
- [ ] Update agent loop to NOT send tool schemas
- [ ] Update agent loop to extract and execute code blocks
- [ ] Update system prompt to explain code execution model
- [ ] Remove any `tool_calls` handling code
- [ ] Test that agent generates code, not JSON tool calls

## Why This Architecture

1. **Token Efficiency** - No tool schemas sent every request (98% reduction)
2. **Model Agnostic** - Any LLM that generates code works
3. **Composable** - Agent can chain operations naturally in code
4. **Debuggable** - Code is explicit, you can see exactly what runs
5. **Extensible** - Add skills by adding TypeScript files
6. **Foolproof** - If there are no tool schemas, there are no tool calls

## References

- [Code execution > MCP](https://www.flowhunt.io/blog/the-end-of-mcp-for-ai-agents-code-execution/)
- [Claude Code bash-first](https://www.anthropic.com/engineering/claude-code-best-practices)
- [OpenCode agents](https://opencode.ai/docs/agents/)
