#!/usr/bin/env bun
/**
 * Agent Browser CLI - Playwright-based browser automation
 *
 * Commands:
 *   open <url>              - Open URL in browser
 *   screenshot [path]       - Take screenshot
 *   click <selector>        - Click element
 *   type <selector> <text>  - Type text into element
 *   html                    - Get page HTML
 *   text                    - Get page text
 *   close                   - Close browser
 */

import { chromium, Browser, Page } from "playwright";
import * as fs from "fs/promises";
import * as path from "path";

// Singleton browser state
let browser: Browser | null = null;
let page: Page | null = null;

const STATE_FILE = "/tmp/agent-browser-state.json";

async function loadState(): Promise<{ wsEndpoint?: string }> {
  try {
    const data = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveState(state: { wsEndpoint?: string }): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify(state));
}

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }

  const state = await loadState();

  // Try to reconnect to existing browser
  if (state.wsEndpoint) {
    try {
      browser = await chromium.connectOverCDP(state.wsEndpoint);
      return browser;
    } catch {
      // Browser no longer available, launch new one
    }
  }

  // Launch new browser
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // Save endpoint for future connections
  // Note: CDP endpoint may not be available for all launch modes
  await saveState({});

  return browser;
}

async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) {
    return page;
  }

  const b = await getBrowser();
  const contexts = b.contexts();

  if (contexts.length > 0 && contexts[0].pages().length > 0) {
    page = contexts[0].pages()[0];
  } else {
    const context = await b.newContext();
    page = await context.newPage();
  }

  return page;
}

async function open(url: string): Promise<void> {
  const p = await getPage();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const result = {
    url: p.url(),
    title: await p.title(),
  };

  console.log(JSON.stringify(result));
}

async function screenshot(outputPath?: string): Promise<void> {
  const p = await getPage();
  const screenshotPath = outputPath || "/home/user/artifacts/screenshot.png";

  // Ensure directory exists
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });

  await p.screenshot({ path: screenshotPath, fullPage: false });

  // Output base64 if requested via format flag
  if (process.argv.includes("--format") && process.argv.includes("base64")) {
    const buffer = await fs.readFile(screenshotPath);
    console.log(buffer.toString("base64"));
  } else {
    console.log(JSON.stringify({ path: screenshotPath }));
  }
}

async function click(selector: string): Promise<void> {
  const p = await getPage();
  await p.click(selector, { timeout: 10000 });
  console.log(JSON.stringify({ success: true }));
}

async function type(selector: string, text: string): Promise<void> {
  const p = await getPage();
  await p.fill(selector, text, { timeout: 10000 });
  console.log(JSON.stringify({ success: true }));
}

async function getHtml(): Promise<void> {
  const p = await getPage();
  const html = await p.content();
  console.log(html);
}

async function getText(): Promise<void> {
  const p = await getPage();
  const text = await p.evaluate(() => document.body.innerText);
  console.log(text);
}

async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
  await saveState({});
  console.log(JSON.stringify({ success: true }));
}

async function main() {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "open":
        if (!args[0]) throw new Error("URL required");
        await open(args[0]);
        break;

      case "screenshot":
        await screenshot(args[0]);
        break;

      case "click":
        if (!args[0]) throw new Error("Selector required");
        await click(args[0]);
        break;

      case "type":
        if (!args[0] || !args[1]) throw new Error("Selector and text required");
        await type(args[0], args[1]);
        break;

      case "html":
        await getHtml();
        break;

      case "text":
        await getText();
        break;

      case "close":
        await closeBrowser();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error("Usage: agent-browser <command> [args]");
        console.error("Commands: open, screenshot, click, type, html, text, close");
        process.exit(1);
    }
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
  }
}

main();
