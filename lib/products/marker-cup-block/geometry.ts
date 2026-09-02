import { boreCutter, cutterArray, unionSolids } from "../../kernel/arrays";
import { lightenUnderside } from "../../kernel/lightening";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { BOOLEAN_OVERLAP, roundedSlab } from "../../kernel/shell";
import {
  CHAMFER_MM,
  QUALITY_SEGMENTS,
  deriveLayout,
  lighteningOptions,
  type MarkerCupBlockParameters,
} from "./schema";
import { validateMarkerCupBlock } from "./validate";

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * A bore cutter tilted about the X axis, pivoted at its own mouth center
 * (local X = 0, Y = 0, Z = topZ). The mouth stays put; a positive tilt
 * swings the floor toward the front (negative Y), so a marker resting in
 * the cup — the axis extended past the mouth, the opposite way from the
 * floor — visibly leans back, toward positive Y, away from the user.
 * `cutterArray` only translates its copies, so placing this template's
 * pivot at the local origin keeps every copy's mouth on the layout grid.
 *
 * `boreCutter` only overshoots the flat top face by `BOOLEAN_OVERLAP`
 * (0.2 mm) along its own, untilted axis. Once tilted, the cutter's widest
 * disk (radius `diameter / 2 + chamfer`, at its own local mouth plane)
 * dips below the real, unrotated top face on the side the tilt lowers,
 * unless the cutter reaches that far past the true mouth plane to begin
 * with — `radius * tan(tilt)` on the far side of the plane from wherever
 * the tilt lifts the disk, matched by the same reach on the near side, so
 * the fix does not need to know which side the rotation's own sign sends
 * the low edge to. A plain, uniform-radius cap of that widest radius,
 * spanning that far on either side of the true mouth plane, is unioned
 * onto the correctly built, un-shifted cutter before the pivot and the
 * rotation: a wide, two-sided cylinder has no directional bias, so it
 * opens both edges of the tilted mouth ellipse.
 *
 * (Stretching the whole compound body-and-chamfer-cone shape upward
 * instead — moving `topZ` and `depth` together, floor held fixed — was
 * tried first and looked right for a plain bore, but it also drags the
 * narrow chamfer cone away from the true mouth plane, along with the
 * wide body cylinder underneath it. After rotation that leaves one side of
 * a chamfered mouth open only out to the plain body's own radius, short of
 * the wider chamfer, because the cone has moved away from where that side
 * needs it. A one-sided cap, extended only upward, has the mirror image
 * of the same defect: it opens the side the tilt lifts, out past the
 * chamfer as intended, but does nothing for the side the tilt lowers,
 * which needs reach in the other direction, below the true mouth plane,
 * not above it. Only a cap generous on both sides fixes both.)
 */
function tiltedBoreCutter(
  kernel: Awaited<ReturnType<typeof getKernel>>,
  options: Parameters<typeof boreCutter>[1] & { tiltDegrees: number },
): Solid {
  if (!options.tiltDegrees) return boreCutter(kernel, options);
  const tiltRadians = options.tiltDegrees * DEGREES_TO_RADIANS;
  const wideRadius = options.diameter / 2 + options.chamfer;
  // How far, along the untilted axis, the widest disk must reach on
  // either side of the true mouth plane: the mouth ellipse needs headroom
  // above the plane on the side the tilt lifts, and the same amount below
  // it on the side the tilt lowers, which side is which depending on the
  // rotation's own sign. A cap spanning both directions by this much
  // covers whichever side needs it, without having to know that sign.
  const extra = wideRadius * Math.tan(tiltRadians) + BOOLEAN_OVERLAP;

  const original = boreCutter(kernel, options);
  const capAtOrigin = kernel.Manifold.cylinder(2 * extra, wideRadius, wideRadius, options.segments);
  const cap = capAtOrigin.translate([0, 0, options.topZ - extra]);
  capAtOrigin.delete();
  const cutter = unionSolids(kernel, [original, cap]);

  const pivot: [number, number, number] = [0, 0, options.topZ];
  const atOrigin = cutter.translate([-pivot[0], -pivot[1], -pivot[2]]);
  cutter.delete();
  const tilted = atOrigin.rotate(-options.tiltDegrees, 0, 0);
  atOrigin.delete();
  const positioned = tilted.translate(pivot);
  tilted.delete();
  return positioned;
}

/**
 * Builds the block as one solid: a rounded slab, minus one batched union of
 * every tilted bore cutter, minus the underside pockets. Coordinates are
 * millimeters, X/Y centered on the origin, base at Z = 0. Row 1 is at the
 * front (negative Y); a positive tilt swings every bore floor toward the
 * front, so a marker resting in a cup visibly leans back, away from the
 * user (see `tiltedBoreCutter`).
 */
export async function generateMarkerCupBlock(
  parameters: MarkerCupBlockParameters,
): Promise<GeneratedModel<MarkerCupBlockParameters>> {
  const validation = validateMarkerCupBlock(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];
  const spacing = layout.rowSpacing;
  if (!spacing.ok) throw new Error("The rows do not fit the block depth at this tilt.");

  const slab = roundedSlab(kernel, {
    width: parameters.blockWidth,
    depth: parameters.blockDepth,
    height: parameters.blockHeight,
    cornerRadius: parameters.cornerRadius,
    segments,
  });

  const rowCutters: Solid[] = layout.rowLayouts.map((rowLayout, index) => {
    if (!rowLayout.ok) throw new Error(`Row ${index + 1} does not fit the block width.`);
    const centerY = spacing.firstCenter + index * spacing.pitch;
    return cutterArray(
      kernel,
      () =>
        tiltedBoreCutter(kernel, {
          diameter: parameters.boreDiameter,
          depth: parameters.boreDepth,
          chamfer: parameters.chamfer ? CHAMFER_MM : 0,
          segments,
          topZ: parameters.blockHeight,
          tiltDegrees: parameters.tiltDegrees,
        }),
      {
        pitchX: rowLayout.pitch,
        pitchY: 0,
        countX: parameters.cupsPerRow,
        countY: 1,
        origin: [rowLayout.firstCenter, centerY, 0],
      },
    );
  });
  const bores = unionSolids(kernel, rowCutters);
  let solid = slab.subtract(bores);
  bores.delete();
  slab.delete();

  if (parameters.lightenUnderside) {
    solid = lightenUnderside(
      kernel,
      solid,
      lighteningOptions(parameters, segments),
    ).solid;
  }

  return finishSolid(solid, parameters, "cup block");
}
