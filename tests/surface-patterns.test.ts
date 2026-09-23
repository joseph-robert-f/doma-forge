import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../lib/products/registry";
import {
  normalizeSurfaceTreatments,
  surfaceTreatmentIssues,
  type SurfaceTreatments,
} from "../lib/surface-patterns";

describe("catalogue surface settings", () => {
  it("declares stable, unique zones on all 15 products and keeps defaults solid", () => {
    expect(PRODUCTS).toHaveLength(15);
    for (const product of PRODUCTS) {
      const spec = product.specs.surfaceTreatments;
      expect(spec?.kind, product.id).toBe("surfaceTreatments");
      if (spec.kind !== "surfaceTreatments") continue;
      expect(spec.zones.length, product.id).toBeGreaterThan(0);
      const ids = spec.zones.map((zone) => zone.id);
      expect(new Set(ids).size, product.id).toBe(ids.length);
      const defaults = product.defaults.surfaceTreatments as SurfaceTreatments;
      expect(defaults.enabled, product.id).toBe(false);
      expect(Object.keys(defaults.zones), product.id).toEqual(ids);
      for (const id of ids) expect(defaults.zones[id].mode).toBe("solid");
      expect(product.groups.flatMap((group) => group.keys).filter((key) => key === "surfaceTreatments")).toHaveLength(1);
    }
  });

  it("copies nested settings, ignores unknown zones, and changes signatures when a zone changes", () => {
    for (const product of PRODUCTS) {
      const spec = product.specs.surfaceTreatments;
      if (spec.kind !== "surfaceTreatments") throw new Error(product.id);
      const base = product.defaults.surfaceTreatments as SurfaceTreatments;
      const first = spec.zones[0].id;
      const normalized = product.normalize({
        ...product.defaults,
        surfaceTreatments: {
          enabled: true,
          zones: {
            [first]: { mode: "holes", opening: "12.0004", web: 2.4, margin: 6 },
            unknown: { mode: "mesh", opening: 2, web: 1, margin: 1 },
          },
        },
      });
      const selected = normalized.surfaceTreatments as SurfaceTreatments;
      expect(selected.zones[first]).toEqual({ mode: "holes", opening: 12, web: 2.4, margin: 6 });
      expect("unknown" in selected.zones).toBe(false);
      expect(selected.zones[first]).not.toBe(base.zones[first]);
      expect(product.signature(normalized)).not.toBe(product.signature(product.defaults));
      selected.zones[first].web = 4;
      expect(base.zones[first].web).toBe(2.4);
    }
  });

  it("requires printable webs with the selected nozzle and rejects invalid dimensions", () => {
    const product = PRODUCTS[0];
    const spec = product.specs.surfaceTreatments;
    if (spec.kind !== "surfaceTreatments") throw new Error("Missing surface spec");
    const floor = spec.zones[0].id;
    const setting = normalizeSurfaceTreatments(spec, {
      enabled: true,
      zones: { [floor]: { mode: "mesh", opening: 12, web: 0.7, margin: 6 } },
    });
    expect(surfaceTreatmentIssues(spec, setting)).toEqual(
      expect.arrayContaining([expect.stringMatching(/web must be between/)]),
    );
    setting.zones[floor].web = 1.2;
    expect(surfaceTreatmentIssues(spec, setting, 0.8)).toEqual(
      expect.arrayContaining([expect.stringMatching(/at least 1.6 mm/)]),
    );
    expect(surfaceTreatmentIssues(spec, setting, 0.4)).toEqual([]);
  });
});
