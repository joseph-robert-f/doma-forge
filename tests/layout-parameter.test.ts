import { describe, expect, it } from "vitest";
import {
  createDesignFile,
  parseDesignFile,
  serializeDesignFile,
} from "../lib/design-file";
import {
  IssueCollector,
  normalizeFromSpecs,
  normalizeLayout,
  signatureFromSpecs,
  validateAgainstSpecs,
} from "../lib/products/shared";
import type {
  AnyParameters,
  AnyProduct,
  LayoutSpec,
  NumberSpec,
  ParametersOf,
} from "../lib/products/types";

/**
 * The layout parameter kind is the first non-scalar parameter. These cases
 * pin the shared behaviour: normalization, range validation, the signature,
 * and the design file round trip. They use a small spec record of their own,
 * so they hold even if every product changes. See
 * 22_FAMILY_A_EXTENSIONS_NOTES.md, decision D-1401.
 */

const WELL_WIDTHS: LayoutSpec = {
  kind: "layout",
  label: "Well widths",
  shortLabel: "Wells",
  description: "The last well is solved from the inside width.",
  minCount: 2,
  maxCount: 5,
  min: 25,
  max: 300,
  step: 0.5,
  unit: "mm",
  newValue: 60,
};

const SPECS = {
  caddyWidth: {
    kind: "number",
    label: "Caddy width",
    shortLabel: "Width",
    min: 60,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  wellWidths: WELL_WIDTHS,
} as const;

type TestParameters = ParametersOf<typeof SPECS>;

const DEFAULTS: TestParameters = {
  caddyWidth: 200,
  wellWidths: [60, 60, 60],
};

const normalize = (input: unknown) => normalizeFromSpecs(SPECS, DEFAULTS, input);

function validate(parameters: TestParameters) {
  const collector = new IssueCollector<keyof typeof SPECS & string>();
  validateAgainstSpecs(SPECS, parameters, collector);
  return collector.result();
}

const signature = (parameters: TestParameters) =>
  signatureFromSpecs("test-product", 1, SPECS, parameters);

describe("layout parameter normalization", () => {
  it("keeps a valid list of widths", () => {
    expect(normalize({ wellWidths: [40, 55, 40] }).wellWidths).toEqual([40, 55, 40]);
  });

  it("converts strings to numbers and rounds to 0.001", () => {
    expect(normalize({ wellWidths: ["40", "55.5", "60.00049"] }).wellWidths).toEqual([
      40, 55.5, 60,
    ]);
  });

  it("turns an empty field into NaN so the user can type again", () => {
    const widths = normalize({ wellWidths: [40, "", 60] }).wellWidths;
    expect(widths[0]).toBe(40);
    expect(Number.isNaN(widths[1])).toBe(true);
    expect(widths[2]).toBe(60);
  });

  it("keeps a negative width for validation to report", () => {
    expect(normalize({ wellWidths: [-5, 60, 60] }).wellWidths).toEqual([-5, 60, 60]);
    expect(validate(normalize({ wellWidths: [-5, 60, 60] })).byField.wellWidths).toEqual([
      "Well 1 must be between 25 and 300 mm.",
    ]);
  });

  it("cuts a list with too many wells to the maximum count", () => {
    expect(normalize({ wellWidths: [30, 31, 32, 33, 34, 35, 36] }).wellWidths).toEqual([
      30, 31, 32, 33, 34,
    ]);
  });

  it("fills a list with too few wells up to the minimum count", () => {
    expect(normalize({ wellWidths: [] }).wellWidths).toEqual([60, 60]);
    expect(normalize({ wellWidths: [42] }).wellWidths).toEqual([42, 60]);
  });

  it("falls back to the default list for a value that is not an array", () => {
    for (const value of [null, undefined, 40, "40,50", { "0": 40 }, true]) {
      expect(normalize({ wellWidths: value }).wellWidths).toEqual([60, 60, 60]);
    }
  });

  it("never shares an array with the defaults", () => {
    const first = normalize({});
    const second = normalize({ caddyWidth: 210 });
    first.wellWidths[0] = 999;
    expect(DEFAULTS.wellWidths).toEqual([60, 60, 60]);
    expect(second.wellWidths).toEqual([60, 60, 60]);
    expect(normalize(DEFAULTS)).toEqual(DEFAULTS);
  });

  it("normalizes a value that is not a number inside the list", () => {
    const widths = normalize({ wellWidths: [{}, [], 60] }).wellWidths;
    expect(Number.isNaN(widths[0])).toBe(true);
    expect(widths[1]).toBe(0);
    expect(widths[2]).toBe(60);
  });

  it("copies a list through normalizeLayout without touching the source", () => {
    const source = [30, 40];
    const copied = normalizeLayout(WELL_WIDTHS, source, []);
    copied[0] = 99;
    expect(source).toEqual([30, 40]);
  });
});

describe("layout parameter validation", () => {
  it("accepts a list inside the count and the width range", () => {
    expect(validate(normalize({ wellWidths: [25, 300] })).valid).toBe(true);
  });

  it("rejects a list with too few or too many wells, naming the counts", () => {
    const short = validate({ ...DEFAULTS, wellWidths: [60] });
    expect(short.byField.wellWidths).toEqual(["Wells must hold between 2 and 5 wells."]);
    const long = validate({ ...DEFAULTS, wellWidths: [60, 60, 60, 60, 60, 60] });
    expect(long.byField.wellWidths).toEqual(["Wells must hold between 2 and 5 wells."]);
  });

  it("names the well that is out of range or cleared", () => {
    expect(validate({ ...DEFAULTS, wellWidths: [60, 400, 60] }).byField.wellWidths).toEqual([
      "Well 2 must be between 25 and 300 mm.",
    ]);
    expect(
      validate({ ...DEFAULTS, wellWidths: [60, 60, Number.NaN] }).byField.wellWidths,
    ).toEqual(["Well 3 must be a number."]);
  });

  it("rejects a value that is not a list at all", () => {
    const result = validate({ ...DEFAULTS, wellWidths: 60 as never });
    expect(result.byField.wellWidths).toEqual(["Well widths must be a list of numbers."]);
  });
});

describe("layout parameter signature", () => {
  it("serializes the list deterministically", () => {
    expect(signature(normalize({ wellWidths: [40, 55.5, 60] }))).toBe(
      "test-product|g1|200|[40,55.5,60]",
    );
    expect(signature(normalize(DEFAULTS))).toBe(signature(normalize(DEFAULTS)));
  });

  it("changes when a width changes, when a well is added, and when wells swap", () => {
    const base = signature(normalize({ wellWidths: [40, 55, 60] }));
    expect(signature(normalize({ wellWidths: [40, 56, 60] }))).not.toBe(base);
    expect(signature(normalize({ wellWidths: [40, 55, 60, 60] }))).not.toBe(base);
    expect(signature(normalize({ wellWidths: [55, 40, 60] }))).not.toBe(base);
  });

  it("does not depend on the order of the keys in the input", () => {
    const first = signature(normalize({ caddyWidth: 210, wellWidths: [40, 55] }));
    const second = signature(normalize({ wellWidths: [40, 55], caddyWidth: 210 }));
    expect(first).toBe(second);
  });
});

/** A product with one layout parameter, for the design file round trip. */
const layoutProduct = {
  id: "layout-test-product",
  geometryVersion: 1,
  label: "Layout test product",
  specs: SPECS,
  defaults: DEFAULTS,
  normalize: (input: unknown) => normalize(input) as unknown as AnyParameters,
  validate: (parameters: AnyParameters) =>
    validate(parameters as unknown as TestParameters),
  signature: (parameters: AnyParameters) =>
    signature(parameters as unknown as TestParameters),
} as unknown as AnyProduct;

const resolve = (id: string) => {
  if (id !== layoutProduct.id) throw new Error(`Unknown product: ${id}`);
  return layoutProduct;
};

describe("layout parameter design file round trip", () => {
  it("writes the list to the file and reads back the same widths", () => {
    const parameters = layoutProduct.normalize({
      caddyWidth: 210,
      wellWidths: [40, 55.5, 60],
    });
    const design = createDesignFile(
      layoutProduct,
      parameters,
      "Living room caddy",
      () => new Date("2026-09-02T12:00:00.000Z"),
    );
    const text = serializeDesignFile(design);
    expect(JSON.parse(text).parameters.wellWidths).toEqual([40, 55.5, 60]);

    const imported = parseDesignFile(text, resolve);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.design.parameters.wellWidths).toEqual([40, 55.5, 60]);
    expect(layoutProduct.signature(imported.design.parameters)).toBe(
      layoutProduct.signature(parameters),
    );
  });

  it("reads a file whose widths are written as strings", () => {
    const text = JSON.stringify({
      format: "drawerforge-design",
      version: 1,
      name: "Strings",
      units: "mm",
      productId: layoutProduct.id,
      geometryVersion: 1,
      createdAt: "2026-09-02T12:00:00.000Z",
      parameters: { caddyWidth: "200", wellWidths: ["40", "55"] },
    });
    const imported = parseDesignFile(text, resolve);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.design.parameters.wellWidths).toEqual([40, 55]);
  });

  it("refuses a file whose layout value is out of range, and names the well", () => {
    const text = JSON.stringify({
      format: "drawerforge-design",
      version: 1,
      name: "Too small",
      units: "mm",
      productId: layoutProduct.id,
      geometryVersion: 1,
      createdAt: "2026-09-02T12:00:00.000Z",
      parameters: { caddyWidth: 200, wellWidths: [10, 55] },
    });
    const imported = parseDesignFile(text, resolve);
    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error).toMatch(/Well 1 must be between 25 and 300 mm/);
  });

  it("refuses a file with no layout parameter at all", () => {
    const text = JSON.stringify({
      format: "drawerforge-design",
      version: 1,
      name: "Missing",
      units: "mm",
      productId: layoutProduct.id,
      geometryVersion: 1,
      createdAt: "2026-09-02T12:00:00.000Z",
      parameters: { caddyWidth: 200 },
    });
    const imported = parseDesignFile(text, resolve);
    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error).toMatch(/missing required parameters: well widths/);
  });
});
