import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { collectPageErrors, gotoReady, waitForReady, waitForStatusPrefix } from "./support";

/**
 * Ported from the scratch harness's `design.js` (13_DESIGN_FILE_NOTES.md).
 * Covers: saving a named design file, clearing storage and reloading back
 * to defaults, opening the saved file to restore the design, and refusing
 * an unsupported file version without changing state.
 */
test.describe("design file save and open", () => {
  test("save, clear storage, reopen, and reject an unsupported version", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoReady(page);

    await page.getByTestId("param-drawer-depth-number").fill("245");
    await page.getByTestId("design-name-input").fill("Left bench");
    await waitForStatusPrefix(page, "Ready · 299 × 244");

    const [designDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("save-design-button").click(),
    ]);
    const designName = designDownload.suggestedFilename();
    expect(designName).toMatch(/^left-bench-drawer-tray-[0-9a-f]{6}\.drawerforge\.json$/);
    const designPath = await designDownload.path();
    const designText = readFileSync(designPath!, "utf8");
    const saved = JSON.parse(designText);
    expect(saved.format).toBe("drawerforge-design");
    expect(saved.version).toBe(2);
    expect(saved.name).toBe("Left bench");
    expect(saved.parameters.drawerDepth).toBe(245);

    const msg1 = await page.getByTestId("design-file-message").textContent();
    expect(msg1 ?? "").toMatch(/Saved/i);

    const [stlDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-stl-button").click(),
    ]);
    // The STL name carries the same six-character hash as the design file,
    // so the two match by eye.
    const hash = designName.match(/-([0-9a-f]{6})\.drawerforge\.json$/)?.[1];
    expect(hash).toBeTruthy();
    expect(stlDownload.suggestedFilename()).toContain(`-${hash}.stl`);

    // Clear storage and reload: the app falls back to its defaults.
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
    const depthAfterReload = await page.getByTestId("param-drawer-depth-number").inputValue();
    expect(depthAfterReload).toBe("200");

    // Open the saved file: the design comes back.
    await page.getByTestId("open-design-input").setInputFiles({
      name: designName,
      mimeType: "application/json",
      buffer: Buffer.from(designText, "utf8"),
    });
    await page.waitForFunction(
      () => document.querySelector<HTMLInputElement>('[data-testid="param-drawer-depth-number"]')?.value === "245",
      null,
      { timeout: 10_000 },
    );
    await waitForStatusPrefix(page, "Ready · 299 × 244");
    const msg2 = await page.getByTestId("design-file-message").textContent();
    expect(msg2 ?? "").toMatch(/Loaded.*Left bench/);
    const nameAfterOpen = await page.getByTestId("design-name-input").inputValue();
    expect(nameAfterOpen).toBe("Left bench");

    // An unsupported version is refused; the current design is unchanged.
    await page.getByTestId("open-design-input").setInputFiles({
      name: "unsupported-version.drawerforge.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "drawerforge-design", version: 9 }), "utf8"),
    });
    await page.waitForFunction(
      () => /not supported/.test(document.querySelector('[data-testid="design-file-message"]')?.textContent ?? ""),
      null,
      { timeout: 10_000 },
    );
    const depthStillSet = await page.getByTestId("param-drawer-depth-number").inputValue();
    expect(depthStillSet).toBe("245");

    expect(errors).toEqual([]);
  });
});
