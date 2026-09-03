import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  HEADPHONE_MOUNT_DEFAULTS,
  HEADPHONE_MOUNT_SPECS,
  LIP_THICKNESS_MM,
  POCKET_WALL_MM,
  deriveLayout,
  headphoneMount,
  type HeadphoneMountParameters,
} from "../lib/products/headphone-mount";
import {
  normalizePrinterProfile,
  thinWallIssues,
  wallLikeKeys,
} from "../lib/printer-profile";
import { analyzeBufferGeometry, modelToBufferGeometry } from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";
import { describeOverhangs, overhangFaces } from "./helpers/print-pose";

const { normalize, validate, generate } = headphoneMount;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump HEADPHONE_MOUNT_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 624;
const GOLDEN_VOLUME = 110119.44;

function withChanges(changes: Partial<HeadphoneMountParameters>): HeadphoneMountParameters {
  return normalize({ ...HEADPHONE_MOUNT_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<HeadphoneMountParameters> = {
  plateWidth: 60, plateHeight: 60, plateThickness: 3, hookWidth: 20, hookRoot: 8,
  hookProjection: 13, hookLip: 4, bandGauge: 4, controllerPocket: false, screwDiameter: 3,
  cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<HeadphoneMountParameters> = {
  plateWidth: 200, plateHeight: 250, plateThickness: 8, hookWidth: 190, hookRoot: 24,
  hookProjection: 60, hookLip: 30, bandGauge: 25, pocketWidth: 190, pocketDepth: 80,
  pocketLip: 30, pocketFloor: 10, screwDiameter: 6, cornerRadius: 10,
};

describe("headphone mount parameters", () => {
  it("ships the mount presets in order", () => {
    expect(headphoneMount.presets.map((preset) => preset.id)).toEqual([
      "headset-and-controller",
      "headset-only",
      "wide-controller",
    ]);
  });

  it("stacks the lower screw, the hook, the band gap, the pocket, and the upper screw", () => {
    const layout = deriveLayout(HEADPHONE_MOUNT_DEFAULTS);
    expect(layout.headDiameter).toBe(9);
    expect(layout.lowerScrewZ).toBe(12.5);
    expect(layout.hookArmZ).toBe(28);
    expect(layout.hookRootTop).toBe(43);
    expect(layout.hookLipTop).toBe(52);
    expect(layout.hookOpening).toBe(15);
    expect(layout.minimumProjection).toBe(27);
    expect(layout.pocketZ).toBe(75);
    expect(layout.pocketRootTop).toBe(83);
    expect(layout.pocketTop).toBe(92);
    expect(layout.upperScrewZ).toBe(137.5);
    expect(layout.minimumHeight).toBe(117);
  });

  it("accepts a projection at 2.5 times the root and refuses one step over it", () => {
    expect(validate(withChanges({ hookRoot: 12, hookProjection: 30 })).valid).toBe(true);
    const result = validate(withChanges({ hookRoot: 12, hookProjection: 30.5 }));
    expect(result.byField.hookProjection?.[0]).toBe(
      "A 30.5 mm hook on a 12 mm root snaps across the layers under a headset. Keep the projection at most 2.5 times the root and at most 60 mm. Use a projection of at most 30 mm, or a root of at least 12.2 mm.",
    );
    // The 60 mm cap: the largest root reaches it exactly.
    expect(validate(withChanges({ hookRoot: 24, hookProjection: 60 })).valid).toBe(true);
    expect(validate(withChanges({ hookRoot: 24, hookProjection: 60.5 })).byField.hookProjection?.[0]).toBe(
      "Projection must be between 12 and 60 mm.",
    );
  });

  it("keeps the hook at least 20 mm wide and inside the plate", () => {
    expect(validate(withChanges({ hookWidth: 19 })).byField.hookWidth?.[0]).toBe(
      "Hook width must be between 20 and 190 mm.",
    );
    expect(validate(withChanges({ hookWidth: 82 })).valid).toBe(true);
    expect(validate(withChanges({ hookWidth: 83 })).byField.hookWidth?.[0]).toBe(
      "Hook width must be at most 82 mm, so 4 mm of plate stays on each side. Use a narrower hook, or a wider plate.",
    );
    expect(validate(withChanges({ pocketWidth: 83 })).byField.pocketWidth?.[0]).toBe(
      "Pocket width must be at most 82 mm, so 4 mm of plate stays on each side. Use a narrower pocket, or a wider plate.",
    );
  });

  it("clears the band in the hook opening, naming the projection that does", () => {
    expect(validate(withChanges({ bandGauge: 13 })).valid).toBe(true);
    const result = validate(withChanges({ bandGauge: 13.5 }));
    expect(result.byField.hookProjection?.[0]).toBe(
      "The hook opening is 15 mm between the plate and the lip, and a 13.5 mm band needs 15.5 mm. Use a projection of at least 30.5 mm, a shorter lip, or a thinner band.",
    );
    // Past the 60 mm cap no projection helps, and the message says so
    // instead of naming a number the field cannot take.
    const capped = validate(withChanges({ hookRoot: 24, hookProjection: 60, hookLip: 30, bandGauge: 40 }));
    expect(capped.byField.hookProjection?.[0]).toBe(
      "The hook opening is 27 mm between the plate and the lip, and a 40 mm band needs 42 mm. No projection clears it. Use a shorter lip, or a thinner band.",
    );
  });

  it("needs room for the fillet, the ramp, and the lip in the hook and the pocket", () => {
    expect(validate(withChanges({ hookLip: 25 })).byField.hookProjection?.[0]).toBe(
      "Hook projection must be at least 31 mm, so the fillet, the lip ramp, and the lip fit. Use a shorter lip, or a longer projection.",
    );
    expect(validate(withChanges({ pocketDepth: 20, pocketLip: 20 })).byField.pocketDepth?.[0]).toBe(
      "Pocket depth must be at least 26 mm, so the fillet, the lip ramp, and the lip fit. Use a shorter pocket lip, or a deeper pocket.",
    );
  });

  it("keeps 8 mm around each screw, with and without the pocket", () => {
    expect(validate(withChanges({ plateHeight: 117 })).valid).toBe(true);
    expect(validate(withChanges({ plateHeight: 116 })).byField.plateHeight?.[0]).toBe(
      "Plate height must be at least 117 mm, to hold the lower screw, the hook, the band gap, the pocket, the upper screw, and 8 mm of plate around each countersink. Use a taller plate, a shorter lip, or a thinner band.",
    );
    expect(validate(withChanges({ controllerPocket: false, plateHeight: 68 })).valid).toBe(true);
    expect(validate(withChanges({ controllerPocket: false, plateHeight: 67 })).byField.plateHeight?.[0]).toBe(
      "Plate height must be at least 68 mm, to hold the lower screw, the hook, the upper screw, and 8 mm of plate around each countersink. Use a taller plate, a shorter lip, or a thinner band.",
    );
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "plateWidth", "plateHeight", "plateThickness", "hookWidth", "hookRoot", "hookProjection",
      "hookLip", "bandGauge", "pocketWidth", "pocketDepth", "pocketLip", "pocketFloor", "screwDiameter",
    ] as const) {
      const cleared = { ...HEADPHONE_MOUNT_DEFAULTS, [key]: Number.NaN };
      expect(() => headphoneMount.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
  });

  it("derives the outside size, the opening, the screw spacing, and the loads", () => {
    expect(headphoneMount.derive(HEADPHONE_MOUNT_DEFAULTS).map((value) => value.value)).toEqual([
      "90 × 45 × 150 mm",
      "15 mm between the plate and the lip, for a 10 mm band",
      "2 on the center line, 125 mm apart",
      "5 kg or more at 3 perimeters in PLA, approximate. This app rates nothing above 5 kg.",
      "5 kg or more at 3 perimeters in PLA, approximate. This app rates nothing above 5 kg.",
    ]);
    // Even the smallest hook the spec allows rates over the 5 kg limit, so
    // the mount always shows the capped text, with the assumptions.
    const light = headphoneMount.derive(withChanges({ hookWidth: 20, hookRoot: 8, hookProjection: 20, hookLip: 4, bandGauge: 8 }));
    expect(light.find((value) => value.id === "hook-load")?.value).toBe(
      "5 kg or more at 3 perimeters in PLA, approximate. This app rates nothing above 5 kg.",
    );
    expect(headphoneMount.derive(withChanges({ controllerPocket: false }))).toHaveLength(4);
    expect(headphoneMount.summary(HEADPHONE_MOUNT_DEFAULTS)).toBe(
      "90 × 45 × 150 mm · 40 mm hook · 70 mm pocket",
    );
  });

  it("creates a deterministic filename", () => {
    expect(headphoneMount.filename(HEADPHONE_MOUNT_DEFAULTS)).toMatch(
      /^drawerforge-headphone-mount-90x45x150-[0-9a-f]{6}\.stl$/,
    );
  });

  it("carries the print pose and no compensation", () => {
    expect(headphoneMount.printOrientation?.rotationDegrees).toEqual({ x: -90, y: 0, z: 0 });
    expect(headphoneMount.printOrientation?.note).toMatch(/pointing up/);
    expect(headphoneMount.compensable).toBeUndefined();
  });
});

describe("headphone mount geometry", () => {
  const fixtures: Array<[string, Partial<HeadphoneMountParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["no pocket", { controllerPocket: false }],
    ["headset only", headphoneMount.presets[1].parameters],
    ["wide controller", headphoneMount.presets[2].parameters],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s mount", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());
    expect(model.status).toBe("NoError");
    expect(analysis.finite).toBe(true);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(layout.outsideWidth, 4);
    expect(size.y).toBeCloseTo(layout.outsideDepth, 4);
    expect(size.z).toBeCloseTo(layout.outsideHeight, 4);
    const contract = headphoneMount.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);
    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it.each(fixtures)("has no face over 45 degrees in the print pose: %s", async (_name, changes) => {
    const model = await generate(withChanges(changes));
    const faces = overhangFaces(model.mesh, headphoneMount.printOrientation);
    expect(faces, describeOverhangs(faces)).toEqual([]);
  });

  it("closes the pocket into a ring above its floor, and bores both screws", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const T = parameters.plateThickness;
    // Through the hook arm: one body.
    expect(horizontalSliceTopology(model.mesh, layout.hookArmZ + parameters.hookRoot / 2)).toMatchObject({
      contours: 1,
      holes: 0,
    });
    // Through the pocket floor: one body, the floor reaching the pocket depth.
    const floor = horizontalSliceTopology(model.mesh, layout.pocketZ + parameters.pocketFloor / 2);
    expect(floor).toMatchObject({ contours: 1, holes: 0 });
    expect(floor.containsSolid([0, -(T + parameters.pocketDepth - 1)])).toBe(true);
    // Above the floor: the plate, the two side walls, and the lip close a ring
    // around the pocket cavity.
    const ring = horizontalSliceTopology(model.mesh, layout.pocketZ + parameters.pocketFloor + 5);
    expect(ring).toMatchObject({ contours: 2, solidComponents: 1, holes: 1 });
    expect(ring.containsSolid([0, -(T + parameters.pocketDepth / 2)])).toBe(false);
    expect(ring.containsSolid([parameters.pocketWidth / 2 - 1, -(T + parameters.pocketDepth / 2)])).toBe(true);
    // Each screw row, just off the bore center line so the slice misses the
    // bore circle's own vertices. A bore runs along Y, right through the
    // plate, so the slice shows the plate cut in two.
    for (const z of [layout.lowerScrewZ, layout.upperScrewZ]) {
      const screw = horizontalSliceTopology(model.mesh, z + 0.3);
      expect(screw).toMatchObject({ contours: 2, solidComponents: 2, holes: 0 });
      expect(screw.containsSolid([0, -T / 2])).toBe(false);
    }
  });

  it("refuses the band case instead of building it", async () => {
    await expect(generate(withChanges({ bandGauge: 13.5 }))).rejects.toThrow(/hook opening/);
  });

  it("builds the largest mount inside the kernel time budget", async () => {
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(withChanges({ ...MAXIMUM_CASE, meshQuality: "fine" }));
    expect(model.status).toBe("NoError");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(HEADPHONE_MOUNT_DEFAULTS));
    expect(headphoneMount.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-45, -45, 0],
      [45, 0, 150],
    ]);
  });
});

describe("printed walls", () => {
  it("adds the lip and the pocket wall, and never the hook root", () => {
    expect(HEADPHONE_MOUNT_DEFAULTS.controllerPocket).toBe(true);
    const walls = headphoneMount.printedWalls!(HEADPHONE_MOUNT_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("lip")).toBeCloseTo(LIP_THICKNESS_MM);
    expect(byKey.get("pocket-wall")).toBeCloseTo(POCKET_WALL_MM);
    expect(byKey.has("hookRoot")).toBe(false);
    for (const key of wallLikeKeys(HEADPHONE_MOUNT_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("omits the pocket wall without a pocket", () => {
    const parameters = withChanges({ controllerPocket: false });
    const walls = headphoneMount.printedWalls!(parameters);
    expect(walls.some((wall) => wall.key === "pocket-wall")).toBe(false);
    expect(walls.some((wall) => wall.key === "lip")).toBe(true);
  });

  it("flags the lip and the pocket wall as thin at a wide enough nozzle", () => {
    // Both are fixed at 3 mm, exactly the floor a 1.5 mm nozzle sets (two
    // nozzle widths), so neither is thin there. A slightly wider nozzle
    // pushes the floor past both and demonstrates the same rule.
    const profile = normalizePrinterProfile({ nozzleDiameter: 1.6 });
    const issues = thinWallIssues(
      headphoneMount.printedWalls!(HEADPHONE_MOUNT_DEFAULTS),
      profile,
    );
    expect(issues.some((issue) => issue.text.includes("Lip thickness"))).toBe(
      true,
    );
    expect(
      issues.some((issue) => issue.text.includes("Pocket side wall")),
    ).toBe(true);
  });

  it("does not throw for a cleared field, and reports only finite values", () => {
    const cleared = { ...HEADPHONE_MOUNT_DEFAULTS, plateWidth: Number.NaN };
    const walls = headphoneMount.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
  });
});
