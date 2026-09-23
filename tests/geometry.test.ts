import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  DRAWER_TRAY_DEFAULTS as DEFAULT_PARAMETERS,
  deriveDimensions,
  drawerTray,
  type DrawerTrayParameters,
} from "../lib/products/drawer-tray";
import {
  analyzeBufferGeometry,
  modelToBufferGeometry,
} from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";

const { normalize, generate } = drawerTray;

function loadPreset(id: string): DrawerTrayParameters {
  const preset = drawerTray.presets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return { ...preset.parameters };
}

const GOLDEN_TRIANGLES = 362;
const GOLDEN_VOLUME = 277462.54;

const fixtures: Array<[string, Partial<DrawerTrayParameters>]> = [
  ["1x1", { rows: 1, columns: 1, fingerScoop: false }],
  ["1x3", { rows: 1, columns: 3, fingerScoop: false }],
  ["2x3 scoop", { rows: 2, columns: 3, fingerScoop: true }],
  ["4x4", { rows: 4, columns: 4, fingerScoop: false }],
];

function expectRoundedCornerWallIsContinuous(
  model: Awaited<ReturnType<typeof generate>>,
) {
  const { parameters } = model;
  const derived = deriveDimensions(parameters);
  const topology = horizontalSliceTopology(
    model.mesh,
    parameters.baseThickness + 0.731,
  );
  const radiusToWallMidline =
    parameters.cornerRadius - parameters.wallThickness / 2;
  const diagonal = radiusToWallMidline / Math.sqrt(2);
  const centerX = derived.outsideWidth / 2 - parameters.cornerRadius;
  const centerY = derived.outsideDepth / 2 - parameters.cornerRadius;

  for (const xDirection of [-1, 1]) {
    for (const yDirection of [-1, 1]) {
      expect(
        topology.containsSolid([
          xDirection * (centerX + diagonal),
          yDirection * (centerY + diagonal),
        ]),
      ).toBe(true);
    }
  }
}

describe("organizer geometry", () => {
  it.each(fixtures)(
    "creates a finite, outward, closed %s organizer",
    async (_name, changes) => {
      const parameters = normalize({ ...DEFAULT_PARAMETERS, ...changes });
      const organizer = await generate(parameters);
      const geometry = modelToBufferGeometry(organizer);
      const analysis = analyzeBufferGeometry(geometry);
      const size = analysis.bounds.getSize(new THREE.Vector3());

      expect(organizer.status).toBe("NoError");
      expect(organizer.volume).toBeGreaterThan(0);
      expect(analysis.finite).toBe(true);
      expect(analysis.triangleCount).toBeGreaterThan(0);
      expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
      expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
      expect(analysis.signedVolume).toBeGreaterThan(0);
      expect(connectedComponentCount(organizer.mesh.triVerts)).toBe(1);
      expect(size.x).toBeCloseTo(deriveDimensions(parameters).outsideWidth, 4);
      expect(size.y).toBeCloseTo(deriveDimensions(parameters).outsideDepth, 4);
      expect(size.z).toBeCloseTo(parameters.organizerHeight, 4);
      expect(analysis.bounds.min.z).toBeCloseTo(0, 5);

      for (const edge of closedEdgeCounts(geometry)) {
        expect(edge.count).toBe(2);
        expect(edge.balance).toBe(0);
      }
      geometry.dispose();
    },
  );

  it("keeps bounds while a scoop removes material above the base", async () => {
    const plain = normalize({ ...DEFAULT_PARAMETERS, fingerScoop: false });
    const scooped = normalize({ ...DEFAULT_PARAMETERS, fingerScoop: true });
    const [plainModel, scoopedModel] = await Promise.all([
      generate(plain),
      generate(scooped),
    ]);
    expect(scoopedModel.bounds).toEqual(plainModel.bounds);
    expect(scoopedModel.volume).toBeLessThan(plainModel.volume);
  });

  it("increases round-feature fidelity with mesh quality", async () => {
    const counts: number[] = [];
    for (const meshQuality of ["draft", "standard", "fine"] as const) {
      const model = await generate(
        normalize({ ...DEFAULT_PARAMETERS, meshQuality }),
      );
      counts.push(model.mesh.triVerts.length / 3);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("keeps every Hand tools compartment closed inside the rounded perimeter", async () => {
    const parameters = loadPreset("tools");
    const model = await generate(parameters);
    const topology = horizontalSliceTopology(
      model.mesh,
      parameters.baseThickness + 0.731,
    );
    expect({
      contours: topology.contours,
      solidComponents: topology.solidComponents,
      holes: topology.holes,
    }).toEqual({
      contours: 1 + parameters.rows * parameters.columns,
      solidComponents: 1,
      holes: parameters.rows * parameters.columns,
    });
    expectRoundedCornerWallIsContinuous(model);
  });

  it.each([
    [10, 2],
    [40, 2],
    [8, 1.2],
  ])(
    "preserves a continuous 1x1 perimeter at radius %s and wall %s",
    async (cornerRadius, wallThickness) => {
      const parameters = normalize({
        ...DEFAULT_PARAMETERS,
        cornerRadius,
        wallThickness,
        rows: 1,
        columns: 1,
        fingerScoop: false,
      });
      const model = await generate(parameters);
      const topology = horizontalSliceTopology(
        model.mesh,
        parameters.baseThickness + 0.731,
      );
      expect({
        contours: topology.contours,
        solidComponents: topology.solidComponents,
        holes: topology.holes,
      }).toEqual({ contours: 2, solidComponents: 1, holes: 1 });
      expectRoundedCornerWallIsContinuous(model);
    },
  );
  it("matches the solid-default golden record at geometry version 2", async () => {
    // Recorded at version 1; version 2 changes only patterned floor openings.
    const model = await generate(normalize(DEFAULT_PARAMETERS));
    expect(drawerTray.geometryVersion).toBe(2);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(
      0.001,
    );
    expect(model.bounds).toEqual([
      [-149.5, -99.5, 0],
      [149.5, 99.5, 50],
    ]);
  });
});
