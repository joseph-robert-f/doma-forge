import type { ManifoldToplevel } from "manifold-3d";
import { unionSolids } from "../../kernel/arrays";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP, roundedShell } from "../../kernel/shell";
import {
  LABEL_LEDGE_HEIGHT_MM,
  LABEL_LEDGE_PROJECTION_MM,
  LABEL_LEDGE_SHELF_MM,
  LABEL_LEDGE_UPSTAND_MM,
  QUALITY_SEGMENTS,
  deriveLayout,
  type PartsBinLayout,
  type PartsBinParameters,
  type RingFrame,
} from "./schema";
import { validatePartsBin } from "./validate";

/**
 * A rectangular ring extruded between the frame's two Z values. The ring is
 * the difference of two rounded rectangles, so its corners follow the outer
 * profile. `grow` extends the prism below and above the frame, which keeps a
 * Boolean face off a face of the body.
 */
function ringPrism(
  kernel: ManifoldToplevel,
  frame: RingFrame,
  segments: number,
  growBelow: number,
  growAbove: number,
): Solid {
  const outerProfile = roundedRectangle(
    kernel,
    frame.outerHalfWidth * 2,
    frame.outerHalfDepth * 2,
    frame.outerCornerRadius,
    segments,
  );
  const innerProfile = roundedRectangle(
    kernel,
    frame.innerHalfWidth * 2,
    frame.innerHalfDepth * 2,
    frame.innerCornerRadius,
    segments,
  );
  const ring = outerProfile.subtract(innerProfile);
  outerProfile.delete();
  innerProfile.delete();
  const prismAtOrigin = ring.extrude(
    frame.topZ - frame.bottomZ + growBelow + growAbove,
  );
  ring.delete();
  const prism = prismAtOrigin.translate([0, 0, frame.bottomZ - growBelow]);
  prismAtOrigin.delete();
  return prism;
}

/**
 * The label ledge: a shelf at the front foot and an upstand at its outer
 * edge. The gap between the upstand and the front face of the bin is the
 * card slot. The ledge never rises above the front rim, so it cannot touch
 * the bin above it in a stack.
 */
function labelLedge(
  kernel: ManifoldToplevel,
  layout: PartsBinLayout,
): Solid {
  const frontY = -layout.bodyDepth / 2;
  const shelfAtOrigin = kernel.Manifold.cube(
    [
      layout.ledgeWidth,
      LABEL_LEDGE_PROJECTION_MM + BOOLEAN_OVERLAP,
      LABEL_LEDGE_SHELF_MM,
    ],
    true,
  );
  const shelf = shelfAtOrigin.translate([
    0,
    frontY - LABEL_LEDGE_PROJECTION_MM / 2 + BOOLEAN_OVERLAP / 2,
    LABEL_LEDGE_SHELF_MM / 2,
  ]);
  shelfAtOrigin.delete();
  const upstandAtOrigin = kernel.Manifold.cube(
    [layout.ledgeWidth, LABEL_LEDGE_UPSTAND_MM, LABEL_LEDGE_HEIGHT_MM],
    true,
  );
  const upstand = upstandAtOrigin.translate([
    0,
    frontY - LABEL_LEDGE_PROJECTION_MM + LABEL_LEDGE_UPSTAND_MM / 2,
    LABEL_LEDGE_HEIGHT_MM / 2,
  ]);
  upstandAtOrigin.delete();
  return unionSolids(kernel, [shelf, upstand]);
}

/**
 * The front scoop: a half cylinder through the front wall at the rim, plus a
 * straight slot through the lip above it. The slot keeps the notch open to
 * the top of the model, so nothing bridges over the scoop.
 */
function scoopCutter(
  kernel: ManifoldToplevel,
  parameters: PartsBinParameters,
  layout: PartsBinLayout,
  segments: number,
): Solid {
  const radius = layout.scoopRadius;
  const wallLength = parameters.wallThickness + BOOLEAN_OVERLAP * 4;
  const centerY = -layout.bodyDepth / 2 + parameters.wallThickness / 2;
  const cylinderAtOrigin = kernel.Manifold.cylinder(
    wallLength,
    radius,
    radius,
    segments,
    true,
  );
  const rotated = cylinderAtOrigin.rotate([90, 0, 0]);
  cylinderAtOrigin.delete();
  const notch = rotated.translate([0, centerY, layout.bodyHeight]);
  rotated.delete();
  if (!layout.lip) return notch;

  const lipHeight = layout.lip.topZ - layout.lip.bottomZ;
  const slotAtOrigin = kernel.Manifold.cube(
    [radius * 2, wallLength, lipHeight + BOOLEAN_OVERLAP * 2],
    true,
  );
  const slot = slotAtOrigin.translate([
    0,
    centerY,
    layout.bodyHeight + lipHeight / 2,
  ]);
  slotAtOrigin.delete();
  return unionSolids(kernel, [notch, slot]);
}

/**
 * Builds the bin as one solid and returns it. The caller owns the solid and
 * deletes it. `generatePartsBin` is the product entry point; a test uses this
 * function directly when it needs two solids, for example to prove that two
 * bins stack without a collision.
 *
 * Order: the rounded shell, plus the lip and the label ledge in one union,
 * minus the underside recess and the front scoop in one union. Coordinates
 * are millimeters, X and Y centered on the origin, the underside at Z = 0.
 */
export function buildPartsBinSolid(
  kernel: ManifoldToplevel,
  parameters: PartsBinParameters,
): Solid {
  const layout = deriveLayout(parameters);
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];

  const { outer, shell } = roundedShell(kernel, {
    width: layout.bodyWidth,
    depth: layout.bodyDepth,
    height: layout.bodyHeight,
    cornerRadius: parameters.cornerRadius,
    wallThickness: parameters.wallThickness,
    baseThickness: parameters.baseThickness,
    segments,
  });
  outer.delete();

  const additions: Solid[] = [shell];
  if (layout.lip) {
    additions.push(ringPrism(kernel, layout.lip, segments, BOOLEAN_OVERLAP, 0));
  }
  if (parameters.labelLedge) {
    additions.push(labelLedge(kernel, layout));
  }
  let solid = unionSolids(kernel, additions);

  const cutters: Solid[] = [];
  if (layout.recess) {
    cutters.push(ringPrism(kernel, layout.recess, segments, BOOLEAN_OVERLAP, 0));
  }
  if (parameters.frontScoop) {
    cutters.push(scoopCutter(kernel, parameters, layout, segments));
  }
  if (cutters.length > 0) {
    const cutter = unionSolids(kernel, cutters);
    const cut = solid.subtract(cutter);
    cutter.delete();
    solid.delete();
    solid = cut;
  }
  return solid;
}

export async function generatePartsBin(
  parameters: PartsBinParameters,
): Promise<GeneratedModel<PartsBinParameters>> {
  const validation = validatePartsBin(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  const kernel = await getKernel();
  return finishSolid(buildPartsBinSolid(kernel, parameters), parameters, "bin");
}
