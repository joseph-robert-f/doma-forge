/** @vitest-environment jsdom */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockDownloads, renderProductApp, setupAppTest } from "./helpers/app";

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("permeable surface user flow", () => {
  setupAppTest();

  it("regenerates the preview and exports the patterned STL selected in the controls", async () => {
    renderProductApp("drawer-tray");
    await waitFor(() =>
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
    { timeout: 180_000 });
    const downloads = mockDownloads();
    const solidKey = screen.getByTestId("model-viewer").getAttribute("data-model-key");
    fireEvent.click(screen.getByTestId("download-stl-button"));
    const solidStl = await readBytes(downloads.lastBlob());
    const solidTriangles = new DataView(solidStl).getUint32(80, true);

    fireEvent.click(screen.getByTestId("param-surface-treatments-toggle"));
    expect(screen.getByTestId("param-surface-treatments-floor-holes"))
      .toHaveProperty("checked", true);
    await waitFor(() => {
      expect(screen.getByTestId("model-viewer").getAttribute("data-model-key"))
        .not.toBe(solidKey);
      expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/);
      expect(screen.getByTestId("download-stl-button")).toHaveProperty("disabled", false);
    }, { timeout: 180_000 });

    fireEvent.click(screen.getByTestId("download-stl-button"));
    const patternedStl = await readBytes(downloads.lastBlob());
    const patternedTriangles = new DataView(patternedStl).getUint32(80, true);
    expect(patternedTriangles).toBeGreaterThan(solidTriangles);
    expect(patternedStl.byteLength).toBe(84 + patternedTriangles * 50);
    downloads.restore();
  }, 420_000);
});
