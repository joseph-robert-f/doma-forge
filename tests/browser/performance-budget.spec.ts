import { expect, test } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gotoReady } from "./support";

/**
 * Performance budget (sprint S10 scope item 4). Two independent checks:
 *
 * 1. The first "Ready" preview appears within 5 seconds of navigation.
 * 2. The page chunk and the worker chunk stay under their byte budgets, as
 *    measured directly from the production build in `dist/client/assets`,
 *    not from network transfer (which would count compression and vary by
 *    connection).
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLIENT_ASSETS_DIR = path.join(REPO_ROOT, "dist/client/assets");

const READY_BUDGET_MS = 5_000;
const PAGE_CHUNK_BUDGET_BYTES = 650 * 1024;
const WORKER_CHUNK_BUDGET_BYTES = 80 * 1024;

/** Finds the one built asset file whose name matches the given pattern. */
function findBuiltAsset(pattern: RegExp): { name: string; bytes: number } {
  const entries = readdirSync(CLIENT_ASSETS_DIR).filter((name) => pattern.test(name));
  if (entries.length === 0) {
    throw new Error(
      `No file matching ${pattern} found in ${CLIENT_ASSETS_DIR}. Run "npm run build" first.`,
    );
  }
  if (entries.length > 1) {
    throw new Error(`Expected exactly one file matching ${pattern}, found: ${entries.join(", ")}`);
  }
  const name = entries[0];
  const bytes = statSync(path.join(CLIENT_ASSETS_DIR, name)).size;
  return { name, bytes };
}

test.describe("performance budget", () => {
  test(`the first Ready preview appears within ${READY_BUDGET_MS} ms`, async ({ page }) => {
    const start = Date.now();
    await gotoReady(page, "/", READY_BUDGET_MS + 5_000);
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(READY_BUDGET_MS);
  });

  test("the built page chunk stays under 650 KB", () => {
    const asset = findBuiltAsset(/^ProductApp-.*\.js$/);
    expect(asset.bytes).toBeLessThan(PAGE_CHUNK_BUDGET_BYTES);
  });

  test("the built worker chunk stays under 80 KB", () => {
    const asset = findBuiltAsset(/^generation\.worker-.*\.js$/);
    expect(asset.bytes).toBeLessThan(WORKER_CHUNK_BUDGET_BYTES);
  });
});
