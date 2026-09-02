import { dividerArrayAtPositions, unionSolids } from "../../kernel/arrays";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { BOOLEAN_OVERLAP, roundedShell } from "../../kernel/shell";
import {
  QUALITY_SEGMENTS,
  deriveLayout,
  type RemoteCaddyParameters,
} from "./schema";
import { validateRemoteCaddy } from "./validate";

/**
 * Builds the caddy as one solid: the rounded shell, plus one divider per
 * well boundary clipped to the outer profile, minus the cut that lowers the
 * front wall. Coordinates are millimeters, X and Y centered on the origin,
 * base at Z = 0. Well 1 is on the left (negative X).
 */
export async function generateRemoteCaddy(
  parameters: RemoteCaddyParameters,
): Promise<GeneratedModel<RemoteCaddyParameters>> {
  const validation = validateRemoteCaddy(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  if (!layout.fits) throw new Error("The wells do not fit the caddy width.");
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];

  // The cavity floor sits at the well floor, so the material under a well is
  // the caddy height minus the well depth, never less than the base.
  const { outer, shell } = roundedShell(kernel, {
    width: parameters.caddyWidth,
    depth: parameters.caddyDepth,
    height: parameters.caddyHeight,
    cornerRadius: parameters.cornerRadius,
    wallThickness: parameters.wallThickness,
    baseThickness: layout.floorZ,
    segments,
  });

  const dividers = dividerArrayAtPositions(kernel, outer, {
    positions: layout.dividerPositions,
    thickness: parameters.dividerThickness,
    length: parameters.caddyDepth + BOOLEAN_OVERLAP * 2,
    height: parameters.wellDepth + BOOLEAN_OVERLAP * 2,
    centerZ: layout.floorZ + parameters.wellDepth / 2,
  });
  outer.delete();

  let solid: Solid = dividers ? unionSolids(kernel, [shell, dividers]) : shell;

  if (parameters.frontWallHeight < parameters.caddyHeight - 1e-9) {
    const cutHeight =
      parameters.caddyHeight - parameters.frontWallHeight + BOOLEAN_OVERLAP;
    const cutDepth = parameters.wallThickness + BOOLEAN_OVERLAP;
    const cutterAtOrigin = kernel.Manifold.cube(
      [parameters.caddyWidth + BOOLEAN_OVERLAP * 2, cutDepth, cutHeight],
      true,
    );
    const cutter = cutterAtOrigin.translate([
      0,
      -parameters.caddyDepth / 2 + (parameters.wallThickness - BOOLEAN_OVERLAP) / 2,
      parameters.frontWallHeight + cutHeight / 2,
    ]);
    cutterAtOrigin.delete();
    const lowered = solid.subtract(cutter);
    cutter.delete();
    solid.delete();
    solid = lowered;
  }

  return finishSolid(solid, parameters, "caddy");
}
