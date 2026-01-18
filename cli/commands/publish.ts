/**
 * lakitu publish
 *
 * Publish your built template to E2B.
 * This is mostly a convenience wrapper - the build command already publishes.
 */

import { execSync } from "child_process";

interface PublishOptions {
  alias?: string;
}

export async function publish(options: PublishOptions) {
  console.log("🍄 Publishing Lakitu template to E2B...\n");

  const alias = options.alias || "lakitu";

  // The build command already publishes, so this is mainly for
  // re-publishing or updating an existing template
  console.log(`Template alias: ${alias}`);
  console.log("");
  console.log("To publish a new template, run:");
  console.log("  npx lakitu build");
  console.log("");
  console.log("To manage templates directly:");
  console.log("  e2b template list");
  console.log("  e2b template delete <template-id>");
  console.log("");

  // Check if e2b CLI is available
  try {
    const templates = execSync("e2b template list", { encoding: "utf-8" });
    console.log("Your E2B templates:");
    console.log(templates);
  } catch {
    console.log("💡 Install E2B CLI for more template management:");
    console.log("   npm install -g @e2b/cli");
    console.log("   e2b auth login");
  }
}
