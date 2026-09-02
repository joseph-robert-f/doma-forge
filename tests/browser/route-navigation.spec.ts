import { expect, test } from "@playwright/test";
import { collectPageErrors, gotoReady } from "./support";

/**
 * Ported from the scratch harness's `route-smoke-s02.js`
 * (sprint S02, 17_PRODUCT_ROUTES_NOTES.md). Covers: the document title
 * follows the design name, the design and its title survive a full
 * navigation to the product's own route and back to "/", and the product
 * switcher renders the same link count on both routes.
 */
test.describe("route navigation", () => {
  test("a design and its title survive navigating to the product route and back", async ({ page }) => {
    const errors = collectPageErrors(page);

    await gotoReady(page, "/");
    const switcherCountOnRoot = await page.getByTestId("product-switcher").locator("a").count();
    // A count of 0 would make the later equality check pass vacuously.
    expect(switcherCountOnRoot).toBeGreaterThan(0);

    const nameInput = page.getByTestId("design-name-input");
    await nameInput.fill("Left bench");
    // The name-save write is debounced 300 ms; the title effect is
    // synchronous with the input, so it updates well before that.
    await page.waitForFunction(() => document.title === "Left bench · DrawerForge", null, { timeout: 5_000 });
    await page.waitForTimeout(500);

    // Full navigation, new document: to the product's own route.
    await gotoReady(page, "/products/drawer-tray");
    expect(await page.getByTestId("design-name-input").inputValue()).toBe("Left bench");
    expect(await page.title()).toBe("Left bench · DrawerForge");
    const switcherCountOnProductRoute = await page.getByTestId("product-switcher").locator("a").count();
    expect(switcherCountOnProductRoute).toBe(switcherCountOnRoot);

    // Back to "/": the design is still there.
    await gotoReady(page, "/");
    expect(await page.getByTestId("design-name-input").inputValue()).toBe("Left bench");

    expect(errors).toEqual([]);
  });
});
