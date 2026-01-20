# Contributing to @lakitu/sdk

This guide covers development setup, workflows, and best practices for contributing to the Lakitu SDK.

## Table of Contents

- [Development Setup](#development-setup)
- [Repository Structure](#repository-structure)
- [Development Modes](#development-modes)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Publishing](#publishing)
- [SDK vs Implementation](#sdk-vs-implementation)

---

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Node.js](https://nodejs.org) v20+
- [E2B Account](https://e2b.dev) with API key
- [Convex Account](https://convex.dev)

### Clone and Install

```bash
git clone https://github.com/shinyobjectz/lakitu.git
cd lakitu
bun install
```

### Environment Setup

Create `.env.local`:

```bash
E2B_API_KEY=your-e2b-key
CONVEX_DEPLOYMENT=your-deployment
SANDBOX_JWT_SECRET=your-secret
OPENROUTER_API_KEY=your-openrouter-key
```

---

## Repository Structure

```
lakitu/
├── sdk/                    # SDK entry points (compiled to dist/)
│   ├── index.ts           # Main exports
│   ├── gateway.ts         # Gateway re-exports
│   ├── db.ts              # Local DB re-exports
│   ├── builders.ts        # KSA definition builders
│   ├── primitives.ts      # Sandbox primitives
│   └── types.ts           # TypeScript types
│
├── ksa/                    # KSA runtime modules (copied to sandbox)
│   ├── _shared/           # Shared utilities
│   │   ├── gateway.ts     # Cloud gateway client
│   │   └── localDb.ts     # Local Convex client
│   ├── _generated/        # Auto-generated registry
│   ├── file.ts            # File operations KSA
│   └── browser.ts         # Browser automation KSA
│
├── convex/                 # Convex backends
│   ├── cloud/             # Cloud component (npm package)
│   │   ├── workflows/     # Thread, sandbox, session management
│   │   ├── gateway/       # HTTP gateway for sandbox calls
│   │   └── schema.ts      # Cloud database schema
│   └── sandbox/           # Sandbox component (runs in E2B)
│       ├── agent/         # Code execution loop
│       ├── planning/      # Beads task tracking
│       └── state/         # File and artifact tracking
│
├── loro/                   # CRDT utilities
│   ├── fs.ts              # LoroFS - filesystem CRDT
│   └── beads.ts           # LoroBeads - task graph CRDT
│
├── runtime/               # Sandbox runtime processes
│   ├── browser/           # Playwright browser automation
│   ├── pdf/               # PDF generation
│   └── lsp/               # Language server protocol
│
├── template/              # E2B template builder
│   └── build.ts           # Template build script
│
├── cli/                   # CLI commands
│   ├── commands/          # Individual commands
│   └── index.ts           # CLI entry point
│
├── shared/                # Shared constants and types
├── tests/                 # Test suites
└── docs/                  # Documentation
```

---

## Development Modes

### As a Submodule (Recommended for SDK Development)

When Lakitu is used as a git submodule in another project:

```bash
# In parent project
cd submodules/lakitu-sdk

# Make changes
vim sdk/index.ts

# Commit to submodule
git add -A && git commit -m "feat: add new feature"

# Push submodule (triggers npm publish if version bumped)
git push origin main

# Back to parent, update submodule reference
cd ../..
git add submodules/lakitu-sdk
git commit -m "chore: update lakitu-sdk"
git push
```

### As npm Package (For Consumers)

```bash
# Install latest
npm install @lakitu/sdk@latest

# Use in code
import { defineKSA, callGateway } from '@lakitu/sdk';
```

### Standalone Development

```bash
# Clone directly
git clone https://github.com/shinyobjectz/lakitu.git
cd lakitu

# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build

# Link locally for testing
npm link
```

---

## Making Changes

### SDK Code (`sdk/`)

The `sdk/` directory contains entry points that get compiled to `dist/`. These are what users import.

```typescript
// sdk/index.ts - Main entry point
export { callGateway } from "./gateway";
export { localDb } from "./db";
```

After changes:

```bash
bun run build
```

### KSA Code (`ksa/`)

KSA files are copied directly to the sandbox at build time. No compilation needed.

```typescript
// ksa/myFeature.ts
import { callGateway } from "./_shared/gateway";

export const doThing = () => callGateway("path", {});
```

After changes:

```bash
bun sandbox:custom  # Rebuild sandbox template
```

### Convex Code (`convex/`)

Two separate Convex projects:

- `convex/cloud/` - Cloud component, deployed as part of user's Convex app
- `convex/sandbox/` - Sandbox component, pre-deployed in E2B template

After cloud changes:
```bash
# Changes deploy with user's app automatically
```

After sandbox changes:
```bash
bun sandbox:custom  # Must rebuild template
```

---

## Testing

### Unit Tests

```bash
bun test              # Run all tests
bun test:watch        # Watch mode
bun test:ui           # Vitest UI
```

### Convex Integration Tests

```bash
bun test:convex       # Run Convex tests
```

### Sandbox Integration Tests

```bash
bun test:integration  # Full E2B sandbox tests
```

### Adding Tests

```typescript
// tests/myFeature.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from '../sdk/myFeature';

describe('myFeature', () => {
  it('should work', () => {
    expect(myFunction()).toBe(expected);
  });
});
```

---

## Publishing

### Automatic (CI)

The GitHub Action publishes to npm when:
1. Version in `package.json` changes
2. Push to `main` branch

```yaml
# .github/workflows/publish.yml
if [ "$CURRENT" != "$NEW" ]; then npm publish; fi
```

### Manual

```bash
# Bump version
vim package.json  # Change version

# Build and publish
bun run build
npm publish
```

### Version Strategy

- **Patch** (0.1.x): Bug fixes, doc updates
- **Minor** (0.x.0): New features, backward compatible
- **Major** (x.0.0): Breaking changes

---

## SDK vs Implementation

Understanding what goes where:

### In the SDK (`@lakitu/sdk`)

- Core runtime (gateway, localDb, primitives)
- KSA builders and types
- Cloud Convex component
- Sandbox Convex component
- E2B template builder
- CLI commands

### In Implementation (User's Project)

- Project-specific KSAs (`convex/lakitu/ksa/`)
- Lakitu configuration (`convex/lakitu/config.ts`)
- Template customization (`convex/lakitu/template.config.ts`)
- Custom Convex features/services
- Gateway whitelist extensions

### Decision Guide

| Change | Where |
|--------|-------|
| New primitive (file, shell, etc.) | SDK `ksa/` |
| New gateway feature | SDK `convex/cloud/gateway/` |
| Project-specific capability | Implementation `convex/lakitu/ksa/` |
| Bug fix in agent loop | SDK `convex/sandbox/agent/` |
| New model preset | SDK `convex/cloud/models.ts` |
| Custom Convex backend | Implementation `convex/features/` |

---

## Code Style

- **TypeScript** for all code
- **Bun** for runtime and package management
- **Vitest** for testing
- Use explicit types (no `any` without justification)
- Document public APIs with JSDoc
- Keep files focused and small

### Naming Conventions

- `camelCase` for functions and variables
- `PascalCase` for types and classes
- `UPPER_CASE` for constants
- `kebab-case` for file names (except TypeScript convention files)

---

## Getting Help

- [GitHub Issues](https://github.com/shinyobjectz/lakitu/issues)
- [Discord](#) (coming soon)
- [Discussions](https://github.com/shinyobjectz/lakitu/discussions)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
