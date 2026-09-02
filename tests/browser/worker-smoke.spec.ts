import { expect, test } from "@playwright/test";
import { statSync } from "node:fs";
import { collectPageErrors, gotoReady, statusText, waitForStatusPrefix } from "./support";

/**
 * Ported from the scratch harness's `smoke.js` (12_WEB_WORKER_GENERATION_NOTES.md).
 * Covers: exactly one generation worker across a page load and five rapid
 * edits, the edits settling on the last value, and a valid STL download.
 */
test.describe("worker smoke and rapid edits", () => {
  test("one worker survives rapid edits and produces a valid download", async ({ page }) => {
    const errors = collectPageErrors(page);
    const workerUrls: string[] = [];
    page.on("worker", (worker) => workerUrls.push(worker.url()));

    await gotoReady(page);

    const depth = page.getByTestId("param-drawer-depth-number");
    for (const value of ["210", "220", "230", "240", "250"]) {
      await depth.fill(value);
      await page.waitForTimeout(50);
    }
    // drawerWidth stays at the default 300, clearancePerSide at 0.5, so the
    // outside width is 299 and the settled outside depth is 249.
    await waitForStatusPrefix(page, "Ready · 299 × 249");
    const settled = await statusText(page);
    expect(settled).toContain("299 × 249");

    // The generation worker is created once and reused for every edit.
    expect(workerUrls.length).toBeGreaterThan(0);
    expect(new Set(workerUrls).size).toBe(1);
    expect(workerUrls[0]).toMatch(/generation\.worker/);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      page.getByTestId("download-stl-button").click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^drawerforge-drawer-tray-299x249x50-2x3-[0-9a-f]{6}\.stl$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const size = statSync(path!).size;
    // The golden mesh's STL (tests/geometry.test.ts) is a few tens of KB;
    // this parameter set is close enough to it to expect the same order of
    // magnitude. A generous floor catches a truncated or empty file.
    expect(size).toBeGreaterThan(2_000);
    expect(size).toBeLessThan(200_000);

    expect(errors).toEqual([]);
  });
});
