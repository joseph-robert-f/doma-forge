import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../lib/products/registry";
import {
  suggestSurfacePattern,
  surfaceAvailability,
} from "../lib/surface-availability";
import type { SurfaceZone } from "../lib/surface-pattern-plan";
import type { SurfaceTreatments } from "../lib/surface-patterns";

describe("surface pattern availability", () => {
  it("finds an actual printable opening when the checkbox is enabled on every default product", () => {
    expect(PRODUCTS).toHaveLength(15);
    for (const product of PRODUCTS) {
      const spec = product.specs.surfaceTreatments;
      expect(spec?.kind, product.id).toBe("surfaceTreatments");
      expect(product.surfaceZones, product.id).toBeDefined();
      if (spec.kind !== "surfaceTreatments" || !product.surfaceZones) continue;

      const defaults = product.normalize(product.defaults);
      expect(product.validate(defaults).valid, product.id).toBe(true);
      const zones = product.surfaceZones(defaults);
      const declared = new Set(spec.zones.map((zone) => zone.id));
      expect(zones.length, product.id).toBeGreaterThan(0);
      for (const zone of zones) expect(declared.has(zone.id), `${product.id}: ${zone.id}`).toBe(true);
      const suggestion = suggestSurfacePattern(spec, zones);
      expect(suggestion, product.id).not.toBeNull();
      if (!suggestion) continue;
      const defaultTreatments = defaults.surfaceTreatments as SurfaceTreatments;
      const treatments: SurfaceTreatments = {
        enabled: true,
        zones: { ...defaultTreatments.zones, [suggestion.zoneId]: suggestion.setting },
      };
      expect(product.validate({ ...defaults, surfaceTreatments: treatments }).valid, product.id).toBe(true);
      const availability = surfaceAvailability(treatments, zones);
      expect(availability.unavailable, product.id).toEqual({});
      expect(availability.openingCount, product.id).toBeGreaterThan(0);
    }
  });

  it("reports a reason before generation when no opening can fit", () => {
    const zones: SurfaceZone[] = [{
      kind: "plane", id: "base", axis: "z", center: 1.5,
      u: [0, 10], v: [0, 10], thickness: 3,
    }];
    const result = surfaceAvailability({
      enabled: true,
      zones: { base: { mode: "holes", opening: 12, web: 2.4, margin: 6 } },
    }, zones);
    expect(result.unavailable.base).toMatch(/No base pattern fits/);
    expect(result.openingCount).toBe(0);
  });

  it("explains when an optional surface is not part of the selected product", () => {
    const result = surfaceAvailability({
      enabled: true,
      zones: { shelf: { mode: "holes", opening: 8, web: 2, margin: 4 } },
    }, []);
    expect(result.unavailable.shelf).toMatch(/not present with these options/);
  });

  it("enforces the combined opening limit across independently planned zones", () => {
    const zones: SurfaceZone[] = ["left", "right"].map((id) => ({
      kind: "plane", id, axis: "z", center: 1.5,
      u: [0, 70], v: [0, 70], thickness: 3,
    }));
    const setting = { mode: "holes" as const, opening: 2, web: 0.8, margin: 1 };
    const result = surfaceAvailability({
      enabled: true,
      zones: { left: setting, right: setting },
    }, zones);
    expect(result.unavailable.left).toMatch(/800 opening limit/);
    expect(result.unavailable.right).toMatch(/800 opening limit/);
  });
});
