/** @vitest-environment jsdom */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { drawerTray } from "../lib/products/drawer-tray";
import { readFileText } from "../lib/design-file";
import { LEGACY_DESIGN_KEY, WORKSPACE_KEY } from "../lib/workspace";
import { mockDownloads, renderReadyApp, setupAppTest } from "./helpers/app";

describe("DrawerForge workspace and design files", () => {
  setupAppTest();

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
});
