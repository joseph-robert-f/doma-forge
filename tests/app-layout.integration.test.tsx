/** @vitest-environment jsdom */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REMOTE_CADDY_ID } from "../lib/products/remote-caddy";
import { renderProductApp, mockDownloads, setupAppTest } from "./helpers/app";

describe("DrawerForge layout parameters", () => {
  setupAppTest();

  async function renderReadyCaddy() {
    const result = renderProductApp(REMOTE_CADDY_ID);
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
