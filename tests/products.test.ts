import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawerTray } from "../lib/products/drawer-tray";
import {
  GEOMETRY_LOADERS,
  loadGeometry,
  type ProductGeometry,
} from "../lib/products/geometry-registry";
import { PRODUCTS, getProduct } from "../lib/products/registry";
import { parameterSlug, shortHash } from "../lib/products/shared";
import { wallLikeKeys, wallsFromSpecs } from "../lib/printer-profile";

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
        expect(
          base.startsWith(`${product.id}|g${product.geometryVersion}|`),
        ).toBe(true);
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
                  : spec.kind === "surfaceTreatments"
                    ? { ...(current as { enabled: boolean }), enabled: !(current as { enabled: boolean }).enabled }
                  : spec.options.find((option) => option.value !== current)
                      ?.value;
          expect(product.signature(product.normalize(changed))).not.toBe(base);
        }
      });

      it("states coupon bounds whenever it builds a coupon", () => {
        expect(Boolean(product.couponBoundsContract)).toBe(
          Boolean(product.coupon),
        );
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
          presets: product.presets.map((preset) => [
            preset.label,
            preset.description,
          ]),
          groups: product.groups.map((group) => [
            group.title,
            group.description,
          ]),
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
    const result = drawerTray.validate({
      ...drawerTray.defaults,
      rows: Number.NaN,
    });
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
    expect(result.byField.meshQuality?.[0]).toMatch(
      /one of Draft, Standard, Fine/,
    );
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
      "drawerforge-drawer-tray-299p5x199x47p5-2x3-8f3b69.stl",
    );
  });

  it("gives a different filename to designs with equal outside size", () => {
    const thin = drawerTray.normalize({
      ...drawerTray.defaults,
      wallThickness: 1.6,
    });
    const thick = drawerTray.normalize({
      ...drawerTray.defaults,
      wallThickness: 2.4,
    });
    expect(drawerTray.filename(thin)).not.toBe(drawerTray.filename(thick));
    expect(drawerTray.filename(thin)).toMatch(
      /^drawerforge-drawer-tray-299x199x50-2x3-[0-9a-f]{6}\.stl$/,
    );
  });

  it("falls back to defaults for unknown enum values", () => {
    const normalized = drawerTray.normalize({
      meshQuality: "ultra",
      fingerScoop: "yes",
    });
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

describe("printed walls", () => {
  it.each(PRODUCTS.map((product) => [product.id, product] as const))(
    "%s reports finite, labeled, positive walls for its defaults and presets",
    (_id, product) => {
      const parameterSets = [
        product.defaults,
        ...product.presets.map((preset) => preset.parameters),
      ];
      for (const parameters of parameterSets) {
        const walls = product.printedWalls
          ? product.printedWalls(parameters)
          : wallsFromSpecs(product.specs, parameters);
        expect(walls.length).toBeGreaterThan(0);
        const keys = new Set<string>();
        for (const wall of walls) {
          expect(wall.key).not.toBe("");
          expect(wall.label).not.toBe("");
          expect(
            Number.isFinite(wall.value) && wall.value > 0,
            `${wall.key} = ${wall.value}`,
          ).toBe(true);
          expect(keys.has(wall.key), `duplicate key ${wall.key}`).toBe(false);
          keys.add(wall.key);
        }
        // Explicit reports describe the actual printed features and may
        // omit heuristic matches such as a wall height. Products without
        // an override must still report every wall-like parameter.
        if (!product.printedWalls) {
          for (const key of wallLikeKeys(product.specs)) {
            expect(keys.has(key), `${key} missing`).toBe(true);
          }
        }
      }
    },
  );

  it("does not throw for a cleared field", () => {
    for (const product of PRODUCTS) {
      if (!product.printedWalls) continue;
      const firstNumber = Object.keys(product.specs).find(
        (key) => product.specs[key].kind === "number",
      );
      if (!firstNumber) continue;
      const cleared = { ...product.defaults, [firstNumber]: Number.NaN };
      expect(() => product.printedWalls?.(cleared)).not.toThrow();
    }
  });
});

describe("print context in validation", () => {
  const small = { bed: { x: 150, y: 150, z: 150 }, nozzleDiameter: 0.4 };
  const unsaved = { bed: null, nozzleDiameter: 0.4 };

  it.each(PRODUCTS.map((product) => [product.id, product] as const))(
    "%s validates the same with an unsaved profile as with none",
    (_id, product) => {
      for (const parameters of [product.defaults, ...product.presets.map((p) => p.parameters)]) {
        expect(product.validate(parameters, unsaved)).toEqual(product.validate(parameters));
      }
    },
  );

  it("refuses exactly the pots and the tall riser on a 150 mm bed, and nothing else", () => {
    const refused: string[] = [];
    for (const product of PRODUCTS) {
      const sets = [["defaults", product.defaults] as const, ...product.presets.map((p) => [p.id, p.parameters] as const)];
      for (const [name, parameters] of sets) {
        const before = product.validate(parameters).valid;
        const after = product.validate(parameters, small);
        if (before && !after.valid) {
          refused.push(`${product.id}/${name}`);
          for (const issue of after.issues) expect(issue.message).toMatch(/150 mm/);
        }
        if (!before) expect(after.valid).toBe(false);
      }
    }
    expect(refused).toEqual([
      "plant-saucer/defaults",
      "plant-saucer/medium-pot",
      "plant-saucer/large-pot",
      "plant-pot/defaults",
      "plant-pot/desk-pot",
      "plant-pot/deep-pot",
      "shelf-riser/boot-riser",
    ]);
  });
});

describe("geometry loaders", () => {
  it("lists one lazy loader per registered product, in catalog order", () => {
    expect(Object.keys(GEOMETRY_LOADERS)).toEqual(
      PRODUCTS.map((product) => product.id),
    );
  });

  it("offers a coupon builder exactly where the product offers a coupon", async () => {
    for (const product of PRODUCTS) {
      const geometry = await loadGeometry(product.id);
      expect(Boolean(geometry.coupon), product.id).toBe(
        Boolean(product.coupon),
      );
      expect(typeof geometry.generate).toBe("function");
    }
  });

  it("rejects an unknown product id and does not read prototype keys", async () => {
    await expect(loadGeometry("missing")).rejects.toThrow(
      "Unknown product: missing",
    );
    await expect(loadGeometry("toString")).rejects.toThrow(
      "Unknown product: toString",
    );
  });

  it("forgets a loader that failed, so the next request tries again", async () => {
    let attempts = 0;
    const table = GEOMETRY_LOADERS as Record<
      string,
      () => Promise<ProductGeometry>
    >;
    // A fresh key nothing else in the suite loads, so the assertion does not
    // depend on whether an earlier test already populated the cache for a
    // real product id.
    const key = "review-eviction";
    table[key] = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("chunk load failed");
      return { generate: async () => { throw new Error("unused"); } };
    };
    try {
      await expect(loadGeometry(key)).rejects.toThrow("chunk load failed");
      await expect(loadGeometry(key)).resolves.toBeTruthy();
      expect(attempts).toBe(2);
    } finally {
      delete table[key];
    }
  });

  it("returns the same geometry module on a second load", async () => {
    const first = await loadGeometry(drawerTray.id);
    const second = await loadGeometry(drawerTray.id);
    expect(second).toBe(first);
  });
});

/**
 * The page and the worker import every product definition. Only the
 * geometry module of a product, loaded on demand, may reach the kernel's
 * solid builders. This test reads the source of each definition-side module
 * and fails on a value import of a builder module or of the product's own
 * geometry, so the chunk layout cannot regress silently.
 */
describe("definition modules stay free of solid builders", () => {
  const BUILDER_MODULES =
    /kernel\/(arrays|lightening|legs|brackets|revolve|shell|profiles|manifold)"/;
  const DEFINITION_FILES = [
    "index.ts",
    "schema.ts",
    "validate.ts",
    "copy.ts",
    "presets.ts",
  ];
  const productsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../lib/products",
  );

  it.each(PRODUCTS.map((product) => product.id))("%s", (id) => {
    for (const name of DEFINITION_FILES) {
      const file = path.join(productsDir, id, name);
      if (!existsSync(file)) continue;
      const source = readFileSync(file, "utf8");
      const valueImports = source
        .split("\n")
        .filter(
          (line) =>
            /^import (?!type )/.test(line) ||
            /^export (?!type )/.test(line) ||
            /^} from /.test(line),
        )
        .join("\n");
      expect(
        valueImports,
        `${id}/${name} imports a builder module`,
      ).not.toMatch(BUILDER_MODULES);
      expect(
        valueImports,
        `${id}/${name} imports its geometry statically`,
      ).not.toMatch(/from "\.\/(geometry|coupon)"/);
    }
  });
});

/**
 * The check above only reads a fixed list of file names per product
 * directory, so it cannot see a leak through `lib/products/registry.ts`,
 * `lib/products/shared.ts`, `lib/products/geometry-registry.ts`, `app/`
 * code, or a definition-side file a later sprint adds under a new name.
 * This test instead walks the real static import graph the page and the
 * worker build from, starting at the modules that hold the whole catalog,
 * and fails if that graph ever reaches a builder module. A dynamic
 * `import()` (how each product's geometry loader actually reaches a
 * builder) is not a static edge, so it is not followed; a type-only
 * `import type` / `export type` statement carries no runtime module, so it
 * is skipped too.
 */
describe("the static import graph from the page and the worker stays free of solid builders", () => {
  const BUILDER_MODULES = new Set([
    "lib/kernel/arrays.ts",
    "lib/kernel/lightening.ts",
    "lib/kernel/legs.ts",
    "lib/kernel/brackets.ts",
    "lib/kernel/revolve.ts",
    "lib/kernel/shell.ts",
    "lib/kernel/profiles.ts",
    "lib/kernel/manifold.ts",
  ]);
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  // The route files Next.js uses to render the page are entry points too:
  // a leak reachable only through one of them would otherwise walk right
  // past this test. They are listed without an existence filter so that a
  // renamed route fails this test loudly instead of dropping out of it.
  const ROUTE_FILES = [
    "app/layout.tsx",
    "app/not-found.tsx",
    "app/page.tsx",
    "app/products/[id]/page.tsx",
  ];

  const ENTRY_FILES = [
    "lib/products/registry.ts",
    "lib/generation/protocol.ts",
    "lib/generation/generation.worker.ts",
    "app/components/ProductApp.tsx",
    ...ROUTE_FILES,
  ];

  /**
   * Static `import`/`export ... from` specifiers, skipping type-only
   * statements. A bare side-effect import, `import "./x"`, has no `from`
   * and is collected by the second pattern so it is followed or reported
   * like any other.
   */
  function staticSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    const pattern = /^(?:import|export)\s+([^;]*?)\bfrom\s*["']([^"']+)["']/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const [, body, specifier] = match;
      if (/^type\b/.test(body.trim())) continue; // whole-statement type import/export
      specifiers.push(specifier);
    }
    const bare = /^import\s*["']([^"']+)["']/gm;
    while ((match = bare.exec(source))) specifiers.push(match[1]);
    return specifiers;
  }

  /**
   * Resolves a relative specifier from `fromFile` to a repo-relative path, or
   * undefined if it cannot be found on disk. A specifier can name a compiled
   * `.js` file that on disk is still a `.ts`/`.tsx` source file (the emitted
   * extension a bundler like Vite rewrites at build time), so a `.js`
   * specifier also tries swapping in those two extensions before giving up.
   */
  function resolveRelative(
    fromFile: string,
    specifier: string,
  ): string | undefined {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
    if (specifier.endsWith(".js")) {
      const withoutJs = base.slice(0, -3);
      candidates.push(`${withoutJs}.ts`, `${withoutJs}.tsx`);
    }
    for (const candidate of candidates) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return undefined;
  }

  it("never reaches lib/kernel/{arrays,lightening,legs,brackets,revolve,shell,profiles,manifold}.ts", () => {
    const visited = new Set<string>();
    const queue = ENTRY_FILES.map((relative) => path.join(repoRoot, relative));
    const reached: string[] = [];
    // A relative specifier this walk cannot resolve is not proof the graph
    // is clean; it is a gap the walk cannot see through. Anything left here
    // at the end fails the test alongside a reached builder, named, so a
    // rename or an unconventional specifier is caught instead of silently
    // skipped.
    const unresolved: string[] = [];

    while (queue.length > 0) {
      const file = queue.shift();
      if (!file || visited.has(file)) continue;
      visited.add(file);
      const repoRelative = path.relative(repoRoot, file).split(path.sep).join("/");
      if (BUILDER_MODULES.has(repoRelative)) {
        reached.push(repoRelative);
        continue;
      }
      const source = readFileSync(file, "utf8");
      for (const specifier of staticSpecifiers(source)) {
        if (!specifier.startsWith(".")) continue; // skip packages and node: builtins
        const resolved = resolveRelative(file, specifier);
        if (!resolved) {
          unresolved.push(`${repoRelative} -> ${specifier}`);
          continue;
        }
        if (!visited.has(resolved)) queue.push(resolved);
      }
    }

    expect(reached, `builder module(s) reachable: ${reached.join(", ")}`).toEqual([]);
    expect(
      unresolved,
      `relative specifier(s) the walk could not resolve: ${unresolved.join(", ")}`,
    ).toEqual([]);
  });
});
