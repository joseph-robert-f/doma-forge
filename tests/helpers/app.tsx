import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { DRAWER_TRAY_ID } from "../../lib/products/drawer-tray";
import { ProductApp } from "../../app/components/ProductApp";

vi.mock("../../app/components/ModelViewer", () => ({
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
export function mockDownloads() {
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

export async function renderReadyApp() {
  const result = renderProductApp(DRAWER_TRAY_ID);
  await waitFor(() =>
    expect(screen.getByTestId("preview-status").textContent).toMatch(/^ready:/),
  );
  return result;
}

export function renderProductApp(productId: string) {
  return render(<ProductApp productId={productId} />);
}

export function setupAppTest() {
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
}
