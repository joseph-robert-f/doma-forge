import { expect, test } from "@playwright/test";
import { drawerTray } from "../../lib/products/drawer-tray";
import { collectPageErrors, gotoReady } from "./support";

test("custom tray rows and columns survive reload and keep invalid edits from exporting", async ({ page }) => {
  const errors = collectPageErrors(page);
  await gotoReady(page, "/");

  await page.getByTestId("param-column-layout-custom").check();
  await page.getByTestId("param-column-layout-size-1").fill("60");
  await page.getByTestId("param-column-layout-size-2").fill("100");
  await page.getByTestId("param-row-layout-custom").check();
  await page.getByTestId("param-row-layout-size-1").fill("70");

  const target = drawerTray.normalize({
    ...drawerTray.defaults,
    columnLayout: { mode: "custom", fixedSizesMm: [60, 100] },
    rowLayout: { mode: "custom", fixedSizesMm: [70] },
  });
  const key = drawerTray.signature(target);
  const viewer = page.getByTestId("model-viewer");
  await expect(viewer).toHaveAttribute("data-model-key", key, { timeout: 60_000 });
  await expect(page.getByTestId("param-column-layout-remaining")).toHaveValue("131");
  await expect(page.getByTestId("param-row-layout-remaining")).toHaveValue("123");
  await expect(page.getByTestId("tray-layout-map")).toBeVisible();
  await expect(page.getByTestId("tray-layout-cell-list")).toContainText("131");
  await expect(page.getByTestId("download-stl-button")).toBeEnabled();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(viewer).toHaveAttribute("data-model-key", key, { timeout: 60_000 });
  await expect(page.getByTestId("param-column-layout-custom")).toBeChecked();
  await expect(page.getByTestId("param-row-layout-custom")).toBeChecked();
  await expect(page.getByTestId("param-column-layout-size-1")).toHaveValue("60");
  await expect(page.getByTestId("param-column-layout-size-2")).toHaveValue("100");
  await expect(page.getByTestId("param-row-layout-size-1")).toHaveValue("70");

  await page.getByTestId("param-column-layout-size-1").fill("80");
  await page.getByTestId("param-column-layout-size-1").press("Tab");
  await expect(page.getByTestId("tray-layout-undo")).toBeEnabled();
  await page.getByTestId("tray-layout-undo").click();
  await expect(page.getByTestId("param-column-layout-size-1")).toHaveValue("60");
  await page.getByTestId("tray-layout-redo").click();
  await expect(page.getByTestId("param-column-layout-size-1")).toHaveValue("80");
  await page.getByTestId("tray-layout-undo").click();
  await expect(page.getByTestId("param-column-layout-size-1")).toHaveValue("60");

  await page.getByTestId("param-column-layout-size-1").fill("200");
  await expect(page.getByTestId("download-stl-button")).toBeDisabled();
  await expect(viewer).toHaveAttribute("data-model-key", key);
  expect(errors).toEqual([]);
});
