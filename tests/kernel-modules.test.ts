import { describe, expect, it } from "vitest";
import {
  boreCutter,
  cutterArray,
  solvePitch,
  unionSolids,
} from "../lib/kernel/arrays";
import {
  MINIMUM_POCKET_DEPTH,
  MINIMUM_POCKET_SPAN,
  lightenUnderside,
  planLightening,
  type LighteningOptions,
} from "../lib/kernel/lightening";
import { getKernel } from "../lib/kernel/manifold";
import { chamferedCircle, polygon, roundedRectangle } from "../lib/kernel/profiles";
import {
  BOOLEAN_OVERLAP,
  roundedShell,
  roundedSlab,
  shellFromProfiles,
} from "../lib/kernel/shell";

const CYLINDER_SEGMENTS = 24;

/** Area of a regular polygon with `segments` sides inscribed in a circle. */
function polygonCircleArea(radius: number, segments: number): number {
  return 0.5 * segments * radius * radius * Math.sin((2 * Math.PI) / segments);
}

describe("pitch solver", () => {
  it("spaces cutters with the same web between and around them", () => {
    const result = solvePitch({ span: 100, count: 4, cutterSize: 10, minimumWeb: 2.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.web).toBeCloseTo(12, 10);
    expect(result.pitch).toBeCloseTo(22, 10);
    expect(result.firstCenter).toBeCloseTo(-50 + 12 + 5, 10);
    const lastCenter = result.firstCenter + 3 * result.pitch;
    expect(lastCenter + 5 + result.web).toBeCloseTo(50, 10);
  });

  it("centers a single cutter", () => {
    const result = solvePitch({ span: 60, count: 1, cutterSize: 13, minimumWeb: 2.5 });
    expect(result).toMatchObject({ ok: true, firstCenter: 0, web: 23.5 });
  });

  it("accepts a web exactly at the minimum and rejects one just under it", () => {
    // span = count * size + (count + 1) * web  ->  5 * 10 + 6 * 2.5 = 65
    expect(solvePitch({ span: 65, count: 5, cutterSize: 10, minimumWeb: 2.5 }).ok).toBe(true);
    const rejected = solvePitch({ span: 64.9, count: 5, cutterSize: 10, minimumWeb: 2.5 });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.web).toBeLessThan(2.5);
    expect(rejected.minimumWeb).toBe(2.5);
  });

  it("reports a negative web when the cutters overlap", () => {
    const result = solvePitch({ span: 50, count: 6, cutterSize: 10, minimumWeb: 2.5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.web).toBeLessThan(0);
  });

  it("rejects a non-integer count or a zero cutter", () => {
    expect(() => solvePitch({ span: 50, count: 1.5, cutterSize: 10, minimumWeb: 2 })).toThrow();
    expect(() => solvePitch({ span: 50, count: 0, cutterSize: 10, minimumWeb: 2 })).toThrow();
    expect(() => solvePitch({ span: 50, count: 2, cutterSize: 0, minimumWeb: 2 })).toThrow();
  });
});

describe("cutter array", () => {
  it.each([
    [1, 1],
    [2, 1],
    [6, 4],
  ])("unions %s by %s separate cylinders into one solid of the summed volume", async (countX, countY) => {
    const kernel = await getKernel();
    const radius = 3;
    const height = 10;
    const array = cutterArray(
      kernel,
      () => kernel.Manifold.cylinder(height, radius, radius, CYLINDER_SEGMENTS),
      { pitchX: 10, pitchY: 10, countX, countY, origin: [0, 0, 0] },
    );
    const single = polygonCircleArea(radius, CYLINDER_SEGMENTS) * height;
    expect(array.status()).toBe("NoError");
    expect(array.volume()).toBeCloseTo(single * countX * countY, 6);
    const box = array.boundingBox();
    expect(box.min[0]).toBeCloseTo(-radius, 6);
    expect(box.max[0]).toBeCloseTo((countX - 1) * 10 + radius, 6);
    expect(box.max[1]).toBeCloseTo((countY - 1) * 10 + radius, 6);
    array.delete();
  });

  it("merges overlapping cutters into one body", async () => {
    const kernel = await getKernel();
    const array = cutterArray(
      kernel,
      () => kernel.Manifold.cube([10, 10, 5], true),
      { pitchX: 8, pitchY: 0, countX: 3, countY: 1, origin: [0, 0, 0] },
    );
    // Three 10 mm cubes on an 8 mm pitch span 26 mm as one block.
    expect(array.volume()).toBeCloseTo(26 * 10 * 5, 6);
    array.delete();
  });

  it("rejects a zero count", async () => {
    const kernel = await getKernel();
    expect(() =>
      cutterArray(kernel, () => kernel.Manifold.cube(1), {
        pitchX: 1, pitchY: 1, countX: 0, countY: 1, origin: [0, 0, 0],
      }),
    ).toThrow(/whole counts/);
    expect(() => unionSolids(kernel, [])).toThrow(/at least one/);
  });
});

describe("bore cutter", () => {
  it("enters the top face and overshoots it, with the chamfer widening the mouth", async () => {
    const kernel = await getKernel();
    const plain = boreCutter(kernel, { diameter: 10, depth: 8, chamfer: 0, segments: CYLINDER_SEGMENTS, topZ: 20 });
    const chamfered = boreCutter(kernel, { diameter: 10, depth: 8, chamfer: 1, segments: CYLINDER_SEGMENTS, topZ: 20 });
    const plainBox = plain.boundingBox();
    expect(plainBox.min[2]).toBeCloseTo(12, 6);
    expect(plainBox.max[2]).toBeCloseTo(20 + BOOLEAN_OVERLAP, 6);
    expect(plainBox.max[0]).toBeCloseTo(5, 6);
    const chamferBox = chamfered.boundingBox();
    expect(chamferBox.max[0]).toBeCloseTo(5 + 1 + BOOLEAN_OVERLAP, 6);
    // The chamfer is exactly one millimeter deep at the face: the mouth is
    // wider just above z = 19 and the plain bore radius just below it.
    const radiusAt = (z: number) => {
      const slice = kernel.Manifold.cube([40, 40, 0.001], true).translate([0, 0, z]);
      const cut = chamfered.intersect(slice);
      const radius = cut.boundingBox().max[0];
      cut.delete();
      slice.delete();
      return radius;
    };
    expect(radiusAt(20)).toBeCloseTo(6, 2);
    expect(radiusAt(19.05)).toBeGreaterThan(5.02);
    expect(radiusAt(18.95)).toBeCloseTo(5, 2);
    expect(chamfered.volume()).toBeGreaterThan(plain.volume());
    expect(chamfered.status()).toBe("NoError");
    plain.delete();
    chamfered.delete();
  });
});

describe("profiles", () => {
  it("extrudes a polygon to the area it encloses", async () => {
    const kernel = await getKernel();
    const triangle = polygon(kernel, [
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    const prism = triangle.extrude(4);
    expect(prism.volume()).toBeCloseTo(50 * 4, 6);
    prism.delete();
    triangle.delete();
    expect(() => polygon(kernel, [[0, 0], [1, 1]])).toThrow(/three points/);
  });

  it("builds a 45 degree chamfer cone that widens by its height", async () => {
    const kernel = await getKernel();
    const cone = chamferedCircle(kernel, 5, 1, CYLINDER_SEGMENTS);
    const box = cone.boundingBox();
    expect(box.max[2]).toBeCloseTo(1.2, 6);
    expect(box.max[0]).toBeCloseTo(5 + 1.2, 6);
    expect(cone.status()).toBe("NoError");
    cone.delete();
  });
});

describe("shell", () => {
  it("makes a slab of the profile area times the height", async () => {
    const kernel = await getKernel();
    const slab = roundedSlab(kernel, { width: 40, depth: 20, height: 5, cornerRadius: 0, segments: 24 });
    expect(slab.volume()).toBeCloseTo(40 * 20 * 5, 6);
    slab.delete();
  });

  it("subtracts the cavity above the base and keeps the outer body", async () => {
    const kernel = await getKernel();
    const { outer, shell } = roundedShell(kernel, {
      width: 40, depth: 30, height: 20, cornerRadius: 0, wallThickness: 2, baseThickness: 3, segments: 24,
    });
    expect(outer.volume()).toBeCloseTo(40 * 30 * 20, 6);
    const cavity = 36 * 26 * (20 - 3);
    expect(shell.volume()).toBeCloseTo(40 * 30 * 20 - cavity, 6);
    const box = shell.boundingBox();
    expect(box.max[2]).toBeCloseTo(20, 6);
    expect(shell.status()).toBe("NoError");
    outer.delete();
    shell.delete();
  });

  it("accepts arbitrary profiles", async () => {
    const kernel = await getKernel();
    const outerProfile = roundedRectangle(kernel, 30, 30, 5, 24);
    const innerProfile = polygon(kernel, [[-10, -10], [10, -10], [0, 10]]);
    const { outer, shell } = shellFromProfiles(outerProfile, innerProfile, 10, 2);
    expect(outer.volume() - shell.volume()).toBeCloseTo(200 * 8, 4);
    outer.delete();
    shell.delete();
    outerProfile.delete();
    innerProfile.delete();
  });
});

describe("underside lightening", () => {
  const base: LighteningOptions = {
    width: 200, depth: 110, cornerRadius: 3, rim: 2, pocketDepth: 4, maximumSpan: 40, web: 2.5, pocketRadius: 2, segments: 24,
  };

  it("splits the inside into pockets no wider than the maximum span", () => {
    const plan = planLightening(base);
    expect(plan).not.toBeNull();
    expect(plan!.spanX).toBeLessThanOrEqual(40);
    expect(plan!.spanY).toBeLessThanOrEqual(40);
    expect(plan!.countX * plan!.spanX + (plan!.countX - 1) * 2.5).toBeCloseTo(196, 10);
    expect(plan!.countY * plan!.spanY + (plan!.countY - 1) * 2.5).toBeCloseTo(106, 10);
  });

  it("returns no plan for a shallow pocket, a tiny slab, or a cleared value", () => {
    expect(planLightening({ ...base, pocketDepth: MINIMUM_POCKET_DEPTH - 0.01 })).toBeNull();
    expect(planLightening({ ...base, width: MINIMUM_POCKET_SPAN + 2 * 2 - 0.1 })).toBeNull();
    expect(planLightening({ ...base, width: Number.NaN })).toBeNull();
  });

  it("keeps a corner pocket inside a large outer corner radius", async () => {
    const kernel = await getKernel();
    // 60 x 40 slab, 1.2 mm rim, 20 mm outer corner: an unclipped pocket
    // grid would cut through the rounded corner and open the pocket to
    // the outside. The clip keeps at least the rim everywhere.
    const options: LighteningOptions = {
      ...base, width: 60, depth: 40, rim: 1.2, cornerRadius: 20, pocketDepth: 3,
    };
    const slab = roundedSlab(kernel, { width: 60, depth: 40, height: 8, cornerRadius: 20, segments: 24 });
    const { solid, plan } = lightenUnderside(kernel, slab, options);
    expect(plan).not.toBeNull();
    // Probe the corner: a point on the 45 degree diagonal, half a rim in
    // from the outer arc, must still be solid at pocket height.
    const arcCenter = [30 - 20, 20 - 20];
    const along = 20 - 0.6;
    const probe = kernel.Manifold.cube([0.2, 0.2, 0.2], true).translate([
      arcCenter[0] + along / Math.SQRT2,
      arcCenter[1] + along / Math.SQRT2,
      1.5,
    ]);
    const hit = solid.intersect(probe);
    expect(hit.volume()).toBeGreaterThan(0.2 * 0.2 * 0.2 * 0.9);
    hit.delete();
    probe.delete();
    solid.delete();
  });

  it("removes the pocket volume and leaves the slab alone when there is no plan", async () => {
    const kernel = await getKernel();
    const slab = roundedSlab(kernel, { width: 200, depth: 110, height: 10, cornerRadius: 0, segments: 24 });
    const before = slab.volume();
    const { solid, plan } = lightenUnderside(kernel, slab, base);
    expect(plan).not.toBeNull();
    expect(solid.volume()).toBeLessThan(before);
    expect(solid.boundingBox().min[2]).toBeCloseTo(0, 6);
    expect(solid.status()).toBe("NoError");
    const untouched = lightenUnderside(kernel, solid, { ...base, pocketDepth: 0 });
    expect(untouched.plan).toBeNull();
    expect(untouched.solid).toBe(solid);
    solid.delete();
  });
});
