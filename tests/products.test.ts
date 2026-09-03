import { describe, expect, it } from "vitest";
import { drawerTray } from "../lib/products/drawer-tray";
import { PRODUCTS, getProduct } from "../lib/products/registry";
import { parameterSlug, shortHash } from "../lib/products/shared";

const FOOD_OR_HEALTH_WORDS =
  /\b(food|drink|kitchen|cutlery|knife|knives|spice|pantry|fridge|medicine|medical|pill)\b/i;

describe("product registry", () => {
  it("lists unique product ids and resolves them", () => {
    const ids = PRODUCTS.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of PRODUCTS) {
      expect(getProduct(product.id)).toBe(product);
    }
    expect(() => getProduct("missing")).toThrow(/unknown product/i);
  });

  describe.each(PRODUCTS.map((product) => [product.id, product] as const))(
    "%s",
    (_id, product) => {
      it("has valid defaults that normalize to themselves", () => {
        expect(product.validate(product.defaults).valid).toBe(true);
        expect(product.normalize(product.defaults)).toEqual(product.defaults);
      });

      it("has at least two valid presets with unique ids", () => {
        expect(product.presets.length).toBeGreaterThanOrEqual(2);
        const ids = product.presets.map((preset) => preset.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).not.toContain("custom");
        for (const preset of product.presets) {
          expect(product.validate(preset.parameters).valid).toBe(true);
        }
      });

      it("places every spec key in exactly one group", () => {
        const grouped = product.groups.flatMap((group) => group.keys);
        expect([...grouped].sort()).toEqual(Object.keys(product.specs).sort());
      });

      it("changes its signature when any parameter changes", () => {
        const base = product.signature(product.defaults);
        expect(base.startsWith(`${product.id}|g${product.geometryVersion}|`)).toBe(
          true,
        );
        for (const [key, spec] of Object.entries(product.specs)) {
          const changed = { ...product.defaults } as Record<string, unknown>;
          const current = changed[key];
          changed[key] =
            spec.kind === "number"
              ? (current as number) + spec.step
              : spec.kind === "boolean"
                ? !(current as boolean)
                : spec.kind === "layout"
                  ? (current as number[]).map((width, index) =>
                      index === 0 ? width + spec.step : width,
                    )
                  : spec.options.find((option) => option.value !== current)?.value;
          expect(product.signature(product.normalize(changed))).not.toBe(base);
        }
      });

      it("states coupon bounds whenever it builds a coupon", () => {
        expect(Boolean(product.couponBoundsContract)).toBe(Boolean(product.coupon));
        if (!product.couponBoundsContract) return;
        const contract = product.couponBoundsContract(product.defaults);
        for (let axis = 0; axis < 3; axis += 1) {
          expect(contract.max[axis]).toBeGreaterThan(contract.min[axis]);
        }
      });

      it("keeps a bounds contract with min below max on every axis", () => {
        const contract = product.boundsContract(product.defaults);
        for (let axis = 0; axis < 3; axis += 1) {
          expect(contract.max[axis]).toBeGreaterThan(contract.min[axis]);
        }
        expect(contract.tolerance).toBeGreaterThan(0);
      });

      it("carries a page title and description for its route metadata", () => {
        expect(typeof product.copy.title).toBe("string");
        expect(product.copy.title.trim().length).toBeGreaterThan(0);
        expect(typeof product.copy.description).toBe("string");
        expect(product.copy.description.trim().length).toBeGreaterThan(0);
      });

      it("does not refer to food or health uses", () => {
        const text = JSON.stringify({
          label: product.label,
          copy: product.copy,
          presets: product.presets.map((preset) => [preset.label, preset.description]),
          groups: product.groups.map((group) => [group.title, group.description]),
        });
        expect(text).not.toMatch(FOOD_OR_HEALTH_WORDS);
      });
    },
  );
});

describe("drawer tray product", () => {
  it("ships exactly the expected presets in order", () => {
    expect(drawerTray.presets.map((preset) => preset.id)).toEqual([
      "tools",
      "desk-supplies",
      "hardware",
    ]);
  });

  it("reports a cleared integer field as both missing and non-integer", () => {
    const result = drawerTray.validate({ ...drawerTray.defaults, rows: Number.NaN });
    expect(result.byField.rows).toEqual([
      "Rows must be a number.",
      "Rows must be a whole number.",
    ]);
  });

  it("rejects an unknown enum or non-boolean value that skipped normalization", () => {
    const result = drawerTray.validate({
      ...drawerTray.defaults,
      meshQuality: "ultra" as never,
      fingerScoop: "yes" as never,
    });
    expect(result.byField.meshQuality?.[0]).toMatch(/one of Draft, Standard, Fine/);
    expect(result.byField.fingerScoop?.[0]).toMatch(/on or off/);
  });

  it("creates a deterministic, locale-independent filename", () => {
    const parameters = drawerTray.normalize({
      ...drawerTray.defaults,
      drawerWidth: 300.5,
      drawerDepth: 200,
      organizerHeight: 47.5,
      rows: 2,
      columns: 3,
    });
    expect(drawerTray.filename(parameters)).toBe(
      "drawerforge-drawer-tray-299p5x199x47p5-2x3-d2bd1f.stl",
    );
  });

  it("gives a different filename to designs with equal outside size", () => {
    const thin = drawerTray.normalize({ ...drawerTray.defaults, wallThickness: 1.6 });
    const thick = drawerTray.normalize({ ...drawerTray.defaults, wallThickness: 2.4 });
    expect(drawerTray.filename(thin)).not.toBe(drawerTray.filename(thick));
    expect(drawerTray.filename(thin)).toMatch(
      /^drawerforge-drawer-tray-299x199x50-2x3-[0-9a-f]{6}\.stl$/,
    );
  });

  it("falls back to defaults for unknown enum values", () => {
    const normalized = drawerTray.normalize({ meshQuality: "ultra", fingerScoop: "yes" });
    expect(normalized.meshQuality).toBe("standard");
    expect(normalized.fingerScoop).toBe(true);
  });
});

describe("shared helpers", () => {
  it("derives kebab-case slugs from parameter keys", () => {
    expect(parameterSlug("drawerWidth")).toBe("drawer-width");
    expect(parameterSlug("clearancePerSide")).toBe("clearance-per-side");
    expect(parameterSlug("rows")).toBe("rows");
  });

  it("hashes deterministically to six hex characters", () => {
    expect(shortHash("abc")).toMatch(/^[0-9a-f]{6}$/);
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
  });
});
