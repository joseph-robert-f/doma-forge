import { describe, expect, it } from "vitest";
import {
  DRAWER_TRAY_DEFAULTS as DEFAULT_PARAMETERS,
  deriveDimensions,
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
      rows: 2.6,
      columns: "4",
      meshQuality: "fine",
      fingerScoop: false,
    } as unknown as Record<string, unknown>);

    expect(normalized.drawerWidth).toBe(350.125);
    expect(normalized.rows).toBe(3);
    expect(normalized.columns).toBe(4);
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
      rows: 2,
      columns: 3,
    });
    const derived = deriveDimensions(parameters);

    expect(derived.outsideWidth).toBe(300);
    expect(derived.outsideDepth).toBe(200);
    expect(derived.outsideHeight).toBe(50);
    expect(derived.compartmentWidth).toBe(97.33333333333333);
    expect(derived.compartmentDepth).toBe(97);
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
                columns,
              });
              if (!validate(parameters).valid) continue;

              const derived = deriveDimensions(parameters);
              const scoop = getFingerScoopLayout(parameters);
              const selectedColumn = Math.floor((columns - 1) / 2);
              const left = -derived.outsideWidth / 2 + wallThickness +
                selectedColumn * (derived.compartmentWidth + dividerThickness);
              const right = left + derived.compartmentWidth;
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
      rows: 1,
      columns: 7,
    });
    expect(validate(parameters).valid).toBe(true);
    expect(deriveDimensions(parameters).compartmentWidth).toBe(10);
    expect(getFingerScoopLayout(parameters)).toEqual({ centerX: 0, radius: 3 });
  });

  it("moves the front-wall pattern keepout with an even-grid scoop", () => {
    const parameters = normalize({ ...DEFAULT_PARAMETERS, columns: 2 });
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
});

describe("parameter validation", () => {
  it.each([
    ["non-positive drawer", { drawerWidth: 0 }, "drawerWidth"],
    ["base consumes walls", { organizerHeight: 15, baseThickness: 12 }, "baseThickness"],
    ["radius exceeds bounds", { cornerRadius: 120 }, "cornerRadius"],
    ["too many columns", { drawerWidth: 80, columns: 8 }, "columns"],
    ["too many rows", { drawerDepth: 80, dividerThickness: 4, rows: 6 }, "rows"],
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
      columns: 7,
      rows: 1,
    });
    const result = validate(parameters);
    expect(deriveDimensions(parameters).compartmentWidth).toBe(10);
    expect(result.byField.columns).toBeUndefined();
  });

  it("rejects a compartment just below 10 mm", () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 85.9,
      clearancePerSide: 0,
      wallThickness: 2,
      dividerThickness: 2,
      columns: 7,
      rows: 1,
    });
    const result = validate(parameters);
    expect(deriveDimensions(parameters).compartmentWidth).toBeLessThan(10);
    expect(result.byField.columns?.join(" ")).toMatch(/at least 10 mm/i);
  });
});
