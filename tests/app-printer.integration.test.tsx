/** @vitest-environment jsdom */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLANT_POT_ID } from "../lib/products/plant-pot";
import { readFileText } from "../lib/design-file";
import { WORKSPACE_KEY } from "../lib/workspace";
import { renderProductApp, mockDownloads, renderReadyApp, setupAppTest } from "./helpers/app";

describe("DrawerForge printer profile", () => {
  setupAppTest();

  /** Opens the Printer section, sets one correction, and waits for the mesh. */
  async function setCorrection(axis: "x" | "y", value: string) {
    const viewer = screen.getByTestId("model-viewer");
    const before = viewer.getAttribute("data-model-key");
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId(`printer-correction-${axis}`), {
      target: { value },
    });
    await waitFor(() =>
      expect(viewer.getAttribute("data-model-key")).not.toBe(before),
    );
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );
  }

  it("opens and closes the printer section", async () => {
    await renderReadyApp();
    const toggle = screen.getByTestId("printer-section-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("printer-bed-width")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("printer-bed-width")).toHaveProperty("value", "220");
    expect(screen.getByTestId("printer-bed-depth")).toHaveProperty("value", "220");
    expect(screen.getByTestId("printer-bed-height")).toHaveProperty("value", "250");
    expect(screen.getByTestId("printer-nozzle")).toHaveProperty("value", "0.4");
    expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0");
    expect(screen.getByTestId("printer-correction-y")).toHaveProperty("value", "0");
  });

  it("shows no compensation line while every correction is zero", async () => {
    await renderReadyApp();
    expect(screen.queryAllByTestId("compensation-note")).toHaveLength(0);
  });

  it("states the modeled size, the target, and the correction", async () => {
    await renderReadyApp();
    await setCorrection("x", "0.5");

    const notes = screen.getAllByTestId("compensation-note");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain(
      "Modeled 299.5 mm = target 299 mm + 0.5 mm correction",
    );
  });

  it("rebuilds the preview when the correction changes", async () => {
    await renderReadyApp();
    const viewer = screen.getByTestId("model-viewer");
    const uncorrectedKey = viewer.getAttribute("data-model-key") ?? "";

    await setCorrection("x", "0.5");
    const correctedKey = viewer.getAttribute("data-model-key") ?? "";
    expect(correctedKey).not.toBe(uncorrectedKey);
    // The mesh identity holds the compensated width, not the target.
    expect(uncorrectedKey).toContain("|300|200|");
    expect(correctedKey).toContain("|300.5|200|");
  });

  it("marks the STL file name when a correction is active", async () => {
    await renderReadyApp();
    await setCorrection("x", "0.5");
    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("download-stl-button"));

    // The hash stays the target's hash; the marker names the correction.
    expect(downloads.downloadName()).toMatch(
      /^drawerforge-drawer-tray-299x199x50-2x3-[0-9a-f]{6}-cx0p5\.stl$/,
    );
    downloads.restore();
  });

  it("marks the fit-test file name and sizes the coupon with the correction", async () => {
    await renderReadyApp();
    await setCorrection("x", "0.5");
    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("download-fit-test-button"));

    await waitFor(() => expect(downloads.createUrl).toHaveBeenCalledOnce());
    expect(downloads.downloadName()).toMatch(
      /^drawerforge-fit-test-drawer-tray-299p5x199-[0-9a-f]{6}-cx0p5\.stl$/,
    );
    downloads.restore();
  });

  it("saves the target in the design file while a correction is active", async () => {
    await renderReadyApp();
    await setCorrection("x", "0.5");
    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("save-design-button"));
    const design = JSON.parse(await readFileText(downloads.lastBlob()));
    expect(design.parameters.drawerWidth).toBe(300);
    expect(design.printer).toBeUndefined();
    downloads.restore();

    // The stored design holds the target too.
    await waitFor(() => {
      const stored = window.localStorage.getItem(WORKSPACE_KEY) ?? "";
      expect(stored).toContain('"drawerWidth":300');
      expect(stored).toContain('"correctionX":0.5');
    });
  });

  it("proposes and applies a correction from a measurement, once", async () => {
    await renderReadyApp();
    await setCorrection("x", "0.5");
    // A correctly calibrated print should measure the 299 mm target, not
    // the 299.5 mm the app modeled with the existing 0.5 mm correction
    // (F-5): the model already holds that correction, so using it here
    // would count it twice.
    expect(screen.getByTestId("calibration-proposal").textContent).toContain(
      "measure width 299 mm",
    );
    const apply = screen.getByTestId("calibration-apply");
    expect(apply).toHaveProperty("disabled", true);

    // The coupon measured 299.4 mm: 0.4 mm over the 299 mm target, so
    // the 0.5 mm existing correction is reduced, not raised.
    fireEvent.change(screen.getByTestId("calibration-measured-x"), {
      target: { value: "299.4" },
    });
    expect(screen.getByTestId("calibration-proposal").textContent).toContain(
      "New X correction 0.1 mm = existing 0.5 mm + target 299 mm − measured 299.4 mm",
    );
    expect(apply).toHaveProperty("disabled", false);

    fireEvent.click(apply);
    expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0.1");
    expect(screen.getByTestId("calibration-measured-x")).toHaveProperty("value", "");
    expect(apply).toHaveProperty("disabled", true);

    // A second Apply cannot double the correction: the measurement is gone.
    fireEvent.click(apply);
    expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0.1");
    await waitFor(() =>
      expect(screen.getAllByTestId("compensation-note")[0].textContent).toContain(
        "Modeled 299.1 mm = target 299 mm + 0.1 mm correction",
      ),
    );
  });

  it("proposes each axis on its own", async () => {
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId("calibration-measured-y"), {
      target: { value: "198.7" },
    });
    const proposal = screen.getByTestId("calibration-proposal").textContent ?? "";
    expect(proposal).toContain("New Y correction 0.3 mm");
    expect(proposal).not.toContain("New X correction");

    fireEvent.click(screen.getByTestId("calibration-apply"));
    expect(screen.getByTestId("printer-correction-y")).toHaveProperty("value", "0.3");
    expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0");
  });

  /** Plants an envelope that already holds a printer profile. */
  function saveProfile(overrides: Record<string, unknown> = {}) {
    window.localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 3,
        updatedAt: "2026-09-02T12:00:00.000Z",
        designs: {},
        printer: {
          version: 1,
          name: "Bench one",
          bedWidth: 220,
          bedDepth: 220,
          bedHeight: 250,
          nozzleDiameter: 0.4,
          correctionX: 0,
          correctionY: 0,
          ...overrides,
        },
      }),
    );
  }

  it("lets the pot's widest rule read a saved bed, and names that bed", async () => {
    saveProfile({ bedWidth: 150, bedDepth: 150 });
    renderProductApp(PLANT_POT_ID);
    // The default pot is about 147 mm across at the rim; a 150 mm bed
    // less 12 mm allows 138 mm, so the rule refuses it and the message
    // names the bed from the profile, not the 220 mm reference.
    const error = await screen.findByTestId("param-wall-angle-degrees-error");
    expect(error.textContent).toMatch(
      /Keep it at most 138 mm, the 150 mm bed in your printer profile less 12 mm\./,
    );
    expect(screen.getByTestId("download-stl-button")).toHaveProperty("disabled", true);
    // Bed changes affect validation, even though they leave the mesh signature
    // unchanged. Generation must resume once this saved profile fits the pot.
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId("printer-bed-width"), { target: { value: "220" } });
    fireEvent.change(screen.getByTestId("printer-bed-depth"), { target: { value: "220" } });
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );
    expect(screen.getByTestId("download-stl-button")).toHaveProperty("disabled", false);
    const previousKey = screen.getByTestId("model-viewer").getAttribute("data-model-key");
    fireEvent.change(screen.getByTestId("printer-bed-width"), { target: { value: "150" } });
    fireEvent.change(screen.getByTestId("printer-bed-depth"), { target: { value: "150" } });
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^paused:/),
    );
    expect(screen.getByTestId("model-viewer").getAttribute("data-model-key")).toBe(previousKey);
    expect(screen.getByTestId("download-stl-button")).toHaveProperty("disabled", true);
  });

  it("names the pot's model download by its own compensable list, not by every nonzero axis (F-1)", async () => {
    // X +0.5 and Y -0.5 cancel in the mean, so the pot (which compensates
    // only its diameter) prints the same mesh as an uncorrected pot. The
    // file name must not claim an X or Y correction it never received.
    saveProfile({ correctionX: 0.5, correctionY: -0.5 });
    renderProductApp(PLANT_POT_ID);
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );
    const downloads = mockDownloads();
    fireEvent.click(screen.getByTestId("download-stl-button"));
    expect(downloads.createUrl).toHaveBeenCalledOnce();
    expect(downloads.downloadName()).toMatch(
      /^drawerforge-plant-pot-[0-9x.]+-\dh-[0-9a-f]{6}\.stl$/,
    );
    expect(downloads.downloadName()).not.toContain("-c");
    downloads.restore();
  });

  it("proposes the shared mean correction for a diameter-only product, and holds it (F-3)", async () => {
    // The pot compensates only its diameter, so the two axis corrections
    // in the profile (0.4 and 0.2, mean 0.3) do not apply to it directly:
    // the mean is what the pot's mesh actually moved by. Pairing the
    // proposal with each axis's own correction instead of that mean would
    // let the two proposals walk apart every round even once the print
    // measures the target.
    saveProfile({ correctionX: 0.4, correctionY: 0.2 });
    renderProductApp(PLANT_POT_ID);
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );
    fireEvent.click(screen.getByTestId("printer-section-toggle"));

    const expected = screen.getByTestId("calibration-proposal").textContent ?? "";
    const match = expected.match(
      /measure width ([\d.]+) mm and depth ([\d.]+) mm/,
    );
    expect(match).not.toBeNull();
    const [, targetX, targetY] = match as unknown as [string, string, string];

    // A print that measures exactly the target proposes the existing mean
    // correction back, on both axes: a fixed point in one step.
    fireEvent.change(screen.getByTestId("calibration-measured-x"), {
      target: { value: targetX },
    });
    fireEvent.change(screen.getByTestId("calibration-measured-y"), {
      target: { value: targetY },
    });
    const proposal = screen.getByTestId("calibration-proposal").textContent ?? "";
    expect(proposal).toContain(
      `New X correction 0.3 mm = existing mean correction 0.3 mm + target ${targetX} mm − measured ${targetX} mm`,
    );
    expect(proposal).toContain(
      `New Y correction 0.3 mm = existing mean correction 0.3 mm + target ${targetY} mm − measured ${targetY} mm`,
    );

    fireEvent.click(screen.getByTestId("calibration-apply"));
    expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0.3");
    expect(screen.getByTestId("printer-correction-y")).toHaveProperty("value", "0.3");

    // Applied, the mean is still 0.3: a second round proposes 0.3 again on
    // both axes rather than walking away from it.
    fireEvent.change(screen.getByTestId("calibration-measured-x"), {
      target: { value: targetX },
    });
    fireEvent.change(screen.getByTestId("calibration-measured-y"), {
      target: { value: targetY },
    });
    const secondRound = screen.getByTestId("calibration-proposal").textContent ?? "";
    expect(secondRound).toContain("New X correction 0.3 mm");
    expect(secondRound).toContain("New Y correction 0.3 mm");
  });

  it("gives no bed warning before a profile is saved", async () => {
    await renderReadyApp();
    // The default tray is 299 mm wide and the placeholder bed is 220 mm.
    // A warning here would be noise on every first visit.
    expect(screen.queryAllByTestId("printer-warning")).toHaveLength(0);
    // The live region stays mounted, so a later warning is announced.
    expect(screen.getByTestId("printer-warnings").getAttribute("role")).toBe(
      "status",
    );

    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    expect(screen.getByTestId("printer-bed-hint").textContent).toBe(
      "Enter your bed size to get build-volume warnings.",
    );
  });

  it("warns above the bed size once a profile is saved, and keeps the download available", async () => {
    saveProfile();
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    expect(screen.queryByTestId("printer-bed-hint")).toBeNull();

    // A 222 mm drawer with 0.5 mm clearance per side gives a 221 mm part.
    fireEvent.change(screen.getByTestId("param-drawer-width-number"), {
      target: { value: "222" },
    });
    const warnings = screen.getAllByTestId("printer-warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].textContent).toBe(
      "The part is 221 mm in X. The bed is 220 mm in X.",
    );

    // A 221 mm drawer gives a 220 mm part, equal to the bed. It passes.
    fireEvent.change(screen.getByTestId("param-drawer-width-number"), {
      target: { value: "221" },
    });
    expect(screen.queryAllByTestId("printer-warning")).toHaveLength(0);

    // The bed value itself is the other half of the rule.
    fireEvent.change(screen.getByTestId("printer-bed-width"), {
      target: { value: "219" },
    });
    expect(screen.getAllByTestId("printer-warning")[0].textContent).toBe(
      "The part is 220 mm in X. The bed is 219 mm in X.",
    );
    await waitFor(() =>
      expect(screen.getByTestId("download-stl-button")).toHaveProperty(
        "disabled",
        false,
      ),
    );
  });

  it("starts warning after the first profile save", async () => {
    await renderReadyApp();
    expect(screen.queryAllByTestId("printer-warning")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId("printer-bed-width"), {
      target: { value: "221" },
    });
    await waitFor(() =>
      expect(window.localStorage.getItem(WORKSPACE_KEY) ?? "").toContain(
        '"printer"',
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("printer-warning")[0].textContent).toBe(
        "The part is 299 mm in X. The bed is 221 mm in X.",
      ),
    );
    expect(screen.queryByTestId("printer-bed-hint")).toBeNull();
  });

  it("refuses the download for a wall under two nozzle widths", async () => {
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId("printer-nozzle"), {
      target: { value: "1.2" },
    });

    // Rule 9: a wall below two nozzle widths is an error, not a warning.
    const download = screen.getByTestId("download-stl-button");
    expect(download).toHaveProperty("disabled", true);
    expect(screen.getByTestId("download-fit-test-button")).toHaveProperty(
      "disabled",
      true,
    );
    expect(document.getElementById("download-help")?.textContent).toContain(
      "Outer wall thickness is 2 mm. A 1.2 mm nozzle needs at least 2.4 mm. A thin wall is weak.",
    );
    const summary = screen.getByTestId("validation-summary");
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.textContent).toContain("Printed walls need attention");
    expect(summary.textContent).toContain("Outer wall thickness is 2 mm.");
    expect(summary.textContent).not.toContain("safe to generate and export");
    // Before the debounced profile save, the bed rule is still silent.
    expect(screen.queryAllByTestId("printer-warning")).toHaveLength(0);
    // Printability blocks export without hiding the valid editable preview.
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/);
    const previousKey = screen.getByTestId("model-viewer").getAttribute("data-model-key");
    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "240" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("model-viewer").getAttribute("data-model-key"))
        .not.toBe(previousKey),
    );
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/);
    expect(download).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByTestId("printer-nozzle"), {
      target: { value: "0.4" },
    });
    expect(download).toHaveProperty("disabled", false);
    expect(summary.getAttribute("role")).toBe("status");
    expect(summary.textContent).toContain("Design checks passed");
  });

  it("refuses the download when the correction takes a value past its limit", async () => {
    await renderReadyApp();
    fireEvent.change(screen.getByTestId("param-drawer-width-number"), {
      target: { value: "600" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );

    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId("printer-correction-x"), {
      target: { value: "0.5" },
    });

    // The field still shows a legal 600, so the message names the
    // correction and not the field limit.
    const message = "The X correction takes the drawer width past its limit.";
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "600",
    );
    expect(screen.queryByTestId("param-drawer-width-error")).toBeNull();
    expect(screen.getByTestId("validation-summary").textContent).toContain(message);
    expect(document.getElementById("download-help")?.textContent).toContain(message);
    expect(screen.getByTestId("download-stl-button")).toHaveProperty(
      "disabled",
      true,
    );
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^paused:/),
    );
    expect(screen.getByTestId("preview-status").textContent).toContain(message);

    fireEvent.change(screen.getByTestId("printer-correction-x"), {
      target: { value: "0" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("download-stl-button")).toHaveProperty(
        "disabled",
        false,
      ),
    );
  });

  it("reports a printer value outside its limit and never hides it", async () => {
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    fireEvent.change(screen.getByTestId("printer-correction-x"), {
      target: { value: "900" },
    });
    expect(
      document.getElementById("printer-correction-x-message")?.textContent,
    ).toBe("X correction must be between -25 and 25 mm.");
    fireEvent.blur(screen.getByTestId("printer-correction-x"));
    expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "25");
  });

  it("keeps the profile in the workspace and restores it", async () => {
    const first = await renderReadyApp();
    await setCorrection("y", "-0.2");
    await waitFor(() =>
      expect(window.localStorage.getItem(WORKSPACE_KEY) ?? "").toContain(
        '"correctionY":-0.2',
      ),
    );
    first.unmount();

    await renderReadyApp();
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    expect(screen.getByTestId("printer-correction-y")).toHaveProperty(
      "value",
      "-0.2",
    );
    expect(screen.getAllByTestId("compensation-note")[0].textContent).toContain(
      "Modeled 198.8 mm = target 199 mm − 0.2 mm correction",
    );
  });

  it("writes no profile when the user does not edit one", async () => {
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("printer-section-toggle"));
    await waitFor(() =>
      expect(window.localStorage.getItem(WORKSPACE_KEY) ?? "").toContain(
        '"format":"drawerforge-workspace"',
      ),
    );
    expect(window.localStorage.getItem(WORKSPACE_KEY) ?? "").not.toContain(
      '"printer"',
    );
  });
});
