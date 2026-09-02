import type { CrossSection, ManifoldToplevel } from "manifold-3d";

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
