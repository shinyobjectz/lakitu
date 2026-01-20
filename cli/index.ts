#!/usr/bin/env bun
/**
 * Lakitu CLI
 *
 * Self-hosted AI agent framework for Convex + E2B.
 *
 * Commands:
 *   init       - Initialize lakitu in a Convex project
 *   build      - Build E2B sandbox template
 *   publish    - Publish template to E2B
 *   cloudflare - Manage Cloudflare workers and R2
 */

import { Command } from "commander";
import { init } from "./commands/init.js";
import { build } from "./commands/build.js";
import { publish } from "./commands/publish.js";
import { cloudflare } from "./commands/cloudflare.js";

const program = new Command();

program
  .name("lakitu")
  .description("Self-hosted AI agent framework for Convex + E2B")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize lakitu in your Convex project")
  .option("-d, --dir <path>", "Convex directory", "convex")
  .option("--skip-install", "Skip npm install")
  .action(init);

program
  .command("build")
  .description("Build E2B sandbox template")
  .option("--base", "Build base template only")
  .option("--custom", "Build custom template only")
  .option("--base-id <id>", "Base template ID for custom build", "lakitu-base")
  .action(build);

program
  .command("publish")
  .description("Publish template to E2B")
  .option("--alias <name>", "Template alias", "lakitu")
  .action(publish);

program
  .command("cloudflare <command>")
  .description("Manage Cloudflare workers and R2")
  .option("-p, --project <path>", "Project directory")
  .action(cloudflare);

program.parse();
