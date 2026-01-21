/**
 * lakitu build
 *
 * Build E2B sandbox template using Dockerfile approach.
 * Uses fromDockerfile() to leverage Docker's COPY instead of SDK's problematic tar streaming.
 */

import { Template, defaultBuildLogger, waitForPort } from "e2b";
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = __dirname.includes("/dist/") 
  ? join(__dirname, "../../..") 
  : join(__dirname, "../..");

interface BuildOptions {
  base?: boolean;
  custom?: boolean;
  baseId?: string;
}

interface ApiKeyResult {
  key: string;
  source: string;
}

function findApiKey(): ApiKeyResult | null {
  if (process.env.E2B_API_KEY) {
    return { key: process.env.E2B_API_KEY, source: "E2B_API_KEY env var" };
  }

  const envPaths = [
    join(process.cwd(), ".env.local"),
    join(process.cwd(), ".env"),
  ];

  for (const path of envPaths) {
    try {
      const content = readFileSync(path, "utf-8");
      const match = content.match(/E2B_API_KEY=(.+)/);
      if (match) return { key: match[1].trim(), source: path };
    } catch { /* not found */ }
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  try {
    const configPath = join(homeDir, ".e2b/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.teamApiKey) return { key: config.teamApiKey, source: "~/.e2b/config.json" };
    if (config.accessToken) return { key: config.accessToken, source: "~/.e2b/config.json" };
  } catch { /* not found */ }

  return null;
}

function preflightCheck(): string {
  const result = findApiKey();
  
  if (!result) {
    console.error("❌ E2B API key not found\n");
    console.error("Set E2B_API_KEY in .env.local or run 'e2b auth login'\n");
    process.exit(1);
  }

  console.log(`🔑 Using API key from ${result.source}\n`);
  return result.key;
}

// Base template using standard Template builder
const baseTemplate = Template()
  .fromImage("e2bdev/code-interpreter:latest")
  .runCmd("sudo apt-get update && sudo apt-get install -y git curl sqlite3 libsqlite3-dev build-essential unzip")
  .runCmd(`export HOME=/home/user && curl -fsSL https://bun.sh/install | bash`)
  .runCmd(`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs`)
  .runCmd(`
    curl -L -o /tmp/convex.zip "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-01-08-272e7f4/convex-local-backend-x86_64-unknown-linux-gnu.zip" && \
    unzip /tmp/convex.zip -d /tmp && \
    sudo mv /tmp/convex-local-backend /usr/local/bin/convex-backend && \
    sudo chmod +x /usr/local/bin/convex-backend && \
    rm /tmp/convex.zip
  `)
  .runCmd(`mkdir -p /home/user/workspace /home/user/.convex/convex-backend-state/lakitu /home/user/artifacts && chown -R user:user /home/user`)
  .setEnvs({
    HOME: "/home/user",
    PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
    CONVEX_URL: "http://localhost:3210",
    LOCAL_CONVEX_URL: "http://localhost:3210",
  });

async function buildBase(apiKey: string) {
  console.log("🔧 Building Lakitu base template...\n");

  const result = await Template.build(baseTemplate, {
    alias: "lakitu-base",
    apiKey,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(`\n✅ Base template: ${result.templateId}`);
  return result.templateId;
}

async function buildCustom(apiKey: string, baseId: string) {
  const buildDir = "/tmp/lakitu-build";

  console.log("📦 Preparing Dockerfile build context...");
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  // Copy lakitu source
  execSync(`rsync -av \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='template' \
    --exclude='assets' \
    --exclude='cli' \
    --exclude='tests' \
    --exclude='dist' \
    --exclude='.github' \
    --exclude='.env*' \
    --exclude='.gitignore' \
    --exclude='.npmignore' \
    --exclude='tsconfig*.json' \
    --exclude='vitest.config.ts' \
    --exclude='CLAUDE.md' \
    --exclude='scripts' \
    --exclude='convex/cloud' \
    ${PACKAGE_ROOT}/ ${join(buildDir, "lakitu")}/`, {
    stdio: "pipe",
  });

  // Copy user's project KSAs
  const userKsaDir = join(process.cwd(), "lakitu");
  if (existsSync(userKsaDir)) {
    console.log("   Copying project KSAs from lakitu/...");
    const ksaFiles = readdirSync(userKsaDir).filter((f: string) => f.endsWith(".ts"));
    for (const file of ksaFiles) {
      cpSync(join(userKsaDir, file), join(buildDir, "lakitu/ksa", file));
    }
    console.log(`   ✓ Copied ${ksaFiles.length} project KSAs`);
  }

  // Copy start script
  cpSync(join(PACKAGE_ROOT, "template/e2b/start.sh"), join(buildDir, "start.sh"));

  // Create Dockerfile - must use real Docker image, not E2B template alias
  const dockerfile = `# Lakitu Custom Template
FROM e2bdev/code-interpreter:latest

# System dependencies
RUN apt-get update && apt-get install -y git curl sqlite3 libsqlite3-dev build-essential unzip && rm -rf /var/lib/apt/lists/*

# Bun runtime (install for user)
RUN su - user -c "curl -fsSL https://bun.sh/install | bash"
ENV PATH="/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin"

# Node.js for npx convex
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Convex local backend
RUN curl -L -o /tmp/convex.zip "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-01-08-272e7f4/convex-local-backend-x86_64-unknown-linux-gnu.zip" && \\
    unzip /tmp/convex.zip -d /tmp && \\
    mv /tmp/convex-local-backend /usr/local/bin/convex-backend && \\
    chmod +x /usr/local/bin/convex-backend && \\
    rm /tmp/convex.zip

# Directory structure
RUN mkdir -p /home/user/workspace /home/user/.convex/convex-backend-state/lakitu /home/user/artifacts && chown -R user:user /home/user

# Copy lakitu code (using Docker's COPY, not SDK's tar streaming)
COPY --chown=user:user lakitu/ /home/user/lakitu/
COPY --chown=user:user start.sh /home/user/start.sh

# Install dependencies
RUN chmod +x /home/user/start.sh && \\
    cd /home/user/lakitu && /home/user/.bun/bin/bun install

# Lightpanda browser - 10x faster, 10x less memory than Chrome
# https://lightpanda.io/docs/getting-started/installation
RUN curl -L -o /usr/local/bin/lightpanda https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux && \\
    chmod a+x /usr/local/bin/lightpanda

# Python: Playwright for CDP connection to Lightpanda
RUN pip3 install playwright markitdown

# Patchright - stealth Chromium that bypasses CDP detection (Cloudflare, DataDome)
# https://github.com/Kaliiiiiiiiii-Vinyzu/patchright
# Install globally for CLI and browser binaries
RUN npm install -g patchright && npx patchright install chrome

# Create CLI tools (must be root)
RUN printf '#!/bin/bash\\nbun run /home/user/lakitu/runtime/pdf/pdf-generator.ts "$$@"\\n' > /usr/local/bin/generate-pdf && chmod +x /usr/local/bin/generate-pdf
RUN printf '#!/bin/bash\\nbun run /home/user/lakitu/runtime/browser/agent-browser-cli.ts "$$@"\\n' > /usr/local/bin/agent-browser && chmod +x /usr/local/bin/agent-browser

# Symlinks and ownership
RUN ln -sf /home/user/lakitu/ksa /home/user/ksa && chown -R user:user /home/user/lakitu /home/user/ksa

# Create Convex state directory (functions deploy at first boot via start.sh)
RUN mkdir -p /home/user/.convex/convex-backend-state/lakitu && chown -R user:user /home/user/.convex

ENV HOME=/home/user
ENV PATH="/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin"
ENV CONVEX_URL="http://localhost:3210"
ENV LOCAL_CONVEX_URL="http://localhost:3210"
ENV CONVEX_LOCAL_STORAGE="/home/user/.convex/convex-backend-state/lakitu"

USER user

# Install patchright in lakitu project for dynamic imports from KSA context
# Then install browser binaries as user (they go to ~/.cache/ms-playwright/)
RUN cd /home/user/lakitu && /home/user/.bun/bin/bun add patchright && \
    npx patchright install chromium

WORKDIR /home/user/workspace
`;

  writeFileSync(join(buildDir, "Dockerfile"), dockerfile);
  console.log("   ✓ Build context ready\n");

  console.log(`🔧 Building Lakitu custom template (Dockerfile method)...\n`);

  // Use fromDockerfile with fileContextPath to leverage Docker's COPY
  // This bypasses the problematic SDK tar streaming that fails via npm/bunx
  const template = Template({ fileContextPath: buildDir })
    .fromDockerfile(join(buildDir, "Dockerfile"))
    .setStartCmd("/home/user/start.sh", waitForPort(3210));

  const result = await Template.build(template, {
    alias: "lakitu",
    apiKey,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(`\n✅ Custom template: ${result.templateId}`);
  return result.templateId;
}

export async function build(options: BuildOptions) {
  console.log("🍄 Lakitu Template Builder (Dockerfile method)\n");

  const apiKey = preflightCheck();

  if (options.base) {
    await buildBase(apiKey);
  } else if (options.custom) {
    await buildCustom(apiKey, options.baseId || "lakitu-base");
  } else {
    const baseId = await buildBase(apiKey);
    await buildCustom(apiKey, baseId);
  }

  console.log("\n🎉 Build complete!");
  process.exit(0);
}
