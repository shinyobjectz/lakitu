/**
 * Browser KSA - Browser automation functions
 *
 * Provides headless browser control for screenshots, navigation, and interaction.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";

const execAsync = promisify(exec);

export interface BrowserResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Open a URL in the browser
 *
 * @example
 * const result = await open('https://example.com');
 * console.log(result.data?.title); // Page title
 */
export async function open(url: string): Promise<BrowserResult<{ url: string; title: string }>> {
  try {
    const { stdout } = await execAsync(`agent-browser open "${url}"`, {
      timeout: 30_000,
    });
    const result = JSON.parse(stdout);
    return {
      success: true,
      data: { url: result.url, title: result.title },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Take a screenshot of the current page
 *
 * @example
 * await open('https://example.com');
 * const result = await screenshot('my-screenshot');
 * console.log(result.data?.path); // /home/user/artifacts/my-screenshot.png
 */
export async function screenshot(name = "screenshot"): Promise<BrowserResult<{ path: string; base64: string }>> {
  const screenshotPath = `/home/user/artifacts/${name}.png`;
  try {
    await execAsync(`agent-browser screenshot "${screenshotPath}"`, {
      timeout: 10_000,
    });
    const buffer = await fs.readFile(screenshotPath);
    return {
      success: true,
      data: { path: screenshotPath, base64: buffer.toString("base64") },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Click an element by CSS selector
 *
 * @example
 * await click('button.submit');
 */
export async function click(selector: string): Promise<BrowserResult> {
  try {
    await execAsync(`agent-browser click "${selector}"`, { timeout: 10_000 });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Type text into an element
 *
 * @example
 * await type('input[name="email"]', 'user@example.com');
 */
export async function type(selector: string, text: string): Promise<BrowserResult> {
  try {
    await execAsync(`agent-browser type "${selector}" "${text}"`, {
      timeout: 10_000,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the HTML content of the current page
 *
 * @example
 * const result = await getHtml();
 * console.log(result.data);
 */
export async function getHtml(): Promise<BrowserResult<string>> {
  try {
    const { stdout } = await execAsync("agent-browser html", {
      timeout: 10_000,
    });
    return { success: true, data: stdout };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the text content of the current page
 *
 * @example
 * const result = await getText();
 * console.log(result.data);
 */
export async function getText(): Promise<BrowserResult<string>> {
  try {
    const { stdout } = await execAsync("agent-browser text", {
      timeout: 10_000,
    });
    return { success: true, data: stdout };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Close the browser
 *
 * @example
 * await closeBrowser();
 */
export async function closeBrowser(): Promise<BrowserResult> {
  try {
    await execAsync("agent-browser close", { timeout: 5_000 });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
