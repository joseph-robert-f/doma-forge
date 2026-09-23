import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  DRAWER_TRAY_DEFAULTS as DEFAULT_PARAMETERS,
  FIT_TEST_COUPON_HEIGHT,
  FIT_TEST_COUPON_MINIMUM_WALL,
  deriveDimensions,
  drawerTray,
  getCouponWallThickness,
} from "../lib/products/drawer-tray";
import {
  buildFitTestCouponMesh,
  generateFitTestCoupon,
} from "../lib/products/drawer-tray/coupon";
import { fitTestCouponFilename } from "../lib/products/shared";
import { inspectBinaryStl, serializeBinaryStl } from "../lib/stl";
import {
  analyzeBufferGeometry,
  modelToBufferGeometry,
} from "../lib/three-geometry";

const { normalize, generate } = drawerTray;

function closedEdgeCounts(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const key = (p: THREE.Vector3) =>
    p
      .toArray()
      .map((value) => Math.round(value * 100_000))
      .join(",");
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

/** Counts the closed contours where a horizontal plane cuts the triangle mesh. */
function horizontalSliceContourCount(
  mesh: Awaited<ReturnType<typeof generateFitTestCoupon>>["mesh"],
  z: number,
): number {
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

  let loopCount = 0;
  const visited = new Set<string>();
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    loopCount += 1;
    let previous: string | undefined;
    let current = start;
    do {
      visited.add(current);
      const next = [...(neighbors.get(current) ?? [])].find(
        (candidate) => candidate !== previous,
      );
      expect(next).toBeDefined();
      previous = current;
      current = next!;
    } while (current !== start);
  }
  return loopCount;
}

/** Per-component float comparison; `toEqual` is too strict for kernel output. */
function expectBoundsClose(
  actual: [[number, number, number], [number, number, number]],
  expectedMin: [number, number, number],
  expectedMax: [number, number, number],
  precision = 6,
) {
  for (let axis = 0; axis < 3; axis += 1) {
    expect(actual[0][axis]).toBeCloseTo(expectedMin[axis], precision);
    expect(actual[1][axis]).toBeCloseTo(expectedMax[axis], precision);
  }
}

const CASES: Array<[string, Partial<typeof DEFAULT_PARAMETERS>]> = [
  ["defaults", {}],
  ["corner radius at the spec maximum (40 mm)", { cornerRadius: 40 }],
  [
    // Half of the shorter outside dimension is the largest radius validate()
    // allows; drawerDepth 80 with 2 mm clearance per side makes that limit
    // 38 mm, below the spec maximum, so this exercises the dimensional
    // clamp in roundedRectangle() rather than the spec's own number.
    "corner radius at the dimensional clamp (half the shorter outside dimension)",
    { drawerDepth: 80, clearancePerSide: 2, cornerRadius: 38 },
  ],
];

describe("fit-test coupon geometry", () => {
  it.each(CASES)(
    "builds a finite, closed, single-shell ring for %s",
    async (_name, changes) => {
      const parameters = normalize({ ...DEFAULT_PARAMETERS, ...changes });
      const [coupon, tray] = await Promise.all([
        generateFitTestCoupon(parameters),
        generate(parameters),
      ]);
      const geometry = modelToBufferGeometry(coupon);
      const analysis = analyzeBufferGeometry(geometry);
      const derived = deriveDimensions(parameters);
      const contract = drawerTray.boundsContract(parameters);

      expect(coupon.status).toBe("NoError");
      expect(coupon.volume).toBeGreaterThan(0);
      expect(analysis.finite).toBe(true);
      expect(analysis.triangleCount).toBeGreaterThan(0);
      expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
      expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
      expect(analysis.signedVolume).toBeGreaterThan(0);
      expect(connectedComponentCount(coupon.mesh.triVerts)).toBe(1);

      // Outside bounds equal the tray's outside bounds in X and Y, and 0 to 5 in Z.
      // Checked two ways: against the product's own bounds contract, and
      // against a tray generated from the same parameters.
      expectBoundsClose(
        coupon.bounds,
        [contract.min[0], contract.min[1], 0],
        [contract.max[0], contract.max[1], FIT_TEST_COUPON_HEIGHT],
      );
      expectBoundsClose(
        coupon.bounds,
        [tray.bounds[0][0], tray.bounds[0][1], 0],
        [tray.bounds[1][0], tray.bounds[1][1], FIT_TEST_COUPON_HEIGHT],
      );
      const size = analysis.bounds.getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(derived.outsideWidth, 4);
      expect(size.y).toBeCloseTo(derived.outsideDepth, 4);
      expect(size.z).toBeCloseTo(FIT_TEST_COUPON_HEIGHT, 4);

      for (const edge of closedEdgeCounts(geometry)) {
        expect(edge.count).toBe(2);
        expect(edge.balance).toBe(0);
      }

      // Exactly one outer contour and one inner contour at mid-height.
      expect(
        horizontalSliceContourCount(coupon.mesh, FIT_TEST_COUPON_HEIGHT / 2),
      ).toBe(2);

      geometry.dispose();
    },
  );

  it("clamps the ring wall to 2 mm even when the tray wall is thinner", () => {
    const thin = normalize({ ...DEFAULT_PARAMETERS, wallThickness: 1.2 });
    expect(getCouponWallThickness(thin)).toBe(FIT_TEST_COUPON_MINIMUM_WALL);
    const thick = normalize({ ...DEFAULT_PARAMETERS, wallThickness: 3 });
    expect(getCouponWallThickness(thick)).toBe(3);
  });

  it("keeps the coupon volume under 10 percent of the tray volume for the defaults", async () => {
    const parameters = normalize(DEFAULT_PARAMETERS);
    const [tray, coupon] = await Promise.all([
      generate(parameters),
      generateFitTestCoupon(parameters),
    ]);
    expect(coupon.volume).toBeLessThan(tray.volume * 0.1);
  });

  it("matches the fit-test coupon golden record for the defaults", async () => {
    // Recorded at geometryVersion 1; versions 2 and 3 change the tray's
    // patterned floor and scoop, leaving this solid fit-test coupon unchanged.
    const model = await generateFitTestCoupon(normalize(DEFAULT_PARAMETERS));
    expect(model.mesh.triVerts.length / 3).toBe(224);
    expect(Math.abs(model.volume - 9754.816) / 9754.816).toBeLessThan(0.001);
    expectBoundsClose(model.bounds, [-149.5, -99.5, 0], [149.5, 99.5, 5]);
  });

  it("throws when the ring wall would consume the whole opening", async () => {
    // Below the drawerWidth spec minimum of 80 mm, so validateDrawerTray
    // rejects it. Call the unvalidated builder directly to reach the
    // collapse guard without going through generateFitTestCoupon.
    const collapsed = normalize({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 10,
      drawerDepth: 10,
      clearancePerSide: 0,
      wallThickness: 6,
    });
    expect(drawerTray.validate(collapsed).valid).toBe(false);
    await expect(buildFitTestCouponMesh(collapsed)).rejects.toThrow(
      /no inside opening/i,
    );
  });

  it("names the coupon file with the product id, the size, and the hash", async () => {
    // S15 finding F-6: the drawer tray is no longer the only product with a
    // coupon, so the name carries the product id the way a full model file
    // does.
    const parameters = normalize(DEFAULT_PARAMETERS);
    const model = await generateFitTestCoupon(parameters);
    const name = fitTestCouponFilename(model, drawerTray.signature(parameters));
    expect(name).toBe("drawerforge-fit-test-drawer-tray-299x199-a629cd.stl");
    expect(drawerTray.filename(parameters)).toContain(drawerTray.id);
    expect(name).toContain(drawerTray.id);
    expect(name).toMatch(/^drawerforge-fit-test-drawer-tray-299x199-[0-9a-f]{6}\.stl$/);
  });

  it("round-trips through the binary STL inspector", async () => {
    const parameters = normalize(DEFAULT_PARAMETERS);
    const model = await generateFitTestCoupon(parameters);
    const geometry = modelToBufferGeometry(model);
    const data = serializeBinaryStl(geometry);
    const inspected = inspectBinaryStl(data);
    geometry.computeBoundingBox();

    expect(data.byteLength).toBe(84 + inspected.triangleCount * 50);
    expect(inspected.triangleCount).toBe(
      geometry.getAttribute("position").count / 3,
    );
    expect(inspected.finite).toBe(true);
    expect(inspected.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(inspected.minimumNormalAlignment).toBeGreaterThan(0.99999);
    expect(
      inspected.bounds.min.distanceTo(geometry.boundingBox!.min),
    ).toBeLessThan(1e-5);
    expect(
      inspected.bounds.max.distanceTo(geometry.boundingBox!.max),
    ).toBeLessThan(1e-5);
    geometry.dispose();
  });
});
