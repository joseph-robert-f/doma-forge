import { expect, test } from "@playwright/test";
import { collectPageErrors, gotoReady, waitForReady, waitForStatusPrefix } from "./support";

/**
 * Ported from the scratch harness's `migrate.js` (14_WORKSPACE_STORAGE_NOTES.md).
 * Covers: a version 1 `drawerforge-design-v1` record migrating in place into
 * the version 3 workspace envelope on first load, the legacy record staying
 * present with a `migratedTo` marker, and the envelope becoming the source
 * of truth for a later edit and rename.
 */
test.describe("storage migration", () => {
  test("a version 1 record migrates to the workspace envelope in place", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoReady(page);

    // Plant a version 1 record exactly as the previous release wrote it.
    const legacy = JSON.stringify({
      version: 1,
      productId: "drawer-tray",
      name: "From v1",
      parameters: {
        drawerWidth: 300,
        drawerDepth: 260,
        clearancePerSide: 0.5,
        organizerHeight: 50,
        wallThickness: 2,
        baseThickness: 2,
        dividerThickness: 2,
        cornerRadius: 8,
        rows: 2,
        columns: 4,
        meshQuality: "standard",
        fingerScoop: true,
      },
    });
    await page.evaluate((record) => {
      localStorage.clear();
      localStorage.setItem("drawerforge-design-v1", record);
    }, legacy);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);

    expect(await page.getByTestId("param-drawer-depth-number").inputValue()).toBe("260");
    expect(await page.getByTestId("param-columns-number").inputValue()).toBe("4");
    expect(await page.getByTestId("design-name-input").inputValue()).toBe("From v1");

    // Give the migration write a moment to land, then inspect storage.
    await page.waitForTimeout(400);
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keys).toContain("drawerforge-design-v1");
    expect(keys).toContain("drawerforge-workspace-v3");

    const envelope = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("drawerforge-workspace-v3") ?? "null"),
    );
    expect(envelope?.format).toBe("drawerforge-workspace");
    expect(envelope?.version).toBe(3);
    expect(Object.keys(envelope?.designs ?? {})).toEqual(["drawer-tray"]);

    const legacyAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("drawerforge-design-v1") ?? "null"),
    );
    expect(legacyAfter?.migratedTo).toBe("drawerforge-workspace-v3");
    expect(legacyAfter?.parameters?.drawerDepth).toBe(260);
    expect(legacyAfter?.name).toBe("From v1");

    // Edit and rename; the envelope, not the legacy key, is now the source
    // of truth across a reload.
    await page.getByTestId("param-rows-number").fill("3");
    await page.getByTestId("design-name-input").fill("Renamed");
    await waitForStatusPrefix(page, "Ready");
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="preview-status"]')?.textContent ?? "").includes("3 × 4"),
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);

    expect(await page.getByTestId("param-rows-number").inputValue()).toBe("3");
    expect(await page.getByTestId("design-name-input").inputValue()).toBe("Renamed");

    expect(errors).toEqual([]);
  });
});
