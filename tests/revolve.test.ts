import { describe, expect, it } from "vitest";
import { getKernel } from "../lib/kernel/manifold";
import {
  REVOLVE_SEGMENTS,
  RIM_AXIS_MARGIN_MM,
  buildVesselProfile,
  clampRimRadius,
  revolveProfile,
  revolveShell,
  rimArcSegments,
  type ProfilePoint,
  type VesselProfileOptions,
} from "../lib/kernel/revolve";
import { BOOLEAN_OVERLAP } from "../lib/kernel/shell";
import { connectedComponentCount } from "./helpers/mesh-checks";

/** True when no two non-neighbouring edges of the closed polygon cross. */
function isSimplePolygon(points: ReadonlyArray<ProfilePoint>): boolean {
  const count = points.length;
  const cross = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
  ) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const segmentsCross = (a: number, b: number) => {
    const [p1, p2] = [points[a], points[(a + 1) % count]];
    const [p3, p4] = [points[b], points[(b + 1) % count]];
    const d1 = cross(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
    const d2 = cross(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
    const d3 = cross(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    const d4 = cross(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      const neighbours = b === a + 1 || (a === 0 && b === count - 1);
      if (neighbours) continue;
      if (segmentsCross(a, b)) return false;
    }
  }
  return true;
}

const BASE_OPTIONS: VesselProfileOptions = {
  outerRadiusAtBase: 40,
  height: 30,
  wallThickness: 2,
  baseThickness: 2.4,
  taperDegrees: 6,
  rimRadius: 1,
};

describe("revolve profiles", () => {
  it("gives a cylinder volume within 0.1 percent at fine quality", async () => {
    const kernel = await getKernel();
    const radius = 10;
    const height = 20;
    const solid = revolveProfile(
      kernel,
      [
        [0, 0],
        [radius, 0],
        [radius, height],
        [0, height],
      ],
      REVOLVE_SEGMENTS.fine,
    );
    const exact = Math.PI * radius * radius * height;
    expect(solid.status()).toBe("NoError");
    expect(Math.abs(solid.volume() - exact) / exact).toBeLessThan(0.001);
    const box = solid.boundingBox();
    expect(box.min).toEqual([-radius, -radius, 0]);
    expect(box.max).toEqual([radius, radius, height]);
    solid.delete();
  });

  it("follows the mesh quality with its segment count", async () => {
    const kernel = await getKernel();
    const counts: number[] = [];
    for (const quality of ["draft", "standard", "fine"] as const) {
      const segments = REVOLVE_SEGMENTS[quality];
      const solid = revolveProfile(
        kernel,
        [
          [0, 0],
          [10, 0],
          [10, 20],
          [0, 20],
        ],
        segments,
      );
      // A four-point profile revolved into `segments` columns: two triangles
      // for the side and one for each end cap, per column.
      expect(solid.numTri()).toBe(segments * 4);
      counts.push(solid.volume());
      solid.delete();
    }
    expect(REVOLVE_SEGMENTS.draft).toBe(48);
    expect(REVOLVE_SEGMENTS.standard).toBe(96);
    expect(REVOLVE_SEGMENTS.fine).toBe(192);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("keeps the rim arc even and at least two steps", () => {
    expect(rimArcSegments(REVOLVE_SEGMENTS.draft)).toBe(6);
    expect(rimArcSegments(REVOLVE_SEGMENTS.standard)).toBe(12);
    expect(rimArcSegments(REVOLVE_SEGMENTS.fine)).toBe(24);
    expect(rimArcSegments(4)).toBe(2);
    expect(rimArcSegments(0)).toBe(2);
    for (const segments of [0, 4, 12, 48, 96, 192]) {
      expect(rimArcSegments(segments) % 2).toBe(0);
    }
  });
});

describe("the rolled rim clamp", () => {
  const request = {
    rimRadius: 20,
    height: 30,
    outerRadiusAtBase: 40,
    wallThickness: 4,
    taperDegrees: 0,
  };

  it("never exceeds a quarter of the height", () => {
    // With a 4 mm wall the wall limit is 3.8 mm, so the height limit binds at
    // a height of 12 mm or less.
    expect(clampRimRadius({ ...request, height: 12 })).toBeCloseTo(3, 6);
    expect(clampRimRadius({ ...request, height: 8 })).toBeCloseTo(2, 6);
  });

  it("never exceeds the wall it rolls over", () => {
    // The cavity cuts the inner half of the bead away, so the bead survives
    // only while r × (1 + tan θ) is under the horizontal wall less the overlap.
    expect(clampRimRadius(request)).toBeCloseTo(4 - BOOLEAN_OVERLAP, 6);
    expect(clampRimRadius({ ...request, wallThickness: 1.6 })).toBeCloseTo(1.4, 6);
  });

  it("keeps the bead clear of the axis", () => {
    const tight = clampRimRadius({
      ...request,
      outerRadiusAtBase: 3,
      wallThickness: 4,
    });
    expect(tight).toBeCloseTo((3 - RIM_AXIS_MARGIN_MM) / 2, 6);
  });

  it("returns zero for a request that is zero, negative, or not a number", () => {
    expect(clampRimRadius({ ...request, rimRadius: 0 })).toBe(0);
    expect(clampRimRadius({ ...request, rimRadius: -2 })).toBe(0);
    expect(clampRimRadius({ ...request, rimRadius: Number.NaN })).toBe(0);
    expect(clampRimRadius({ ...request, height: Number.NaN })).toBe(0);
  });

  it("never returns more than the request", () => {
    expect(clampRimRadius({ ...request, rimRadius: 0.5 })).toBe(0.5);
  });
});

describe("the vessel profile builder", () => {
  it("places the floor, the wall, and the widest ring where it says", () => {
    const profile = buildVesselProfile(BASE_OPTIONS)!;
    expect(profile).not.toBeNull();
    const tangent = Math.tan((6 * Math.PI) / 180);
    const horizontalWall = 2 / Math.cos((6 * Math.PI) / 180);
    expect(profile.taperTangent).toBeCloseTo(tangent, 9);
    expect(profile.horizontalWall).toBeCloseTo(horizontalWall, 9);
    expect(profile.rimRadius).toBe(1);
    expect(profile.rimRadiusClamped).toBe(false);
    expect(profile.wallTopZ).toBe(29);
    expect(profile.maximumRadius).toBeCloseTo(40 + 29 * tangent, 9);
    expect(profile.innerRadiusAtFloor).toBeCloseTo(
      40 - horizontalWall + 2.4 * tangent,
      9,
    );
    // The outer profile starts on the axis at Z = 0 and reaches the height.
    expect(profile.outer[0]).toEqual([0, 0]);
    expect(Math.max(...profile.outer.map(([, z]) => z))).toBeCloseTo(30, 9);
    expect(Math.max(...profile.outer.map(([r]) => r))).toBeCloseTo(
      profile.maximumRadius,
      9,
    );
    // The cavity starts on top of the floor and overshoots the rim.
    expect(profile.inner[0]).toEqual([0, 2.4]);
    expect(profile.inner[3][1]).toBeCloseTo(30 + BOOLEAN_OVERLAP, 9);
  });

  it("makes a square rim when the bead radius is zero", () => {
    const profile = buildVesselProfile({ ...BASE_OPTIONS, rimRadius: 0 })!;
    expect(profile.rimRadius).toBe(0);
    expect(profile.wallTopZ).toBe(30);
    expect(profile.outer).toHaveLength(4);
    expect(isSimplePolygon(profile.outer)).toBe(true);
  });

  it("reports a reduced bead radius", () => {
    const profile = buildVesselProfile({ ...BASE_OPTIONS, rimRadius: 3 })!;
    expect(profile.rimRadius).toBeLessThan(3);
    expect(profile.rimRadiusClamped).toBe(true);
  });

  it("returns null when the numbers do not make a vessel", () => {
    expect(buildVesselProfile({ ...BASE_OPTIONS, height: Number.NaN })).toBeNull();
    expect(buildVesselProfile({ ...BASE_OPTIONS, outerRadiusAtBase: 0 })).toBeNull();
    expect(buildVesselProfile({ ...BASE_OPTIONS, baseThickness: 40 })).toBeNull();
    expect(buildVesselProfile({ ...BASE_OPTIONS, taperDegrees: 75 })).toBeNull();
    // A wall thicker than the radius closes the cavity.
    expect(buildVesselProfile({ ...BASE_OPTIONS, wallThickness: 45 })).toBeNull();
  });

  it("never lets the rolled rim cross itself, down to the smallest radius", () => {
    const radii = [3, 4, 6, 10, 20, 40, 104];
    const heights = [8, 15, 40, 220];
    const walls = [1.6, 2, 4];
    const tapers = [0, 3, 6, 12, 45];
    let checked = 0;
    for (const outerRadiusAtBase of radii) {
      for (const height of heights) {
        for (const wallThickness of walls) {
          for (const taperDegrees of tapers) {
            // Ask for a bead far larger than any clamp allows.
            const profile = buildVesselProfile({
              outerRadiusAtBase,
              height,
              wallThickness,
              baseThickness: 1.6,
              taperDegrees,
              rimRadius: 50,
              rimSegments: rimArcSegments(REVOLVE_SEGMENTS.fine),
            });
            if (!profile) continue;
            checked += 1;
            expect(profile.rimRadius).toBeLessThanOrEqual(height / 4 + 1e-9);
            expect(profile.maximumRadius - 2 * profile.rimRadius).toBeGreaterThanOrEqual(
              RIM_AXIS_MARGIN_MM - 1e-9,
            );
            expect(isSimplePolygon(profile.outer)).toBe(true);
            expect(isSimplePolygon(profile.inner)).toBe(true);
            expect(profile.outer.every(([r, z]) => r >= 0 && z >= 0)).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("builds a closed, single-piece shell at the smallest radius the clamp allows", async () => {
    const kernel = await getKernel();
    const segments = REVOLVE_SEGMENTS.fine;
    const profile = buildVesselProfile({
      outerRadiusAtBase: 3,
      height: 8,
      wallThickness: 1.6,
      baseThickness: 1.6,
      taperDegrees: 3,
      rimRadius: 50,
      rimSegments: rimArcSegments(segments),
    })!;
    expect(profile).not.toBeNull();
    const built = revolveShell(kernel, profile, segments);
    expect(built.shell.status()).toBe("NoError");
    expect(built.shell.isEmpty()).toBe(false);
    expect(built.shell.genus()).toBe(0);
    expect(built.shell.volume()).toBeGreaterThan(0);
    const mesh = built.shell.getMesh();
    expect(connectedComponentCount(Uint32Array.from(mesh.triVerts))).toBe(1);
    const box = built.shell.boundingBox();
    expect(box.max[2]).toBeCloseTo(8, 6);
    expect(box.max[0]).toBeCloseTo(profile.maximumRadius, 6);
    built.outer.delete();
    built.cavity.delete();
    built.shell.delete();
  });

  it("subtracts the cavity from the outer body", async () => {
    const kernel = await getKernel();
    const profile = buildVesselProfile({
      ...BASE_OPTIONS,
      rimSegments: rimArcSegments(REVOLVE_SEGMENTS.standard),
    })!;
    const built = revolveShell(kernel, profile, REVOLVE_SEGMENTS.standard);
    expect(built.shell.volume()).toBeLessThan(built.outer.volume());
    expect(built.cavity.volume()).toBeGreaterThan(0);
    expect(built.shell.genus()).toBe(0);
    const box = built.shell.boundingBox();
    expect(box.min[0]).toBeCloseTo(-profile.maximumRadius, 5);
    expect(box.min[1]).toBeCloseTo(-profile.maximumRadius, 5);
    expect(box.min[2]).toBe(0);
    expect(box.max[2]).toBeCloseTo(30, 5);
    built.outer.delete();
    built.cavity.delete();
    built.shell.delete();
  });
});
