/**
 * Browser Skills
 *
 * Functions for browser automation.
 * Uses the agent-browser CLI for headless browser control.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface BrowserResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface Screenshot {
  path: string;
  base64?: string;
}

// ============================================================================
// State
// ============================================================================

let browserSessionId: string | null = null;

// ============================================================================
// Functions
// ============================================================================

/**
 * Open a URL in the browser.
 *
 * @param url - URL to navigate to
 * @returns Browser result with page info
 *
 * @example
 * await open('https://example.com');
 */
export async function open(url: string): Promise<BrowserResult> {
  try {
    const { stdout } = await execAsync(`agent-browser open "${url}"`, {
      timeout: 30_000,
    });

    const result = JSON.parse(stdout);
    browserSessionId = result.sessionId;

    return {
      success: true,
      data: {
        url: result.url,
        title: result.title,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Take a screenshot of the current page.
 *
 * @param name - Optional filename (default: screenshot)
 * @returns Path to screenshot file
 *
 * @example
 * const { path } = await screenshot('homepage');
 * // Saves to /home/user/artifacts/homepage.png
 */
export async function screenshot(name = "screenshot"): Promise<Screenshot> {
  const path = `/home/user/artifacts/${name}.png`;

  try {
    await execAsync(`agent-browser screenshot "${path}"`, {
      timeout: 10_000,
    });

    // Read as base64 for embedding
    const buffer = await fs.readFile(path);
    const base64 = buffer.toString("base64");

    return { path, base64 };
  } catch (error) {
    return {
      path: "",
      error: error instanceof Error ? error.message : String(error),
    } as any;
  }
}

/**
 * Click an element on the page.
 *
 * @param selector - CSS selector for element to click
 * @returns Result of click action
 *
 * @example
 * await click('button.submit');
 */
export async function click(selector: string): Promise<BrowserResult> {
  try {
    const { stdout } = await execAsync(`agent-browser click "${selector}"`, {
      timeout: 10_000,
    });

    return {
      success: true,
      data: JSON.parse(stdout),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Type text into an input field.
 *
 * @param selector - CSS selector for input element
 * @param text - Text to type
 * @returns Result of type action
 *
 * @example
 * await type('input[name="search"]', 'hello world');
 */
export async function type(selector: string, text: string): Promise<BrowserResult> {
  try {
    const escaped = text.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
      `agent-browser type "${selector}" "${escaped}"`,
      { timeout: 10_000 }
    );

    return {
      success: true,
      data: JSON.parse(stdout),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the current page's HTML content.
 *
 * @returns Page HTML
 *
 * @example
 * const html = await getHtml();
 */
export async function getHtml(): Promise<string> {
  try {
    const { stdout } = await execAsync("agent-browser html", {
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return stdout;
  } catch {
    return "";
  }
}

/**
 * Get the current page's text content.
 *
 * @returns Page text (no HTML tags)
 *
 * @example
 * const text = await getText();
 */
export async function getText(): Promise<string> {
  try {
    const { stdout } = await execAsync("agent-browser text", {
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024, // 5MB
    });

    return stdout;
  } catch {
    return "";
  }
}

/**
 * Close the browser session.
 *
 * @example
 * await close();
 */
export async function closeBrowser(): Promise<void> {
  try {
    await execAsync("agent-browser close", { timeout: 5_000 });
    browserSessionId = null;
  } catch {
    // Ignore close errors
  }
}
