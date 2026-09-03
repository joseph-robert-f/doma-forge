import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import type { Solid } from "./manifold";

/**
 * A centered rectangle with rounded corners. The radius is clamped so the
 * profile never degenerates; below 0.01 mm a plain square is returned.
 */
export function roundedRectangle(
  kernel: ManifoldToplevel,
  width: number,
  depth: number,
  radius: number,
  segments: number,
): CrossSection {
  const safeRadius = Math.max(
    0,
    Math.min(radius, width / 2 - 0.01, depth / 2 - 0.01),
  );
  if (safeRadius < 0.01) {
    return kernel.CrossSection.square([width, depth], true);
  }
  const core = kernel.CrossSection.square(
    [width - safeRadius * 2, depth - safeRadius * 2],
    true,
  );
  const rounded = core.offset(safeRadius, "Round", 2, segments);
  core.delete();
  return rounded;
}

/**
 * A simple polygon from at least three points, in millimeters. The kernel
 * fixes the winding, so the points may run either way. A cross-section a
 * product extrudes, offsets, or revolves.
 */
export function polygon(
  kernel: ManifoldToplevel,
  points: ReadonlyArray<readonly [number, number]>,
): CrossSection {
  if (points.length < 3) {
    throw new Error("A polygon needs at least three points.");
  }
  return new kernel.CrossSection(
    [points.map(([x, y]) => [x, y] as [number, number])],
    "Positive",
  );
}

/**
 * The cone cutter for a chamfered bore: a 45 degree frustum whose bottom
 * radius is the bore radius and whose top is wider by `chamfer`. Placed with
 * its base `chamfer` below the face, it cuts the chamfer; it overshoots the
 * face by 0.2 mm so the top faces never coincide.
 */
export function chamferedCircle(
  kernel: ManifoldToplevel,
  radius: number,
  chamfer: number,
  segments: number,
): Solid {
  const overshoot = 0.2;
  const height = chamfer + overshoot;
  return kernel.Manifold.cylinder(height, radius, radius + height, segments);
}
