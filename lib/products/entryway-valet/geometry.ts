import { dividerArrayAtPositions, unionSolids } from "../../kernel/arrays";
import { extrudeAlongX } from "../../kernel/brackets";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { polygon, roundedRectangle } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP, roundedShell } from "../../kernel/shell";
import {
  QUALITY_SEGMENTS,
  SLOT_LIP_HEIGHT_MM,
  SLOT_LIP_THICKNESS_MM,
  deriveLayout,
  type EntrywayValetParameters,
} from "./schema";
import { validateEntrywayValet } from "./validate";

/**
 * Builds the valet as one solid: the rounded shell, the well dividers in
 * the front zone, the divider between the wells and the rest zone, the slot
 * lip, and the angled rest wedge, every one clipped to the outer profile.
 * Coordinates are millimeters, X and Y centered on the origin, base at
 * Z = 0. Well 1 is on the left and the rest is at the back. The modeled
 * pose is the print pose.
 */
export async function generateEntrywayValet(
  parameters: EntrywayValetParameters,
): Promise<GeneratedModel<EntrywayValetParameters>> {
  const validation = validateEntrywayValet(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  if (!layout.wellsFit) throw new Error("The wells do not fit the valet width.");
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];
  const { valetWidth, valetDepth, valetHeight, baseThickness, dividerThickness } = parameters;

  const { outer, shell } = roundedShell(kernel, {
    width: valetWidth,
    depth: valetDepth,
    height: valetHeight,
    cornerRadius: parameters.cornerRadius,
    wallThickness: parameters.wallThickness,
    baseThickness,
    segments,
  });
  const parts: Solid[] = [shell];
  const wallHeight = valetHeight - baseThickness;
  const wallCenterZ = baseThickness + wallHeight / 2;

  // Well dividers stop at the back divider, so the clip for them is the
  // outer body cut off at the rest zone.
  const wellZoneAtOrigin = kernel.Manifold.cube(
    [
      valetWidth + BOOLEAN_OVERLAP * 2,
      layout.backDividerY + valetDepth / 2 + BOOLEAN_OVERLAP,
      valetHeight + BOOLEAN_OVERLAP * 2,
    ],
    true,
  );
  const wellZone = wellZoneAtOrigin.translate([
    0,
    (layout.backDividerY - valetDepth / 2 - BOOLEAN_OVERLAP) / 2,
    valetHeight / 2,
  ]);
  wellZoneAtOrigin.delete();
  const wellClip = outer.intersect(wellZone);
  wellZone.delete();
  const wellDividers = dividerArrayAtPositions(kernel, wellClip, {
    positions: layout.dividerPositions,
    thickness: dividerThickness,
    length: valetDepth + BOOLEAN_OVERLAP * 2,
    height: wallHeight + BOOLEAN_OVERLAP * 2,
    centerZ: wallCenterZ,
    axis: "x",
  });
  wellClip.delete();
  if (wellDividers) parts.push(wellDividers);

  const backDivider = dividerArrayAtPositions(kernel, outer, {
    positions: [layout.backDividerY],
    thickness: dividerThickness,
    length: valetWidth + BOOLEAN_OVERLAP * 2,
    height: wallHeight + BOOLEAN_OVERLAP * 2,
    centerZ: wallCenterZ,
    axis: "y",
  });
  if (backDivider) parts.push(backDivider);

  const lip = dividerArrayAtPositions(kernel, outer, {
    positions: [layout.lipY],
    thickness: SLOT_LIP_THICKNESS_MM,
    length: valetWidth + BOOLEAN_OVERLAP * 2,
    height: SLOT_LIP_HEIGHT_MM + BOOLEAN_OVERLAP * 2,
    centerZ: baseThickness + SLOT_LIP_HEIGHT_MM / 2,
    axis: "y",
  });
  if (lip) parts.push(lip);
  outer.delete();

  // The rest wedge: its face passes through the wedge foot at the base top
  // and leans back by the rest angle. It reaches into the back wall and
  // below the base top, and the outer profile extruded to the rest height
  // clips it to the shell.
  const lean = Math.tan((parameters.restAngle * Math.PI) / 180);
  const footY = layout.wedgeFootY;
  const profile = polygon(kernel, [
    [footY - (baseThickness + BOOLEAN_OVERLAP) * lean, -BOOLEAN_OVERLAP],
    [valetDepth / 2 + BOOLEAN_OVERLAP, -BOOLEAN_OVERLAP],
    [valetDepth / 2 + BOOLEAN_OVERLAP, parameters.restHeight],
    [footY + (parameters.restHeight - baseThickness) * lean, parameters.restHeight],
  ]);
  const wedgeFull = extrudeAlongX(kernel, profile, valetWidth + BOOLEAN_OVERLAP * 2);
  profile.delete();
  const restOutline = roundedRectangle(kernel, valetWidth, valetDepth, parameters.cornerRadius, segments);
  const restClip = restOutline.extrude(parameters.restHeight);
  restOutline.delete();
  const wedge = wedgeFull.intersect(restClip);
  wedgeFull.delete();
  restClip.delete();
  parts.push(wedge);

  return finishSolid(unionSolids(kernel, parts), parameters, "valet");
}
