# Lakitu Skills

TypeScript modules the agent imports and uses. Read the source files for full API documentation.

## Quick Reference

| Skill | Functions | Import |
|-------|-----------|--------|
| **web** | `search`, `scrape`, `news` | `from './skills/web'` |
| **file** | `read`, `write`, `edit`, `glob`, `grep`, `ls` | `from './skills/file'` |
| **pdf** | `generate` | `from './skills/pdf'` |
| **beads** | `create`, `update`, `close`, `list`, `getReady`, `get` | `from './skills/beads'` |
| **browser** | `open`, `screenshot`, `click`, `type`, `getText`, `getHtml` | `from './skills/browser'` |

## Usage Examples

### Web Research

```typescript
import { search, scrape, news } from './skills/web';

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
import { read, write, edit, glob, grep } from './skills/file';

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
import { generate } from './skills/pdf';

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
import { create, update, close, list, getReady } from './skills/beads';

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
import { open, screenshot, click, type, getText } from './skills/browser';

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
| `/home/user/skills/` | These skill modules (read-only) |

## Adding New Skills

See `packages/lakitu/CLAUDE.md` for instructions on adding new skills.
