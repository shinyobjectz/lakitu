/**
 * lakitu init
 *
 * Initialize lakitu in a Convex project:
 * 1. Install @lakitu/sdk as a dependency
 * 2. Create lakitu/ folder with example KSA
 * 3. Add lakitu component to convex.config.ts
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

interface InitOptions {
  dir: string;
  skipInstall?: boolean;
}

const EXAMPLE_KSA = `/**
 * # Example KSA - Custom Capability
 * 
 * KSAs (Knowledge, Skills, Abilities) are simple TypeScript functions
 * that agents can import and use via code execution.
 * 
 * ## When to use:
 * - Wrap your Convex services for agent access
 * - Add custom capabilities to your agent
 * 
 * ## Example:
 * \`\`\`typescript
 * import * as example from './ksa/example';
 * 
 * const greeting = await example.greet("World");
 * \`\`\`
 */
import { callGateway } from "@lakitu/sdk/ksa/gateway";
import { localDb } from "@lakitu/sdk/ksa/localDb";

/**
 * Generate a greeting by calling your Convex service.
 * @param name - Name to greet
 */
export async function greet(name: string): Promise<string> {
  const result = await callGateway("myService.greet", { name });
  return (result as any)?.message || "Hello, " + name + "!";
}

/**
 * Save a note using the local sandbox database.
 */
export async function saveNote(content: string) {
  return localDb.mutate("notes:save", { content });
}

/**
 * List all notes from the local database.
 */
export async function listNotes() {
  return localDb.query("notes:list", {});
}
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
      const useBun = existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"));
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

  // Step 2: Create lakitu/ directory at project root
  const lakituDir = join(cwd, "lakitu");
  if (!existsSync(lakituDir)) {
    mkdirSync(lakituDir, { recursive: true });
    console.log("📁 Created lakitu/ directory\n");
  }

  // Step 3: Create example KSA
  const examplePath = join(lakituDir, "example.ts");
  if (!existsSync(examplePath)) {
    console.log("📝 Creating example KSA...");
    writeFileSync(examplePath, EXAMPLE_KSA);
    console.log("   ✓ Created lakitu/example.ts\n");
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
  console.log("  2. Create KSAs in lakitu/ as simple TypeScript functions");
  console.log("  3. Build template: npx lakitu build");
  console.log("  4. Publish to E2B: npx lakitu publish");
  console.log("");
  console.log("KSA files are plain TypeScript - import from './ksa/yourfile'");
  console.log("in your agent code.\n");
}
