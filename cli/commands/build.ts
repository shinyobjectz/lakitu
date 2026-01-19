/**
 * lakitu build
 *
 * Build E2B sandbox template with pre-deployed Convex functions.
 *
 * Strategy:
 * 1. Start local convex-backend
 * 2. Deploy sandbox functions with `convex dev --once`
 * 3. Capture the state directory
 * 4. Build E2B template with pre-built state baked in
 */

import { Template, defaultBuildLogger, waitForPort } from "e2b";
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Handle both TS source (cli/commands) and compiled JS (dist/cli/commands)
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
  // 1. Environment variable
  if (process.env.E2B_API_KEY) {
    return { key: process.env.E2B_API_KEY, source: "E2B_API_KEY env var" };
  }

  // 2. .env files
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

  // 3. E2B CLI config
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  try {
    const configPath = join(homeDir, ".e2b/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.teamApiKey) return { key: config.teamApiKey, source: "~/.e2b/config.json (teamApiKey)" };
    if (config.accessToken) return { key: config.accessToken, source: "~/.e2b/config.json (accessToken)" };
  } catch { /* not found */ }

  return null;
}

function preflightCheck(): string {
  const result = findApiKey();
  
  if (!result) {
    console.error("❌ E2B API key not found\n");
    console.error("To fix this, do ONE of the following:\n");
    console.error("  1. Set environment variable:");
    console.error("     export E2B_API_KEY=your_key\n");
    console.error("  2. Add to .env.local:");
    console.error("     echo 'E2B_API_KEY=your_key' >> .env.local\n");
    console.error("  3. Login via E2B CLI:");
    console.error("     npm install -g @e2b/cli");
    console.error("     e2b auth login\n");
    console.error("Get your API key at: https://e2b.dev/dashboard\n");
    process.exit(1);
  }

  console.log(`🔑 Using API key from ${result.source}\n`);
  return result.key;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pre-build Convex locally: start backend, deploy functions, capture state
 */
async function prebuildConvex(): Promise<string> {
  const stateDir = "/tmp/lakitu-convex-state";
  const sandboxConvexDir = join(PACKAGE_ROOT, "convex/sandbox");

  console.log("=== Pre-building Convex locally ===");

  // Clean up any existing state
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });

  // Kill any existing convex-backend
  try {
    execSync("pkill -f convex-backend", { stdio: "ignore" });
    await sleep(1000);
  } catch { /* not running */ }

  console.log("Starting local convex-backend...");

  // Filter out Bun's node shim from PATH so convex-backend finds real Node.js
  const cleanPath = (process.env.PATH || "")
    .split(":")
    .filter(p => !p.includes("bun-node-"))
    .join(":");

  // Start convex-backend in background
  const backend = spawn("convex-backend", [
    join(stateDir, "convex_local_backend.sqlite3"),
    "--port", "3210",
    "--site-proxy-port", "3211",
    "--local-storage", stateDir,
  ], {
    cwd: stateDir,
    stdio: "pipe",
    env: { ...process.env, PATH: cleanPath },
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
    await sleep(1000);
  }

  // Deploy functions using convex dev --once
  console.log("Deploying functions with convex dev --once...");

  const tempEnvFile = "/tmp/lakitu-convex-env";
  writeFileSync(tempEnvFile, `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd
`);

  try {
    // Run from package root where convex.json is (specifies functions: "convex/sandbox")
    execSync(`npx convex dev --once --typecheck disable --env-file ${tempEnvFile}`, {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
      env: { ...process.env, CONVEX_DEPLOYMENT: undefined, PATH: cleanPath },
    });
    console.log("Functions deployed successfully!");
  } catch (error) {
    backend.kill();
    throw new Error("Convex deploy failed");
  }

  // Give backend a moment to flush state
  await sleep(2000);

  // Stop backend gracefully
  console.log("Stopping backend...");
  backend.kill("SIGTERM");
  await sleep(1000);

  console.log("=== Pre-build complete ===\n");
  return stateDir;
}

// Base template: Ubuntu + Bun + Convex Backend + Node.js
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
  });

// Custom template: Add Lakitu code + PRE-BUILT Convex state + AUTO-START backend
function customTemplate(baseId: string, buildDir: string) {
  return Template()
    .fromTemplate(baseId)
    .copy(`${buildDir}/lakitu`, "/home/user/lakitu")
    .copy(`${buildDir}/start.sh`, "/home/user/start.sh")
    .copy(`${buildDir}/convex-state`, "/home/user/.convex/convex-backend-state/lakitu")
    .runCmd(`
      sudo chown -R user:user /home/user/lakitu /home/user/start.sh /home/user/.convex && \
      chmod +x /home/user/start.sh && \
      export HOME=/home/user && \
      export PATH="/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin" && \
      cd /home/user/lakitu && bun install && \
      echo '#!/bin/bash\nbun run /home/user/lakitu/runtime/pdf/pdf-generator.ts "$@"' | sudo tee /usr/local/bin/generate-pdf && \
      sudo chmod +x /usr/local/bin/generate-pdf && \
      cp -r /home/user/lakitu/ksa /home/user/ksa && \
      chown -R user:user /home/user/ksa
    `)
    .setEnvs({
      HOME: "/home/user",
      PATH: "/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin",
      CONVEX_URL: "http://localhost:3210",
      CONVEX_LOCAL_STORAGE: "/home/user/.convex/convex-backend-state/lakitu",
    })
    .setStartCmd("/home/user/start.sh", waitForPort(3210));
}

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

  // Step 1: Pre-build Convex locally
  const stateDir = await prebuildConvex();

  // Step 2: Prepare build context
  console.log("📦 Preparing build context...");
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  // Copy lakitu source using rsync (more reliable than cpSync for E2B)
  execSync(`rsync -av --exclude='node_modules' --exclude='.git' --exclude='template' --exclude='cli' --exclude='dist' --exclude='.env*' ${PACKAGE_ROOT}/ ${join(buildDir, "lakitu")}/`, {
    stdio: "pipe",
  });

  // Copy user's project KSAs from lakitu/ folder (if exists)
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

  // Copy pre-built Convex state
  cpSync(stateDir, join(buildDir, "convex-state"), { recursive: true });

  console.log("   ✓ Build context ready\n");

  // Step 3: Build E2B template with pre-built state
  console.log(`🔧 Building Lakitu custom template on ${baseId}...\n`);

  const result = await Template.build(customTemplate(baseId, buildDir), {
    alias: "lakitu",
    apiKey,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(`\n✅ Custom template: ${result.templateId}`);
  console.log("   Functions are PRE-DEPLOYED - sandbox starts instantly!");
  return result.templateId;
}

export async function build(options: BuildOptions) {
  console.log("🍄 Lakitu Template Builder\n");

  // Preflight: Check for API key before doing any work
  const apiKey = preflightCheck();

  if (options.base) {
    await buildBase(apiKey);
  } else if (options.custom) {
    await buildCustom(apiKey, options.baseId || "lakitu-base");
  } else {
    // Build both
    const baseId = await buildBase(apiKey);
    await buildCustom(apiKey, baseId);
  }

  console.log("\n🎉 Build complete!");
}
