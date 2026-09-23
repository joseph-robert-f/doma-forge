import { describe, expect, it } from "vitest";
import { getProduct } from "../lib/products/registry";
import type { AnyParameters } from "../lib/products/types";
import type { SurfaceMode, SurfaceTreatments } from "../lib/surface-patterns";
import { analyzeBufferGeometry, modelToBufferGeometry } from "../lib/three-geometry";
import { assertBinaryStlRoundTrip } from "./helpers/product-contract";
import { closedEdgeCounts, connectedComponentCount } from "./helpers/mesh-checks";

interface Case {
  product: string;
  surface: string;
  changes?: Record<string, unknown>;
  opening?: number;
  web?: number;
  margin?: number;
}

// Compact arrays legitimately have no room for a 12 mm opening. These
// fixtures expose spare material without relaxing any product load rules.
const CASES: Case[] = [
  { product: "socket-tray", surface: "base", changes: { lightenUnderside: false } },
  { product: "marker-cup-block", surface: "base", changes: {
    blockWidth: 180, blockDepth: 130, cupsPerRow: 3, lightenUnderside: false,
  } },
  { product: "battery-organizer", surface: "base", changes: {
    organizerWidth: 180, organizerDepth: 130, rows: 2, cellsPerRow: 3,
    lightenUnderside: false,
  } },
  { product: "tool-fin-rack", surface: "base", changes: { rackWidth: 220, finCount: 4 } },
  { product: "card-holder", surface: "base", changes: {
    holderWidth: 220, holderDepth: 80, slotCount: 6,
  } },
  { product: "wall-hook-rail", surface: "plate" },
  { product: "wall-hook-rail", surface: "shelf", changes: {
    keyShelf: true, railHeight: 100,
  } },
  { product: "headphone-mount", surface: "plate" },
  { product: "headphone-mount", surface: "pocket", opening: 4, web: 0.8, margin: 0.8 },
  { product: "shelf-riser", surface: "deck", changes: { lightenDeck: false } },
];

function parametersFor(
  fixture: Case,
  mode: SurfaceMode,
): AnyParameters {
  const product = getProduct(fixture.product);
  const raw = product.normalize({ ...product.defaults, ...fixture.changes });
  const current = raw.surfaceTreatments as SurfaceTreatments;
  return product.normalize({
    ...raw,
    surfaceTreatments: {
      enabled: mode !== "solid",
      zones: {
        ...current.zones,
        [fixture.surface]: {
          mode,
          opening: fixture.opening ?? 8,
          web: fixture.web ?? 2,
          margin: fixture.margin ?? 4,
        },
      },
    },
  });
}

describe("patterned structural surfaces", () => {
  it.each(CASES)("cuts $surface on $product without changing its functional frame", async (fixture) => {
    const product = getProduct(fixture.product);
    const solidParameters = parametersFor(fixture, "solid");
    expect(product.validate(solidParameters).valid).toBe(true);
    const solid = await product.generate(solidParameters);

    for (const mode of ["holes", "mesh"] as const) {
      const parameters = parametersFor(fixture, mode);
      const context = `${fixture.product}/${fixture.surface}/${mode}`;
      expect(product.normalize(parameters), context).toEqual(parameters);
      expect(product.validate(parameters).issues, context).toEqual([]);
      const patterned = await product.generate(parameters);
      expect(patterned.status, context).toBe("NoError");
      expect(patterned.parameters, context).toEqual(parameters);
      expect(patterned.volume, context).toBeLessThan(solid.volume - 0.1);
      const bounds = product.boundsContract(parameters);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(Math.abs(patterned.bounds[0][axis] - bounds.min[axis]), context)
          .toBeLessThanOrEqual(bounds.tolerance);
        expect(Math.abs(patterned.bounds[1][axis] - bounds.max[axis]), context)
          .toBeLessThanOrEqual(bounds.tolerance);
      }
      expect(connectedComponentCount(patterned.mesh.triVerts), context).toBe(1);

      const geometry = modelToBufferGeometry(patterned);
      try {
        const analysis = analyzeBufferGeometry(geometry);
        expect(analysis.finite, context).toBe(true);
        expect(analysis.minimumTriangleArea, context).toBeGreaterThan(1e-8);
        expect(analysis.minimumNormalLength, context).toBeCloseTo(1, 5);
        expect(analysis.signedVolume, context).toBeGreaterThan(0);
        expect(Math.abs(analysis.signedVolume - patterned.volume) / patterned.volume, context)
          .toBeLessThan(0.001);
        expect(closedEdgeCounts(geometry).filter((edge) => edge.count !== 2 || edge.balance !== 0), context)
          .toEqual([]);
        assertBinaryStlRoundTrip(geometry, context);
      } finally {
        geometry.dispose();
      }
    }
  }, 120_000);

  it.each([
    { fixture: CASES[0], flag: "lightenUnderside" },
    { fixture: CASES[1], flag: "lightenUnderside" },
    { fixture: CASES[2], flag: "lightenUnderside" },
    { fixture: CASES[9], flag: "lightenDeck" },
  ])("omits blind underside pockets while $fixture.product/$fixture.surface is open", async ({ fixture, flag }) => {
    const product = getProduct(fixture.product);
    const base = parametersFor(fixture, "holes");
    const withoutPockets = product.normalize({ ...base, [flag]: false });
    const requestedPockets = product.normalize({ ...base, [flag]: true });
    expect(product.validate(requestedPockets).valid).toBe(true);
    const plain = await product.generate(withoutPockets);
    const requested = await product.generate(requestedPockets);
    expect(requested.volume).toBeCloseTo(plain.volume, 6);
    expect(requested.mesh.triVerts).toEqual(plain.mesh.triVerts);
    expect(requested.mesh.vertProperties).toEqual(plain.mesh.vertProperties);
  }, 120_000);

  it("keeps the wall hook fit coupon solid", async () => {
    const fixture = { product: "wall-hook-rail", surface: "plate" };
    const product = getProduct(fixture.product);
    expect(product.coupon).toBeDefined();
    const plain = await product.coupon!(parametersFor(fixture, "solid"));
    const selected = await product.coupon!(parametersFor(fixture, "holes"));
    expect(selected.volume).toBeCloseTo(plain.volume, 6);
    expect(selected.mesh.triVerts).toEqual(plain.mesh.triVerts);
  }, 120_000);
});
