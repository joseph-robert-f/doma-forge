import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  DRAIN_WEB_MM,
  PLANT_POT_DEFAULTS,
  PLANT_POT_SPECS,
  SAUCER_GAP_MM,
  derivePotLayout,
  drainHoleCenters,
  plantPot,
  type PlantPotParameters,
  maximumPotDiameter,
} from "../lib/products/plant-pot";
import { SAUCER_DERIVED_ID } from "../lib/products/plant-pot/index";
import { deriveSaucerLayout, plantSaucer } from "../lib/products/plant-saucer";
import {
  normalizePrinterProfile,
  thinWallIssues,
  wallLikeKeys,
} from "../lib/printer-profile";
import { inspectBinaryStl, serializeBinaryStl } from "../lib/stl";
import {
  analyzeBufferGeometry,
  modelToBufferGeometry,
} from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";

const { normalize, validate, generate } = plantPot;

// Recorded at geometryVersion 1 for the defaults; version 2 changes only
// patterned wall spacing, so the solid-default mesh remains the same.
const GOLDEN_TRIANGLES = 3472;
const GOLDEN_VOLUME = 149662.25;
const GOLDEN_RADIUS = 73.5584;

function withChanges(changes: Partial<PlantPotParameters>): PlantPotParameters {
  return normalize({ ...PLANT_POT_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<PlantPotParameters> = {
  baseDiameter: 50, potHeight: 40, wallAngleDegrees: 0, rimRadius: 0,
  drainHoles: 1, drainHoleDiameter: 4, wallThickness: 1.6, baseThickness: 1.6,
  meshQuality: "draft",
};
const CONFLICT_CASE_CHANGES: Partial<PlantPotParameters> = {
  baseDiameter: 50, drainHoles: 8, drainHoleDiameter: 8,
};
const MAXIMUM_CASE: Partial<PlantPotParameters> = {
  baseDiameter: 200, potHeight: 220, wallAngleDegrees: 1, rimRadius: 3,
  drainHoles: 8, drainHoleDiameter: 8, wallThickness: 4, baseThickness: 6,
  meshQuality: "fine",
};

const CONFLICT_CASE = withChanges(CONFLICT_CASE_CHANGES);

describe("plant pot parameters", () => {
  it("ships the pot-size presets in order", () => {
    expect(plantPot.presets.map((preset) => preset.id)).toEqual([
      "seedling",
      "desk-pot",
      "deep-pot",
    ]);
  });

  it("keeps the drainage hole between 4 and 8 mm and the wall under 45 degrees", () => {
    expect(plantPot.specs.drainHoleDiameter.min).toBe(4);
    expect(plantPot.specs.drainHoleDiameter.max).toBe(8);
    expect(plantPot.specs.wallAngleDegrees.max).toBe(45);
    expect(
      validate({ ...PLANT_POT_DEFAULTS, drainHoleDiameter: 3 }).byField.drainHoleDiameter,
    ).toHaveLength(1);
    expect(
      validate({ ...PLANT_POT_DEFAULTS, wallAngleDegrees: 50 }).byField
        .wallAngleDegrees?.[0],
    ).toBe("Wall angle must be between 0 and 45.");
  });

  it("rejects a pot that is wider than the bed less 12 mm, naming the wall angle", () => {
    const result = validate(withChanges({ baseDiameter: 160, wallAngleDegrees: 12 }));
    expect(result.valid).toBe(false);
    expect(result.byField.wallAngleDegrees?.[0]).toMatch(
      /^The pot is [\d.]+ mm across at the rim\. Keep it at most 208 mm, the 220 mm bed less 12 mm\./,
    );
    expect(validate(withChanges({ baseDiameter: 160, wallAngleDegrees: 5 })).valid).toBe(
      true,
    );
  });

  it("rejects holes that crowd each other, naming the hole count", () => {
    const result = validate(CONFLICT_CASE);
    expect(result.valid).toBe(false);
    expect(result.byField.drainHoles?.[0]).toBe(
      "8 holes of 8 mm leave 0.8 mm between neighbours. Keep at least 2.5 mm. Use fewer holes, a smaller hole, or a wider base.",
    );
    expect(
      validate(withChanges({ baseDiameter: 50, drainHoles: 4, drainHoleDiameter: 8 }))
        .valid,
    ).toBe(true);
  });

  it("guards the wall against a base diameter that skipped normalization", () => {
    // Inside the spec range the derived hole circle always leaves the wall
    // clear. The rule is the guard that keeps it that way, so it is checked
    // with a value the form cannot produce.
    const result = validate({ ...PLANT_POT_DEFAULTS, baseDiameter: 20 });
    expect(result.valid).toBe(false);
    expect(result.byField.drainHoleDiameter?.[0]).toMatch(
      /^A 6 mm hole leaves [-\d.]+ mm between the hole and the wall\. Keep at least 2\.5 mm, so the holes stay in the flat base\./,
    );
  });

  it("keeps every drainage hole inside the flat base by the layout numbers", () => {
    for (const baseDiameter of [50, 90, 120, 200]) {
      for (const drainHoles of [1, 3, 4, 6, 8]) {
        for (const drainHoleDiameter of [4, 6, 8]) {
          const parameters = withChanges({ baseDiameter, drainHoles, drainHoleDiameter });
          if (!validate(parameters).valid) continue;
          const layout = derivePotLayout(parameters);
          for (const [x, y] of drainHoleCenters(layout, drainHoles)) {
            const reach = Math.hypot(x, y) + drainHoleDiameter / 2;
            expect(reach + DRAIN_WEB_MM).toBeLessThanOrEqual(
              layout.innerFloorRadius + 1e-9,
            );
          }
        }
      }
    }
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "baseDiameter",
      "potHeight",
      "wallAngleDegrees",
      "drainHoleDiameter",
      "wallThickness",
      "baseThickness",
      "rimRadius",
      "drainHoles",
    ] as const) {
      const cleared = { ...PLANT_POT_DEFAULTS, [key]: Number.NaN };
      expect(() => plantPot.derive(cleared)).not.toThrow();
      expect(() => plantPot.boundsContract(cleared)).not.toThrow();
      expect(() => plantPot.summary(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    expect(
      plantPot.derive({ ...PLANT_POT_DEFAULTS, baseDiameter: Number.NaN })[0].value,
    ).toBe("does not fit");
    // A cleared count must never print "NaN holes".
    const clearedCount = { ...PLANT_POT_DEFAULTS, drainHoles: Number.NaN };
    expect(
      plantPot.derive(clearedCount).find((value) => value.id === "drain-holes")?.value,
    ).toBe("does not fit");
    expect(plantPot.summary(clearedCount)).toMatch(/· — holes$/);
    for (const value of plantPot.derive(clearedCount)) {
      expect(value.value).not.toMatch(/NaN/);
    }
  });

  it("creates a deterministic filename with the base, the height, and the holes", () => {
    expect(plantPot.filename(withChanges({}))).toMatch(
      /^drawerforge-plant-pot-120x130-4h-[0-9a-f]{6}\.stl$/,
    );
    expect(plantPot.filename(withChanges({ drainHoles: 5 }))).not.toBe(
      plantPot.filename(withChanges({})),
    );
  });

  it("derives the widest diameter, the depth, the saucer, and the drainage", () => {
    expect(plantPot.derive(withChanges({})).map((value) => value.value)).toEqual([
      "147.1 mm",
      "127 mm",
      "122 mm",
      "4 holes of 6 mm on a 58.1 mm circle",
      "1 mm",
    ]);
    const single = plantPot.derive(withChanges({ drainHoles: 1 }));
    expect(single.find((value) => value.id === "drain-holes")?.value).toBe(
      "1 hole of 6 mm at the center",
    );
    expect(plantPot.summary(withChanges({ drainHoles: 1 }))).toMatch(/· 1 hole$/);
  });
});

describe("the pot and saucer pair", () => {
  it("names a saucer floor that is the pot base plus 2 mm", () => {
    for (const baseDiameter of [50, 90, 120, 150, 200]) {
      const parameters = withChanges({ baseDiameter });
      const row = plantPot
        .derive(parameters)
        .find((value) => value.id === SAUCER_DERIVED_ID);
      expect(row?.label).toBe("Matching saucer floor");
      expect(row?.value).toBe(`${baseDiameter + SAUCER_GAP_MM} mm`);
    }
  });

  it("takes the derived value into the saucer and gets the pot base back", () => {
    const pot = withChanges({ baseDiameter: 150, potHeight: 200 });
    const potLayout = derivePotLayout(pot);
    const saucer = plantSaucer.normalize({
      ...plantSaucer.defaults,
      innerDiameter: potLayout.saucerInnerDiameter,
      rimHeight: 20,
    });
    expect(plantSaucer.validate(saucer).valid).toBe(true);
    const saucerLayout = deriveSaucerLayout(saucer);
    // The saucer floor takes the pot base with a 2 mm gap all round.
    expect(saucerLayout.innerDiameter).toBe(pot.baseDiameter + SAUCER_GAP_MM);
    expect(saucerLayout.potBaseDiameter).toBe(pot.baseDiameter);
    const potBaseRow = plantSaucer
      .derive(saucer)
      .find((value) => value.id === "pot-base");
    expect(potBaseRow?.value).toBe(`${pot.baseDiameter} mm`);
    // The pot goes in from the top: the rim opening is never narrower than
    // the floor the pot rests on.
    expect(saucerLayout.openingDiameter).toBeGreaterThanOrEqual(
      saucerLayout.innerDiameter,
    );
  });
});

describe("plant pot geometry", () => {
  const fixtures: Array<[string, Partial<PlantPotParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["one center hole", { drainHoles: 1 }],
    ["square rim, straight wall", { rimRadius: 0, wallAngleDegrees: 0 }],
    ["steep wall", { baseDiameter: 60, potHeight: 60, wallAngleDegrees: 45 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s pot", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());
    const layout = derivePotLayout(parameters);

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(layout.widestDiameter, 3);
    expect(size.y).toBeCloseTo(layout.widestDiameter, 3);
    expect(size.z).toBeCloseTo(parameters.potHeight, 4);

    const contract = plantPot.boundsContract(parameters);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(Math.abs(model.bounds[0][axis] - contract.min[axis])).toBeLessThanOrEqual(
        contract.tolerance,
      );
      expect(Math.abs(model.bounds[1][axis] - contract.max[axis])).toBeLessThanOrEqual(
        contract.tolerance,
      );
    }

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    await expect(generate(CONFLICT_CASE)).rejects.toThrow(
      /8 holes of 8 mm leave 0.8 mm between neighbours/,
    );
  });

  it.each(fixtures)(
    "cuts the %s pot's drainage holes through the flat base and never through the wall",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const model = await generate(parameters);
      const holes = parameters.drainHoles;
      // Through the base: one outer contour and one hole per drain.
      const base = horizontalSliceTopology(model.mesh, parameters.baseThickness / 2);
      expect({
        contours: base.contours,
        solidComponents: base.solidComponents,
        holes: base.holes,
      }).toEqual({ contours: 1 + holes, solidComponents: 1, holes });
      // Just above the base the section is the wall alone: one ring, one hole.
      const aboveBase = horizontalSliceTopology(
        model.mesh,
        parameters.baseThickness + 0.5,
      );
      expect(aboveBase).toMatchObject({ contours: 2, solidComponents: 1, holes: 1 });
      // Halfway up, the same: the drainage never reaches the wall.
      const middle = horizontalSliceTopology(model.mesh, parameters.potHeight / 2);
      expect(middle).toMatchObject({ contours: 2, solidComponents: 1, holes: 1 });
    },
  );

  it("increases the segment count of the revolved surface with mesh quality", async () => {
    const counts: number[] = [];
    for (const meshQuality of ["draft", "standard", "fine"] as const) {
      const model = await generate(withChanges({ meshQuality }));
      counts.push(model.mesh.triVerts.length / 3);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("builds the largest pot inside the kernel time budget", async () => {
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(withChanges(MAXIMUM_CASE));
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // The measured value here is about 0.13 s (23_REVOLVED_FORMS_NOTES.md).
    expect(elapsed).toBeLessThan(2_000);
  });

  it("round-trips the exact preview triangles through binary STL", async () => {
    const model = await generate(withChanges({}));
    const geometry = modelToBufferGeometry(model);
    const data = serializeBinaryStl(geometry);
    const inspected = inspectBinaryStl(data);
    geometry.computeBoundingBox();
    expect(inspected.triangleCount).toBe(geometry.getAttribute("position").count / 3);
    expect(inspected.finite).toBe(true);
    expect(inspected.minimumNormalAlignment).toBeGreaterThan(0.99999);
    expect(inspected.bounds.min.distanceTo(geometry.boundingBox!.min)).toBeLessThan(1e-5);
    expect(inspected.bounds.max.distanceTo(geometry.boundingBox!.max)).toBeLessThan(1e-5);
    const parsed = new STLLoader().parse(data);
    expect(parsed.getAttribute("position").count).toBe(
      geometry.getAttribute("position").count,
    );
    parsed.dispose();
    geometry.dispose();
  });

  it("matches the solid-default golden record at geometry version 2", async () => {
    const model = await generate(normalize(PLANT_POT_DEFAULTS));
    expect(plantPot.geometryVersion).toBe(2);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds[0][0]).toBeCloseTo(-GOLDEN_RADIUS, 3);
    expect(model.bounds[0][1]).toBeCloseTo(-GOLDEN_RADIUS, 3);
    expect(model.bounds[0][2]).toBe(0);
    expect(model.bounds[1][0]).toBeCloseTo(GOLDEN_RADIUS, 3);
    expect(model.bounds[1][1]).toBeCloseTo(GOLDEN_RADIUS, 3);
    expect(model.bounds[1][2]).toBeCloseTo(130, 5);
  });
});

describe("printed walls", () => {
  it("adds the drain-hole webs to the key-name walls", () => {
    const layout = derivePotLayout(PLANT_POT_DEFAULTS);
    const walls = plantPot.printedWalls!(PLANT_POT_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("wall-web")).toBeCloseTo(layout.wallWeb);
    expect(byKey.get("neighbour-web")).toBeCloseTo(layout.neighbourWeb);
    for (const key of wallLikeKeys(PLANT_POT_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("omits the neighbour web for a single center hole", () => {
    const parameters = withChanges({ drainHoles: 1 });
    const walls = plantPot.printedWalls!(parameters);
    expect(walls.some((wall) => wall.key === "wall-web")).toBe(true);
    expect(walls.some((wall) => wall.key === "neighbour-web")).toBe(false);
  });

  it("flags a thin neighbour web at a 1.5 mm nozzle", () => {
    // Six 8 mm holes on the smallest, thickest-walled pot the schema
    // allows leave neighbours 2.5 mm apart, DRAIN_WEB_MM's own floor and
    // under a 1.5 mm nozzle's 3 mm minimum.
    const parameters = withChanges({
      baseDiameter: 50,
      wallThickness: 4,
      wallAngleDegrees: 0,
      rimRadius: 0,
      drainHoles: 6,
      drainHoleDiameter: 8,
      potHeight: 50,
    });
    expect(plantPot.validate(parameters).valid).toBe(true);
    const layout = derivePotLayout(parameters);
    expect(layout.neighbourWeb).toBeCloseTo(DRAIN_WEB_MM);
    const profile = normalizePrinterProfile({ nozzleDiameter: 1.5 });
    const issues = thinWallIssues(plantPot.printedWalls!(parameters), profile);
    expect(
      issues.some((issue) => issue.text.includes("Web between drain holes")),
    ).toBe(true);
  });

  it("does not throw for a cleared field, and reports only finite values", () => {
    const cleared = { ...PLANT_POT_DEFAULTS, baseDiameter: Number.NaN };
    const walls = plantPot.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
  });
});

describe("print context", () => {
  const widest = plantPot.normalize({
    ...PLANT_POT_DEFAULTS,
    baseDiameter: 160,
    potHeight: 100,
    wallAngleDegrees: 10,
  });

  it("uses the reference bed while the profile is unsaved, exactly as before", () => {
    const unsaved = { bed: null, nozzleDiameter: 0.4 };
    expect(plantPot.validate(widest, unsaved)).toEqual(plantPot.validate(widest));
    expect(plantPot.validate(widest).valid).toBe(true);
    expect(maximumPotDiameter(unsaved)).toEqual({ limit: 208, bedWidth: 220, known: false });
  });

  it("refuses a pot wider than the saved bed less 12 mm and names that bed", () => {
    const small = { bed: { x: 180, y: 220, z: 250 }, nozzleDiameter: 0.4 };
    expect(maximumPotDiameter(small)).toEqual({ limit: 168, bedWidth: 180, known: true });
    const result = plantPot.validate(widest, small);
    expect(result.valid).toBe(false);
    expect(result.byField.wallAngleDegrees?.[0]).toMatch(
      /^The pot is [\d.]+ mm across at the rim\. Keep it at most 168 mm, the 180 mm bed in your printer profile less 12 mm\./,
    );
    expect(plantPot.validate(PLANT_POT_DEFAULTS, small).valid).toBe(true);
  });

  it("does not raise the field limit for a bed larger than the reference", () => {
    const large = { bed: { x: 300, y: 300, z: 300 }, nozzleDiameter: 0.4 };
    expect(maximumPotDiameter(large).limit).toBe(288);
    expect(plantPot.specs.baseDiameter.max).toBe(200);
    expect(plantPot.validate(widest, large).valid).toBe(true);
  });

  it("names a bed too small for any pot instead of a limit no field can reach", () => {
    const tiny = { bed: { x: 60, y: 200, z: 200 }, nozzleDiameter: 0.4 };
    const result = plantPot.validate(PLANT_POT_DEFAULTS, tiny);
    expect(result.byField.wallAngleDegrees).toEqual([
      "The 60 mm bed in your printer profile is too small for any pot this app makes; the smallest is 50 mm across the rim. Check the bed size in the profile.",
    ]);
    // A context whose bed axes are not usable counts as the reference bed.
    expect(
      maximumPotDiameter({ bed: { x: Number.NaN, y: 180, z: 200 }, nozzleDiameter: 0.4 }),
    ).toEqual({ limit: 208, bedWidth: 220, known: false });
  });
});
