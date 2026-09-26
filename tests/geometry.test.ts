import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  DRAWER_TRAY_DEFAULTS as DEFAULT_PARAMETERS,
  deriveDimensions,
  deriveTrayLayout,
  drawerTray,
  type DrawerTrayParameters,
} from "../lib/products/drawer-tray";
import { getFingerScoopLayout } from "../lib/products/drawer-tray/surface-zones";
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

const GOLDEN_TRIANGLES = 360;
const GOLDEN_VOLUME = 277462.54;

const fixtures: Array<[string, Partial<DrawerTrayParameters>]> = [
  ["1x1", { rowLayout: { mode: "even", count: 1 }, columnLayout: { mode: "even", count: 1 }, fingerScoop: false }],
  ["1x3", { rowLayout: { mode: "even", count: 1 }, columnLayout: { mode: "even", count: 3 }, fingerScoop: false }],
  ["2x3 scoop", { rowLayout: { mode: "even", count: 2 }, columnLayout: { mode: "even", count: 3 }, fingerScoop: true }],
  ["4x4", { rowLayout: { mode: "even", count: 4 }, columnLayout: { mode: "even", count: 4 }, fingerScoop: false }],
  ["unequal 2x3", { rowLayout: { mode: "custom", fixedSizesMm: [70] }, columnLayout: { mode: "custom", fixedSizesMm: [60, 100] }, fingerScoop: true }],
  ["dense 6x8", { rowLayout: { mode: "even", count: 6 }, columnLayout: { mode: "even", count: 8 }, fingerScoop: false }],
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

function frontProfileY(width: number, depth: number, radius: number, x: number): number {
  const safeRadius = Math.max(0, Math.min(radius, width / 2 - 0.01, depth / 2 - 0.01));
  const beyondStraight = Math.max(0, Math.abs(x) - (width / 2 - safeRadius));
  return -depth / 2 + safeRadius - Math.sqrt(safeRadius ** 2 - beyondStraight ** 2);
}

function frontWallMidY(parameters: DrawerTrayParameters, x: number): number {
  const derived = deriveDimensions(parameters);
  const outer = frontProfileY(derived.outsideWidth, derived.outsideDepth, parameters.cornerRadius, x);
  const inner = frontProfileY(
    derived.outsideWidth - parameters.wallThickness * 2,
    derived.outsideDepth - parameters.wallThickness * 2,
    Math.max(0, parameters.cornerRadius - parameters.wallThickness),
    x,
  );
  return (outer + inner) / 2;
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

  it.each([
    ["even columns", { drawerWidth: 80, drawerDepth: 80, clearancePerSide: 0, organizerHeight: 20, cornerRadius: 4, rowLayout: { mode: "even", count: 2 }, columnLayout: { mode: "even", count: 2 } }],
    ["narrow odd columns", { drawerWidth: 86, drawerDepth: 80, clearancePerSide: 0, organizerHeight: 20, cornerRadius: 4, rowLayout: { mode: "even", count: 1 }, columnLayout: { mode: "even", count: 7 } }],
    ["rounded front", { drawerWidth: 80, drawerDepth: 80, clearancePerSide: 0, organizerHeight: 20, cornerRadius: 40, rowLayout: { mode: "even", count: 2 }, columnLayout: { mode: "even", count: 2 } }],
  ] satisfies Array<[string, Partial<DrawerTrayParameters>]>) (
    "opens the scoop without removing a divider in %s",
    async (_name, changes) => {
      const parameters = normalize({ ...DEFAULT_PARAMETERS, ...changes, fingerScoop: true });
      expect(drawerTray.validate(parameters).valid).toBe(true);
      const scoop = getFingerScoopLayout(parameters);
      const model = await generate(parameters);
      const geometry = modelToBufferGeometry(model);
      expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
      for (const edge of closedEdgeCounts(geometry)) {
        expect(edge.count).toBe(2);
        expect(edge.balance).toBe(0);
      }
      geometry.dispose();
      const throughNotch = horizontalSliceTopology(model.mesh, parameters.organizerHeight - 1);
      const scoopWallY = frontWallMidY(parameters, scoop.centerX);
      expect(throughNotch.containsSolid([scoop.centerX, scoopWallY])).toBe(false);

      const belowNotch = horizontalSliceTopology(
        model.mesh,
        parameters.organizerHeight - scoop.radius - 0.731,
      );
      expect(belowNotch.containsSolid([scoop.centerX, scoopWallY])).toBe(true);

      const layout = deriveTrayLayout(parameters);
      const frontDividerY = layout.rows.dividerCenters[0];
      if (layout.rows.spans.length > 1) {
        expect(throughNotch.containsSolid([scoop.centerX, frontDividerY])).toBe(true);
      }
      if (layout.columns.spans.length % 2 === 0) {
        expect(throughNotch.containsSolid([0, frontWallMidY(parameters, 0)])).toBe(true);
      } else {
        const dividerX = layout.columns.dividerCenters.find((center) => center > 0)!;
        expect(throughNotch.containsSolid([dividerX, frontWallMidY(parameters, dividerX)])).toBe(true);
      }
    },
  );

  it("places unequal dividers at the measured boundaries", async () => {
    const parameters = normalize({
      ...DEFAULT_PARAMETERS,
      rowLayout: { mode: "custom", fixedSizesMm: [70] },
      columnLayout: { mode: "custom", fixedSizesMm: [60, 100] },
      fingerScoop: false,
    });
    const layout = deriveTrayLayout(parameters);
    const model = await generate(parameters);
    const slice = horizontalSliceTopology(model.mesh, parameters.baseThickness + 0.731);
    expect({ contours: slice.contours, holes: slice.holes, components: slice.solidComponents }).toEqual({
      contours: 7,
      holes: 6,
      components: 1,
    });
    for (const column of layout.columns.spans) {
      for (const row of layout.rows.spans) {
        expect(slice.containsSolid([column.center, row.center])).toBe(false);
      }
    }
    for (const x of layout.columns.dividerCenters) {
      expect(slice.containsSolid([x, layout.rows.spans[0].center])).toBe(true);
    }
    for (const y of layout.rows.dividerCenters) {
      expect(slice.containsSolid([layout.columns.spans[0].center, y])).toBe(true);
    }
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
      contours: 1 + deriveTrayLayout(parameters).rows.spans.length * deriveTrayLayout(parameters).columns.spans.length,
      solidComponents: 1,
      holes: deriveTrayLayout(parameters).rows.spans.length * deriveTrayLayout(parameters).columns.spans.length,
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
        rowLayout: { mode: "even", count: 1 },
        columnLayout: { mode: "even", count: 1 },
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
  it("matches the solid-default golden record at geometry version 4", async () => {
    // The default equal layout keeps its old mesh while the signature moves
    // to version 4 for measured unequal layouts.
    const model = await generate(normalize(DEFAULT_PARAMETERS));
    expect(drawerTray.geometryVersion).toBe(4);
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
