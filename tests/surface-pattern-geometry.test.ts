import { describe, expect, it } from "vitest";
import { getKernel, type Solid } from "../lib/kernel/manifold";
import { finishSolid } from "../lib/kernel/mesh";
import { ResourceScope } from "../lib/kernel/ownership";
import { applySurfacePatterns, type SurfaceZone } from "../lib/kernel/surface-pattern";
import type { SurfaceTreatments } from "../lib/surface-patterns";
import { modelToBufferGeometry } from "../lib/three-geometry";
import { assertBinaryStlRoundTrip } from "./helpers/product-contract";
import { closedEdgeCounts, connectedComponentCount } from "./helpers/mesh-checks";

function settings(id: string, mode: "holes" | "mesh"): SurfaceTreatments {
  return {
    enabled: true,
    zones: { [id]: { mode, opening: 8, web: 2, margin: 4 } },
  };
}

async function checkPattern(
  makeBody: (scope: ResourceScope, kernel: Awaited<ReturnType<typeof getKernel>>) => Solid,
  zone: SurfaceZone,
  mode: "holes" | "mesh",
) {
  const kernel = await getKernel();
  const scope = new ResourceScope();
  try {
    const body = makeBody(scope, kernel);
    const originalVolume = body.volume();
    const cut = applySurfacePatterns(kernel, scope, body, settings(zone.id, mode), [zone]);
    expect(cut.volume()).toBeLessThan(originalVolume);
    const model = finishSolid(scope.take(cut), { mode }, "pattern test");
    expect(model.status).toBe("NoError");
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    const geometry = modelToBufferGeometry(model);
    try {
      const badEdges = closedEdgeCounts(geometry).filter((edge) => edge.count !== 2 || edge.balance !== 0);
      expect(badEdges).toEqual([]);
      assertBinaryStlRoundTrip(geometry, `${zone.id}/${mode}`);
    } finally {
      geometry.dispose();
    }
  } finally {
    scope.dispose();
  }
}

describe("surface pattern solids", () => {
  it.each(["holes", "mesh"] as const)("cuts a closed planar %s panel that survives STL export", async (mode) => {
    await checkPattern((scope, kernel) => {
      const cube = scope.own(kernel.Manifold.cube([50, 50, 4], true));
      const body = scope.own(cube.translate([0, 0, 2]));
      scope.delete(cube);
      return body;
    }, {
      kind: "plane", id: "floor", axis: "z", center: 2,
      u: [-25, 25], v: [-25, 25], thickness: 4,
    }, mode);
  }, 30_000);

  it("cuts a vertical wall along its normal", async () => {
    await checkPattern((scope, kernel) => {
      const cube = scope.own(kernel.Manifold.cube([4, 50, 40], true));
      const body = scope.own(cube.translate([2, 0, 20]));
      scope.delete(cube);
      return body;
    }, {
      kind: "plane", id: "wall", axis: "x", center: 2,
      u: [-25, 25], v: [0, 40], thickness: 4,
    }, "mesh");
  }, 30_000);

  it("cuts a curved vessel wall without opening its rim", async () => {
    await checkPattern((scope, kernel) => {
      const outer = scope.own(kernel.Manifold.cylinder(40, 25, 25, 64));
      const inner = scope.own(kernel.Manifold.cylinder(39, 22, 22, 64));
      const raised = scope.own(inner.translate([0, 0, 3]));
      scope.delete(inner);
      const shell = scope.own(outer.subtract(raised));
      scope.delete(outer);
      scope.delete(raised);
      return shell;
    }, {
      kind: "radial", id: "wall", center: [0, 0], z: [6, 34],
      radiusAtZero: 23.5, slope: 0, thickness: 3,
    }, "holes");
  }, 30_000);
});
