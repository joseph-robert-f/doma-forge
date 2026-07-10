/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawerForgeApp } from "../app/components/DrawerForgeApp";

vi.mock("../app/components/DrawerViewer", () => ({
  DrawerViewer: ({
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

async function renderReadyApp() {
  const result = render(<DrawerForgeApp />);
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
    fireEvent.click(screen.getByTestId("preset-cutlery"));

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
  });

  it("downloads a nonempty binary STL from the current preview", async () => {
    await renderReadyApp();
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:drawerforge-test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    let downloadName = "";
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
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

    fireEvent.click(screen.getByTestId("download-stl-button"));

    expect(createUrl).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(84);
    expect(downloadName).toBe("drawerforge-299x199x50-2x3.stl");
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
    fireEvent.click(screen.getByTestId("preset-cutlery"));
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "360",
    );

    fireEvent.click(screen.getByTestId("reset-defaults-button"));
    expect(screen.getByTestId("param-drawer-width-number")).toHaveProperty(
      "value",
      "300",
    );
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

  it("persists and restores the latest valid design", async () => {
    const first = await renderReadyApp();
    fireEvent.change(screen.getByTestId("param-drawer-depth-number"), {
      target: { value: "245" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    );
    await waitFor(() => {
      const stored = window.localStorage.getItem("drawerforge-design-v1") ?? "";
      expect(stored).toContain('"drawerDepth":245');
    });
    first.unmount();

    await renderReadyApp();
    expect(screen.getByTestId("param-drawer-depth-number")).toHaveProperty(
      "value",
      "245",
    );
  });
});
