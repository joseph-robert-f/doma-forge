import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  LIP_THICKNESS_MM,
  WALL_HOOK_RAIL_DEFAULTS,
  WALL_HOOK_RAIL_SPECS,
  deriveLayout,
  wallHookRail,
  type WallHookRailParameters,
} from "../lib/products/wall-hook-rail";
import {
  normalizePrinterProfile,
  thinWallIssues,
  wallLikeKeys,
} from "../lib/printer-profile";
import { inspectBinaryStl, serializeBinaryStl } from "../lib/stl";
import { analyzeBufferGeometry, modelToBufferGeometry } from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";
import { describeOverhangs, overhangFaces } from "./helpers/print-pose";

const { normalize, validate, generate } = wallHookRail;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump WALL_HOOK_RAIL_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 692;
const GOLDEN_VOLUME = 69278.04;

function withChanges(changes: Partial<WallHookRailParameters>): WallHookRailParameters {
  return normalize({ ...WALL_HOOK_RAIL_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<WallHookRailParameters> = {
  railLength: 100, railHeight: 41, plateThickness: 3, hookCount: 1, hookWidth: 8,
  hookRoot: 8, hookProjection: 12, hookLip: 0, screwCount: 1, screwSpacing: 20,
  screwDiameter: 3, keyShelf: false, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<WallHookRailParameters> = {
  railLength: 400, railHeight: 120, plateThickness: 8, hookCount: 8, hookWidth: 24,
  hookRoot: 20, hookProjection: 50, hookLip: 20, screwCount: 4, screwSpacing: 100,
  screwDiameter: 6, keyShelf: true, shelfDepth: 80, cornerRadius: 10,
};

describe("wall hook rail parameters", () => {
  it("ships the rail presets in order", () => {
    expect(wallHookRail.presets.map((preset) => preset.id)).toEqual([
      "key-rail",
      "bag-hooks",
      "key-shelf",
    ]);
  });

  it("stacks the hook band, the screw row, and the shelf up the plate", () => {
    const layout = deriveLayout(WALL_HOOK_RAIL_DEFAULTS);
    expect(layout.armZ).toBe(6);
    expect(layout.rootTop).toBe(17);
    expect(layout.lipTop).toBe(20);
    expect(layout.headDiameter).toBe(9);
    expect(layout.screwBandBottom).toBe(25);
    expect(layout.screwBandTop).toBe(42);
    expect(layout.screwZ).toBe(33.5);
    expect(layout.minimumHeight).toBe(42);
    expect(layout.hookCenters.map((x) => Number(x.toFixed(6)))).toEqual([-75.6, -25.2, 25.2, 75.6]);
    expect(layout.screws).toMatchObject({ ok: true, positions: [-80, 80] });
  });

  it("accepts a projection at 2.5 times the root and refuses one step over it", () => {
    expect(validate(withChanges({ hookRoot: 8, hookProjection: 20 })).valid).toBe(true);
    const result = validate(withChanges({ hookRoot: 8, hookProjection: 20.5 }));
    expect(result.valid).toBe(false);
    expect(result.byField.hookProjection?.[0]).toBe(
      "A 20.5 mm hook on a 8 mm root snaps across the layers. Keep the projection at most 2.5 times the root and at most 60 mm. Use a projection of at most 20 mm, or a root of at least 8.2 mm.",
    );
    expect(validate(withChanges({ hookRoot: 20, hookProjection: 50, railHeight: 60 })).valid).toBe(true);
    expect(validate(withChanges({ hookRoot: 20, hookProjection: 50.5, railHeight: 60 })).valid).toBe(false);
    // The 60 mm cap: the largest root reaches it exactly, so the root the
    // message asks for is always inside the field's range.
    expect(validate(withChanges({ hookRoot: 24, hookProjection: 60, railHeight: 70 })).valid).toBe(true);
    expect(validate(withChanges({ hookRoot: 8, hookProjection: 55 })).byField.hookProjection?.[0]).toMatch(
      /a root of at least 22 mm\.$/,
    );
  });

  it("accepts the smallest root and refuses one step under it", () => {
    expect(validate(withChanges({ hookRoot: 8 })).valid).toBe(true);
    expect(validate(withChanges({ hookRoot: 7.5 })).byField.hookRoot?.[0]).toBe(
      "Root must be between 8 and 24 mm.",
    );
  });

  it("needs room for the fillet, the ramp, and the lip in the projection", () => {
    expect(validate(withChanges({ hookRoot: 12, hookLip: 20, hookProjection: 26 })).valid).toBe(true);
    const result = validate(withChanges({ hookRoot: 12, hookLip: 20, hookProjection: 25 }));
    expect(result.byField.hookProjection?.[0]).toBe(
      "Hook projection must be at least 26 mm, so the fillet, the lip ramp, and the lip fit. Use a shorter lip, or a longer projection.",
    );
  });

  it("keeps 20 mm between hooks, naming the count and the fix", () => {
    expect(validate(withChanges({ hookCount: 4, hookWidth: 30 })).valid).toBe(true);
    const result = validate(withChanges({ hookCount: 5, hookWidth: 30 }));
    expect(result.byField.hookCount?.[0]).toBe(
      "5 hooks of 30 mm leave 15 mm between them, and each gap must be at least 20 mm. Use fewer hooks, narrower hooks, or a longer rail.",
    );
  });

  it("keeps 8 mm from an end countersink to the rail end", () => {
    expect(validate(withChanges({ screwSpacing: 215 })).valid).toBe(true);
    const result = validate(withChanges({ screwSpacing: 216 }));
    expect(result.byField.screwSpacing?.[0]).toBe(
      "2 screws at 216 mm leave 7.5 mm from an end countersink to the rail end, and it must be at least 8 mm. Use a spacing of at most 215 mm, or a longer rail.",
    );
  });

  it("keeps the screw row 8 mm from the hook root and the plate top, or the shelf gussets", () => {
    expect(validate(withChanges({ railHeight: 42 })).valid).toBe(true);
    expect(validate(withChanges({ railHeight: 41 })).byField.railHeight?.[0]).toBe(
      "Rail height must be at least 42 mm, to hold the hook root, the screw row, and 8 mm of plate around each countersink. Use a taller rail, a smaller root, or a smaller screw.",
    );
    expect(validate(withChanges({ keyShelf: true, railHeight: 77 })).valid).toBe(true);
    expect(validate(withChanges({ keyShelf: true, railHeight: 76 })).byField.railHeight?.[0]).toBe(
      "Rail height must be at least 77 mm, to hold the hook root, the screw row, the shelf gussets, and 8 mm of plate around each countersink. Use a taller rail, a smaller root, or a smaller screw.",
    );
  });

  it("puts a gusset at each end of the shelf and a rib every 150 mm", () => {
    expect(deriveLayout(withChanges({ keyShelf: true, railHeight: 80 })).gussetCenters).toEqual([
      -117.5, 117.5, 0,
    ]);
    const long = deriveLayout(withChanges({ keyShelf: true, railHeight: 80, railLength: 400, plateThickness: 5 }));
    // 390 mm between the end gussets: three bays of 130 mm.
    expect(long.gussetCenters.map((x) => Number(x.toFixed(6)))).toEqual([-197.5, 197.5, -65, 65]);
    expect(deriveLayout(withChanges({ keyShelf: true, railHeight: 80, railLength: 150 })).gussetCenters).toEqual([
      -72.5, 72.5,
    ]);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "railLength", "railHeight", "plateThickness", "hookCount", "hookWidth", "hookRoot",
      "hookProjection", "hookLip", "screwCount", "screwSpacing", "screwDiameter", "shelfDepth",
    ] as const) {
      const cleared = { ...WALL_HOOK_RAIL_DEFAULTS, [key]: Number.NaN };
      expect(() => wallHookRail.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
  });

  it("creates a deterministic filename with the size and the hook count", () => {
    expect(wallHookRail.filename(WALL_HOOK_RAIL_DEFAULTS)).toMatch(
      /^drawerforge-wall-hook-rail-240x25x50-4hooks-[0-9a-f]{6}\.stl$/,
    );
    expect(wallHookRail.filename(withChanges({ hookRoot: 9 }))).not.toBe(
      wallHookRail.filename(WALL_HOOK_RAIL_DEFAULTS),
    );
  });

  it("derives the outside size, the pitch, the screw row, and the approximate load", () => {
    expect(wallHookRail.derive(WALL_HOOK_RAIL_DEFAULTS).map((value) => value.value)).toEqual([
      "240 × 25 × 50 mm",
      "50.4 mm, 38.4 mm between hooks",
      "2 at 160 mm, 33.5 mm up from the bottom",
      "about 3.3 kg at 3 perimeters in PLA, approximate",
    ]);
    expect(wallHookRail.derive(withChanges({ keyShelf: true, railHeight: 80 })).at(-1)).toMatchObject({
      id: "shelf-load",
    });
    expect(wallHookRail.summary(WALL_HOOK_RAIL_DEFAULTS)).toBe(
      "240 × 25 × 50 mm · 4 hooks · 2 screws at 160 mm",
    );
  });

  it("never shows a load without the material and the perimeters it assumes", () => {
    for (const changes of [{}, { hookRoot: 20, hookProjection: 20, hookWidth: 30 }]) {
      const load = wallHookRail.derive(withChanges(changes)).find((value) => value.id === "hook-load");
      expect(load?.value).toMatch(/3 perimeters in PLA/);
      expect(load?.value).toMatch(/approximate/);
    }
  });

  it("carries the print pose: plate on the bed, hooks up", () => {
    expect(wallHookRail.printOrientation?.rotationDegrees).toEqual({ x: -90, y: 0, z: 0 });
    expect(wallHookRail.printOrientation?.note).toMatch(/plate flat on the bed/);
    expect(wallHookRail.printOrientation?.note).toMatch(/hooks pointing up/);
  });

  it("is not compensated: nothing on it fits a measured space", () => {
    expect(wallHookRail.compensable).toBeUndefined();
  });
});

describe("wall hook rail geometry", () => {
  const fixtures: Array<[string, Partial<WallHookRailParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["bag hooks", wallHookRail.presets[1].parameters],
    ["key shelf", wallHookRail.presets[2].parameters],
    ["single hook", { hookCount: 1 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s rail", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(layout.outsideWidth, 4);
    expect(size.y).toBeCloseTo(layout.outsideDepth, 4);
    expect(size.z).toBeCloseTo(layout.outsideHeight, 4);
    const contract = wallHookRail.boundsContract(parameters);
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
    const faces = overhangFaces(model.mesh, wallHookRail.printOrientation);
    expect(faces, describeOverhangs(faces)).toEqual([]);
  });

  it("refuses the hook rule case instead of building it", async () => {
    await expect(generate(withChanges({ hookProjection: 20.5 }))).rejects.toThrow(
      /snaps across the layers/,
    );
  });

  it("joins every hook to the plate and bores every screw through it", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    // Through the hook arms: the plate and the four hooks are one body.
    const arms = horizontalSliceTopology(model.mesh, layout.armZ + parameters.hookRoot / 2);
    expect(arms).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
    // The hooks face -Y. The hook row is symmetric, so each center is a hook.
    for (const x of layout.hookCenters) {
      expect(arms.containsSolid([x, -(parameters.plateThickness + parameters.hookProjection - 1)])).toBe(true);
    }
    // Between two hooks there is only the plate.
    expect(arms.containsSolid([0, -(parameters.plateThickness + 5)])).toBe(false);
    // Through the screw row, just off the bore center line so the slice
    // misses the bore circle's own vertices. A bore runs along Y, right
    // through the plate, so the slice shows the plate cut into three pieces.
    const screws = horizontalSliceTopology(model.mesh, layout.screwZ + 0.3);
    expect(screws).toMatchObject({ contours: 3, solidComponents: 3, holes: 0 });
    expect(screws.containsSolid([-80, -parameters.plateThickness / 2])).toBe(false);
    expect(screws.containsSolid([0, -parameters.plateThickness / 2])).toBe(true);
  });

  it("clips the shelf and its gussets to the rounded plate corners", async () => {
    const parameters = withChanges({ keyShelf: true, railHeight: 80, cornerRadius: 10 });
    const model = await generate(parameters);
    // At the shelf, just under the plate top, the rounded corner has no material.
    const shelf = horizontalSliceTopology(model.mesh, parameters.railHeight - 1);
    expect(shelf.containsSolid([parameters.railLength / 2 - 0.5, -(parameters.plateThickness + 10)])).toBe(false);
    expect(shelf.containsSolid([0, -(parameters.plateThickness + 10)])).toBe(true);
  });

  it("builds the single-hook coupon at the rail's own hook", async () => {
    const coupon = await wallHookRail.coupon!(WALL_HOOK_RAIL_DEFAULTS);
    expect(coupon.bounds).toEqual([
      [-30, -25, 0],
      [30, 0, 50],
    ]);
    expect(connectedComponentCount(coupon.mesh.triVerts)).toBe(1);
    const contract = wallHookRail.couponBoundsContract!(WALL_HOOK_RAIL_DEFAULTS);
    expect(coupon.bounds).toEqual([contract.min, contract.max]);
    const layout = deriveLayout(WALL_HOOK_RAIL_DEFAULTS);
    expect(horizontalSliceTopology(coupon.mesh, layout.armZ + 4)).toMatchObject({ contours: 1 });
    expect(horizontalSliceTopology(coupon.mesh, layout.screwZ + 0.3)).toMatchObject({ solidComponents: 3 });
    expect(overhangFaces(coupon.mesh, wallHookRail.printOrientation)).toEqual([]);
    await expect(wallHookRail.coupon!(withChanges({ hookProjection: 20.5 }))).rejects.toThrow(
      /snaps across the layers/,
    );
  });

  it("increases round-feature fidelity with mesh quality", async () => {
    const counts: number[] = [];
    for (const meshQuality of ["draft", "standard", "fine"] as const) {
      const model = await generate(withChanges({ meshQuality }));
      counts.push(model.mesh.triVerts.length / 3);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("builds the largest rail inside the kernel time budget", async () => {
    const parameters = withChanges({ ...MAXIMUM_CASE, meshQuality: "fine" });
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(parameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
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
    expect(parsed.getAttribute("position").count).toBe(geometry.getAttribute("position").count);
    parsed.dispose();
    geometry.dispose();
  });

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(WALL_HOOK_RAIL_DEFAULTS));
    expect(wallHookRail.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-120, -25, 0],
      [120, 0, 50],
    ]);
  });
});

describe("printed walls", () => {
  it("adds the lip to the key-name walls", () => {
    const walls = wallHookRail.printedWalls!(WALL_HOOK_RAIL_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("lip")).toBeCloseTo(LIP_THICKNESS_MM);
    for (const key of wallLikeKeys(WALL_HOOK_RAIL_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("keeps the lip whether or not the shelf is on", () => {
    const withShelf = withChanges({ keyShelf: true });
    const walls = wallHookRail.printedWalls!(withShelf);
    expect(walls.some((wall) => wall.key === "lip")).toBe(true);
    // The gusset and the shelf both build at the plate thickness, already
    // reported by the key rule, so neither gets a separate entry.
    expect(walls.some((wall) => wall.key.includes("gusset"))).toBe(false);
    expect(walls.some((wall) => wall.key.includes("shelf"))).toBe(false);
  });

  it("flags the lip as thin at a wide enough nozzle", () => {
    // The lip is fixed at 3 mm, exactly the floor a 1.5 mm nozzle sets
    // (two nozzle widths), so it is not itself thin there. A slightly
    // wider nozzle pushes the floor past the fixed lip and demonstrates
    // the same rule.
    const profile = normalizePrinterProfile({ nozzleDiameter: 1.6 });
    const issues = thinWallIssues(
      wallHookRail.printedWalls!(WALL_HOOK_RAIL_DEFAULTS),
      profile,
    );
    expect(issues.some((issue) => issue.text.includes("Lip thickness"))).toBe(
      true,
    );
  });

  it("does not throw for a cleared field, and reports only finite values", () => {
    const cleared = { ...WALL_HOOK_RAIL_DEFAULTS, railLength: Number.NaN };
    const walls = wallHookRail.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
  });
});
