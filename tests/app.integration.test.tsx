/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAWER_TRAY_ID, drawerTray } from "../lib/products/drawer-tray";
import { REMOTE_CADDY_ID } from "../lib/products/remote-caddy";
import { readFileText } from "../lib/design-file";
import { LEGACY_DESIGN_KEY, WORKSPACE_KEY } from "../lib/workspace";
import { ProductApp } from "../app/components/ProductApp";

vi.mock("../app/components/ModelViewer", () => ({
  ModelViewer: ({
    modelKey,
    status,
    statusDetail,
  }: {
    modelKey: string;
    status: string;
    statusDetail?: string;
  }) => (
    <section data-testid="model-viewer" data-model-key={modelKey}>
      <span data-testid="preview-status">
        {status}: {statusDetail}
      </span>
    </section>
  ),
}));

/** Captures anchor downloads: the blob handed to createObjectURL and the file name. */
function mockDownloads() {
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:drawerforge-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  let downloadName = "";
  const originalCreateElement = document.createElement.bind(document);
  const createElement = vi
    .spyOn(document, "createElement")
    .mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "download", {
          get: () => downloadName,
          set: (value: string) => {
            downloadName = value;
          },
          configurable: true,
        });
      }
      return element;
    });
  return {
    createUrl,
    lastBlob: () => createUrl.mock.calls.at(-1)?.[0] as Blob,
    downloadName: () => downloadName,
    restore: () => createElement.mockRestore(),
  };
}

async function renderReadyApp() {
  const result = render(<ProductApp productId={DRAWER_TRAY_ID} />);
  await waitFor(() =>
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
  );
  return result;
}

describe("DrawerForge app integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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
      /^drawerforge-fit-test-299x199-[0-9a-f]{6}\.stl$/,
    );
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
      /^left-bench-drawerforge-fit-test-299x199-[0-9a-f]{6}\.stl$/,
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

  it("ignores a saved design that belongs to another product", async () => {
    window.localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 2,
        updatedAt: "",
        designs: {
          "some-other-product": {
            productId: "some-other-product",
            geometryVersion: 1,
            name: "Other",
            parameters: { drawerWidth: 400 },
            updatedAt: "",
          },
        },
      }),
    );
    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "300",
    );
    // This product's own save keeps the other product's entry.
    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "210" },
    });
    await waitFor(() => {
      const envelope = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "{}");
      expect(envelope.designs["drawer-tray"]?.parameters?.drawerDepth).toBe(210);
      expect(envelope.designs["some-other-product"]?.name).toBe("Other");
    });
  });

  it("ignores a drawer-tray entry that names another product", async () => {
    window.localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 2,
        updatedAt: "",
        designs: {
          "drawer-tray": {
            productId: "some-other-product",
            geometryVersion: 1,
            name: "Wrong",
            parameters: { ...drawerTray.defaults, drawerWidth: 400 },
            updatedAt: "",
          },
        },
      }),
    );
    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty("value", "300");
    expect(screen.getByTestId("design-name-input")).toHaveProperty("value", "");
  });

  it("saves a design file and reopens it after storage is cleared", async () => {
    const first = await renderReadyApp();
    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "245" },
    });
    fireEvent.change(screen.getByTestId("design-name-input"), {
      target: { value: "Left bench" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("model-viewer").getAttribute("data-model-key")).toContain("|245|"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("download-stl-button")).toHaveProperty("disabled", false),
    );
    const savedKey = screen.getByTestId("model-viewer").getAttribute("data-model-key");

    const downloads = mockDownloads();

    fireEvent.click(screen.getByTestId("save-design-button"));
    expect(downloads.downloadName()).toMatch(/^left-bench-drawer-tray-[0-9a-f]{6}\.drawerforge\.json$/);
    const text = await readFileText(downloads.lastBlob());
    const design = JSON.parse(text);
    expect(design).toMatchObject({
      format: "drawerforge-design",
      version: 1,
      units: "mm",
      productId: "drawer-tray",
      name: "Left bench",
    });
    expect(design.parameters.drawerDepth).toBe(245);
    expect(screen.getByTestId("design-file-message").textContent).toMatch(/Saved "Left bench"/);

    // STL downloads carry the design name too.
    fireEvent.click(screen.getByTestId("download-stl-button"));
    expect(downloads.downloadName()).toMatch(/^left-bench-drawerforge-drawer-tray-299x244x50-2x3-[0-9a-f]{6}\.stl$/);
    downloads.restore();

    first.unmount();
    window.localStorage.clear();

    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-depth-number")).toHaveProperty("value", "200");
    const file = new File([text], "left-bench.drawerforge.json", { type: "application/json" });
    fireEvent.change(screen.getByTestId("open-design-input"), { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByTestId("param-drawer-depth-number")).toHaveProperty("value", "245"),
    );
    expect(screen.getByTestId("design-name-input")).toHaveProperty("value", "Left bench");
    expect(screen.getByTestId("design-file-message").textContent).toMatch(/Loaded "Left bench"/);
    const custom = screen.getByTestId("preset-custom").querySelector("input") as HTMLInputElement;
    expect(custom.checked).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("model-viewer").getAttribute("data-model-key")).toBe(savedKey),
    );
  });

  it("keeps the current design when an invalid file is opened", async () => {
    await renderReadyApp();
    const viewer = screen.getByTestId("model-viewer");
    const key = viewer.getAttribute("data-model-key");

    const wrongVersion = new File(
      [JSON.stringify({ format: "drawerforge-design", version: 7, units: "mm" })],
      "old.drawerforge.json",
      { type: "application/json" },
    );
    fireEvent.change(screen.getByTestId("open-design-input"), { target: { files: [wrongVersion] } });
    await waitFor(() =>
      expect(screen.getByTestId("design-file-message").textContent).toMatch(
        /old\.drawerforge\.json: Design file version 7 is not supported/,
      ),
    );
    expect(screen.getByTestId("design-file-message").getAttribute("data-tone")).toBe("error");
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty("value", "300");
    expect(viewer.getAttribute("data-model-key")).toBe(key);
    expect(screen.getByTestId("download-stl-button")).toHaveProperty("disabled", false);
  });

  it("persists a renamed design without a geometry edit", async () => {
    const first = await renderReadyApp();
    fireEvent.change(screen.getByTestId("design-name-input"), {
      target: { value: "Vanity top" },
    });
    await waitFor(() =>
      expect(window.localStorage.getItem(WORKSPACE_KEY) ?? "").toContain('"name":"Vanity top"'),
    );
    first.unmount();
    await renderReadyApp();
    expect(screen.getByTestId("design-name-input")).toHaveProperty("value", "Vanity top");
  });

  it("migrates a version 1 record on first load and marks it in place", async () => {
    const legacy = JSON.stringify({
      version: 1,
      productId: "drawer-tray",
      name: "From v1",
      parameters: { ...drawerTray.defaults, drawerDepth: 260, columns: 4 },
    });
    window.localStorage.setItem(LEGACY_DESIGN_KEY, legacy);

    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-depth-number")).toHaveProperty("value", "260");
    expect(screen.getByTestId("param-columns-number")).toHaveProperty("value", "4");
    expect(screen.getByTestId("design-name-input")).toHaveProperty("value", "From v1");
    await waitFor(() => {
      const envelope = window.localStorage.getItem(WORKSPACE_KEY) ?? "";
      expect(envelope).toContain('"drawerDepth":260');
      expect(envelope).toContain('"name":"From v1"');
    });
    const marked = JSON.parse(window.localStorage.getItem(LEGACY_DESIGN_KEY) ?? "{}");
    expect(marked).toMatchObject({ ...JSON.parse(legacy), migratedTo: WORKSPACE_KEY });
  });

  it("starts from defaults when the workspace is corrupt", async () => {
    window.localStorage.setItem(WORKSPACE_KEY, "{corrupt");
    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty("value", "300");
    await waitFor(() =>
      expect(window.localStorage.getItem(WORKSPACE_KEY) ?? "").toContain('"format":"drawerforge-workspace"'),
    );
  });

  it("persists and restores the latest valid design", async () => {
    const first = await renderReadyApp();
    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "245" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );
    await waitFor(() => {
      const stored = window.localStorage.getItem(WORKSPACE_KEY) ?? "";
      expect(stored).toContain('"drawerDepth":245');
      expect(stored).toContain('"productId":"drawer-tray"');
      expect(stored).toContain('"format":"drawerforge-workspace"');
    });
    first.unmount();

    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-depth-number")).toHaveProperty(
      "value",
      "245",
    );
  });

  describe("printer profile", () => {
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
        /^drawerforge-fit-test-299p5x199-[0-9a-f]{6}-cx0p5\.stl$/,
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
      // The coupon is modeled 299.5 mm wide. It printed 299.4 mm.
      expect(screen.getByTestId("calibration-proposal").textContent).toContain(
        "Expected width 299.5 mm",
      );
      const apply = screen.getByTestId("calibration-apply");
      expect(apply).toHaveProperty("disabled", true);

      fireEvent.change(screen.getByTestId("calibration-measured-x"), {
        target: { value: "299.4" },
      });
      expect(screen.getByTestId("calibration-proposal").textContent).toContain(
        "New X correction 0.6 mm = existing 0.5 mm + expected 299.5 mm − measured 299.4 mm",
      );
      expect(apply).toHaveProperty("disabled", false);

      fireEvent.click(apply);
      expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0.6");
      expect(screen.getByTestId("calibration-measured-x")).toHaveProperty("value", "");
      expect(apply).toHaveProperty("disabled", true);

      // A second Apply cannot double the correction: the measurement is gone.
      fireEvent.click(apply);
      expect(screen.getByTestId("printer-correction-x")).toHaveProperty("value", "0.6");
      await waitFor(() =>
        expect(screen.getAllByTestId("compensation-note")[0].textContent).toContain(
          "Modeled 299.6 mm = target 299 mm + 0.6 mm correction",
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
          version: 2,
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
      // The wall is an error, so it is not on the warning surface, and no
      // profile is saved yet, so the bed rule is silent.
      expect(screen.queryAllByTestId("printer-warning")).toHaveLength(0);

      fireEvent.change(screen.getByTestId("printer-nozzle"), {
        target: { value: "0.4" },
      });
      expect(download).toHaveProperty("disabled", false);
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

  describe("layout parameter", () => {
    async function renderReadyCaddy() {
      const result = render(<ProductApp productId={REMOTE_CADDY_ID} />);
      await waitFor(() =>
        expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
      );
      return result;
    }

    it("rebuilds the preview and renames the download when a well width changes", async () => {
      await renderReadyCaddy();
      const viewer = screen.getByTestId("model-viewer");
      const firstKey = viewer.getAttribute("data-model-key");
      const downloads = mockDownloads();

      fireEvent.click(screen.getByTestId("download-stl-button"));
      const firstName = downloads.downloadName();
      expect(firstName).toMatch(
        /^drawerforge-remote-caddy-220x130x60-3w-[0-9a-f]{6}\.stl$/,
      );

      // Well 2 is narrower by 10 mm, so the solved well 3 is wider by 10 mm.
      expect(screen.getByTestId("param-well-widths-well-2")).toHaveProperty(
        "value",
        "70",
      );
      fireEvent.change(screen.getByTestId("param-well-widths-well-2"), {
        target: { value: "60" },
      });

      await waitFor(() =>
        expect(viewer.getAttribute("data-model-key")).not.toBe(firstKey),
      );
      await waitFor(() =>
        expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
      );
      expect(screen.getByTestId("derived-well-widths").textContent).toContain(
        "70 \u00d7 60 \u00d7 82 mm",
      );

      fireEvent.click(screen.getByTestId("download-stl-button"));
      const secondName = downloads.downloadName();
      expect(secondName).toMatch(
        /^drawerforge-remote-caddy-220x130x60-3w-[0-9a-f]{6}\.stl$/,
      );
      expect(secondName).not.toBe(firstName);
      downloads.restore();
    });

    it("adds and removes a well, and reports a layout that does not fit", async () => {
      await renderReadyCaddy();
      expect(screen.queryByTestId("param-well-widths-well-4")).toBeNull();
      // The last well is solved, so its input shows the result and is read-only.
      const solved = screen.getByTestId("param-well-widths-well-3") as HTMLInputElement;
      expect(solved).toHaveProperty("value", "72");
      expect(solved.readOnly).toBe(true);
      expect((screen.getByTestId("param-well-widths-well-1") as HTMLInputElement).readOnly).toBe(
        false,
      );

      // Two narrow wells leave room in the caddy for a fourth well.
      fireEvent.change(screen.getByTestId("param-well-widths-well-1"), {
        target: { value: "50" },
      });
      fireEvent.change(screen.getByTestId("param-well-widths-well-2"), {
        target: { value: "50" },
      });
      expect(screen.getByTestId("param-well-widths-well-3")).toHaveProperty("value", "112");

      // A new well goes in front of the solved well, and the solved well
      // gives up the width the new well and its divider take.
      fireEvent.click(screen.getByTestId("param-well-widths-add-well"));
      expect(screen.getByTestId("param-well-widths-well-3")).toHaveProperty("value", "50");
      expect(screen.getByTestId("param-well-widths-well-4")).toHaveProperty("value", "60");
      await waitFor(() =>
        expect(screen.getByTestId("derived-well-widths").textContent).toContain(
          "50 \u00d7 50 \u00d7 50 \u00d7 60 mm",
        ),
      );
      await waitFor(() =>
        expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
      );

      // A wider well 3 leaves too little for the solved well 4.
      fireEvent.change(screen.getByTestId("param-well-widths-well-3"), {
        target: { value: "90" },
      });
      await waitFor(() =>
        expect(screen.getByTestId("param-well-widths-error").textContent).toBe(
          "Well 4 is solved to 20 mm, and every well must be at least 25 mm wide. Shrink well 3 by 5 mm, remove a well, or make the caddy 5 mm wider.",
        ),
      );
      expect(screen.getByTestId("download-stl-button")).toHaveProperty(
        "disabled",
        true,
      );
      await waitFor(() =>
        expect(screen.getByTestId("preview-status").textContent).toMatch(/^paused:/),
      );

      // Remove takes the well in front of the solved well, so the solved
      // well takes its width back and the layout fits again.
      fireEvent.click(screen.getByTestId("param-well-widths-remove-well"));
      expect(screen.queryByTestId("param-well-widths-well-4")).toBeNull();
      expect(screen.getByTestId("param-well-widths-well-3")).toHaveProperty("value", "112");
      await waitFor(() =>
        expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
      );
      expect(screen.queryByTestId("param-well-widths-error")).toBeNull();
      expect(screen.getByTestId("download-stl-button")).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("names the field and the fix when a printer correction breaks the solved well", async () => {
      await renderReadyCaddy();
      // 216 mm inside leaves the solved well exactly at its 25 mm minimum.
      fireEvent.change(screen.getByTestId("param-well-widths-well-1"), {
        target: { value: "100" },
      });
      fireEvent.change(screen.getByTestId("param-well-widths-well-2"), {
        target: { value: "87" },
      });
      await waitFor(() =>
        expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
      );

      fireEvent.click(screen.getByTestId("printer-section-toggle"));
      fireEvent.change(screen.getByTestId("printer-correction-x"), {
        target: { value: "-1" },
      });

      // The correction takes a millimeter off the inside width, and the
      // solved well carries all of it.
      await waitFor(() =>
        expect(screen.getByTestId("validation-summary").textContent).toContain(
          "Well 3 is solved to 24 mm",
        ),
      );
      expect(screen.getByTestId("validation-summary").textContent).toContain(
        "Lower the correction, or change the value.",
      );
      expect(screen.getByTestId("download-stl-button")).toHaveProperty(
        "disabled",
        true,
      );
    });
  });
});
