import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  BATTERY_ORGANIZER_DEFAULTS,
  FINGER_RELIEF_DEPTH_MM,
  batteryOrganizer,
  deriveLayout,
  type BatteryOrganizerParameters,
} from "../lib/products/battery-organizer";
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

const { normalize, validate, generate } = batteryOrganizer;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump BATTERY_ORGANIZER_GEOMETRY_VERSION and re-record on
// purpose.
const GOLDEN_TRIANGLES = 3084;
const GOLDEN_VOLUME = 330330.14;

function withChanges(changes: Partial<BatteryOrganizerParameters>): BatteryOrganizerParameters {
  return normalize({ ...BATTERY_ORGANIZER_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<BatteryOrganizerParameters> = {
  organizerWidth: 60, organizerDepth: 40, organizerHeight: 20, rows: 1, cellsPerRow: 1,
  cellDiameter: 5, cellLength: 10, exposedHeight: 3, clearancePerSide: 0,
  wallThickness: 1.2, baseThickness: 1.2, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<BatteryOrganizerParameters> = {
  organizerWidth: 400, organizerDepth: 300, organizerHeight: 100, rows: 4, cellsPerRow: 8,
  cellDiameter: 34, cellLength: 65, exposedHeight: 10, clearancePerSide: 2,
  wallThickness: 4, baseThickness: 6, cornerRadius: 20,
};
const COIN_CELL_CASE: Partial<BatteryOrganizerParameters> = {
  organizerWidth: 90, organizerDepth: 72, organizerHeight: 20, rows: 2, cellsPerRow: 5,
  cellDiameter: 20, cellLength: 3.2, cellShape: "slot", exposedHeight: 8, clearancePerSide: 0.4,
};
// A corner radius wide enough to cut the end wells open once the finger
// relief widens them. At the tight webs the relief itself already flags
// (row and column both close to the 8.5 mm relief-safe minimum), a
// genuine corner-only conflict needs a web within a few hundredths of a
// millimeter of that floor: below it, the row or column check reports its
// own error too, so both fire together here. That is realistic — a
// cramped layout is rarely tight in only one way — so the test checks
// that the corner fix (a smaller radius, or the relief off) clears the
// corner-specific error, not that it clears every error.
const CORNER_CONFLICT_CASE: Partial<BatteryOrganizerParameters> = {
  organizerWidth: 92, organizerDepth: 65, organizerHeight: 20, rows: 4, cellsPerRow: 6,
  cellDiameter: 5, cellLength: 10, exposedHeight: 3, clearancePerSide: 0.05,
  wallThickness: 1.2, baseThickness: 1.2, cornerRadius: 20,
};

describe("battery organizer parameters", () => {
  it("ships the cell presets in order", () => {
    expect(batteryOrganizer.presets.map((preset) => preset.id)).toEqual([
      "aa",
      "aaa",
      "c-cell",
      "d-cell",
      "18650",
      "2032-coin",
    ]);
  });

  it("builds only the rows the row count asks for", () => {
    const layout = deriveLayout(withChanges({ rows: 1 }));
    expect(layout.rowLayouts).toHaveLength(1);
  });

  it("sets the well depth from the cell's standing length minus the exposed height", () => {
    const round = deriveLayout(withChanges({ cellLength: 50.5, exposedHeight: 12 }));
    expect(round.boreDepth).toBeCloseTo(38.5, 6);
    const coin = deriveLayout(withChanges(COIN_CELL_CASE));
    // A coin cell's standing length is its diameter, not its length.
    expect(coin.boreDepth).toBeCloseTo(COIN_CELL_CASE.cellDiameter! - COIN_CELL_CASE.exposedHeight!, 6);
  });

  it("rejects an exposed height at or past the cell's standing length, naming the field", () => {
    const result = validate(withChanges({ cellLength: 20, exposedHeight: 20 }));
    expect(result.valid).toBe(false);
    expect(result.byField.exposedHeight?.[0]).toMatch(/standing length of the cell/);
  });

  it("rejects a well deeper than the height minus the base, naming the field and the fix", () => {
    const result = validate(withChanges({ organizerHeight: 20, exposedHeight: 3 }));
    expect(result.valid).toBe(false);
    expect(result.byField.exposedHeight?.[0]).toMatch(/Exposed height must be at least/);
  });

  it("rejects cells whose web is under the minimum, naming the row and the fix", () => {
    const result = validate(withChanges({ cellsPerRow: 12 }));
    expect(result.valid).toBe(false);
    expect(result.byField.cellsPerRow?.[0]).toMatch(/Row 1: 12 cells/);
  });

  it("rejects a web that fits the plain minimum but not the finger relief's own", () => {
    // The pitch solve reserves only the plain 2.5 mm minimum web, using
    // each well's un-widened footprint; the finger relief is not itself a
    // cutter the layout is solved around. Six cells per row on the
    // defaults leaves a 3.3 mm web -- enough for the plain minimum, not
    // enough once the 6 mm-wider relief is added on top.
    const withoutRelief = withChanges({ cellsPerRow: 6, fingerRelief: false });
    expect(validate(withoutRelief).valid).toBe(true);
    const withRelief = withChanges({ cellsPerRow: 6 });
    const result = validate(withRelief);
    expect(result.valid).toBe(false);
    expect(result.byField.cellsPerRow?.[0]).toMatch(
      /Row 1: 6 cells leave a web of 3\.3 mm, but the finger relief widens each well by 6 mm/,
    );
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "organizerWidth", "organizerDepth", "wallThickness", "cellsPerRow", "rows",
      "organizerHeight", "cellDiameter", "cellLength", "exposedHeight", "clearancePerSide",
    ] as const) {
      const cleared = { ...BATTERY_ORGANIZER_DEFAULTS, [key]: Number.NaN };
      expect(() => batteryOrganizer.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
  });

  it("rejects a corner radius that cuts into an end well once the finger relief is included", () => {
    const corner = withChanges(CORNER_CONFLICT_CASE);
    const result = validate(corner);
    expect(result.valid).toBe(false);
    expect(result.byField.cornerRadius?.[0]).toMatch(/cuts into the end wells of row/);
    const maximum = Number(result.byField.cornerRadius?.[0].match(/at most ([\d.]+) mm/)?.[1]);
    expect(Number.isFinite(maximum)).toBe(true);
    // The corner-specific error clears at the reported radius and returns
    // just past it; the row and column web errors, present here too (see
    // the comment on CORNER_CONFLICT_CASE), are unaffected either way.
    expect(validate({ ...corner, cornerRadius: maximum }).byField.cornerRadius).toBeUndefined();
    expect(validate({ ...corner, cornerRadius: maximum + 0.5 }).byField.cornerRadius).toBeDefined();
    // Turning off the finger relief narrows the footprint and satisfies
    // the plain (non-relief) minimum web too, so the whole design clears.
    expect(validate({ ...corner, cornerRadius: maximum + 0.5, fingerRelief: false }).valid).toBe(
      true,
    );
  });

  it("creates a deterministic filename with the size and the well grid", () => {
    expect(batteryOrganizer.filename(withChanges({ organizerWidth: 120.5 }))).toMatch(
      /^drawerforge-battery-organizer-120p5x85x45-3x4-[0-9a-f]{6}\.stl$/,
    );
    expect(batteryOrganizer.filename(withChanges({ cellDiameter: 20 }))).not.toBe(
      batteryOrganizer.filename(BATTERY_ORGANIZER_DEFAULTS),
    );
  });

  it("derives the well depth, the pitch per row, and the pockets", () => {
    const values = batteryOrganizer.derive(BATTERY_ORGANIZER_DEFAULTS);
    expect(values[0].value).toBe("120 × 85 × 45 mm");
    expect(values[1].label).toBe("Well depth");
    const noPockets = batteryOrganizer.derive(withChanges({ lightenUnderside: false }));
    expect(noPockets.at(-1)?.value).toBe("none");
  });
});

describe("battery organizer geometry", () => {
  const fixtures: Array<[string, Partial<BatteryOrganizerParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["no finger relief, no pockets", { fingerRelief: false, lightenUnderside: false }],
    ["coin cells on edge", COIN_CELL_CASE],
    ["large corner radius with pockets", { organizerHeight: 60, wallThickness: 1.2, cornerRadius: 12 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s organizer", async (_name, changes) => {
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
    expect(size.x).toBeCloseTo(parameters.organizerWidth, 4);
    expect(size.y).toBeCloseTo(parameters.organizerDepth, 4);
    expect(size.z).toBeCloseTo(parameters.organizerHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    const contract = batteryOrganizer.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    const parameters = withChanges({ cellsPerRow: 12 });
    await expect(generate(parameters)).rejects.toThrow(/Row 1: 12 cells/);
  });

  it.each([
    ["default", {}],
    ["coin cells on edge", COIN_CELL_CASE],
    ["single cell", MINIMUM_CASE],
  ] as Array<[string, Partial<BatteryOrganizerParameters>]>)(
    "shows one outer contour and one hole per well in a slice through the %s wells",
    async (_name, changes) => {
      // The finger relief stays on (its default): this slice, mid-bore,
      // is always well below the relief's own shallow 3 mm depth, so it
      // exercises a real, relief-on model rather than a disabled feature.
      const parameters = withChanges({ ...changes, lightenUnderside: false });
      const layout = deriveLayout(parameters);
      const model = await generate(parameters);
      const topology = horizontalSliceTopology(
        model.mesh,
        parameters.organizerHeight - layout.boreDepth / 2,
      );
      const wells = parameters.rows * parameters.cellsPerRow;
      expect({
        contours: topology.contours,
        solidComponents: topology.solidComponents,
        holes: topology.holes,
      }).toEqual({ contours: 1 + wells, solidComponents: 1, holes: wells });
    },
  );

  it.each([
    ["default", {}],
    ["large corner radius", { organizerHeight: 60, wallThickness: 1.2, cornerRadius: 12 }],
  ] as Array<[string, Partial<BatteryOrganizerParameters>]>)(
    "shows the whole pocket grid in a slice through the %s underside and none above the base",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const layout = deriveLayout(parameters);
      const model = await generate(parameters);
      const plan = layout.lightening!;
      const pockets = horizontalSliceTopology(model.mesh, plan.pocketDepth / 2);
      expect(pockets.holes).toBe(plan.countX * plan.countY);
      const base = horizontalSliceTopology(
        model.mesh,
        plan.pocketDepth + parameters.baseThickness / 2,
      );
      expect(base).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
    },
  );

  it("widens a well mouth with the finger relief without changing the bounds or the well depth", async () => {
    const plain = await generate(withChanges({ fingerRelief: false }));
    const relief = await generate(withChanges({ fingerRelief: true }));
    expect(relief.bounds).toEqual(plain.bounds);
    expect(relief.volume).toBeLessThan(plain.volume);
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const floorSlice = parameters.organizerHeight - layout.boreDepth - 0.5;
    const plainFloor = horizontalSliceTopology(plain.mesh, floorSlice);
    const reliefFloor = horizontalSliceTopology(relief.mesh, floorSlice);
    expect(plainFloor.holes).toBe(0);
    expect(reliefFloor.holes).toBe(0);
  });

  it("keeps every finger relief its own separate well, not merged into a trough", async () => {
    // The defaults (relief on, geometryVersion 1) satisfy the relief-safe
    // minimum web validation now requires; a slice inside the relief's
    // own 3 mm depth must still show one hole per well, not one shared
    // trough per row from two reliefs merging. See the rejected case
    // above for what an under-webbed layout would have produced instead.
    const parameters = withChanges({});
    const model = await generate(parameters);
    const topology = horizontalSliceTopology(
      model.mesh,
      parameters.organizerHeight - FINGER_RELIEF_DEPTH_MM / 2,
    );
    const wells = parameters.rows * parameters.cellsPerRow;
    expect({
      contours: topology.contours,
      solidComponents: topology.solidComponents,
      holes: topology.holes,
    }).toEqual({ contours: 1 + wells, solidComponents: 1, holes: wells });
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

  it("builds 32 fine wells with pockets inside the kernel time budget", async () => {
    const parameters = withChanges({
      organizerWidth: 400, organizerDepth: 300, organizerHeight: 100, rows: 4, cellsPerRow: 8,
      cellDiameter: 30, cellLength: 65, exposedHeight: 15, meshQuality: "fine",
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
    const model = await generate(normalize(BATTERY_ORGANIZER_DEFAULTS));
    expect(batteryOrganizer.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-60, -42.5, 0],
      [60, 42.5, 45],
    ]);
  });
});
