import * as THREE from "three";
import { expect } from "vitest";
import type { KernelMesh } from "../../lib/kernel/mesh";

/**
 * Shared mesh checks for product geometry tests. These mirror the helpers
 * that `tests/geometry.test.ts` defines for the drawer tray; that file keeps
 * its own copies so the drawer tray's golden test stays untouched.
 */

function key(point: THREE.Vector3): string {
  return point
    .toArray()
    .map((value) => Math.round(value * 100_000))
    .join(",");
}

/** Every edge of a closed, consistently wound mesh has count 2, balance 0. */
export function closedEdgeCounts(geometry: THREE.BufferGeometry) {
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

export function connectedComponentCount(indices: Uint32Array): number {
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

export interface SliceTopology {
  contours: number;
  solidComponents: number;
  holes: number;
  containsSolid: (point: [number, number]) => boolean;
}

/**
 * Counts the closed contours where the horizontal plane at `z` cuts the
 * mesh, and sorts them into outer contours and holes by nesting depth.
 */
export function horizontalSliceTopology(mesh: KernelMesh, z: number): SliceTopology {
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
        candidate !== index && contains(polygon, loops[index][0]) ? depth + 1 : depth,
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
      loops.reduce((inside, polygon) => inside !== contains(polygon, point), false),
  };
}
