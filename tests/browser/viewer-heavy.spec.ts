import { expect, test } from "@playwright/test";
import { drawerTray } from "../../lib/products/drawer-tray";
import { collectPageErrors, gotoReady, statusText, waitForReady } from "./support";

/**
 * Ported from the scratch harness's `heavy.js` (12_WEB_WORKER_GENERATION_NOTES.md).
 * Software WebGL is slow (see the sprint's Risks section), so this is the
 * one viewer-heavy step in the suite and carries its own generous timeout.
 * It drives the largest parameter set the drawer tray allows at fine
 * quality (6 x 8 compartments, a 600 x 600 mm drawer) and proves the page
 * survives a full regeneration under that load without freezing or
 * throwing.
 */
test.describe("viewer under a heavy regeneration", () => {
  test.setTimeout(120_000);

  test("a 6x8 fine-quality tray regenerates cleanly after a full-mesh edit", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoReady(page, "/", 60_000);
    const viewer = page.getByTestId("model-viewer");
    const heavyParameters = {
      ...drawerTray.defaults,
      rows: 6,
      columns: 8,
      drawerWidth: 600,
      drawerDepth: 600,
      meshQuality: "fine" as const,
    };

    await page.getByTestId("param-rows-number").fill("6");
    await page.getByTestId("param-columns-number").fill("8");
    await page.getByTestId("param-drawer-width-number").fill("600");
    await page.getByTestId("param-drawer-depth-number").fill("600");
    await page.getByTestId("param-mesh-quality-fine").click();
    await expect(viewer).toHaveAttribute(
      "data-model-key", drawerTray.signature(heavyParameters), { timeout: 60_000 },
    );
    await waitForReady(page, 60_000);

    // clearancePerSide stays at the 0.5 mm default, so a 600 mm drawer
    // gives a 599 mm outside dimension.
    const beforeToggle = await statusText(page);
    expect(beforeToggle).toContain("599 × 599");
    expect(beforeToggle).toContain("6 × 8");

    await page.getByTestId("param-finger-scoop-toggle").click();
    // Wait for the edited mesh, not an old Ready label or a machine-dependent
    // long task. A responsive browser may complete without any long tasks.
    await expect(viewer).toHaveAttribute(
      "data-model-key",
      drawerTray.signature({ ...heavyParameters, fingerScoop: !heavyParameters.fingerScoop }),
      { timeout: 60_000 },
    );

    // The regeneration must finish and settle back on the same footprint;
    // the finger scoop only cuts a notch and never changes the outer bounds.
    await waitForReady(page, 60_000);
    const afterToggle = await statusText(page);
    expect(afterToggle).toContain("599 × 599");
    expect(afterToggle).toContain("6 × 8");

    await expect(page.getByTestId("download-stl-button")).toBeEnabled();

    expect(errors).toEqual([]);
  });
});
