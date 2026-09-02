import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { gotoReady } from "./support";

/**
 * Accessibility gate for the default page (sprint S10 scope item 3). The
 * bar is zero serious or critical axe violations; a moderate or minor
 * finding does not fail the build but is still worth a look.
 */
test.describe("accessibility", () => {
  test("the default page has no serious or critical axe violations", async ({ page }) => {
    await gotoReady(page, "/");

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    const summary = blocking
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} node(s)`,
      )
      .join("\n");

    expect(blocking, summary).toEqual([]);
  });
});
