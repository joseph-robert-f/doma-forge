import { describe, expect, it } from "vitest";
import {
  DESIGN_FILE_FORMAT,
  createDesignFile,
  designFilename,
  designNameSlug,
  namedMeshFilename,
  normalizeDesignName,
  parseDesignFile,
  serializeDesignFile,
} from "../lib/design-file";
import { DRAWER_TRAY_ID } from "../lib/products/drawer-tray";
import { getProduct } from "../lib/products/registry";
import type { SurfaceTreatments } from "../lib/surface-patterns";

const drawerTray = getProduct(DRAWER_TRAY_ID);

const fixedNow = () => new Date("2026-09-02T12:00:00.000Z");

describe("design file export", () => {
  it("writes a versioned, normalized, millimeter design with a name", () => {
    const design = createDesignFile(
      drawerTray,
      { ...drawerTray.defaults, drawerWidth: "310.0004" as unknown as number },
      "  Workshop   drawer  ",
      fixedNow,
    );
    expect(design).toMatchObject({
      format: DESIGN_FILE_FORMAT,
      version: 3,
      units: "mm",
      productId: "drawer-tray",
      geometryVersion: drawerTray.geometryVersion,
      name: "Workshop drawer",
      createdAt: "2026-09-02T12:00:00.000Z",
    });
    expect(design.parameters.drawerWidth).toBe(310);
    expect(serializeDesignFile(design)).toMatch(/^\{\n {2}"format": "drawerforge-design",/);
    expect(serializeDesignFile(design).endsWith("\n")).toBe(true);
  });

  it("refuses to export an invalid design", () => {
    expect(() =>
      createDesignFile(drawerTray, { ...drawerTray.defaults, drawerWidth: 10 }, "x"),
    ).toThrow(/valid design/);
  });

  it("names the file from the design name, product, and signature hash", () => {
    const design = createDesignFile(drawerTray, drawerTray.defaults, "Left Bench (top)", fixedNow);
    expect(designFilename(design)).toMatch(
      /^left-bench-top-drawer-tray-[0-9a-f]{6}\.drawerforge\.json$/,
    );
    const unnamed = createDesignFile(drawerTray, drawerTray.defaults, "", fixedNow);
    expect(designFilename(unnamed)).toMatch(/^drawer-tray-[0-9a-f]{6}\.drawerforge\.json$/);
  });

  it("prefixes mesh filenames with the design name only when one exists", () => {
    expect(namedMeshFilename("Left bench", "drawerforge-x.stl")).toBe("left-bench-drawerforge-x.stl");
    expect(namedMeshFilename("   ", "drawerforge-x.stl")).toBe("drawerforge-x.stl");
    expect(namedMeshFilename("!!!", "drawerforge-x.stl")).toBe("drawerforge-x.stl");
  });

  it("normalizes and caps names", () => {
    expect(normalizeDesignName(42)).toBe("");
    expect(normalizeDesignName("a".repeat(80))).toHaveLength(60);
    expect(designNameSlug("Ünïcode & Symbols!")).toBe("unicode-symbols");
    expect(designNameSlug("a".repeat(39) + " b")).toBe("a".repeat(39));
    expect(designNameSlug("日本語")).toBe("");
  });
});

describe("design file import", () => {
  const good = serializeDesignFile(createDesignFile(drawerTray, drawerTray.defaults, "Round trip", fixedNow));
  function legacy(version: 1 | 2) {
    const data = JSON.parse(good);
    data.version = version;
    delete data.parameters.rowLayout;
    delete data.parameters.columnLayout;
    data.parameters.rows = 2;
    data.parameters.columns = 3;
    return data;
  }

  it("round-trips to the same signature", () => {
    const result = parseDesignFile(good);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.product.id).toBe("drawer-tray");
    expect(result.design.name).toBe("Round trip");
    expect(result.warnings).toEqual([]);
    expect(drawerTray.signature(result.design.parameters)).toBe(
      drawerTray.signature(drawerTray.normalize(drawerTray.defaults)),
    );
  });

  it("imports a v1 design with every surface solid", () => {
    const data = legacy(1);
    data.parameters.surfaceTreatments.enabled = true;
    data.parameters.surfaceTreatments.zones.floor.mode = "holes";
    const result = parseDesignFile(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.design.version).toBe(3);
    expect(result.design.parameters.rowLayout).toEqual({ mode: "even", count: 2 });
    expect(result.design.parameters.columnLayout).toEqual({ mode: "even", count: 3 });
    const treatment = result.design.parameters.surfaceTreatments as SurfaceTreatments;
    expect(treatment.enabled).toBe(false);
    expect(treatment.zones.floor.mode).toBe("solid");
  });

  it("rejects unknown v2 surface zones and modes before normalization", () => {
    const unknownZone = legacy(2);
    unknownZone.parameters.surfaceTreatments.zones.future = {
      mode: "holes", opening: 10, web: 2.4, margin: 6,
    };
    const zoneResult = parseDesignFile(JSON.stringify(unknownZone));
    expect(zoneResult.ok).toBe(false);
    if (!zoneResult.ok) expect(zoneResult.error).toMatch(/unknown surface zone: future/);

    const unknownMode = legacy(2);
    unknownMode.parameters.surfaceTreatments.zones.floor.mode = "magic";
    const modeResult = parseDesignFile(JSON.stringify(unknownMode));
    expect(modeResult.ok).toBe(false);
    if (!modeResult.ok) expect(modeResult.error).toMatch(/unknown Floor surface mode/);
  });

  it("round-trips a patterned v2 design", () => {
    const parameters = drawerTray.normalize({
      ...drawerTray.defaults,
      surfaceTreatments: {
        enabled: true,
        zones: { floor: { mode: "holes", opening: 10, web: 2.4, margin: 6 } },
      },
    });
    const design = createDesignFile(drawerTray, parameters, "Permeable", fixedNow);
    const legacyFile = JSON.parse(serializeDesignFile(design));
    legacyFile.version = 2;
    delete legacyFile.parameters.rowLayout;
    delete legacyFile.parameters.columnLayout;
    legacyFile.parameters.rows = 2;
    legacyFile.parameters.columns = 3;
    const imported = parseDesignFile(JSON.stringify(legacyFile));
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error("unreachable");
    expect((imported.design.parameters.surfaceTreatments as SurfaceTreatments).zones.floor.mode).toBe("holes");
    expect(drawerTray.signature(imported.design.parameters)).toBe(drawerTray.signature(parameters));
  });

  it("round-trips custom axes in v3 and rejects malformed custom arrays", () => {
    const parameters = drawerTray.normalize({
      ...drawerTray.defaults,
      columnLayout: { mode: "custom", fixedSizesMm: [60, 100] },
      rowLayout: { mode: "custom", fixedSizesMm: [70] },
    });
    const design = createDesignFile(drawerTray, parameters, "Measured", fixedNow);
    const imported = parseDesignFile(serializeDesignFile(design));
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error("unreachable");
    expect(imported.design.parameters.columnLayout).toEqual(parameters.columnLayout);
    expect(imported.design.parameters.rowLayout).toEqual(parameters.rowLayout);

    for (const fixedSizesMm of [null, [60, "wide"], [60, null], Array(8).fill(10)]) {
      const bad = JSON.parse(serializeDesignFile(design));
      bad.parameters.columnLayout = { mode: "custom", fixedSizesMm };
      const result = parseDesignFile(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/fixed sizes/);
    }
  });

  it("ignores unknown fields and unknown parameters", () => {
    const data = JSON.parse(good);
    data.extra = { nested: true };
    data.parameters.futureKnob = 99;
    const result = parseDesignFile(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect("futureKnob" in result.design.parameters).toBe(false);
  });

  it.each([
    ["not JSON", "{oops", /not valid JSON/],
    ["an array", "[]", /design object/],
    ["wrong format", JSON.stringify({ format: "other", version: 1 }), /file format/],
    ["wrong version", JSON.stringify({ format: DESIGN_FILE_FORMAT, version: 4 }), /version 4 is not supported/],
    ["wrong units", JSON.stringify({ format: DESIGN_FILE_FORMAT, version: 1, units: "in" }), /Only millimeters/],
    ["no product", JSON.stringify({ format: DESIGN_FILE_FORMAT, version: 1, units: "mm" }), /name a product/],
    [
      "unknown product",
      JSON.stringify({ format: DESIGN_FILE_FORMAT, version: 1, units: "mm", productId: "toaster", parameters: {} }),
      /no product named "toaster"/,
    ],
    [
      "no parameters",
      JSON.stringify({ format: DESIGN_FILE_FORMAT, version: 1, units: "mm", productId: "drawer-tray" }),
      /no parameters object/,
    ],
  ])("rejects %s with an actionable error", (_label, text, pattern) => {
    const result = parseDesignFile(text);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(pattern);
  });

  it("rejects a file with missing parameters instead of filling defaults", () => {
    const data = JSON.parse(good);
    delete data.parameters.rowLayout;
    delete data.parameters.fingerScoop;
    const result = parseDesignFile(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/missing required parameters:.*row layout.*finger scoop/);
  });

  it("reports a missing legacy row count instead of using the new default", () => {
    const data = legacy(2);
    delete data.parameters.rows;
    const result = parseDesignFile(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing required parameters: rows/);
  });

  it("rejects out-of-range values with the product's own message", () => {
    const data = JSON.parse(good);
    data.parameters.drawerWidth = 5000;
    const result = parseDesignFile(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/Drawer width must be between 80 and 600 mm/);
  });

  it("returns an error instead of throwing on values that cannot be converted", () => {
    const poisonedVersion = JSON.stringify({
      format: DESIGN_FILE_FORMAT,
      version: { toString: 1, valueOf: 2 },
    });
    const a = parseDesignFile(poisonedVersion);
    expect(a.ok).toBe(false);
    if (a.ok) throw new Error("unreachable");
    expect(a.error).toMatch(/version \{"toString":1,"valueOf":2\} is not supported/);

    const data = JSON.parse(good);
    data.parameters.drawerWidth = { valueOf: 1, toString: 2 };
    const b = parseDesignFile(JSON.stringify(data));
    expect(b.ok).toBe(false);
    if (b.ok) throw new Error("unreachable");
    expect(b.error).toMatch(/could not be read as a design/);
  });

  it("warns when the geometry version differs", () => {
    const newer = JSON.parse(good);
    newer.geometryVersion = 99;
    const older = JSON.parse(good);
    older.geometryVersion = 0;
    const a = parseDesignFile(JSON.stringify(newer));
    const b = parseDesignFile(JSON.stringify(older));
    expect(a.ok && a.warnings[0]).toMatch(/newer version/);
    expect(b.ok && b.warnings[0]).toMatch(/geometry has been updated/);
  });
});
