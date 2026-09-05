import { expect, test, type Page } from "@playwright/test";
import { PRODUCTS } from "../../lib/products/registry";
import { gotoReady } from "./support";

const PRODUCT_FAMILIES = [
  "Shelled trays and bins",
  "Comb and bore arrays",
  "Brackets and wall mounts",
  "Revolved forms",
] as const;

const VIEWPORTS = [
  { name: "desktop", width: 1363, height: 936, headerHeight: 72 },
  { name: "wide tablet", width: 1024, height: 768, headerHeight: 72 },
  { name: "desktop boundary", width: 960, height: 720, headerHeight: 72 },
  { name: "tablet", width: 768, height: 900, headerHeight: 72 },
  { name: "tablet boundary", width: 640, height: 900, headerHeight: 72 },
  { name: "mobile boundary", width: 639, height: 844, headerHeight: 58 },
  { name: "mobile", width: 390, height: 844, headerHeight: 58 },
  { name: "narrow mobile", width: 320, height: 700, headerHeight: 58 },
] as const;

function switcherParts(page: Page) {
  return {
    switcher: page.getByTestId("product-switcher"),
    trigger: page.getByTestId("product-switcher-trigger"),
    panel: page.getByTestId("product-switcher-panel"),
  };
}

async function expectClosedSwitcherFitsHeader(
  page: Page,
  viewport: (typeof VIEWPORTS)[number],
) {
  const { panel, trigger } = switcherParts(page);
  const header = page.locator("header.app-header");
  const viewer = page.getByTestId("model-viewer");

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  const [headerBox, triggerBox, viewerBox] = await Promise.all([
    header.boundingBox(),
    trigger.boundingBox(),
    viewer.boundingBox(),
  ]);

  if (!headerBox || !triggerBox || !viewerBox) {
    throw new Error("The header, product trigger, and 3D viewer must be visible.");
  }

  const headerBottom = headerBox.y + headerBox.height;
  const triggerBottom = triggerBox.y + triggerBox.height;

  expect(headerBox.y).toBeGreaterThanOrEqual(0);
  expect(headerBox.height).toBe(viewport.headerHeight);
  expect(triggerBox.x).toBeGreaterThanOrEqual(headerBox.x);
  expect(triggerBox.y).toBeGreaterThanOrEqual(headerBox.y);
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width);
  expect(triggerBottom).toBeLessThanOrEqual(headerBottom);
  expect(viewerBox.y).toBeGreaterThanOrEqual(headerBottom - 1);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) >
      window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
}

test.describe("product switcher", () => {
  test("keeps the closed picker inside every target header without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: VIEWPORTS[0].width,
      height: VIEWPORTS[0].height,
    });
    await gotoReady(page, "/");

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectClosedSwitcherFitsHeader(page, viewport);
    }
  })

  test("opens with Enter and Space, then closes on Escape and returns focus", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    const { panel, trigger } = switcherParts(page);

    for (const key of ["Enter", "Space"]) {
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press(key);

      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(panel).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();
    }

    await trigger.focus();
    await page.keyboard.press("Enter");
    const firstProductLink = panel.getByRole("link", {
      name: PRODUCTS[0].label,
      exact: true,
    });
    await page.keyboard.press("Tab");
    await expect(firstProductLink).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("groups every product, keeps the current route active, and navigates on selection", async ({
    page,
  }) => {
    const activeProduct = PRODUCTS.find((product) => product.id === "plant-pot");
    const destinationProduct = PRODUCTS.find((product) => product.id === "remote-caddy");

    if (!activeProduct || !destinationProduct) {
      throw new Error("Expected plant-pot and remote-caddy in the product registry.");
    }

    await gotoReady(page, `/products/${activeProduct.id}`);
    const { panel, trigger } = switcherParts(page);

    await expect(trigger).toContainText(activeProduct.label);
    await trigger.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("product-switcher-group")).toHaveCount(
      PRODUCT_FAMILIES.length,
    );

    for (const family of PRODUCT_FAMILIES) {
      await expect(panel.getByRole("heading", { name: family, exact: true })).toBeVisible();
    }

    await expect(panel.getByRole("link")).toHaveCount(PRODUCTS.length);
    for (const product of PRODUCTS) {
      await expect(
        panel.getByRole("link", { name: product.label, exact: true }),
      ).toHaveCount(1);
    }

    const activeLink = panel.locator('a[aria-current="page"]');
    await expect(activeLink).toHaveCount(1);
    await expect(activeLink).toHaveText(activeProduct.label);

    const destination = panel.getByRole("link", {
      name: destinationProduct.label,
      exact: true,
    });
    await Promise.all([
      page.waitForURL(new RegExp(`/products/${destinationProduct.id}$`)),
      destination.click(),
    ]);
    await expect(trigger).toContainText(destinationProduct.label);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await trigger.click();
    await expect(panel.locator('a[aria-current="page"]')).toHaveText(
      destinationProduct.label,
    );
  });

  test("reports an error status when WebGL is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "WebGLRenderingContext", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, "WebGL2RenderingContext", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("renderer-error")).toContainText(
      "This browser does not provide WebGL for the 3D preview.",
    );
    await expect(page.getByTestId("preview-status")).toHaveAttribute("data-status", "error");
    await expect(page.getByTestId("preview-status")).toContainText(/^Error/);
    await expect(page.getByTestId("fit-view-button")).toBeDisabled();
    await expect(page.getByTestId("reset-view-button")).toBeDisabled();
  });
});
