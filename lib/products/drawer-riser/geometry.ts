import { dividerArrayAtPositions, unionSolids } from "../../kernel/arrays";
import { legPosts } from "../../kernel/legs";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { BOOLEAN_OVERLAP, roundedShell } from "../../kernel/shell";
import {
  LEG_CORNER_RADIUS_MM,
  QUALITY_SEGMENTS,
  deriveLayout,
  type DrawerRiserParameters,
} from "./schema";
import { validateDrawerRiser } from "./validate";

/**
 * Builds the riser as one solid: four leg posts with hull gussets, the deck
 * and tray walls above them, and the divider grid clipped to the outer
 * profile. Coordinates are millimeters, X and Y centered on the origin, the
 * foot of the legs at Z = 0. The part is modeled the way it stands in the
 * drawer; it prints upside down, which is what `printOrientation` says.
 */
export async function generateDrawerRiser(
  parameters: DrawerRiserParameters,
): Promise<GeneratedModel<DrawerRiserParameters>> {
  const validation = validateDrawerRiser(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  if (!layout.legs.ok) throw new Error("The legs do not fit under the deck.");
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];

  const deckHeight = parameters.baseThickness + parameters.trayHeight;
  const { outer: deckOuterAtOrigin, shell: shellAtOrigin } = roundedShell(kernel, {
    width: layout.outsideWidth,
    depth: layout.outsideDepth,
    height: deckHeight,
    cornerRadius: parameters.cornerRadius,
    wallThickness: parameters.wallThickness,
    baseThickness: parameters.baseThickness,
    segments,
  });
  const deckOuter = deckOuterAtOrigin.translate([0, 0, layout.deckZ]);
  deckOuterAtOrigin.delete();
  const shell = shellAtOrigin.translate([0, 0, layout.deckZ]);
  shellAtOrigin.delete();

  const parts: Solid[] = [shell];
  const dividerHeight = parameters.trayHeight + BOOLEAN_OVERLAP * 2;
  const dividerCenterZ =
    layout.deckZ + parameters.baseThickness + parameters.trayHeight / 2;
  const columns = dividerArrayAtPositions(kernel, deckOuter, {
    positions: layout.columnPositions,
    thickness: parameters.dividerThickness,
    length: layout.outsideDepth + BOOLEAN_OVERLAP * 2,
    height: dividerHeight,
    centerZ: dividerCenterZ,
    axis: "x",
  });
  if (columns) parts.push(columns);
  const rows = dividerArrayAtPositions(kernel, deckOuter, {
    positions: layout.rowPositions,
    thickness: parameters.dividerThickness,
    length: layout.outsideWidth + BOOLEAN_OVERLAP * 2,
    height: dividerHeight,
    centerZ: dividerCenterZ,
    axis: "y",
  });
  if (rows) parts.push(rows);
  deckOuter.delete();

  parts.push(
    legPosts(kernel, {
      centers: layout.legs.centers,
      section: parameters.legSection,
      cornerRadius: Math.min(LEG_CORNER_RADIUS_MM, parameters.legSection / 4),
      height: layout.deckZ,
      gusset: layout.legGusset,
      segments,
    }),
  );

  return finishSolid(unionSolids(kernel, parts), parameters, "riser");
}
