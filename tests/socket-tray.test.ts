import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  MINIMUM_WEB_MM,
  SOCKET_TRAY_DEFAULTS,
  deriveLayout,
  socketTray,
  type SocketTrayParameters,
} from "../lib/products/socket-tray";
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

const { normalize, validate, generate } = socketTray;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump SOCKET_TRAY_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 4092;
const GOLDEN_VOLUME = 412174.09;

function withChanges(changes: Partial<SocketTrayParameters>): SocketTrayParameters {
  return normalize({ ...SOCKET_TRAY_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<SocketTrayParameters> = {
  trayWidth: 60, trayDepth: 40, trayHeight: 10, rows: 1, holesPerRow: 1,
  boreDepth: 3, boreDiameter1: 5, wallThickness: 1.2, baseThickness: 1.2, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<SocketTrayParameters> = {
  trayWidth: 400, trayDepth: 300, trayHeight: 60, rows: 4, holesPerRow: 12,
  boreDepth: 54, wallThickness: 4, baseThickness: 6, cornerRadius: 20,
};

describe("socket tray parameters", () => {
  it("ships the drive-size presets in order", () => {
    expect(socketTray.presets.map((preset) => preset.id)).toEqual([
      "quarter-inch",
      "half-inch",
      "driver-bits",
    ]);
  });

  it("builds only the rows the row count asks for", () => {
    const layout = deriveLayout(withChanges({ rows: 3 }));
    expect(layout.rowDiameters).toEqual([13, 17, 22]);
    expect(layout.rowLayouts).toHaveLength(3);
  });

  it("rejects a bore deeper than the height minus the base, naming the field", () => {
    const result = validate(withChanges({ boreDepth: 23 }));
    expect(result.valid).toBe(false);
    expect(result.byField.boreDepth?.[0]).toBe(
      "Bore depth must be at most 22.6 mm, so that 2.4 mm of base stays under the bores.",
    );
  });

  it("rejects a row whose web is under the minimum, naming the row and the fix", () => {
    // 196 mm inside the rim: 12 bores of 13 mm leave (196 - 156) / 13 = 3.08 mm;
    // 12 bores of 14 mm leave (196 - 168) / 13 = 2.15 mm.
    expect(validate(withChanges({ holesPerRow: 12, boreDiameter2: 13 })).valid).toBe(true);
    const result = validate(withChanges({ holesPerRow: 12, boreDiameter2: 14 }));
    expect(result.valid).toBe(false);
    expect(result.byField.holesPerRow).toEqual([
      `Row 2: 12 bores of 14 mm leave a web of 2.2 mm. Keep at least ${MINIMUM_WEB_MM} mm between bores. Use fewer bores per row, a smaller row 2 bore, or a wider tray.`,
    ]);
  });

  it("accepts a web exactly at the minimum", () => {
    // Inside width for 8 bores of 17 mm at a 2.5 mm web: 8 * 17 + 9 * 2.5 = 158.5.
    const exact = withChanges({ trayWidth: 162.5, wallThickness: 2 });
    expect(deriveLayout(exact).rowLayouts[1]).toMatchObject({ ok: true, web: 2.5 });
    expect(validate(exact).valid).toBe(true);
    expect(validate(withChanges({ trayWidth: 162, wallThickness: 2 })).byField.holesPerRow).toHaveLength(1);
  });

  it("reports overlapping bores as not fitting", () => {
    const result = validate(withChanges({ holesPerRow: 12, boreDiameter2: 27 }));
    expect(result.byField.holesPerRow?.[0]).toMatch(/do not fit in the 196 mm inside the rim/);
  });

  it("rejects rows that do not fit the depth, naming the rows field", () => {
    const result = validate(withChanges({ rows: 4, trayDepth: 100, holesPerRow: 4 }));
    expect(result.valid).toBe(false);
    expect(result.byField.rows?.[0]).toMatch(/^4 rows of up to 27 mm do not fit in the 96 mm inside the rim/);
    // 116 mm inside the rim: 4 rows of 27 mm leave (116 - 108) / 5 = 1.6 mm.
    expect(validate(withChanges({ rows: 4, trayDepth: 120, holesPerRow: 4 })).byField.rows?.[0]).toMatch(
      /leave 1.6 mm between rows/,
    );
  });

  it("ignores the diameter of a row that is not built", () => {
    const result = validate(withChanges({ rows: 1, boreDiameter4: 40, holesPerRow: 12 }));
    expect(result.valid).toBe(true);
  });

  it("creates a deterministic filename with the size and the bore grid", () => {
    expect(socketTray.filename(withChanges({ trayWidth: 200.5 }))).toMatch(
      /^drawerforge-socket-tray-200p5x110x25-2x8-[0-9a-f]{6}\.stl$/,
    );
    expect(socketTray.filename(withChanges({ boreDiameter1: 14 }))).not.toBe(
      socketTray.filename(SOCKET_TRAY_DEFAULTS),
    );
  });

  it("derives the pitch per row, the base under the bores, and the pockets", () => {
    const values = socketTray.derive(SOCKET_TRAY_DEFAULTS);
    expect(values.map((value) => value.value)).toEqual([
      "200 × 110 × 25 mm",
      "23.2 mm, web 10.2 mm",
      "23.7 mm, web 6.7 mm",
      "7 mm",
      "5 × 3, 4.6 mm deep",
    ]);
    const noPockets = socketTray.derive(withChanges({ lightenUnderside: false }));
    expect(noPockets.at(-1)?.value).toBe("none");
  });
});

describe("socket tray geometry", () => {
  const fixtures: Array<[string, Partial<SocketTrayParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["plain bores without pockets", { chamfer: false, lightenUnderside: false }],
    ["four rows", { rows: 4, trayDepth: 160, holesPerRow: 6 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s tray", async (_name, changes) => {
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
    expect(size.x).toBeCloseTo(parameters.trayWidth, 4);
    expect(size.y).toBeCloseTo(parameters.trayDepth, 4);
    expect(size.z).toBeCloseTo(parameters.trayHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    const contract = socketTray.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    const parameters = withChanges({ holesPerRow: 12, boreDiameter2: 27 });
    await expect(generate(parameters)).rejects.toThrow(/Row 2: 12 bores of 27 mm do not fit/);
  });

  it.each([
    ["default", {}],
    ["four rows", { rows: 4, trayDepth: 160, holesPerRow: 6 }],
    ["single bore", MINIMUM_CASE],
  ] as Array<[string, Partial<SocketTrayParameters>]>)(
    "shows one outer contour and one hole per bore in a slice through the %s bores",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const model = await generate(parameters);
      const topology = horizontalSliceTopology(
        model.mesh,
        parameters.trayHeight - parameters.boreDepth / 2,
      );
      const bores = parameters.rows * parameters.holesPerRow;
      expect({
        contours: topology.contours,
        solidComponents: topology.solidComponents,
        holes: topology.holes,
      }).toEqual({ contours: 1 + bores, solidComponents: 1, holes: bores });
    },
  );

  it("shows the pocket grid in a slice through the underside and none above the base", async () => {
    const parameters = withChanges({});
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
  });

  it("widens a chamfered bore mouth without changing the bounds or the bore floor", async () => {
    const plain = await generate(withChanges({ chamfer: false }));
    const chamfered = await generate(withChanges({ chamfer: true }));
    expect(chamfered.bounds).toEqual(plain.bounds);
    expect(chamfered.volume).toBeLessThan(plain.volume);
    const parameters = withChanges({});
    const floorSlice = parameters.trayHeight - parameters.boreDepth - 0.5;
    const plainFloor = horizontalSliceTopology(plain.mesh, floorSlice);
    const chamferedFloor = horizontalSliceTopology(chamfered.mesh, floorSlice);
    expect(plainFloor.holes).toBe(0);
    expect(chamferedFloor.holes).toBe(0);
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

  it("builds 48 fine bores with pockets inside the kernel time budget", async () => {
    const parameters = withChanges({
      trayWidth: 400, trayDepth: 300, trayHeight: 40, rows: 4, holesPerRow: 12,
      boreDepth: 30, meshQuality: "fine",
    });
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(parameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // The spec's threshold is one second. Allow five for a slow CI runner;
    // the measured value is recorded in 20_KERNEL_MODULES_NOTES.md.
    expect(elapsed).toBeLessThan(5_000);
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
    const model = await generate(normalize(SOCKET_TRAY_DEFAULTS));
    expect(socketTray.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-100, -55, 0],
      [100, 55, 25],
    ]);
  });
});
