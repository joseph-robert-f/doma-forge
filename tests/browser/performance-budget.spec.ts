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
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CLIENT_ASSETS_DIR = path.join(REPO_ROOT, "dist/client/assets");

const READY_BUDGET_MS = 5_000;
const PAGE_CHUNK_BUDGET_BYTES = 650 * 1024;
// The worker chunk holds only the protocol and one lazy loader per product;
// each product's geometry, schema, and the kernel load on demand in their
// own chunks. Fifteen products measure 2.8 KB here, so the budget is 16 KB:
// a product added later costs the worker one loader line, and a static
// import of any product or kernel module fails this at once. Before S13
// the same chunk held every product's geometry and measured 197 KB; see
// 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1701.
const WORKER_CHUNK_BUDGET_BYTES = 16 * 1024;
// The registry chunk holds every product's schema, validation, copy, and
// presets, which the page needs for its form. Fifteen products measure
// 126 KB, about 8.5 KB per product, so the budget is 176 KB: room for five
// more products, and a builder module leaking in fails it.
const REGISTRY_CHUNK_BUDGET_BYTES = 176 * 1024;

/** Finds the one built asset file whose name matches the given pattern. */
function findBuiltAsset(pattern: RegExp): { name: string; bytes: number } {
  const entries = readdirSync(CLIENT_ASSETS_DIR).filter((name) =>
    pattern.test(name),
  );
  if (entries.length === 0) {
    throw new Error(
      `No file matching ${pattern} found in ${CLIENT_ASSETS_DIR}. Run "npm run build" first.`,
    );
  }
  if (entries.length > 1) {
    throw new Error(
      `Expected exactly one file matching ${pattern}, found: ${entries.join(", ")}`,
    );
  }
  const name = entries[0];
  const bytes = statSync(path.join(CLIENT_ASSETS_DIR, name)).size;
  return { name, bytes };
}

test.describe("performance budget", () => {
  test(`the first Ready preview appears within ${READY_BUDGET_MS} ms`, async ({
    page,
  }) => {
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

  test(`the built registry chunk stays under ${REGISTRY_CHUNK_BUDGET_BYTES / 1024} KB`, () => {
    const asset = findBuiltAsset(/^registry-.*\.js$/);
    expect(asset.bytes).toBeLessThan(REGISTRY_CHUNK_BUDGET_BYTES);
  });
});
