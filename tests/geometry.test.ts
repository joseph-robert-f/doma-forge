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

function key(point: THREE.Vector3): string {
  return point
    .toArray()
    .map((value) => Math.round(value * 100_000))
    .join(",");
}

function closedEdgeCounts(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const edges = new Map<string, { count: number; balance: number }>();
  for (let triangle = 0; triangle < position.count; triangle += 3) {
    const vertices = [0, 1, 2].map((offset) =>
      key(point.fromBufferAttribute(position, triangle + offset)),
    );
    for (const [fromIndex, toIndex] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const from = vertices[fromIndex];
      const to = vertices[toIndex];
      const forward = from < to;
      const edgeKey = forward ? `${from}|${to}` : `${to}|${from}`;
      const value = edges.get(edgeKey) ?? { count: 0, balance: 0 };
      value.count += 1;
      value.balance += forward ? 1 : -1;
      edges.set(edgeKey, value);
    }
  }
  return [...edges.values()];
}

function connectedComponentCount(indices: Uint32Array): number {
  const neighbors = new Map<number, Set<number>>();
  const connect = (from: number, to: number) => {
    const adjacent = neighbors.get(from) ?? new Set<number>();
    adjacent.add(to);
    neighbors.set(from, adjacent);
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    connect(a, b);
    connect(a, c);
    connect(b, a);
    connect(b, c);
    connect(c, a);
    connect(c, b);
  }

  const visited = new Set<number>();
  let components = 0;
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    components += 1;
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
  }
  return components;
}

/**
 * Count the closed contours where a horizontal plane cuts the triangle mesh.
 * Above the floor, a sound tray has one outside contour plus one closed contour
 * for every compartment. A cavity that breaks through a rounded outside corner
 * merges a compartment with the exterior and changes this topology even though
 * the 3D result can still be a formally closed manifold.
 */
function horizontalSliceTopology(
  mesh: Awaited<ReturnType<typeof generate>>["mesh"],
  z: number,
): {
  contours: number;
  solidComponents: number;
  holes: number;
  containsSolid: (point: [number, number]) => boolean;
} {
  const points = new Map<string, [number, number]>();
  const edges: Array<[string, string]> = [];
  const epsilon = 1e-7;

  const pointKey = (x: number, y: number) =>
    `${Math.round(x * 100_000)},${Math.round(y * 100_000)}`;
  const vertex = (index: number): [number, number, number] => {
    const offset = index * mesh.numProp;
    return [
      mesh.vertProperties[offset],
      mesh.vertProperties[offset + 1],
      mesh.vertProperties[offset + 2],
    ];
  };

  for (let triangle = 0; triangle < mesh.triVerts.length; triangle += 3) {
    const vertices = [
      vertex(mesh.triVerts[triangle]),
      vertex(mesh.triVerts[triangle + 1]),
      vertex(mesh.triVerts[triangle + 2]),
    ];
    const intersections: Array<[number, number]> = [];

    for (const [fromIndex, toIndex] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const from = vertices[fromIndex];
      const to = vertices[toIndex];
      const fromSide = from[2] - z;
      const toSide = to[2] - z;
      if (
        Math.abs(fromSide) <= epsilon ||
        Math.abs(toSide) <= epsilon ||
        fromSide * toSide >= 0
      ) {
        continue;
      }
      const amount = fromSide / (fromSide - toSide);
      intersections.push([
        from[0] + (to[0] - from[0]) * amount,
        from[1] + (to[1] - from[1]) * amount,
      ]);
    }

    if (intersections.length === 0) continue;
    expect(intersections).toHaveLength(2);
    const fromKey = pointKey(...intersections[0]);
    const toKey = pointKey(...intersections[1]);
    if (fromKey === toKey) continue;
    points.set(fromKey, intersections[0]);
    points.set(toKey, intersections[1]);
    edges.push([fromKey, toKey]);
  }

  const neighbors = new Map<string, Set<string>>();
  for (const [from, to] of edges) {
    const fromNeighbors = neighbors.get(from) ?? new Set<string>();
    const toNeighbors = neighbors.get(to) ?? new Set<string>();
    fromNeighbors.add(to);
    toNeighbors.add(from);
    neighbors.set(from, fromNeighbors);
    neighbors.set(to, toNeighbors);
  }
  expect(points.size).toBeGreaterThan(0);
  for (const adjacent of neighbors.values()) expect(adjacent.size).toBe(2);

  const loops: Array<Array<[number, number]>> = [];
  const visited = new Set<string>();
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    const loop: Array<[number, number]> = [];
    let previous: string | undefined;
    let current = start;
    do {
      visited.add(current);
      loop.push(points.get(current)!);
      const next = [...(neighbors.get(current) ?? [])].find(
        (candidate) => candidate !== previous,
      );
      expect(next).toBeDefined();
      previous = current;
      current = next!;
    } while (current !== start);
    loops.push(loop);
  }

  const contains = (polygon: Array<[number, number]>, point: [number, number]) => {
    let inside = false;
    for (let index = 0, prior = polygon.length - 1; index < polygon.length; prior = index++) {
      const [x, y] = polygon[index];
      const [priorX, priorY] = polygon[prior];
      if (
        (y > point[1]) !== (priorY > point[1]) &&
        point[0] < ((priorX - x) * (point[1] - y)) / (priorY - y) + x
      ) {
        inside = !inside;
      }
    }
    return inside;
  };

  let solidComponents = 0;
  let holes = 0;
  for (let index = 0; index < loops.length; index += 1) {
    const nestingDepth = loops.reduce(
      (depth, polygon, candidate) =>
        candidate !== index && contains(polygon, loops[index][0])
          ? depth + 1
          : depth,
      0,
    );
    if (nestingDepth % 2 === 0) solidComponents += 1;
    else holes += 1;
  }
  return {
    contours: loops.length,
    solidComponents,
    holes,
    containsSolid: (point) =>
      loops.reduce(
        (inside, polygon) => inside !== contains(polygon, point),
        false,
      ),
  };
}

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
  it.each(fixtures)("creates a finite, outward, closed %s organizer", async (_name, changes) => {
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
  });

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
  it("matches the geometry version 1 golden record for the defaults", async () => {
    // Recorded at geometryVersion 1. A change here is a geometry change:
    // bump DRAWER_TRAY_GEOMETRY_VERSION and re-record on purpose.
    const model = await generate(normalize(DEFAULT_PARAMETERS));
    expect(drawerTray.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-149.5, -99.5, 0],
      [149.5, 99.5, 50],
    ]);
  });
});
