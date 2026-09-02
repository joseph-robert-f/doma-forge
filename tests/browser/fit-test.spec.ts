import { expect, test } from "@playwright/test";
import { statSync } from "node:fs";
import { collectPageErrors, gotoReady } from "./support";

/**
 * Ported from the scratch harness's `fit-test-smoke.js`
 * (sprint S01, 16_FIT_TEST_COUPON_NOTES.md). Covers: the fit-test coupon
 * download and the full-model STL download both produce a non-trivial
 * binary STL, and the fit-test button is enabled once a preview is ready.
 */
test.describe("fit-test coupon download", () => {
  test("downloads a fit-test coupon and the full STL, both valid binary STL", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoReady(page);

    const fitTestButton = page.getByTestId("download-fit-test-button");
    await expect(fitTestButton).toBeEnabled();

    const [fitTestDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      fitTestButton.click(),
    ]);
    const fitTestName = fitTestDownload.suggestedFilename();
    expect(fitTestName).toMatch(/^drawerforge-fit-test-\d+(?:p\d+)?x\d+(?:p\d+)?-[0-9a-f]{6}\.stl$/);
    const fitTestPath = await fitTestDownload.path();
    const fitTestSize = statSync(fitTestPath!).size;
    // A binary STL is at least an 80-byte header plus a 4-byte triangle
    // count plus one 50-byte triangle record. A coupon is a small ring, so
    // this stays well under the full model's size.
    expect(fitTestSize).toBeGreaterThan(134);
    expect(fitTestSize).toBeLessThan(50_000);

    const [stlDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      page.getByTestId("download-stl-button").click(),
    ]);
    const stlPath = await stlDownload.path();
    const stlSize = statSync(stlPath!).size;
    expect(stlSize).toBeGreaterThan(134);
    // The fit-test coupon is a small perimeter ring (16_FIT_TEST_COUPON_NOTES.md);
    // the full model has walls, a base, and dividers on top of that same
    // perimeter, so it must come back strictly larger, not just non-trivial.
    expect(stlSize).toBeGreaterThan(fitTestSize);

    expect(errors).toEqual([]);
  });
});
