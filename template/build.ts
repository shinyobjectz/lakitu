#!/usr/bin/env bun
/**
 * E2B Template Builder for Lakitu
 *
 * Strategy: Build Convex LOCALLY first, then upload pre-built state to E2B
 *
 * Steps:
 *   1. Load template config from convex/lakitu/template.config.ts (if exists)
 *   2. Start local convex-backend
 *   3. Deploy functions with `convex dev --once`
 *   4. Stop backend, capture the state directory
 *   5. Build E2B template with pre-built state + custom packages baked in
 *
 * Usage:
 *   bun lakitu              # Build the template
 *   bun lakitu base         # Build base template only
 *   bun lakitu custom       # Build custom template only
 */

import { Template, defaultBuildLogger, waitForPort } from "e2b";
import { $ } from "bun";
import type { TemplateConfig } from "../sdk/template";

const LAKITU_DIR = `${import.meta.dir}/..`;
const STATE_DIR = "/tmp/lakitu-convex-state";
const BUILD_DIR = "/tmp/lakitu-build";

/**
 * Load template config from project's convex/lakitu/template.config.ts
 */
async function loadTemplateConfig(): Promise<TemplateConfig> {
  const configPaths = [
    `${LAKITU_DIR}/../../convex/lakitu/template.config.ts`,
    `${process.cwd()}/convex/lakitu/template.config.ts`,
  ];

  for (const configPath of configPaths) {
    try {
      const configModule = await import(configPath);
      const config = configModule.default || configModule;
      console.log(`Loaded template config from ${configPath}`);
      return config;
    } catch {
      // Config not found, continue to next path
    }
  }

  console.log("No template config found, using defaults");
  return {
    packages: { apt: [], pip: [], npm: [] },
    services: [],
    setup: [],
    env: {},
    files: {},
  };
}

/**
 * Generate apt install command from config
 */
function generateAptInstall(packages: string[]): string {
  if (packages.length === 0) return "";
  return `sudo apt-get install -y ${packages.join(" ")}`;
}

/**
 * Generate pip install command from config
 */
function generatePipInstall(packages: string[]): string {
  if (packages.length === 0) return "";
  return `pip3 install ${packages.join(" ")}`;
}

/**
 * Generate npm install command from config
 */
function generateNpmInstall(packages: string[]): string {
  if (packages.length === 0) return "";
  return `sudo npm install -g ${packages.join(" ")}`;
}

async function getApiKey(): Promise<string> {
  if (process.env.E2B_API_KEY) return process.env.E2B_API_KEY;

  // Check .env.local files
  const envPaths = [
    `${import.meta.dir}/.env.local`,
    `${import.meta.dir}/../../.env.local`,
    `${import.meta.dir}/../../../.env.local`,
    `${process.cwd()}/.env.local`,
  ];
  for (const path of envPaths) {
    try {
      const content = await Bun.file(path).text();
      const match = content.match(/E2B_API_KEY=(.+)/);
      if (match) return match[1].trim();
    } catch { /* not found */ }
  }

  // Check E2B config
  try {
    const config = await Bun.file(`${process.env.HOME}/.e2b/config.json`).json();
    if (config.teamApiKey) return config.teamApiKey;
    if (config.accessToken) return config.accessToken;
  } catch { /* not found */ }

  throw new Error("E2B_API_KEY not found. Set in .env.local or run 'e2b auth login'");
}

/**
 * Pre-build Convex locally: start backend, deploy functions, capture state
 */
async function prebuildConvex(): Promise<string> {
  console.log("=== Pre-building Convex locally ===");

  // Clean up any existing state
  await $`rm -rf ${STATE_DIR}`.quiet();
  await $`mkdir -p ${STATE_DIR}`.quiet();

  // Kill any existing convex-backend
  await $`pkill -f "convex-backend" || true`.quiet();
  await Bun.sleep(1000);

  console.log("Starting local convex-backend...");

  // Start convex-backend in background
  // Run from STATE_DIR so the sqlite db is created there directly
  // Pass explicit sqlite path as first argument
  const backend = Bun.spawn([
    "convex-backend",
    `${STATE_DIR}/convex_local_backend.sqlite3`,
    "--port", "3210",
    "--site-proxy-port", "3211",
    "--local-storage", STATE_DIR,
  ], {
    cwd: STATE_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for backend to be ready
  console.log("Waiting for backend to be ready...");
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:3210/version");
      if (res.ok) {
        console.log(`Backend ready after ${i + 1} seconds`);
        break;
      }
    } catch { /* not ready yet */ }

    if (i === 29) {
      backend.kill();
      throw new Error("Backend failed to start after 30 seconds");
    }
    await Bun.sleep(1000);
  }

  // Deploy functions using convex dev --once
  console.log("Deploying functions with convex dev --once...");

  // Build clean env without CONVEX_DEPLOYMENT (conflicts with CONVEX_SELF_HOSTED_URL)
  const cleanEnv = { ...process.env };
  delete cleanEnv.CONVEX_DEPLOYMENT;

  // Create a temporary env file for the self-hosted deployment
  // This overrides any .env.local in the project
  const tempEnvFile = "/tmp/lakitu-convex-env";
  await Bun.write(tempEnvFile, `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd
`);

  // Deploy sandbox functions (not the cloud component)
  // Note: convex.json specifies "functions": "convex/sandbox" to target the sandbox directory
  const deploy = await $`cd ${LAKITU_DIR} && ./node_modules/.bin/convex dev --once --typecheck disable --env-file ${tempEnvFile}`
    .env(cleanEnv)
    .nothrow();

  if (deploy.exitCode !== 0) {
    console.log("Deploy stdout:", deploy.stdout.toString());
    console.log("Deploy stderr:", deploy.stderr.toString());
    backend.kill();
    throw new Error(`Convex deploy failed with exit code ${deploy.exitCode}`);
  }

  console.log("Functions deployed successfully!");

  // Give backend a moment to flush state
  await Bun.sleep(2000);

  // Stop backend gracefully
  console.log("Stopping backend...");
  backend.kill("SIGTERM");
  await Bun.sleep(1000);

  // Verify state was captured
  const stateFiles = await $`ls -la ${STATE_DIR}`.text();
  console.log("State directory contents:");
  console.log(stateFiles);

  // Check modules directory has content
  const modulesDir = `${STATE_DIR}/modules`;
  try {
    const moduleFiles = await $`ls ${modulesDir}`.text();
    console.log(`Modules deployed: ${moduleFiles.trim().split('\n').length} files`);
  } catch {
    console.log("Warning: No modules directory found");
  }

  // Verify sqlite db was copied
  try {
    const sqliteSize = await $`ls -la ${STATE_DIR}/convex_local_backend.sqlite3`.text();
    console.log("SQLite database:", sqliteSize.trim());
  } catch {
    console.log("WARNING: SQLite database not found!");
  }

  console.log("=== Pre-build complete ===\n");
  return STATE_DIR;
}

// Base template: Ubuntu + Bun + Convex Backend + Node.js
const baseTemplate = Template()
  .fromImage("e2bdev/code-interpreter:latest")
  .runCmd("sudo apt-get update && sudo apt-get install -y git curl sqlite3 libsqlite3-dev build-essential unzip")
  // Install Bun
  .runCmd(`
    export HOME=/home/user && \
    curl -fsSL https://bun.sh/install | bash
  `)
  // Install Node.js for npx convex
  .runCmd(`
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && \
    sudo apt-get install -y nodejs
  `)
  // Install Convex local backend
  .runCmd(`
    curl -L -o /tmp/convex.zip "https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-01-08-272e7f4/convex-local-backend-x86_64-unknown-linux-gnu.zip" && \
    unzip /tmp/convex.zip -d /tmp && \
    sudo mv /tmp/convex-local-backend /usr/local/bin/convex-backend && \
    sudo chmod +x /usr/local/bin/convex-backend && \
    rm /tmp/convex.zip
  `)
  // Create directory structure
  .runCmd(`
    mkdir -p /home/user/workspace /home/user/.convex/convex-backend-state/lakitu /home/user/artifacts && \
    chown -R user:user /home/user
  `)
  // Install crawl4ai + camoufox for stealth web scraping
  .runCmd(`
    pip3 install crawl4ai playwright camoufox && \
    /home/user/.local/bin/playwright install chromium firefox --with-deps && \
    /home/user/.local/bin/crawl4ai-setup || true && \
    python3 -c "from camoufox.sync_api import Camoufox; print('camoufox ready')" || true
  `)
  .setEnvs({
    HOME: "/home/user",
    PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
    CONVEX_URL: "http://localhost:3210",
    LOCAL_CONVEX_URL: "http://localhost:3210",
  });

// Custom template: Add Lakitu code + PRE-BUILT Convex state + AUTO-START backend
const customTemplate = (baseId: string, buildDir: string, config: TemplateConfig) => {
  let template = Template()
    .fromTemplate(baseId)
    // Copy Lakitu source code
    .copy(`${buildDir}/lakitu`, "/home/user/lakitu")
    .copy(`${buildDir}/start.sh`, "/home/user/start.sh")
    // Copy project-specific KSAs
    .copy(`${buildDir}/project-ksa`, "/home/user/project-ksa")
    // Copy PRE-BUILT Convex state (functions already deployed!)
    .copy(`${buildDir}/convex-state`, "/home/user/.convex/convex-backend-state/lakitu");

  // Install custom packages from template config
  const aptPackages = config.packages?.apt || [];
  const pipPackages = config.packages?.pip || [];
  const npmPackages = config.packages?.npm || [];

  if (aptPackages.length > 0 || pipPackages.length > 0 || npmPackages.length > 0) {
    console.log("Installing custom packages from template config...");
    const installCmds: string[] = [];

    if (aptPackages.length > 0) {
      console.log(`  APT: ${aptPackages.join(", ")}`);
      installCmds.push(generateAptInstall(aptPackages));
    }
    if (pipPackages.length > 0) {
      console.log(`  PIP: ${pipPackages.join(", ")}`);
      installCmds.push(generatePipInstall(pipPackages));
    }
    if (npmPackages.length > 0) {
      console.log(`  NPM: ${npmPackages.join(", ")}`);
      installCmds.push(generateNpmInstall(npmPackages));
    }

    template = template.runCmd(installCmds.join(" && "));
  }

  // Run custom setup commands
  const setupCmds = config.setup || [];
  if (setupCmds.length > 0) {
    console.log(`Running ${setupCmds.length} custom setup commands...`);
    for (const cmd of setupCmds) {
      template = template.runCmd(cmd);
    }
  }

  // Fix permissions and install dependencies (but NO convex deploy needed!)
  template = template.runCmd(`
    sudo chown -R user:user /home/user/lakitu /home/user/start.sh /home/user/.convex /home/user/project-ksa && \
    chmod +x /home/user/start.sh && \
    export HOME=/home/user && \
    export PATH="/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin" && \
    cd /home/user/lakitu && bun install && \
    echo '#!/bin/bash\nbun run /home/user/lakitu/runtime/pdf/pdf-generator.ts "$@"' | sudo tee /usr/local/bin/generate-pdf && \
    sudo chmod +x /usr/local/bin/generate-pdf && \
    echo '#!/bin/bash\nbun run /home/user/lakitu/runtime/browser/agent-browser-cli.ts "$@"' | sudo tee /usr/local/bin/agent-browser && \
    sudo chmod +x /usr/local/bin/agent-browser && \
    cp -r /home/user/project-ksa/*.ts /home/user/lakitu/ksa/ && \
    ln -sf /home/user/lakitu/ksa /home/user/ksa && \
    chown -R user:user /home/user/lakitu/ksa && \
    echo "KSA modules:" && ls /home/user/lakitu/ksa/*.ts 2>/dev/null | head -20
  `)
  // Verify state was copied (including sqlite db!)
  .runCmd(`
    echo "=== Verifying pre-built Convex state ===" && \
    ls -la /home/user/.convex/convex-backend-state/lakitu/ && \
    echo "Modules:" && \
    ls /home/user/.convex/convex-backend-state/lakitu/modules/ 2>/dev/null | wc -l && \
    echo "SQLite database:" && \
    ls -la /home/user/.convex/convex-backend-state/lakitu/convex_local_backend.sqlite3 && \
    echo "=== State verified ==="
  `);

  // Set environment variables (merge defaults with config)
  const envVars = {
    HOME: "/home/user",
    PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
    CONVEX_URL: "http://localhost:3210",
    LOCAL_CONVEX_URL: "http://localhost:3210",
    CONVEX_LOCAL_STORAGE: "/home/user/.convex/convex-backend-state/lakitu",
    ...(config.env || {}),
  };
  template = template.setEnvs(envVars);

  // AUTO-START: convex-backend starts on sandbox boot, E2B waits for port 3210
  return template.setStartCmd("/home/user/start.sh", waitForPort(3210));
};

async function buildBase() {
  const apiKey = await getApiKey();
  console.log("Building Lakitu base template...");

  const result = await Template.build(baseTemplate, {
    alias: "lakitu-base",
    apiKey,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(`Base template: ${result.templateId}`);
  return result.templateId;
}

async function buildCustom(baseId = "lakitu-base") {
  const apiKey = await getApiKey();

  // Step 0: Load template config
  const templateConfig = await loadTemplateConfig();

  // Step 1: Pre-build Convex locally
  const stateDir = await prebuildConvex();

  // Step 2: Prepare build context
  console.log("Preparing build context...");
  await $`rm -rf ${BUILD_DIR}`.quiet();
  await $`mkdir -p ${BUILD_DIR}`.quiet();

  // Copy lakitu source - only runtime files needed in sandbox
  await $`rsync -av \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='template' \
    --exclude='assets' \
    --exclude='cli' \
    --exclude='tests' \
    --exclude='dist' \
    --exclude='.github' \
    --exclude='.env.local' \
    --exclude='.gitignore' \
    --exclude='.npmignore' \
    --exclude='tsconfig*.json' \
    --exclude='vitest.config.ts' \
    --exclude='CLAUDE.md' \
    --exclude='scripts' \
    ${LAKITU_DIR}/ ${BUILD_DIR}/lakitu/`.quiet();
  await $`cp ${import.meta.dir}/e2b/start.sh ${BUILD_DIR}/`;

  // Copy project-specific KSAs
  // Supported paths (checked in order):
  //   1. convex/lakitu/ksa/ - Alternative location (colocated with convex backend)
  //   2. lakitu/           - Standard location for project.social (27 KSA modules)
  //
  // Note: project.social uses lakitu/ at the project root as its standard KSA location.
  // The convex/lakitu/ksa/ path is supported for projects that prefer colocating KSAs
  // with their Convex backend code.
  const ALT_KSA_DIR = `${LAKITU_DIR}/../../convex/lakitu/ksa`;
  const STANDARD_KSA_DIR = `${LAKITU_DIR}/../../lakitu`;
  await $`mkdir -p ${BUILD_DIR}/project-ksa`.quiet();

  // Try alternative location first (convex/lakitu/ksa/), fall back to standard (lakitu/)
  try {
    await $`test -d ${ALT_KSA_DIR}`.quiet();
    await $`cp -r ${ALT_KSA_DIR}/* ${BUILD_DIR}/project-ksa/`.quiet();
    console.log("Copied project KSAs from convex/lakitu/ksa/");
  } catch {
    try {
      await $`cp -r ${STANDARD_KSA_DIR}/* ${BUILD_DIR}/project-ksa/`.quiet();
      console.log("Copied project KSAs from lakitu/");
    } catch {
      console.log("No project KSAs found");
    }
  }

  // Copy custom files from template config
  const customFiles = templateConfig.files || {};
  for (const [dest, src] of Object.entries(customFiles)) {
    const srcPath = `${LAKITU_DIR}/../../${src}`;
    await $`cp -r ${srcPath} ${BUILD_DIR}/${dest}`.quiet();
    console.log(`Copied custom file: ${src} -> ${dest}`);
  }

  // Copy pre-built Convex state
  await $`cp -r ${stateDir} ${BUILD_DIR}/convex-state`;

  console.log("Build context ready:");
  await $`ls -la ${BUILD_DIR}`;

  // Step 3: Build E2B template with pre-built state + custom config
  console.log(`\nBuilding Lakitu custom template on ${baseId}...`);

  const result = await Template.build(customTemplate(baseId, BUILD_DIR, templateConfig), {
    alias: "lakitu",
    apiKey,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(`\n✅ Custom template: ${result.templateId}`);
  console.log("Functions are PRE-DEPLOYED - sandbox just needs to start the backend!");
  return result.templateId;
}

async function buildAll() {
  const baseId = await buildBase();
  await buildCustom(baseId);
}

// CLI
const cmd = process.argv[2];

async function main() {
  if (cmd === "base") await buildBase();
  else if (cmd === "custom") await buildCustom(process.argv[3]);
  else await buildAll();

  process.exit(0);
}

main().catch(e => {
  console.error("Build failed:", e);
  process.exit(1);
});
