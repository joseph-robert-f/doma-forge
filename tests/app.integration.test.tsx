/** @vitest-environment jsdom */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { drawerTray } from "../lib/products/drawer-tray";
import { mockDownloads, renderReadyApp, setupAppTest } from "./helpers/app";

describe("DrawerForge controls, generation, and export", () => {
  setupAppTest();

  it("keeps sliders and numeric fields synchronized", async () => {
    await renderReadyApp();
    const slider = screen.getByTestId("param-drawer-width-range");
    const number = screen.getByTestId("param-drawer-width-number");

    fireEvent.change(slider, { target: { value: "330" } });
    expect(number).toHaveProperty("value", "330");

    fireEvent.change(number, { target: { value: "315" } });
    expect(slider).toHaveProperty("value", "315");
  });

  it("keeps an out-of-range numeric edit synchronized with the slider", async () => {
    await renderReadyApp();
    const slider = screen.getByTestId("param-drawer-width-range");
    const number = screen.getByTestId("param-drawer-width-number");

    fireEvent.change(number, { target: { value: "999" } });

    expect(number).toHaveProperty("value", "999");
    expect(slider).toHaveProperty("value", "999");
    expect(slider).toHaveProperty("min", "80");
    expect(slider).toHaveProperty("max", "999");
    expect(slider).toHaveProperty("step", "any");
    expect(slider.getAttribute("aria-valuetext")).toBe("999 mm");
    expect(screen.getByTestId("download-stl-button")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("represents off-step numeric edits exactly and snaps subsequent slider input", async () => {
    await renderReadyApp();
    const slider = screen.getByTestId("param-wall-thickness-range");
    const number = screen.getByTestId("param-wall-thickness-number");

    fireEvent.change(number, { target: { value: "2.123" } });

    expect(number).toHaveProperty("value", "2.123");
    expect(number).toHaveProperty("step", "any");
    expect(slider).toHaveProperty("value", "2.123");
    expect(slider).toHaveProperty("step", "any");
    expect(slider.getAttribute("aria-valuetext")).toBe("2.123 mm");

    fireEvent.change(slider, { target: { value: "2.37" } });
    expect(number).toHaveProperty("value", "2.4");
    expect(slider).toHaveProperty("step", "0.1");
  });

  it("updates the same viewer after a valid debounced change", async () => {
    await renderReadyApp();
    const viewer = screen.getByTestId("model-viewer");
    const originalKey = viewer.getAttribute("data-model-key");

    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "240" },
    });
    await waitFor(() =>
      expect(viewer.getAttribute("data-model-key")).not.toBe(originalKey),
    );
    expect(screen.getByTestId("model-viewer")).toBe(viewer);
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/);
  });

  it("explains that download is waiting while the preview is stale", async () => {
    await renderReadyApp();

    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "240" },
    });

    expect(screen.getByTestId("download-stl-button")).toHaveProperty(
      "disabled",
      true,
    );
    expect(document.getElementById("download-help")?.textContent).toMatch(
      /wait for the current preview/i,
    );
  });

  it("blocks download and preserves the last valid model for invalid input", async () => {
    await renderReadyApp();
    const viewer = screen.getByTestId("model-viewer");
    const lastValidKey = viewer.getAttribute("data-model-key");

    fireEvent.change(screen.getByTestId("param-drawer-width-number"), {
      target: { value: "80" },
    });
    fireEvent.change(screen.getByTestId("param-columns-number"), {
      target: { value: "8" },
    });

    expect(screen.getByTestId("download-stl-button")).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByTestId("param-columns-error").textContent).toMatch(
      /at least 10 mm/i,
    );
    expect(viewer.getAttribute("data-model-key")).toBe(lastValidKey);
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^paused:/),
    );
  });

  it("loads a preset and marks manual edits as Custom", async () => {
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("preset-tools"));

    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "360",
    );
    expect(screen.getByTestId("param-columns-number")).toHaveProperty(
      "value",
      "4",
    );

    fireEvent.change(screen.getByTestId("param-organizer-height-number"), {
      target: { value: "57" },
    });
    const custom = screen
      .getByTestId("preset-custom")
      .querySelector("input") as HTMLInputElement;
    expect(custom.checked).toBe(true);
    expect(
      drawerTray.presets.find((preset) => preset.id === "tools")?.parameters
        .organizerHeight,
    ).toBe(55);
  });

  it("downloads a nonempty binary STL from the current preview", async () => {
    await renderReadyApp();
    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("download-stl-button"));

    expect(downloads.createUrl).toHaveBeenCalledOnce();
    expect(downloads.lastBlob().size).toBeGreaterThan(84);
    expect(downloads.downloadName()).toMatch(
      /^drawerforge-drawer-tray-299x199x50-2x3-[0-9a-f]{6}\.stl$/,
    );
  });

  it("keeps the fit-test button state in step with the STL button", async () => {
    await renderReadyApp();
    const stlButton = screen.getByTestId("download-stl-button") as HTMLButtonElement;
    const fitTestButton = screen.getByTestId("download-fit-test-button");
    expect(fitTestButton).toHaveProperty("disabled", stlButton.disabled);

    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "240" },
    });
    expect(stlButton).toHaveProperty("disabled", true);
    expect(fitTestButton).toHaveProperty("disabled", true);

    await waitFor(() => expect(stlButton).toHaveProperty("disabled", false));
    expect(fitTestButton).toHaveProperty("disabled", false);
  });

  it("downloads a nonempty binary fit-test coupon matching the filename pattern", async () => {
    await renderReadyApp();
    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("download-fit-test-button"));

    await waitFor(() => expect(downloads.createUrl).toHaveBeenCalledOnce());
    expect(downloads.lastBlob().size).toBeGreaterThan(84);
    expect(downloads.downloadName()).toMatch(
      /^drawerforge-fit-test-drawer-tray-299x199-[0-9a-f]{6}\.stl$/,
    );
  });

  it("labels the fit-test button busy while the coupon builds", async () => {
    await renderReadyApp();
    const downloads = mockDownloads();
    const fitTestButton = screen.getByTestId("download-fit-test-button");

    fireEvent.click(fitTestButton);

    // The coupon builds through the generation client, so the button shows
    // its busy state at once and stays disabled until the file is ready.
    expect(fitTestButton).toHaveProperty("disabled", true);
    expect(fitTestButton.textContent).toContain("Building fit test");
    await waitFor(() => expect(downloads.createUrl).toHaveBeenCalledOnce());
    await waitFor(() => expect(fitTestButton).toHaveProperty("disabled", false));
    expect(fitTestButton.textContent).toContain("Download fit test");
  });

  it("releases the fit-test geometry and clears busy state when a download fails", async () => {
    await renderReadyApp();
    const { BufferGeometry } = await import("three");
    const disposed = vi.spyOn(BufferGeometry.prototype, "dispose");
    const downloads = mockDownloads();
    downloads.createUrl.mockImplementation(() => {
      throw new Error("The browser refused the download.");
    });
    const button = screen.getByTestId("download-fit-test-button");
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("design-file-message").textContent)
        .toContain("The browser refused the download."),
    );
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button).toHaveProperty("disabled", false);
    expect(disposed).toHaveBeenCalledOnce();
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/);
    downloads.restore();
  });

  it("prefixes the fit-test download with the design name", async () => {
    await renderReadyApp();
    fireEvent.change(screen.getByTestId("design-name-input"), {
      target: { value: "Left bench" },
    });
    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("download-fit-test-button"));

    await waitFor(() => expect(downloads.createUrl).toHaveBeenCalledOnce());
    expect(downloads.downloadName()).toMatch(
      /^left-bench-drawerforge-fit-test-drawer-tray-299x199-[0-9a-f]{6}\.stl$/,
    );
  });

  it("blocks a stale download until a valid regeneration finishes", async () => {
    await renderReadyApp();
    const download = screen.getByTestId("download-stl-button");
    expect(download).toHaveProperty("disabled", false);

    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "235" },
    });
    expect(download).toHaveProperty("disabled", true);

    await waitFor(() => expect(download).toHaveProperty("disabled", false));
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/);
  });

  it("resets a preset design to the practical defaults", async () => {
    await renderReadyApp();
    fireEvent.click(screen.getByTestId("preset-tools"));
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "360",
    );

    fireEvent.change(screen.getByTestId("design-name-input"), {
      target: { value: "Temp name" },
    });
    fireEvent.click(screen.getByTestId("reset-defaults-button"));
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "300",
    );
    expect(screen.getByTestId("design-name-input")).toHaveProperty("value", "");
    expect(screen.getByTestId("design-file-message").textContent).toBe("");
    expect(screen.getByTestId("param-drawer-depth-number")).toHaveProperty(
      "value",
      "200",
    );
    expect(screen.getByTestId("param-rows-number")).toHaveProperty(
      "value",
      "2",
    );
    expect(screen.getByTestId("param-columns-number")).toHaveProperty(
      "value",
      "3",
    );
  });

  it("carries the design name in the document title, and restores it when the name is cleared", async () => {
    // jsdom's default document.title is "", which would make the restore
    // assertion below pass trivially even with no restore logic at all. Set
    // it to something else first, so the assertions below only pass if the
    // app actually sets and restores the title.
    document.title = "Some other page";
    await renderReadyApp();
    expect(document.title).toBe(drawerTray.copy.title);

    fireEvent.change(screen.getByTestId("design-name-input"), {
      target: { value: "Left bench" },
    });
    await waitFor(() => expect(document.title).toBe("Left bench · DrawerForge"));

    fireEvent.change(screen.getByTestId("design-name-input"), {
      target: { value: "  " },
    });
    await waitFor(() => expect(document.title).toBe(drawerTray.copy.title));
  });

  it("regenerates when a boolean or enum parameter changes", async () => {
    await renderReadyApp();
    const viewer = screen.getByTestId("model-viewer");
    const download = screen.getByTestId("download-stl-button");
    const originalKey = viewer.getAttribute("data-model-key");

    const scoop = screen.getByTestId("param-finger-scoop-toggle") as HTMLInputElement;
    expect(scoop.checked).toBe(true);
    fireEvent.click(scoop);
    expect(scoop.checked).toBe(false);
    expect(download).toHaveProperty("disabled", true);
    await waitFor(() =>
      expect(viewer.getAttribute("data-model-key")).not.toBe(originalKey),
    );
    await waitFor(() => expect(download).toHaveProperty("disabled", false));
    const scoopedKey = viewer.getAttribute("data-model-key");

    fireEvent.click(screen.getByTestId("param-mesh-quality-fine"));
    await waitFor(() =>
      expect(viewer.getAttribute("data-model-key")).not.toBe(scoopedKey),
    );
    await waitFor(() => expect(download).toHaveProperty("disabled", false));
    expect(
      (screen.getByTestId("param-mesh-quality-fine") as HTMLInputElement).checked,
    ).toBe(true);
    const custom = screen
      .getByTestId("preset-custom")
      .querySelector("input") as HTMLInputElement;
    expect(custom.checked).toBe(true);
  });

  it("settles on the last of several rapid edits without an error", async () => {
    await renderReadyApp();
    const viewer = screen.getByTestId("model-viewer");
    const depth = screen.getByTestId("param-drawer-depth-number");
    const download = screen.getByTestId("download-stl-button");

    // Each pause is longer than the 140 ms debounce, so a generation is in
    // flight when the next edit supersedes it.
    for (const value of ["210", "220", "230", "240", "250"]) {
      fireEvent.change(depth, { target: { value } });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await waitFor(() => expect(download).toHaveProperty("disabled", false), {
      timeout: 10_000,
    });
    expect(screen.getByTestId("preview-status").textContent).toMatch(
      /^ready: 299 × 249 × 50 mm/,
    );
    expect(viewer.getAttribute("data-model-key")).toContain("|250|");
  });

  it("shows the calculated result rows from the product definition", async () => {
    await renderReadyApp();
    expect(screen.getByTestId("derived-outside-dimensions").textContent).toBe(
      "299 × 199 × 50 mm",
    );
    expect(
      screen.getByTestId("derived-compartment-dimensions").textContent,
    ).toMatch(/^≈ /);
  });
});
