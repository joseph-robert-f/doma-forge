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
// The worker chunk holds the registry, so it grows with every product: its
// schema, its validation, and its geometry. S10 set 80 KB with two products.
// Eight products measure 122 KB, eleven 154 KB, and fifteen 197 KB, about
// 10 KB per product over a 46 KB fixed part, so the budget is 224 KB: the
// full catalog of the sprint plan fits with room for two more products, and
// a doubling still fails. The lasting fix is a dynamic import per product in
// the generation worker so the chunk stops growing with the catalog; see
// 24_BRACKET_FAMILY_NOTES.md open issue 1, 22_FAMILY_A_EXTENSIONS_NOTES.md
// open issue 1, and the S06 review in 21_WAVE_1_PRODUCTS_NOTES.md.
const WORKER_CHUNK_BUDGET_BYTES = 224 * 1024;

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

  test(`the built worker chunk stays under ${WORKER_CHUNK_BUDGET_BYTES / 1024} KB`, () => {
    const asset = findBuiltAsset(/^generation\.worker-.*\.js$/);
    expect(asset.bytes).toBeLessThan(WORKER_CHUNK_BUDGET_BYTES);
  });
});
