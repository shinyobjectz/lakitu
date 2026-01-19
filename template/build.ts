#!/usr/bin/env bun
/**
 * E2B Template Builder for Lakitu
 *
 * Strategy: Build Convex LOCALLY first, then upload pre-built state to E2B
 *
 * Steps:
 *   1. Start local convex-backend
 *   2. Deploy functions with `convex dev --once`
 *   3. Stop backend, capture the state directory
 *   4. Build E2B template with pre-built state baked in
 *
 * Usage:
 *   bun lakitu              # Build the template
 *   bun lakitu base         # Build base template only
 *   bun lakitu custom       # Build custom template only
 */

import { Template, defaultBuildLogger, waitForPort } from "e2b";
import { $ } from "bun";

const LAKITU_DIR = `${import.meta.dir}/..`;
const STATE_DIR = "/tmp/lakitu-convex-state";
const BUILD_DIR = "/tmp/lakitu-build";

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
  .setEnvs({
    HOME: "/home/user",
    PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
    CONVEX_URL: "http://localhost:3210",
  });

// Custom template: Add Lakitu code + PRE-BUILT Convex state + AUTO-START backend
const customTemplate = (baseId: string, buildDir: string) => Template()
  .fromTemplate(baseId)
  // Copy Lakitu source code
  .copy(`${buildDir}/lakitu`, "/home/user/lakitu")
  .copy(`${buildDir}/start.sh`, "/home/user/start.sh")
  // Copy PRE-BUILT Convex state (functions already deployed!)
  .copy(`${buildDir}/convex-state`, "/home/user/.convex/convex-backend-state/lakitu")
  // Fix permissions and install dependencies (but NO convex deploy needed!)
  .runCmd(`
    sudo chown -R user:user /home/user/lakitu /home/user/start.sh /home/user/.convex && \
    chmod +x /home/user/start.sh && \
    export HOME=/home/user && \
    export PATH="/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin" && \
    cd /home/user/lakitu && bun install && \
    echo '#!/bin/bash\nbun run /home/user/lakitu/runtime/pdf/pdf-generator.ts "$@"' | sudo tee /usr/local/bin/generate-pdf && \
    sudo chmod +x /usr/local/bin/generate-pdf && \
    echo '#!/bin/bash\nbun run /home/user/lakitu/runtime/browser/agent-browser-cli.ts "$@"' | sudo tee /usr/local/bin/agent-browser && \
    sudo chmod +x /usr/local/bin/agent-browser && \
    cp -r /home/user/lakitu/ksa /home/user/ksa && \
    chown -R user:user /home/user/ksa
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
  `)
  .setEnvs({
    HOME: "/home/user",
    PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
    CONVEX_URL: "http://localhost:3210",
    CONVEX_LOCAL_STORAGE: "/home/user/.convex/convex-backend-state/lakitu",
  })
  // AUTO-START: convex-backend starts on sandbox boot, E2B waits for port 3210
  // This eliminates ~1000ms of polling overhead - backend is ready when create() returns
  .setStartCmd("/home/user/start.sh", waitForPort(3210));

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

  // Step 1: Pre-build Convex locally
  const stateDir = await prebuildConvex();

  // Step 2: Prepare build context
  console.log("Preparing build context...");
  await $`rm -rf ${BUILD_DIR}`.quiet();
  await $`mkdir -p ${BUILD_DIR}`.quiet();

  // Copy lakitu source (excluding node_modules, .git, template)
  await $`rsync -av --exclude='node_modules' --exclude='.git' --exclude='template' ${LAKITU_DIR}/ ${BUILD_DIR}/lakitu/`.quiet();
  await $`cp ${import.meta.dir}/e2b/start.sh ${BUILD_DIR}/`;

  // Copy pre-built Convex state
  await $`cp -r ${stateDir} ${BUILD_DIR}/convex-state`;

  console.log("Build context ready:");
  await $`ls -la ${BUILD_DIR}`;

  // Step 3: Build E2B template with pre-built state
  console.log(`\nBuilding Lakitu custom template on ${baseId}...`);

  const result = await Template.build(customTemplate(baseId, BUILD_DIR), {
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
