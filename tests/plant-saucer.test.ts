import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  PLANT_SAUCER_DEFAULTS,
  PLANT_SAUCER_SPECS,
  RIB_WIDTH_MM,
  deriveSaucerLayout,
  minimumRimHeight,
  plantSaucer,
  type PlantSaucerParameters,
  maximumSaucerDiameter,
} from "../lib/products/plant-saucer";
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

const { normalize, validate, generate } = plantSaucer;

// Recorded at geometryVersion 1 for the defaults. A change here is a geometry
// change: bump PLANT_SAUCER_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 3168;
const GOLDEN_VOLUME = 66133.06;
const GOLDEN_RADIUS = 83.2302;

function withChanges(changes: Partial<PlantSaucerParameters>): PlantSaucerParameters {
  return normalize({ ...PLANT_SAUCER_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<PlantSaucerParameters> = {
  innerDiameter: 60, rimHeight: 8, taperDegrees: 3, rimRadius: 0,
  overflowNotch: false, liftRibs: 0, ribHeight: 1,
  wallThickness: 1.6, baseThickness: 1.6, meshQuality: "draft",
};
// The largest saucer the outside-diameter rule accepts at the full taper: a
// 180 mm floor is 201.4 mm across the rim, under the 208 mm limit.
const MAXIMUM_CASE: Partial<PlantSaucerParameters> = {
  innerDiameter: 180, rimHeight: 40, taperDegrees: 12, rimRadius: 3,
  overflowNotch: true, liftRibs: 6, ribHeight: 8,
  wallThickness: 4, baseThickness: 6, meshQuality: "fine",
};

describe("plant saucer parameters", () => {
  it("ships the pot-size presets in order", () => {
    expect(plantSaucer.presets.map((preset) => preset.id)).toEqual([
      "small-pot",
      "medium-pot",
      "large-pot",
    ]);
  });

  it("stops the inner diameter at the bed less 12 mm", () => {
    expect(plantSaucer.specs.innerDiameter.max).toBe(208);
    expect(
      validate({ ...PLANT_SAUCER_DEFAULTS, innerDiameter: 210 }).byField.innerDiameter?.[0],
    ).toBe("Inner diameter must be between 60 and 208 mm.");
  });

  it("stops the outside diameter at the bed less 12 mm, naming the taper", () => {
    // The outside is always wider than the floor, so the widest floors need a
    // small taper, a thin wall, or a short rim.
    const wide = withChanges({
      innerDiameter: 208, rimHeight: 40, taperDegrees: 12,
      wallThickness: 4, baseThickness: 6, liftRibs: 0,
    });
    const result = validate(wide);
    expect(result.valid).toBe(false);
    expect(result.byField.taperDegrees?.[0]).toBe(
      "The saucer is 230.2 mm across at the rim. Keep it at most 208 mm, the 220 mm bed less 12 mm. Use less taper, a shorter rim, a thinner wall, or a smaller floor.",
    );
    expect(deriveSaucerLayout(wide).outsideDiameter).toBeGreaterThan(208);
    // The same floor fits with a small taper, a thin wall, and a short rim.
    const narrow = withChanges({
      innerDiameter: 200, rimHeight: 12, taperDegrees: 3,
      wallThickness: 1.6, baseThickness: 2, liftRibs: 0,
    });
    expect(deriveSaucerLayout(narrow).outsideDiameter).toBeLessThan(208);
    expect(validate(narrow).valid).toBe(true);
  });

  it("keeps the taper at 3 degrees or more and the wall at 1.6 mm or more", () => {
    expect(plantSaucer.specs.taperDegrees.min).toBe(3);
    expect(plantSaucer.specs.taperDegrees.max).toBe(12);
    expect(plantSaucer.specs.wallThickness.min).toBe(1.6);
    expect(
      validate({ ...PLANT_SAUCER_DEFAULTS, taperDegrees: 2 }).byField.taperDegrees,
    ).toHaveLength(1);
    expect(
      validate({ ...PLANT_SAUCER_DEFAULTS, wallThickness: 1.2 }).byField.wallThickness,
    ).toHaveLength(1);
  });

  it("puts the floor diameter exactly where the user asked for it", () => {
    for (const innerDiameter of [60, 92, 160, 208]) {
      for (const taperDegrees of [3, 6, 12]) {
        const layout = deriveSaucerLayout(withChanges({ innerDiameter, taperDegrees }));
        expect(layout.profile!.innerRadiusAtFloor * 2).toBeCloseTo(innerDiameter, 9);
      }
    }
  });

  it("rejects a rim that is too short to hold water, naming the field", () => {
    const result = validate(withChanges({ rimHeight: 8, baseThickness: 6 }));
    expect(result.valid).toBe(false);
    expect(result.byField.rimHeight?.[0]).toBe(
      "Rim height must be at least 9 mm, so the saucer holds 3 mm of water above the 6 mm floor. Use a taller rim or a thinner floor.",
    );
    expect(
      validate(withChanges({ rimHeight: 9, baseThickness: 6, ribHeight: 2 })).valid,
    ).toBe(true);
  });

  it("measures the water depth to the notch floor, not to the rim", () => {
    // The notch is the lowest point of the rim, so it sets the depth. Without
    // this rule a 9 mm rim on a 6 mm floor holds 1.5 mm, not 3 mm.
    const notched = withChanges({ rimHeight: 9, baseThickness: 6, overflowNotch: true, liftRibs: 0 });
    expect(deriveSaucerLayout(notched).holdingDepth).toBeCloseTo(1.5, 9);
    const result = validate(notched);
    expect(result.valid).toBe(false);
    expect(result.byField.rimHeight?.[0]).toBe(
      "Rim height must be at least 12 mm, so the saucer holds 3 mm of water above the 6 mm floor. The overflow notch takes 1.5 mm off the depth. Use a taller rim, a thinner floor, or no overflow notch.",
    );
    expect(minimumRimHeight(6, false)).toBe(9);
    expect(minimumRimHeight(6, true)).toBe(12);
    const fixed = withChanges({ rimHeight: 12, baseThickness: 6, overflowNotch: true, liftRibs: 0 });
    expect(deriveSaucerLayout(fixed).holdingDepth).toBeCloseTo(3, 9);
    expect(validate(fixed).valid).toBe(true);
  });

  it("rejects a lift rib that reaches the rim, naming the field and the fix", () => {
    const result = validate(withChanges({ rimHeight: 8, ribHeight: 8 }));
    expect(result.valid).toBe(false);
    expect(result.byField.ribHeight?.[0]).toBe(
      "A lift rib must be at most 4.6 mm high, so 1 mm stays between the rib and the rim. Use a lower rib, a taller rim, or a thinner floor.",
    );
    expect(validate(withChanges({ rimHeight: 8, ribHeight: 4.5 })).valid).toBe(true);
    // With no ribs the rib height is not built, so it is not checked.
    expect(validate(withChanges({ rimHeight: 8, ribHeight: 8, liftRibs: 0 })).valid).toBe(
      true,
    );
  });

  it("clamps the rolled rim and reports the value it used", () => {
    const clamped = withChanges({ rimRadius: 3 });
    const layout = deriveSaucerLayout(clamped);
    expect(layout.rimRadiusClamped).toBe(true);
    expect(layout.rimRadius).toBeLessThan(3);
    expect(validate(clamped).valid).toBe(true);
    const row = plantSaucer.derive(clamped).find((value) => value.id === "rim-radius");
    expect(row?.value).toMatch(/^1\.6 mm, reduced from 3 mm$/);
    // A quarter of the rim height is the other limit. It binds once the wall
    // is thick enough to allow a larger bead.
    const short = deriveSaucerLayout(
      withChanges({ rimHeight: 8, rimRadius: 3, wallThickness: 4, baseThickness: 1.6 }),
    );
    expect(short.rimRadius).toBeCloseTo(2, 6);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "innerDiameter",
      "rimHeight",
      "taperDegrees",
      "wallThickness",
      "baseThickness",
      "ribHeight",
      "rimRadius",
      "liftRibs",
    ] as const) {
      const cleared = { ...PLANT_SAUCER_DEFAULTS, [key]: Number.NaN };
      expect(() => plantSaucer.derive(cleared)).not.toThrow();
      expect(() => plantSaucer.boundsContract(cleared)).not.toThrow();
      expect(() => plantSaucer.summary(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    expect(
      plantSaucer.derive({ ...PLANT_SAUCER_DEFAULTS, innerDiameter: Number.NaN })[0].value,
    ).toBe("does not fit");
    for (const key of ["liftRibs", "rimRadius", "ribHeight"] as const) {
      const cleared = { ...PLANT_SAUCER_DEFAULTS, [key]: Number.NaN };
      for (const value of plantSaucer.derive(cleared)) {
        expect(value.value).not.toMatch(/NaN/);
      }
      expect(plantSaucer.summary(cleared)).not.toMatch(/NaN/);
    }
  });

  it("creates a deterministic filename with the floor and the rim", () => {
    expect(plantSaucer.filename(withChanges({}))).toMatch(
      /^drawerforge-plant-saucer-160x15-[0-9a-f]{6}\.stl$/,
    );
    expect(plantSaucer.filename(withChanges({ rimRadius: 2 }))).not.toBe(
      plantSaucer.filename(withChanges({})),
    );
  });

  it("derives the outside, the pot base, the water depth, and the ribs", () => {
    expect(plantSaucer.derive(withChanges({})).map((value) => value.value)).toEqual([
      "166.5 mm",
      "15 mm",
      "158 mm",
      "12.6 mm",
      "162.5 mm",
      "1 mm",
      "2 across the floor, 3 mm high",
    ]);
    const notched = plantSaucer.derive(withChanges({ overflowNotch: true }));
    expect(notched.find((value) => value.id === "holding-depth")?.value).toBe("8.6 mm");
    const flat = plantSaucer.derive(withChanges({ liftRibs: 0 }));
    expect(flat.find((value) => value.id === "lift-ribs")?.value).toBe("none");
    const square = plantSaucer.derive(withChanges({ rimRadius: 0 }));
    expect(square.find((value) => value.id === "rim-radius")?.value).toBe("square rim");
  });
});

describe("plant saucer geometry", () => {
  const fixtures: Array<[string, Partial<PlantSaucerParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["square rim without ribs", { rimRadius: 0, liftRibs: 0 }],
    ["overflow notch", { overflowNotch: true }],
    ["six ribs", { rimHeight: 20, liftRibs: 6, ribHeight: 5 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s saucer", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());
    const layout = deriveSaucerLayout(parameters);

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.triangleCount).toBeGreaterThan(0);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.z).toBeCloseTo(parameters.rimHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    expect(size.x).toBeLessThanOrEqual(layout.outsideDiameter + 1e-4);

    const contract = plantSaucer.boundsContract(parameters);
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
    await expect(generate(withChanges({ rimHeight: 8, ribHeight: 8 }))).rejects.toThrow(
      /A lift rib must be at most 4.6 mm high/,
    );
  });

  it.each(fixtures)(
    "holds water: every slice of the %s saucer below the rim is one closed contour",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const model = await generate(parameters);
      const layout = deriveSaucerLayout(parameters);
      const top = Math.min(layout.notchFloorZ, layout.profile!.wallTopZ);
      const heights: number[] = [];
      for (let step = 1; step < 20; step += 1) {
        heights.push((top * step) / 20);
      }
      for (const z of heights) {
        const topology = horizontalSliceTopology(model.mesh, z);
        // One solid piece at every height: the floor is continuous and the
        // wall is a closed ring, so nothing leaks.
        expect({ z, solid: topology.solidComponents }).toEqual({ z, solid: 1 });
        if (z < parameters.baseThickness) {
          // Below the floor the section is a full disc with no hole in it.
          expect({ z, contours: topology.contours, holes: topology.holes }).toEqual({
            z,
            contours: 1,
            holes: 0,
          });
        }
      }
    },
  );

  it("shows one hole per rib gap above the ribs and one cavity above them", async () => {
    const parameters = withChanges({ rimHeight: 20, liftRibs: 3, ribHeight: 5 });
    const model = await generate(parameters);
    const layout = deriveSaucerLayout(parameters);
    const throughRibs = horizontalSliceTopology(
      model.mesh,
      (parameters.baseThickness + layout.ribTopZ) / 2,
    );
    // Three ribs cross the floor through the center, so they cut the cavity
    // into six sectors.
    expect(throughRibs).toMatchObject({ solidComponents: 1, holes: 6 });
    const aboveRibs = horizontalSliceTopology(
      model.mesh,
      (layout.ribTopZ + parameters.rimHeight) / 2,
    );
    expect(aboveRibs).toMatchObject({ contours: 2, solidComponents: 1, holes: 1 });
  });

  it("opens the rim only where the overflow notch is", async () => {
    const parameters = withChanges({ overflowNotch: true });
    const layout = deriveSaucerLayout(parameters);
    const model = await generate(parameters);
    const belowNotch = horizontalSliceTopology(model.mesh, layout.notchFloorZ - 0.5);
    expect(belowNotch).toMatchObject({ contours: 2, solidComponents: 1, holes: 1 });
    const inNotch = horizontalSliceTopology(model.mesh, layout.notchFloorZ + 0.5);
    // The ring is open at the notch, so the section is one C-shaped contour.
    expect(inNotch).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
    const plain = await generate(withChanges({}));
    expect(model.volume).toBeLessThan(plain.volume);
  });

  it("increases the segment count of the revolved surface with mesh quality", async () => {
    const counts: number[] = [];
    for (const meshQuality of ["draft", "standard", "fine"] as const) {
      const model = await generate(withChanges({ meshQuality }));
      counts.push(model.mesh.triVerts.length / 3);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("builds the largest saucer inside the kernel time budget", async () => {
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(withChanges(MAXIMUM_CASE));
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // The measured value here is about 0.2 s (23_REVOLVED_FORMS_NOTES.md).
    // Two seconds leaves room for a slower CI runner.
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

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(PLANT_SAUCER_DEFAULTS));
    expect(plantSaucer.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds[0][0]).toBeCloseTo(-GOLDEN_RADIUS, 3);
    expect(model.bounds[0][1]).toBeCloseTo(-GOLDEN_RADIUS, 3);
    expect(model.bounds[0][2]).toBe(0);
    expect(model.bounds[1][0]).toBeCloseTo(GOLDEN_RADIUS, 3);
    expect(model.bounds[1][1]).toBeCloseTo(GOLDEN_RADIUS, 3);
    expect(model.bounds[1][2]).toBeCloseTo(15, 5);
  });
});

describe("printed walls", () => {
  it("adds the lift rib width at the defaults", () => {
    expect(PLANT_SAUCER_DEFAULTS.liftRibs).toBeGreaterThan(0);
    const walls = plantSaucer.printedWalls!(PLANT_SAUCER_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("rib-width")).toBeCloseTo(RIB_WIDTH_MM);
    for (const key of wallLikeKeys(PLANT_SAUCER_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("omits the rib width with a flat floor", () => {
    const parameters = withChanges({ liftRibs: 0 });
    const walls = plantSaucer.printedWalls!(parameters);
    expect(walls.some((wall) => wall.key === "rib-width")).toBe(false);
  });

  it("flags a thin rib at a wide enough nozzle", () => {
    // The rib width is fixed at 3 mm, exactly the floor a 1.5 mm nozzle
    // sets (two nozzle widths), so it is not itself thin there. A
    // slightly wider nozzle pushes the floor past the fixed rib and
    // demonstrates the same rule.
    const profile = normalizePrinterProfile({ nozzleDiameter: 1.6 });
    const issues = thinWallIssues(
      plantSaucer.printedWalls!(PLANT_SAUCER_DEFAULTS),
      profile,
    );
    expect(
      issues.some((issue) => issue.text.includes("Lift rib width")),
    ).toBe(true);
  });

  it("does not throw for a cleared field, and reports only finite values", () => {
    const cleared = { ...PLANT_SAUCER_DEFAULTS, liftRibs: Number.NaN };
    const walls = plantSaucer.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
    expect(walls.some((wall) => wall.key === "rib-width")).toBe(false);
  });
});

describe("print context", () => {
  const wide = plantSaucer.normalize({
    ...PLANT_SAUCER_DEFAULTS,
    innerDiameter: 180,
    rimHeight: 20,
    taperDegrees: 8,
  });

  it("uses the reference bed while the profile is unsaved, exactly as before", () => {
    const unsaved = { bed: null, nozzleDiameter: 0.4 };
    expect(plantSaucer.validate(wide, unsaved)).toEqual(plantSaucer.validate(wide));
    expect(plantSaucer.validate(wide).valid).toBe(true);
    expect(maximumSaucerDiameter(unsaved)).toEqual({ limit: 208, bedWidth: 220, known: false });
  });

  it("refuses a saucer wider than the saved bed less 12 mm and names that bed", () => {
    const small = { bed: { x: 200, y: 180, z: 250 }, nozzleDiameter: 0.4 };
    const result = plantSaucer.validate(wide, small);
    expect(result.valid).toBe(false);
    expect(result.byField.taperDegrees?.[0]).toMatch(
      /^The saucer is [\d.]+ mm across at the rim\. Keep it at most 168 mm, the 180 mm bed in your printer profile less 12 mm\./,
    );
    expect(plantSaucer.validate(PLANT_SAUCER_DEFAULTS, small).valid).toBe(true);
  });

  it("names a bed too small for any saucer instead of a limit no field can reach", () => {
    const tiny = { bed: { x: 60, y: 60, z: 60 }, nozzleDiameter: 0.4 };
    const result = plantSaucer.validate(PLANT_SAUCER_DEFAULTS, tiny);
    expect(result.byField.taperDegrees).toEqual([
      "The 60 mm bed in your printer profile is too small for any saucer this app makes; the smallest is about 63.2 mm across the rim. Check the bed size in the profile.",
    ]);
  });
});
