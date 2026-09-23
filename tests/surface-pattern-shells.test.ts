import { describe, expect, it } from "vitest";
import { drawerTray } from "../lib/products/drawer-tray";
import { drawerRiser } from "../lib/products/drawer-riser";
import { partsBin } from "../lib/products/parts-bin";
import { remoteCaddy } from "../lib/products/remote-caddy";
import { entrywayValet } from "../lib/products/entryway-valet";
import { plantPot } from "../lib/products/plant-pot";
import { plantSaucer } from "../lib/products/plant-saucer";
import { saucerPatternZones } from "../lib/products/plant-saucer/geometry";
import { deriveSaucerLayout } from "../lib/products/plant-saucer/schema";
import type { AnyProduct } from "../lib/products/types";
import { planSurfacePatterns } from "../lib/surface-pattern-plan";
import type { SurfaceMode, SurfaceTreatments } from "../lib/surface-patterns";
import { assertProductContract } from "./helpers/product-contract";

interface SurfaceCase {
  product: AnyProduct;
  zone: string;
  overrides?: Record<string, unknown>;
  opening?: number;
  margin?: number;
  contract?: boolean;
}

const cases: SurfaceCase[] = [
  { product: drawerTray as unknown as AnyProduct, zone: "floor", contract: true },
  { product: drawerTray as unknown as AnyProduct, zone: "walls" },
  { product: drawerTray as unknown as AnyProduct, zone: "dividers" },
  { product: drawerRiser as unknown as AnyProduct, zone: "floor", contract: true },
  { product: drawerRiser as unknown as AnyProduct, zone: "walls" },
  { product: drawerRiser as unknown as AnyProduct, zone: "dividers" },
  { product: partsBin as unknown as AnyProduct, zone: "floor" },
  { product: partsBin as unknown as AnyProduct, zone: "walls", contract: true },
  { product: remoteCaddy as unknown as AnyProduct, zone: "floor" },
  { product: remoteCaddy as unknown as AnyProduct, zone: "walls", overrides: { frontWallHeight: 50 } },
  { product: remoteCaddy as unknown as AnyProduct, zone: "dividers", contract: true },
  { product: entrywayValet as unknown as AnyProduct, zone: "floor", contract: true },
  { product: entrywayValet as unknown as AnyProduct, zone: "walls" },
  { product: entrywayValet as unknown as AnyProduct, zone: "dividers" },
  { product: plantPot as unknown as AnyProduct, zone: "base" },
  { product: plantPot as unknown as AnyProduct, zone: "wall", contract: true },
  // A taller saucer has usable straight wall below the rolled rim. Its notch
  // and lift ribs remain present while the selected surface becomes permeable.
  { product: plantSaucer as unknown as AnyProduct, zone: "floor", overrides: { rimHeight: 32, overflowNotch: true }, contract: true },
  { product: plantSaucer as unknown as AnyProduct, zone: "wall", overrides: { rimHeight: 32, overflowNotch: true }, opening: 12, margin: 4 },
];

function withPattern(
  product: AnyProduct,
  baseline: ReturnType<AnyProduct["normalize"]>,
  zone: string,
  mode: SurfaceMode,
  opening: number,
  margin: number,
) {
  const prior = baseline.surfaceTreatments as SurfaceTreatments;
  return product.normalize({
    ...baseline,
    surfaceTreatments: {
      enabled: true,
      zones: {
        ...prior.zones,
        [zone]: { mode, opening, web: 2.4, margin },
      },
    },
  });
}

describe("permeable shell and vessel surfaces", () => {
  it("keeps floor openings out of rounded bin corners", async () => {
    const baseline = partsBin.normalize({
      ...partsBin.defaults,
      binWidth: 60,
      binDepth: 60,
      cornerRadius: 20,
      wallThickness: 1.2,
      stacking: false,
      frontScoop: false,
      labelLedge: false,
    });
    const parameters = partsBin.normalize({
      ...baseline,
      surfaceTreatments: {
        enabled: true,
        zones: {
          ...baseline.surfaceTreatments.zones,
          floor: { mode: "holes", opening: 4, web: 0.8, margin: 0.8 },
        },
      },
    });
    expect(partsBin.validate(parameters).issues).toEqual([]);

    const plan = planSurfacePatterns(parameters.surfaceTreatments, partsBin.surfaceZones!(parameters));
    const centers = plan.flatMap(({ cells }) => cells.map(({ center }) => center));
    expect(centers.length).toBeGreaterThan(0);
    for (const x of [-24, 24]) {
      for (const y of [-24, 24]) {
        expect(centers).not.toContainEqual([x, y, parameters.baseThickness / 2]);
      }
    }
    expect((await partsBin.generate(parameters)).status).toBe("NoError");
  }, 90_000);

  it("keeps sloped-wall openings above lift-rib roots", () => {
    const baseline = plantSaucer.normalize({
      ...plantSaucer.defaults,
      rimHeight: 32,
      liftRibs: 6,
      ribHeight: 8,
    });
    const layout = deriveSaucerLayout(baseline);
    expect(layout.profile).not.toBeNull();
    const parameters = withPattern(
      plantSaucer as unknown as AnyProduct,
      baseline,
      "wall",
      "holes",
      4,
      0.8,
    );
    const plan = planSurfacePatterns(
      parameters.surfaceTreatments as SurfaceTreatments,
      saucerPatternZones(baseline, layout, layout.profile!),
    ).find(({ zone }) => zone.id === "wall");
    expect(plan?.cells.length).toBeGreaterThan(0);
    for (const cell of plan!.cells) {
      expect(cell.center[2] - plan!.settings.opening / 2)
        .toBeGreaterThanOrEqual(layout.ribTopZ + 2);
    }
  });

  for (const fixture of cases) {
    it(`${fixture.product.id} ${fixture.zone} cuts both holes and mesh`, async () => {
      const baseline = fixture.product.normalize({ ...fixture.product.defaults, ...fixture.overrides });
      const original = await fixture.product.generate(baseline);
      expect(original.status).toBe("NoError");
      for (const mode of ["holes", "mesh"] as const) {
        const parameters = withPattern(
          fixture.product,
          baseline,
          fixture.zone,
          mode,
          fixture.opening ?? 16,
          fixture.margin ?? 6,
        );
        expect(fixture.product.validate(parameters).issues).toEqual([]);
        const patterned = await fixture.product.generate(parameters);
        expect(patterned.status).toBe("NoError");
        expect(patterned.volume, `${fixture.product.id}/${fixture.zone}/${mode}`)
          .toBeLessThan(original.volume - 0.1);
        for (let end = 0; end < 2; end += 1) {
          for (let axis = 0; axis < 3; axis += 1) {
            expect(Math.abs(patterned.bounds[end][axis] - original.bounds[end][axis]))
              .toBeLessThan(1e-4);
          }
        }
        if (fixture.contract && mode === "holes") {
          await assertProductContract(
            fixture.product,
            parameters,
            `${fixture.zone} ${mode}`,
            1,
          );
        }
      }
    }, 90_000);
  }
});
