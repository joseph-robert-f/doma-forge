import { BOOLEAN_OVERLAP } from "./overlap";

/**
 * The vessel profile: the two-dimensional outline of a revolved form in the
 * XZ half-plane, where the first number is the radius and the second the
 * height. Pure; a product schema may import this module. The revolve
 * builders live in `revolve.ts`. See 28_CONTRACT_FOLLOW_UPS_NOTES.md,
 * decision D-1701.
 */

/** One profile point: `[radius, height]`. */
export type ProfilePoint = readonly [number, number];

/**
 * Segments in one full revolution, per mesh quality. A revolved surface is
 * the whole silhouette of the part, not a small feature, so it takes four
 * times the segment count of a bore. See 23_REVOLVED_FORMS_NOTES.md, D-1502.
 */
export const REVOLVE_SEGMENTS = {
  draft: 48,
  standard: 96,
  fine: 192,
} as const;

export type RevolveQuality = keyof typeof REVOLVE_SEGMENTS;

/**
 * Points on the rolled-rim arc for a given revolution segment count. The
 * count is always even, so the arc holds a point at the top of the bead and
 * the part reaches its stated height exactly.
 */
export function rimArcSegments(segments: number): number {
  return evenSegments(Math.round(segments / 8));
}

/** Rounds a segment count up to an even number of at least two. */
function evenSegments(segments: number): number {
  if (!Number.isFinite(segments)) return 2;
  return Math.max(2, 2 * Math.max(1, Math.round(segments / 2)));
}

/** Material the rolled rim leaves between the bead and the axis. */
export const RIM_AXIS_MARGIN_MM = 0.5;

export interface RimRadiusRequest {
  /** The bead radius the user asked for. */
  rimRadius: number;
  /** Total height of the vessel, floor to the top of the bead. */
  height: number;
  /** Outer radius at Z = 0. */
  outerRadiusAtBase: number;
  /** Wall thickness, measured perpendicular to the wall. */
  wallThickness: number;
  /** Wall taper from vertical, in degrees. */
  taperDegrees: number;
}

/**
 * The bead radius the profile can carry. Three limits apply.
 *
 * 1. A quarter of the height. A taller bead would eat the straight wall and
 *    fold the profile over itself.
 * 2. The wall. The cavity cuts the inner half of the bead away. The top of
 *    the bead survives that cut only while
 *    `r × (1 + tan θ) ≤ horizontalWall − BOOLEAN_OVERLAP`, and the part
 *    reaches its stated height only while the top of the bead survives.
 * 3. The axis. The bead's inner edge is at `outerRadius(height − r) − 2r`.
 *    That edge must stay `RIM_AXIS_MARGIN_MM` clear of the axis, which gives
 *    `r ≤ (R0 + H × tan θ − margin) / (2 + tan θ)`.
 *
 * The result is never negative and never larger than the request.
 */
export function clampRimRadius(request: RimRadiusRequest): number {
  const { rimRadius, height, outerRadiusAtBase, wallThickness, taperDegrees } =
    request;
  const values = [
    rimRadius,
    height,
    outerRadiusAtBase,
    wallThickness,
    taperDegrees,
  ];
  if (!values.every((value) => Number.isFinite(value))) return 0;
  if (rimRadius <= 0 || height <= 0 || outerRadiusAtBase <= 0) return 0;
  if (wallThickness <= 0 || taperDegrees < 0 || taperDegrees > 60) return 0;
  const radians = (taperDegrees * Math.PI) / 180;
  const tangent = Math.tan(radians);
  const horizontalWall = wallThickness / Math.cos(radians);
  const wallLimit = (horizontalWall - BOOLEAN_OVERLAP) / (1 + tangent);
  const axisLimit =
    (outerRadiusAtBase + height * tangent - RIM_AXIS_MARGIN_MM) / (2 + tangent);
  return Math.max(0, Math.min(rimRadius, height / 4, wallLimit, axisLimit));
}

export interface VesselProfileOptions {
  /** Outer radius at Z = 0, the footprint radius. */
  outerRadiusAtBase: number;
  /** Total height, from Z = 0 to the top of the rim. */
  height: number;
  /** Wall thickness, measured perpendicular to the wall. */
  wallThickness: number;
  /** Floor thickness, measured up from Z = 0. */
  baseThickness: number;
  /** Wall taper from vertical, in degrees. A positive angle opens upward. */
  taperDegrees: number;
  /** Rolled-rim bead radius the user asked for. Zero gives a square rim. */
  rimRadius: number;
  /** Points on the bead arc. Defaults to the standard-quality count. */
  rimSegments?: number;
}

export interface VesselProfile {
  /** The outer boundary, closed, counted from the axis at Z = 0. */
  outer: ProfilePoint[];
  /** The cavity, closed. It overshoots the top by `BOOLEAN_OVERLAP`. */
  inner: ProfilePoint[];
  /** The bead radius after the clamp. */
  rimRadius: number;
  /** True when the clamp reduced the requested bead radius. */
  rimRadiusClamped: boolean;
  /** Height of the top of the straight wall, where the bead starts. */
  wallTopZ: number;
  /** Horizontal offset between the outer wall and the cavity. */
  horizontalWall: number;
  /** Tangent of the taper angle. `radius(z) = radiusAtBase + z × tangent`. */
  taperTangent: number;
  outerRadiusAtBase: number;
  /** Cavity radius at Z = 0, taken down the same taper line. */
  innerRadiusAtBase: number;
  /** Cavity radius at the top of the floor. The floor's usable radius. */
  innerRadiusAtFloor: number;
  /** The widest outer radius. It sits at `wallTopZ`. */
  maximumRadius: number;
  /** The narrowest clear radius at the rim. Never less than the floor radius. */
  openingRadius: number;
}

/**
 * Builds the outer profile and the cavity profile of a revolved vessel: a
 * flat floor, a tapered wall, and an optional rolled rim.
 *
 * The rolled rim is a bead that rolls inward from the top of the wall. Its
 * outer edge continues the wall, so the bead never overhangs the outside and
 * the part prints without supports. Its top sits at the stated height.
 *
 * Returns null when the numbers cannot make a simple profile, the way
 * `planLightening` returns null. A caller reports "does not fit" instead.
 */
export function buildVesselProfile(
  options: VesselProfileOptions,
): VesselProfile | null {
  const {
    outerRadiusAtBase,
    height,
    wallThickness,
    baseThickness,
    taperDegrees,
    rimRadius: requestedRimRadius,
  } = options;
  const values = [
    outerRadiusAtBase,
    height,
    wallThickness,
    baseThickness,
    taperDegrees,
    requestedRimRadius,
  ];
  if (!values.every((value) => Number.isFinite(value))) return null;
  if (outerRadiusAtBase <= 0 || wallThickness <= 0 || baseThickness <= 0) {
    return null;
  }
  if (taperDegrees < 0 || taperDegrees > 60) return null;
  if (height <= baseThickness) return null;

  const radians = (taperDegrees * Math.PI) / 180;
  const taperTangent = Math.tan(radians);
  const horizontalWall = wallThickness / Math.cos(radians);
  const innerRadiusAtBase = outerRadiusAtBase - horizontalWall;
  const outerRadiusAt = (z: number) => outerRadiusAtBase + z * taperTangent;
  const innerRadiusAt = (z: number) => innerRadiusAtBase + z * taperTangent;
  const innerRadiusAtFloor = innerRadiusAt(baseThickness);
  if (innerRadiusAtFloor <= 0) return null;

  const rimRadius = clampRimRadius({
    rimRadius: requestedRimRadius,
    height,
    outerRadiusAtBase,
    wallThickness,
    taperDegrees,
  });
  const wallTopZ = height - rimRadius;
  const maximumRadius = outerRadiusAt(wallTopZ);

  const outer: ProfilePoint[] = [
    [0, 0],
    [outerRadiusAtBase, 0],
  ];
  let openingRadius: number;
  if (rimRadius > 1e-6) {
    const beadCenter = maximumRadius - rimRadius;
    outer.push([maximumRadius, wallTopZ]);
    const steps = evenSegments(
      options.rimSegments === undefined
        ? rimArcSegments(REVOLVE_SEGMENTS.standard)
        : options.rimSegments,
    );
    for (let step = 1; step <= steps; step += 1) {
      const angle = (Math.PI * step) / steps;
      outer.push([
        beadCenter + rimRadius * Math.cos(angle),
        wallTopZ + rimRadius * Math.sin(angle),
      ]);
    }
    outer.push([0, wallTopZ]);
    openingRadius = Math.max(beadCenter - rimRadius, innerRadiusAt(wallTopZ));
  } else {
    outer.push([maximumRadius, height]);
    outer.push([0, height]);
    openingRadius = innerRadiusAt(height);
  }

  const cavityTopZ = height + BOOLEAN_OVERLAP;
  const inner: ProfilePoint[] = [
    [0, baseThickness],
    [innerRadiusAtFloor, baseThickness],
    [innerRadiusAt(cavityTopZ), cavityTopZ],
    [0, cavityTopZ],
  ];

  return {
    outer,
    inner,
    rimRadius,
    rimRadiusClamped: rimRadius < requestedRimRadius - 1e-9,
    wallTopZ,
    horizontalWall,
    taperTangent,
    outerRadiusAtBase,
    innerRadiusAtBase,
    innerRadiusAtFloor,
    maximumRadius,
    openingRadius,
  };
}
