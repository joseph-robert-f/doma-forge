import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  CHAMFER_MM,
  MARKER_CUP_BLOCK_DEFAULTS,
  boreMouthSemiAxes,
  deriveLayout,
  markerCupBlock,
  type MarkerCupBlockParameters,
} from "../lib/products/marker-cup-block";
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

const { normalize, validate, generate } = markerCupBlock;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump MARKER_CUP_BLOCK_GEOMETRY_VERSION and re-record on
// purpose.
const GOLDEN_TRIANGLES = 3244;
const GOLDEN_VOLUME = 448525.81;

function withChanges(changes: Partial<MarkerCupBlockParameters>): MarkerCupBlockParameters {
  return normalize({ ...MARKER_CUP_BLOCK_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<MarkerCupBlockParameters> = {
  blockWidth: 60, blockDepth: 40, blockHeight: 20, rows: 1, cupsPerRow: 1,
  boreDiameter: 5, boreDepth: 8, tiltDegrees: 0,
  wallThickness: 1.2, baseThickness: 1.2, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<MarkerCupBlockParameters> = {
  blockWidth: 400, blockDepth: 300, blockHeight: 130, rows: 4, cupsPerRow: 10,
  boreDiameter: 35, boreDepth: 100, tiltDegrees: 15,
  wallThickness: 4, baseThickness: 6, cornerRadius: 18,
};
// A tilted bore whose mouth stays inside the back wall but whose floor, the
// end of the bore axis after it leans back, exits the wall. See the S06
// spec's Risks section and 21_WAVE_1_PRODUCTS_NOTES.md.
const TILT_WALL_BREACH_CASE: Partial<MarkerCupBlockParameters> = {
  blockWidth: 60, blockDepth: 40, blockHeight: 40, rows: 2, cupsPerRow: 2,
  boreDiameter: 6, boreDepth: 36, tiltDegrees: 15, chamfer: false,
  wallThickness: 1.2, baseThickness: 1.2, cornerRadius: 0, lightenUnderside: false,
};

describe("marker cup block parameters", () => {
  it("ships the cup-size presets in order", () => {
    expect(markerCupBlock.presets.map((preset) => preset.id)).toEqual([
      "fine-markers",
      "wide-markers-tilted",
      "brush-cups",
    ]);
  });

  it("builds only the rows the row count asks for", () => {
    const layout = deriveLayout(withChanges({ rows: 1 }));
    expect(layout.rowLayouts).toHaveLength(1);
  });

  it("rejects a bore deeper than the height minus the base at this tilt, naming the field", () => {
    const result = validate(withChanges({ boreDepth: 100 }));
    expect(result.valid).toBe(false);
    expect(result.byField.boreDepth?.[0]).toMatch(/Bore depth must be at most .* mm at this tilt/);
  });

  it("rejects a bore that would punch through the base, using the tilted floor's low edge, not its center", () => {
    // The floor disc's center sits depth * cos(tilt) below the mouth, but
    // its low edge, at radius (d/2 + chamfer), dips a further
    // (d/2 + chamfer) * sin(tilt). Checking only the center accepted this
    // input with a through hole; see 21_WAVE_1_PRODUCTS_NOTES.md.
    const throughHole = withChanges({
      blockWidth: 120, blockDepth: 90, blockHeight: 40, rows: 1, cupsPerRow: 1,
      boreDiameter: 35, boreDepth: 40, tiltDegrees: 15, chamfer: false,
      wallThickness: 2, baseThickness: 1.2, cornerRadius: 0, lightenUnderside: false,
    });
    const result = validate(throughHole);
    expect(result.valid).toBe(false);
    expect(result.byField.boreDepth?.[0]).toMatch(/Bore depth must be at most 35\.5 mm at this tilt/);
  });

  it("rejects cups whose web is under the minimum, naming the row and the fix", () => {
    const result = validate(withChanges({ cupsPerRow: 12, boreDiameter: 20 }));
    expect(result.valid).toBe(false);
    expect(result.byField.cupsPerRow?.[0]).toMatch(/Row 1: 12 cups of 20 mm/);
  });

  it("accepts a web exactly at the minimum", () => {
    // Inside width for 4 cups of 20 mm at a 2.5 mm web: 4 * 20 + 5 * 2.5 = 92.5.
    const exact = withChanges({ rows: 1, blockWidth: 96.5, wallThickness: 2 });
    expect(deriveLayout(exact).rowLayouts[0]).toMatchObject({ ok: true, web: 2.5 });
    expect(validate(exact).valid).toBe(true);
    expect(
      validate(withChanges({ rows: 1, blockWidth: 96, wallThickness: 2 })).byField.cupsPerRow,
    ).toHaveLength(1);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of ["blockWidth", "blockDepth", "wallThickness", "cupsPerRow", "rows", "blockHeight", "tiltDegrees"] as const) {
      const cleared = { ...MARKER_CUP_BLOCK_DEFAULTS, [key]: Number.NaN };
      expect(() => markerCupBlock.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
  });

  it("widens the row web needed as the tilt increases", () => {
    const upright = deriveLayout(withChanges({ tiltDegrees: 0 })).rowSpacing;
    const tilted = deriveLayout(withChanges({ tiltDegrees: 15 })).rowSpacing;
    expect(upright.ok && tilted.ok).toBe(true);
    if (upright.ok && tilted.ok) {
      expect(tilted.web).toBeLessThan(upright.web);
    }
  });

  it("rejects a tilted bore whose floor exits the wall while its mouth stays inside", () => {
    const upright = withChanges({ ...TILT_WALL_BREACH_CASE, tiltDegrees: 0 });
    expect(validate(upright).valid).toBe(true);

    const tilted = withChanges(TILT_WALL_BREACH_CASE);
    const result = validate(tilted);
    expect(result.valid).toBe(false);
    // A positive tilt swings the floor toward the front (negative Y), so
    // it is row 1, the front row, whose floor reaches the front wall.
    // Even a square corner (radius 0) does not fix a straight-wall
    // breach, so the message names the tilt, not the corner radius.
    expect(result.byField.tiltDegrees?.[0]).toMatch(
      /pushes the tilted floor of row 1 past the wall/,
    );
    expect(result.byField.cornerRadius).toBeUndefined();

    // The layout that flags it must be doing so by the floor, not the mouth:
    // the mouth alone stays inside the wall at this tilt.
    const layout = deriveLayout(tilted);
    const spacing = layout.rowSpacing;
    expect(spacing.ok).toBe(true);
    if (spacing.ok) {
      const rowY = spacing.firstCenter; // row 1
      const mouthSemiY = tilted.boreDiameter / 2 / Math.cos((tilted.tiltDegrees * Math.PI) / 180);
      expect(Math.abs(rowY) + mouthSemiY).toBeLessThan(
        tilted.blockDepth / 2 - tilted.wallThickness,
      );
    }
  });

  it("rejects a corner radius that cuts into an end cup, naming the largest radius that fits", () => {
    const corner = withChanges({
      blockWidth: 60, blockDepth: 40, blockHeight: 20, rows: 4, cupsPerRow: 7,
      boreDiameter: 5, boreDepth: 10, tiltDegrees: 0,
      wallThickness: 1.2, baseThickness: 1.2, cornerRadius: 20,
      chamfer: false, lightenUnderside: false,
    });
    const result = validate(corner);
    expect(result.valid).toBe(false);
    expect(result.byField.cornerRadius).toHaveLength(1);
    const maximum = Number(result.byField.cornerRadius?.[0].match(/at most ([\d.]+) mm/)?.[1]);
    expect(Number.isFinite(maximum)).toBe(true);
    expect(validate({ ...corner, cornerRadius: maximum }).valid).toBe(true);
    expect(validate({ ...corner, cornerRadius: maximum + 0.5 }).valid).toBe(false);
  });

  it("creates a deterministic filename with the size and the cup grid", () => {
    expect(markerCupBlock.filename(withChanges({ blockWidth: 120.5 }))).toMatch(
      /^drawerforge-marker-cup-block-120p5x90x70-2x4-[0-9a-f]{6}\.stl$/,
    );
    expect(markerCupBlock.filename(withChanges({ boreDiameter: 22 }))).not.toBe(
      markerCupBlock.filename(MARKER_CUP_BLOCK_DEFAULTS),
    );
  });

  it("derives the pitch per row, the base under the bores, and the pockets", () => {
    const values = markerCupBlock.derive(MARKER_CUP_BLOCK_DEFAULTS);
    expect(values[0].value).toBe("120 × 90 × 70 mm");
    // Defaults have lightenUnderside on, so this must be the pocket grid,
    // never the "none" string the no-pockets case below checks for.
    expect(values.at(-1)?.value).toMatch(/^\d+ × \d+, [\d.]+ mm deep$/);
    const noPockets = markerCupBlock.derive(withChanges({ lightenUnderside: false }));
    expect(noPockets.at(-1)?.value).toBe("none");
  });
});

describe("marker cup block geometry", () => {
  const fixtures: Array<[string, Partial<MarkerCupBlockParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["upright, no pockets", { tiltDegrees: 0, chamfer: false, lightenUnderside: false }],
    ["large corner radius with pockets", { blockHeight: 90, wallThickness: 1.2, cornerRadius: 15, tiltDegrees: 5 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s block", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.triangleCount).toBeGreaterThan(0);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(parameters.blockWidth, 4);
    expect(size.y).toBeCloseTo(parameters.blockDepth, 4);
    expect(size.z).toBeCloseTo(parameters.blockHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    const contract = markerCupBlock.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    const parameters = withChanges(TILT_WALL_BREACH_CASE);
    await expect(generate(parameters)).rejects.toThrow(/pushes the tilted floor of row 1 past the wall/);
  });

  it.each([
    ["default", {}],
    ["single cup", MINIMUM_CASE],
  ] as Array<[string, Partial<MarkerCupBlockParameters>]>)(
    "shows one outer contour and one hole per cup at the mid-depth of every bore in the %s block",
    async (_name, changes) => {
      const parameters = withChanges({ ...changes, lightenUnderside: false });
      const model = await generate(parameters);
      const tiltRadians = (parameters.tiltDegrees * Math.PI) / 180;
      const floorZ = parameters.blockHeight - parameters.boreDepth * Math.cos(tiltRadians);
      const midZ = (floorZ + parameters.blockHeight) / 2;
      const topology = horizontalSliceTopology(model.mesh, midZ);
      const cups = parameters.rows * parameters.cupsPerRow;
      expect({
        contours: topology.contours,
        solidComponents: topology.solidComponents,
        holes: topology.holes,
      }).toEqual({ contours: 1 + cups, solidComponents: 1, holes: cups });
    },
  );

  it("shows one outer contour and one hole per cup at the mouth, at the defaults' own tilt", async () => {
    // Exercises the tilt, not the untitled special case: a slice near the
    // top face, at half the tilted bore's own vertical reach, must still
    // show one hole per cup once the mouth-opening fix (D-1313) is in.
    const parameters = withChanges({ chamfer: false, lightenUnderside: false });
    const model = await generate(parameters);
    const tiltRadians = (parameters.tiltDegrees * Math.PI) / 180;
    const nearMouthZ = parameters.blockHeight - (parameters.boreDepth * Math.cos(tiltRadians)) / 2;
    const topology = horizontalSliceTopology(model.mesh, nearMouthZ);
    const cups = parameters.rows * parameters.cupsPerRow;
    expect({ contours: topology.contours, solidComponents: topology.solidComponents, holes: topology.holes }).toEqual(
      { contours: 1 + cups, solidComponents: 1, holes: cups },
    );
  });

  it("keeps the full base thickness above the pocket ceiling, at this tilt", async () => {
    // The pocket ceiling must sit baseThickness below the tilted bore
    // floor's own deepest, tilt-widened reach, not just its center's
    // vertical drop (see boreVerticalReach in schema.ts and
    // 21_WAVE_1_PRODUCTS_NOTES.md). Uses the defaults' own tilt.
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    expect(layout.lightening).not.toBeNull();
    const plan = layout.lightening!;
    const model = await generate(parameters);
    const pockets = horizontalSliceTopology(model.mesh, plan.pocketDepth / 2);
    expect(pockets.holes).toBe(plan.countX * plan.countY);
    // Just above the pocket ceiling, inside the base: solid, no bore
    // reaching down into it.
    const base = horizontalSliceTopology(model.mesh, plan.pocketDepth + parameters.baseThickness / 2);
    expect(base).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
  });

  it("removes the same volume tilted as upright, once the mouth is fully open", async () => {
    const upright = await generate(withChanges({ tiltDegrees: 0, chamfer: false, lightenUnderside: false }));
    const tilted = await generate(withChanges({ tiltDegrees: 15, chamfer: false, lightenUnderside: false }));
    expect(tilted.bounds).toEqual(upright.bounds);
    // A cylindrical bore of a given depth, pivoted at its mouth on the
    // flat top face, removes the same volume from the slab whatever its
    // tilt: the wider opening at the mouth on one side exactly balances
    // the shallower vertical reach at the center on the other. Equal
    // volumes here is the correctness check for the fix in
    // `tiltedBoreCutter`: with the wedge-roofing defect it fixed, less
    // volume was removed as the tilt increased (a real bore floor was
    // left partly closed).
    expect(Math.abs(tilted.volume - upright.volume) / upright.volume).toBeLessThan(1e-9);
  });

  it("fully opens the tilted mouth ellipse at the top face, leaving no roofed wedge", async () => {
    // At the defaults' tilt, the S06 spec's Risk: a slice just under the
    // top face must already show the whole mouth ellipse open, including
    // its far edge, where a missing axial overshoot used to leave a wedge
    // of un-cut material roofing part of the mouth. See D-1302/geometry.ts.
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const spacing = layout.rowSpacing;
    const row = layout.rowLayouts[0];
    expect(spacing.ok && row.ok).toBe(true);
    if (!spacing.ok || !row.ok) return;
    const cupX = row.firstCenter;
    const cupY = spacing.firstCenter;
    const tiltRadians = (parameters.tiltDegrees * Math.PI) / 180;
    const mouthSemiY = boreMouthSemiAxes(
      parameters.boreDiameter / 2 + CHAMFER_MM,
      tiltRadians,
    ).semiY;

    const model = await generate(parameters);
    const topology = horizontalSliceTopology(model.mesh, parameters.blockHeight - 0.01);
    // Both edges of the ellipse, near and far along Y, and its center.
    expect(topology.containsSolid([cupX, cupY + mouthSemiY * 0.95])).toBe(false);
    expect(topology.containsSolid([cupX, cupY - mouthSemiY * 0.95])).toBe(false);
    expect(topology.containsSolid([cupX, cupY])).toBe(false);
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

  it("builds 40 fine, tilted cups with pockets inside the kernel time budget", async () => {
    const parameters = withChanges({
      blockWidth: 400, blockDepth: 300, blockHeight: 130, rows: 4, cupsPerRow: 10,
      boreDiameter: 30, boreDepth: 90, tiltDegrees: 15, meshQuality: "fine",
    });
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(parameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // Budget of two seconds, the same margin recorded for the socket tray
    // in 20_KERNEL_MODULES_NOTES.md D-913.
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
    const model = await generate(normalize(MARKER_CUP_BLOCK_DEFAULTS));
    expect(markerCupBlock.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-60, -45, 0],
      [60, 45, 70],
    ]);
  });
});
