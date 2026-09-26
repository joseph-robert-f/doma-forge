import { describe, expect, it } from "vitest";
import { compensate, PRINTER_PROFILE_DEFAULTS } from "../lib/printer-profile";
import {
  DRAWER_TRAY_DEFAULTS as DEFAULT_PARAMETERS,
  deriveDimensions,
  deriveTrayLayout,
  drawerTray,
} from "../lib/products/drawer-tray";
import {
  FINGER_SCOOP_SIDE_CLEARANCE,
  getFingerScoopLayout,
  drawerTraySurfaceZones,
} from "../lib/products/drawer-tray/surface-zones";

const { normalize, validate } = drawerTray;

describe("parameter normalization and derivation", () => {
  it("coerces persisted values into one canonical parameter model", () => {
    const normalized = normalize({
      drawerWidth: "350.125",
      rowLayout: { mode: "even", count: 2.6 },
      columnLayout: { mode: "even", count: "4" },
      meshQuality: "fine",
      fingerScoop: false,
    } as unknown as Record<string, unknown>);

    expect(normalized.drawerWidth).toBe(350.125);
    expect(normalized.rowLayout).toEqual({ mode: "even", count: 3 });
    expect(normalized.columnLayout).toEqual({ mode: "even", count: 4 });
    expect(normalized.meshQuality).toBe("fine");
    expect(normalized.fingerScoop).toBe(false);
    expect(normalized.baseThickness).toBe(DEFAULT_PARAMETERS.baseThickness);
  });

  it("derives outside and compartment dimensions", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 302,
      drawerDepth: 202,
      clearancePerSide: 1,
      wallThickness: 2,
      dividerThickness: 2,
      rowLayout: { mode: "even", count: 2 },
      columnLayout: { mode: "even", count: 3 },
    });
    const derived = deriveDimensions(parameters);

    expect(derived.outsideWidth).toBe(300);
    expect(derived.outsideDepth).toBe(200);
    expect(derived.outsideHeight).toBe(50);
    expect(derived.compartmentWidth).toBe(97.33333333333333);
    expect(derived.compartmentDepth).toBe(97);
  });

  it("solves the final measured row and column from the remaining interior", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      columnLayout: { mode: "custom", fixedSizesMm: [60, 100] },
      rowLayout: { mode: "custom", fixedSizesMm: [70] },
    });
    const layout = deriveTrayLayout(parameters);
    expect(layout.insideWidth).toBe(295);
    expect(layout.insideDepth).toBe(195);
    expect(layout.columns.sizesMm).toEqual([60, 100, 131]);
    expect(layout.rows.sizesMm).toEqual([70, 123]);
    expect(layout.columns.dividerCenters).toEqual([-86.5, 15.5]);
    expect(layout.rows.dividerCenters).toEqual([-26.5]);
    expect(validate(parameters).valid).toBe(true);
  });

  it("keeps fixed measured sizes under printer compensation and adjusts only the remaining cell", () => {
    const target = normalize({
      ...DEFAULT_PARAMETERS,
      columnLayout: { mode: "custom", fixedSizesMm: [60, 100] },
      rowLayout: { mode: "custom", fixedSizesMm: [70] },
    });
    const corrected = compensate(target, {
      ...PRINTER_PROFILE_DEFAULTS,
      correctionX: 0.6,
      correctionY: -0.3,
    }, drawerTray.compensable);
    const before = deriveTrayLayout(target);
    const after = deriveTrayLayout(corrected);
    expect(after.columns.sizesMm.slice(0, -1)).toEqual([60, 100]);
    expect(after.rows.sizesMm.slice(0, -1)).toEqual([70]);
    expect(after.columns.sizesMm[2] - before.columns.sizesMm[2]).toBeCloseTo(0.6, 6);
    expect(after.rows.sizesMm[1] - before.rows.sizesMm[1]).toBeCloseTo(-0.3, 6);
  });

  it("rounds tiny numeric input without replacing it with a default", () => {
    const normalized = normalize({
      ...DEFAULT_PARAMETERS,
      clearancePerSide: 0.0001,
    });
    expect(normalized.clearancePerSide).toBe(0);
  });
});

describe("front finger scoop placement", () => {
  it("stays inside a central front compartment across valid grid widths", () => {
    for (const drawerWidth of [80, 86, 98, 120, 300, 600]) {
      for (const clearancePerSide of [0, 5]) {
        for (const wallThickness of [1.2, 2, 6]) {
          for (const dividerThickness of [1.2, 2, 6]) {
            for (let columns = 1; columns <= 8; columns += 1) {
              const parameters = normalize({
                ...DEFAULT_PARAMETERS,
                drawerWidth,
                clearancePerSide,
                wallThickness,
                dividerThickness,
                columnLayout: { mode: "even", count: columns },
              });
              if (!validate(parameters).valid) continue;

              const layout = deriveTrayLayout(parameters);
              const scoop = getFingerScoopLayout(parameters);
              const selectedColumn = Math.floor((columns - 1) / 2);
              const { start: left, end: right } = layout.columns.spans[selectedColumn];
              expect(scoop.centerX - scoop.radius).toBeGreaterThanOrEqual(
                left + FINGER_SCOOP_SIDE_CLEARANCE - 1e-8,
              );
              expect(scoop.centerX + scoop.radius).toBeLessThanOrEqual(
                right - FINGER_SCOOP_SIDE_CLEARANCE + 1e-8,
              );
              if (columns % 2 === 1) expect(scoop.centerX).toBeCloseTo(0, 8);
              else expect(scoop.centerX).toBeLessThan(0);
            }
          }
        }
      }
    }
  });

  it("shrinks the radius to 3 mm in a valid 10 mm front compartment", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 86,
      clearancePerSide: 0,
      wallThickness: 2,
      dividerThickness: 2,
      rowLayout: { mode: "even", count: 1 },
      columnLayout: { mode: "even", count: 7 },
    });
    expect(validate(parameters).valid).toBe(true);
    expect(deriveDimensions(parameters).compartmentWidth).toBe(10);
    expect(getFingerScoopLayout(parameters)).toEqual({ centerX: 0, radius: 3 });
  });

  it("moves the front-wall pattern keepout with an even-grid scoop", () => {
    const parameters = normalize({ ...DEFAULT_PARAMETERS, columnLayout: { mode: "even", count: 2 } });
    const scoop = getFingerScoopLayout(parameters);
    const front = drawerTraySurfaceZones(parameters).find(
      (zone) => zone.kind === "plane" && zone.id === "walls" &&
        zone.axis === "y" && zone.center < 0,
    );
    if (!front || front.kind !== "plane") throw new Error("Front wall zone missing");
    expect(front.keepouts?.find((keepout) => keepout.kind === "circle")).toEqual({
      kind: "circle",
      center: [scoop.centerX, parameters.organizerHeight],
      radius: scoop.radius + FINGER_SCOOP_SIDE_CLEARANCE,
    });
  });

  it("keeps an off-center custom scoop inside the front cell containing zero", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      columnLayout: { mode: "custom", fixedSizesMm: [130, 10] },
    });
    const selected = deriveTrayLayout(parameters).columns.spans[2];
    const scoop = getFingerScoopLayout(parameters);
    expect(selected.start).toBe(-3.5);
    expect(scoop.centerX).toBeGreaterThan(0);
    expect(scoop.centerX - scoop.radius).toBeGreaterThanOrEqual(selected.start + FINGER_SCOOP_SIDE_CLEARANCE);
    expect(scoop.centerX + scoop.radius).toBeLessThanOrEqual(selected.end - FINGER_SCOOP_SIDE_CLEARANCE);
  });
});

describe("parameter validation", () => {
  it.each([
    ["non-positive drawer", { drawerWidth: 0 }, "drawerWidth"],
    ["base consumes walls", { organizerHeight: 15, baseThickness: 12 }, "baseThickness"],
    ["radius exceeds bounds", { cornerRadius: 120 }, "cornerRadius"],
    ["too many columns", { drawerWidth: 80, columnLayout: { mode: "even", count: 8 } }, "columnLayout"],
    ["too many rows", { drawerDepth: 80, dividerThickness: 4, rowLayout: { mode: "even", count: 6 } }, "rowLayout"],
  ])("rejects %s", (_label, changes, expectedField) => {
    const result = validate(
      normalize({ ...DEFAULT_PARAMETERS, ...changes }),
    );
    expect(result.valid).toBe(false);
    expect(result.byField[expectedField as keyof typeof result.byField]).toBeTruthy();
  });

  it("accepts a compartment that is exactly 10 mm wide", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 86,
      clearancePerSide: 0,
      wallThickness: 2,
      dividerThickness: 2,
      columnLayout: { mode: "even", count: 7 },
      rowLayout: { mode: "even", count: 1 },
    });
    const result = validate(parameters);
    expect(deriveDimensions(parameters).compartmentWidth).toBe(10);
    expect(result.byField.columnLayout).toBeUndefined();
  });

  it("rejects a compartment just below 10 mm", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 85.9,
      clearancePerSide: 0,
      wallThickness: 2,
      dividerThickness: 2,
      columnLayout: { mode: "even", count: 7 },
      rowLayout: { mode: "even", count: 1 },
    });
    const result = validate(parameters);
    expect(deriveDimensions(parameters).compartmentWidth).toBeLessThan(10);
    expect(result.byField.columnLayout?.join(" ")).toMatch(/at least 10 mm/i);
  });

  it("names a too-small fixed and remaining custom compartment", () => {
    const fixed = normalize({
      ...DEFAULT_PARAMETERS,
      columnLayout: { mode: "custom", fixedSizesMm: [9.9] },
    });
    expect(validate(fixed).byField.columnLayout?.join(" ")).toMatch(/Column 1.*at least 10 mm/i);
    const remaining = normalize({
      ...DEFAULT_PARAMETERS,
      columnLayout: { mode: "custom", fixedSizesMm: [285.1] },
    });
    expect(validate(remaining).byField.columnLayout?.join(" ")).toMatch(/Column 2.*at least 10 mm/i);
  });

  it.each([
    ["front-left", 10, 10, 1, 1],
    ["front-right", 283, 10, 1, 2],
    ["back-left", 10, 183, 2, 1],
    ["back-right", 283, 183, 2, 2],
  ] as const)("rejects a disappearing %s corner cell", (corner, firstColumn, firstRow, row, column) => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      cornerRadius: 40,
      columnLayout: { mode: "custom", fixedSizesMm: [firstColumn] },
      rowLayout: { mode: "custom", fixedSizesMm: [firstRow] },
    });
    const result = validate(parameters);
    const location = new RegExp(`${corner} corner \\(Row ${row}, Column ${column}\\)`);
    expect(result.valid).toBe(false);
    expect(result.byField.rowLayout?.join(" ")).toMatch(location);
    expect(result.byField.columnLayout?.join(" ")).toMatch(/10 × 10 mm floor area/);
  });

  it("accepts a nearby corner cell with a 10 mm square inside the rounded cavity", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      cornerRadius: 40,
      columnLayout: { mode: "custom", fixedSizesMm: [22] },
      rowLayout: { mode: "custom", fixedSizesMm: [22] },
    });
    expect(validate(parameters).valid).toBe(true);
  });

  it("rejects a corrupt huge count without allocating a huge grid", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      columnLayout: { mode: "even", count: 1e9 },
    });
    expect(deriveTrayLayout(parameters).columns.spans).toHaveLength(8);
    expect(validate(parameters).byField.columnLayout).toBeTruthy();
  });
});
