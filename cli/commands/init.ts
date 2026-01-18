/**
 * lakitu init
 *
 * Initialize lakitu in a Convex project:
 * 1. Install @lakitu/sdk as a dependency
 * 2. Create convex/lakitu.config.ts
 * 3. Add lakitu component to convex.config.ts
 * 4. Create example KSA file
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

interface InitOptions {
  dir: string;
  skipInstall?: boolean;
}

const LAKITU_CONFIG = `/**
 * Lakitu Configuration
 *
 * Configure your AI agent's capabilities here.
 */

import { Lakitu } from "@lakitu/sdk";

export default Lakitu.configure({
  // E2B template to use (build with: npx lakitu build)
  template: "lakitu",

  // Default model for agent
  model: "anthropic/claude-sonnet-4-20250514",

  // KSA modules to enable
  ksas: [
    // Built-in KSAs
    "file",
    "shell",
    "browser",
    "beads",

    // Custom KSAs (define in convex/lakitu/)
    // "./example",
  ],

  // Sandbox pool settings
  pool: {
    min: 0,
    max: 5,
    idleTimeout: 300_000, // 5 minutes
  },
});
`;

const EXAMPLE_KSA = `/**
 * Example Custom KSA
 *
 * KSAs (Knowledge, Skills, Abilities) are capability modules
 * that the AI agent can use via code execution.
 */

import { defineKSA, fn, service } from "@lakitu/sdk";

export const exampleKSA = defineKSA("example")
  .description("Example KSA showing how to define custom capabilities")
  .category("skills")

  // Simple function that calls a Convex service
  .fn("greet", fn()
    .description("Generate a greeting")
    .param("name", { type: "string", required: true })
    .impl(service("myService.greet")
      .mapArgs(({ name }) => ({ userName: name }))
    )
  )

  .build();

export default exampleKSA;
`;

const CONVEX_CONFIG_ADDITION = `
// Lakitu agent component
import lakitu from "@lakitu/sdk/component";
app.use(lakitu);
`;

export async function init(options: InitOptions) {
  const cwd = process.cwd();
  const convexDir = join(cwd, options.dir);

  console.log("🍄 Initializing Lakitu...\n");

  // Check if convex directory exists
  if (!existsSync(convexDir)) {
    console.error(`❌ Convex directory not found: ${convexDir}`);
    console.log("   Run this command from a Convex project root.");
    process.exit(1);
  }

  // Step 1: Install dependency
  if (!options.skipInstall) {
    console.log("📦 Installing @lakitu/sdk...");
    try {
      // Detect package manager
      const useBun = existsSync(join(cwd, "bun.lockb"));
      const usePnpm = existsSync(join(cwd, "pnpm-lock.yaml"));
      const useYarn = existsSync(join(cwd, "yarn.lock"));

      const pm = useBun ? "bun" : usePnpm ? "pnpm" : useYarn ? "yarn" : "npm";
      const addCmd = pm === "yarn" ? "add" : "install";

      execSync(`${pm} ${addCmd} @lakitu/sdk`, { stdio: "inherit" });
      console.log("   ✓ Installed\n");
    } catch (error) {
      console.warn("   ⚠ Could not auto-install. Run: npm install @lakitu/sdk\n");
    }
  }

  // Step 2: Create convex/lakitu/ directory and config
  const lakituDir = join(convexDir, "lakitu");
  if (!existsSync(lakituDir)) {
    mkdirSync(lakituDir, { recursive: true });
  }

  const configPath = join(lakituDir, "config.ts");
  if (!existsSync(configPath)) {
    console.log("📝 Creating convex/lakitu/config.ts...");
    writeFileSync(configPath, LAKITU_CONFIG);
    console.log("   ✓ Created\n");
  } else {
    console.log("📝 convex/lakitu/config.ts already exists, skipping.\n");
  }

  // Step 3: Create example KSA in convex/lakitu/
  const examplePath = join(lakituDir, "example.ts");
  if (!existsSync(examplePath)) {
    console.log("📝 Creating example KSA...");
    if (!existsSync(lakituDir)) {
      mkdirSync(lakituDir, { recursive: true });
    }
    writeFileSync(examplePath, EXAMPLE_KSA);
    console.log("   ✓ Created convex/lakitu/example.ts\n");
  }

  // Step 4: Check convex.config.ts
  const convexConfigPath = join(convexDir, "convex.config.ts");
  if (existsSync(convexConfigPath)) {
    const content = readFileSync(convexConfigPath, "utf-8");
    if (!content.includes("@lakitu/sdk")) {
      console.log("📝 Add this to your convex.config.ts:\n");
      console.log("   " + CONVEX_CONFIG_ADDITION.trim().split("\n").join("\n   "));
      console.log("");
    }
  }

  // Done
  console.log("✅ Lakitu initialized!\n");
  console.log("Next steps:");
  console.log("  1. Add lakitu component to convex.config.ts (see above)");
  console.log("  2. Define KSAs in convex/lakitu/");
  console.log("  3. Build template: npx lakitu build");
  console.log("  4. Publish to E2B: npx lakitu publish");
  console.log("");
}
