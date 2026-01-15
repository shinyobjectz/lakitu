<p align="center">
  <img src="assets/laki2-banner.jpeg" alt="Lakitu Banner" width="100%">
</p>

# Lakitu

> AI agent runtime using **code execution**, not JSON tool calls.

Lakitu is an autonomous development environment that runs in an [E2B](https://e2b.dev) sandbox. The agent writes TypeScript code that imports from **KSAs** (Knowledge, Skills, and Abilities), which gets executed in the sandbox.

## The Code Execution Model

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

**Why?** Token efficiency (no tool schemas), composability (chain operations in code), debuggability (read exactly what ran).

## KSAs (Knowledge, Skills, and Abilities)

KSAs are TypeScript modules the agent imports. They combine:
- **Knowledge**: JSDoc documentation
- **Skills**: Executable functions
- **Abilities**: What the agent can accomplish

### Available KSAs

| Category | KSA | Functions |
|----------|-----|-----------|
| **System** | `file` | `read`, `write`, `edit`, `glob`, `grep`, `ls` |
| | `browser` | `open`, `screenshot`, `click`, `type`, `getText` |
| | `beads` | `create`, `update`, `close`, `list`, `getReady` |
| | `pdf` | `generate` |
| **Research** | `web` | `search`, `scrape`, `news` |
| | `news` | `trending`, `monitorBrand`, `analyzeSentiment` |
| | `social` | `tiktokProfile`, `instagramPosts`, `twitterPosts`, `searchSocial` |
| **Data** | `companies` | `enrichDomain`, `searchCompanies`, `getTechStack` |
| **Create** | `email` | `send`, `sendText`, `sendWithAttachment` |

### Example Agent Code

```typescript
import { search, scrape } from './ksa/web';
import { enrichDomain } from './ksa/companies';
import { send } from './ksa/email';

// Research a company
const results = await search('Stripe payments company');
const content = await scrape(results[0].url);

// Enrich with company data
const company = await enrichDomain('stripe.com');
console.log(`${company.name}: ${company.industry}, ${company.employeeRange} employees`);

// Send findings
await send({
  to: 'user@example.com',
  subject: 'Company Research: Stripe',
  text: `Industry: ${company.industry}\nEmployees: ${company.employeeRange}`
});
```

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
│  │  HTTP → Convex Services (OpenRouter, APITube, ScrapeCreators)   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  /home/user/workspace/    Working files                          │    │
│  │  /home/user/artifacts/    Persistent outputs (PDFs, screenshots) │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
lakitu/
├── ksa/                    # KSA modules (agent imports these)
│   ├── _shared/            # Shared utilities
│   │   └── gateway.ts      # Cloud gateway client
│   ├── _templates/         # Templates for new KSAs
│   ├── web.ts              # Web search & scraping
│   ├── news.ts             # News research & monitoring
│   ├── social.ts           # Social media scraping
│   ├── companies.ts        # Company data enrichment
│   ├── email.ts            # Email sending
│   ├── file.ts             # File operations
│   ├── browser.ts          # Browser automation
│   ├── beads.ts            # Task tracking
│   ├── pdf.ts              # PDF generation
│   └── index.ts            # Discovery & exports
│
├── convex/                 # Convex backend
│   ├── agent/              # Agent loop implementation
│   │   └── codeExecLoop.ts # Code execution loop (no tool schemas)
│   ├── actions/            # Convex actions
│   │   └── codeExec.ts     # Code execution runtime
│   ├── prompts/            # System prompts
│   │   └── codeExec.ts     # KSA documentation for agent
│   └── tools/              # LEGACY: Being removed
│
├── shared/                 # Shared types
│   └── chain-of-thought.ts # Execution tracing
│
└── runtime/                # CLI commands for bash
```

## Adding New KSAs

See `ksa/README.md` for detailed instructions. Quick steps:

1. Copy template from `ksa/_templates/`
2. Implement functions (use `callGateway()` for external services)
3. Add to `ksa/index.ts` registry
4. Document in system prompt (`convex/prompts/codeExec.ts`)

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start local Convex dev server |
| `bun deploy` | Deploy to Convex cloud |
| `bun test` | Run unit tests |
| `bun typecheck` | TypeScript type check |

## Related Documentation

- `CLAUDE.md` - Instructions for AI agents working on this codebase
- `ksa/README.md` - KSA documentation and extension guide
- `convex/prompts/codeExec.ts` - System prompt with KSA examples

## Links

- [E2B Documentation](https://e2b.dev/docs)
- [Convex Documentation](https://docs.convex.dev)
