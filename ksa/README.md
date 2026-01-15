# Lakitu KSAs (Knowledge, Skills, and Abilities)

> **Why "KSA"?** The terms "tools" and "skills" are overloaded in AI agent codebases.
> Every framework (AI SDK, MCP, Claude, OpenCode) uses them differently.
> **KSA** is a distinct term that won't be confused with other implementations.

## What is a KSA?

A KSA is a comprehensive capability module that combines:

- **Knowledge**: Documentation and context (like MCP descriptions)
- **Skills**: Executable TypeScript functions (like tool implementations)
- **Abilities**: What the agent can accomplish (like Claude skills guidance)

KSAs are designed for **code execution** - the agent imports and calls them directly.

## Quick Reference

### System KSAs (Local Operations)

| KSA | Functions | Import |
|-----|-----------|--------|
| **file** | `read`, `write`, `edit`, `glob`, `grep`, `ls` | `from './ksa/file'` |
| **browser** | `open`, `screenshot`, `click`, `type`, `getText`, `getHtml` | `from './ksa/browser'` |
| **beads** | `create`, `update`, `close`, `list`, `getReady`, `get` | `from './ksa/beads'` |
| **pdf** | `generate` | `from './ksa/pdf'` |

### Research KSAs (Gateway Operations)

| KSA | Functions | Import |
|-----|-----------|--------|
| **web** | `search`, `scrape`, `news` | `from './ksa/web'` |
| **news** | `search`, `trending`, `breakingNews`, `monitorBrand`, `analyzeSentiment` | `from './ksa/news'` |
| **social** | `tiktokProfile`, `instagramProfile`, `twitterProfile`, `youtubeProfile`, `*Posts` | `from './ksa/social'` |
| **companies** | `enrichDomain`, `searchCompanies`, `findSimilar`, `getTechStack` | `from './ksa/companies'` |
| **email** | `send`, `sendText`, `sendHtml`, `sendWithAttachment`, `sendTemplate` | `from './ksa/email'` |

## Usage

The agent writes TypeScript that imports from KSAs:

```typescript
import { search, scrape } from './ksa/web';
import { write } from './ksa/file';
import { generate } from './ksa/pdf';

// Research a topic
const results = await search('AI news 2025');

// Get detailed content
const content = await scrape(results[0].url);

// Save as PDF
await generate(content.markdown, 'ai-report', 'AI News Report');
```

## How KSAs Differ From...

| Concept | What It Is | How KSA Differs |
|---------|------------|-----------------|
| **AI SDK tool()** | JSON schema + execute function for tool calling | KSA is plain TypeScript, no JSON schema |
| **MCP Tool** | Server-defined capability with protocol | KSA is local files, no protocol overhead |
| **Claude Skill** | Prompt-based capability guidance | KSA includes actual executable code |
| **Function Call** | LLM generates JSON to call function | KSA: LLM generates code that imports & calls |

## KSA File Examples

### Web Research

```typescript
import { search, scrape, news } from './ksa/web';

// Search the web
const results = await search('TypeScript best practices');
for (const r of results) {
  console.log(`${r.title}: ${r.url}`);
}

// Get content from a URL
const content = await scrape('https://example.com/article');
console.log(content.markdown);

// Get recent news
const articles = await news('AI', 5);
```

### File Operations

```typescript
import { read, write, edit, glob, grep } from './ksa/file';

// Read a file
const content = await read('/home/user/workspace/README.md');

// Write a file
await write('/home/user/workspace/output.txt', 'Hello, world!');

// Edit a file (find and replace)
await edit('/home/user/workspace/config.ts', 'debug: false', 'debug: true');

// Find TypeScript files
const tsFiles = await glob('**/*.ts');

// Search for patterns
const todos = await grep('TODO:');
```

### PDF Generation

```typescript
import { generate } from './ksa/pdf';

await generate(`# Quarterly Report

## Summary
Key findings from this quarter...

## Metrics
- Revenue: $1.2M
- Growth: 15%
`, 'quarterly-report', 'Q4 2025 Report');

// Creates /home/user/artifacts/quarterly-report.pdf
```

### Task Tracking

```typescript
import { create, update, close, list, getReady } from './ksa/beads';

// Create a task
const id = await create({
  title: 'Implement search feature',
  type: 'feature',
  priority: 1,
});

// Update status
await update(id, { status: 'in_progress' });

// List open tasks
const tasks = await list({ status: 'open' });

// Get ready tasks (no blockers)
const ready = await getReady();

// Close when done
await close(id, 'Search feature implemented and tested');
```

### Browser Automation

```typescript
import { open, screenshot, click, type, getText } from './ksa/browser';

// Open a page
await open('https://example.com');

// Take a screenshot
const { path } = await screenshot('homepage');

// Interact with elements
await click('button.login');
await type('input[name="email"]', 'user@example.com');

// Get page content
const text = await getText();
```

## Working Directories

| Path | Purpose |
|------|---------|
| `/home/user/workspace/` | Working directory for code and files |
| `/home/user/artifacts/` | Persistent outputs (PDFs, screenshots) |
| `/home/user/ksa/` | KSA modules (read-only) |

## Adding New KSAs

### Two Types of KSAs

1. **Gateway KSAs** - Call Convex services via cloud gateway (research, data, external APIs)
2. **Local KSAs** - Operate locally in sandbox (filesystem, bash, local binaries)

### Quick Start

1. Copy the appropriate template from `ksa/_templates/`:
   - `gateway-ksa.template.ts` for Gateway KSAs
   - `local-ksa.template.ts` for Local KSAs

2. Create your KSA file:
   ```bash
   cp ksa/_templates/gateway-ksa.template.ts ksa/myservice.ts
   ```

3. Implement your functions:
   - For gateway KSAs: use `callGateway()` from `./_shared/gateway`
   - For local KSAs: use `fs`, `exec`, etc.

4. Add to `ksa/index.ts`:
   ```typescript
   // Add export
   export * as myservice from "./myservice";

   // Add to registry
   {
     name: "myservice",
     description: "What this KSA does",
     category: "research",  // or "data", "create", "system", "ai"
     functions: ["func1", "func2"],
     importPath: "./ksa/myservice",
   },
   ```

### Gateway KSA Example

```typescript
import { callGateway } from "./_shared/gateway";

export async function getData(query: string) {
  return callGateway("services.MyService.internal.call", {
    endpoint: "/v1/data",
    params: { q: query },
  });
}
```

### Local KSA Example

```typescript
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function runTool(arg: string) {
  const { stdout } = await execAsync(`my-tool ${arg}`);
  return stdout.trim();
}
```

### Mapping Services to KSAs

When creating KSAs from existing `convex/services/`:

| Service | KSA | Category |
|---------|-----|----------|
| Valyu | web | research |
| APITube | news | research |
| ScrapeCreators | social | research |
| TheCompanies | companies | data |
| SendGrid | email | create |
| DataForSEO | seo | research |
| ScrapeDo | web | research |
| WhatCMS | cms | data |

### Best Practices

1. **Type-first** - Define types based on service types, simplified for agent use
2. **JSDoc everything** - The agent learns from your documentation
3. **Include examples** - Show real usage in @example blocks
4. **Handle errors gracefully** - Return null/empty instead of throwing when appropriate
5. **Keep it focused** - Each KSA should do one thing well
