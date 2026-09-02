import type { Page } from "@playwright/test";

/**
 * Shared helpers for the real-browser suite (sprint S10). Every spec in
 * this folder drives a production build served by `npm run start`, through
 * `playwright.config.ts`'s `webServer`.
 */

/**
 * Console errors that are a known, pre-existing environment quirk rather
 * than a page bug. `12_WEB_WORKER_GENERATION_NOTES.md` open issue 1: the
 * local production server (`vinext start`) serves `.wasm` as
 * `application/octet-stream`, so Chromium logs a streaming-compile
 * warning and falls back to array-buffer instantiation. That fallback
 * still works; it is slower, not broken. Fixing the MIME type is a
 * server-configuration change outside this sprint's scope. Filtering the
 * warning here keeps the error assertion meaningful for every other spec
 * in this folder instead of forcing each one to repeat the filter.
 */
const BENIGN_CONSOLE_PATTERNS = [
  /wasm streaming compile failed/i,
  /falling back to ArrayBuffer instantiation/i,
];

/** Attaches page-error and console-error listeners. Call before `page.goto`. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (BENIGN_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  return errors;
}

/** Waits for the preview status region to read "Ready...". */
export async function waitForReady(page: Page, timeout = 30_000) {
  await page.waitForFunction(
    () => /^Ready/.test(document.querySelector('[data-testid="preview-status"]')?.textContent ?? ""),
    null,
    { timeout },
  );
}

/** Waits for the preview status text to start with the given prefix. */
export async function waitForStatusPrefix(page: Page, prefix: string, timeout = 30_000) {
  await page.waitForFunction(
    (expected) =>
      (document.querySelector('[data-testid="preview-status"]')?.textContent ?? "").startsWith(expected),
    prefix,
    { timeout },
  );
}

export async function statusText(page: Page): Promise<string> {
  return (await page.getByTestId("preview-status").textContent()) ?? "";
}

/** Navigates to the given path and waits for the first Ready preview. */
export async function gotoReady(page: Page, path = "/", timeout = 30_000) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForReady(page, timeout);
}
