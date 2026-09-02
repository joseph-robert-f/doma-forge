import { describe, expect, it } from "vitest";
import {
  DRAWER_TRAY_DEFAULTS as DEFAULT_PARAMETERS,
  deriveDimensions,
  drawerTray,
} from "../lib/products/drawer-tray";

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
