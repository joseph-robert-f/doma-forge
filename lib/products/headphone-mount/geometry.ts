import { unionSolids } from "../../kernel/arrays";
import { jHook, screwCutters } from "../../kernel/brackets";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP } from "../../kernel/shell";
import {
  HOOK_FILLET_MM,
  LIP_THICKNESS_MM,
  POCKET_WALL_MM,
  QUALITY_SEGMENTS,
  deriveLayout,
  type HeadphoneMountParameters,
} from "./schema";
import { validateHeadphoneMount } from "./validate";

/**
 * Builds the mount as one solid: the plate against the wall, the wide hook
 * low on it, the optional pocket above the hook, minus two screw bores on
 * the center line. The pocket is a very wide J-hook, its floor the arm and
 * its lip the same 45 degree ramp, with a side wall at each end. The mount
 * is assembled with the wall at Y = 0 and the hook toward +Y, then turned
 * 180 degrees about Z, so the finished part has the plate in Y from minus
 * its thickness to 0 and the hook toward -Y, the side the viewer faces. X
 * is centered, Z is up from the plate bottom. The part prints turned -90
 * degrees about X, plate on the bed and hook up.
 */
export async function generateHeadphoneMount(
  parameters: HeadphoneMountParameters,
): Promise<GeneratedModel<HeadphoneMountParameters>> {
  const validation = validateHeadphoneMount(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];
  const filletSegments = Math.max(2, Math.round(segments / 4));
  const T = parameters.plateThickness;
  const W = parameters.plateWidth;
  const H = parameters.plateHeight;

  const outline = roundedRectangle(kernel, W, H, parameters.cornerRadius, segments);
  const plateFlat = outline.extrude(T);
  outline.delete();
  const plateTurned = plateFlat.rotate([90, 0, 0]);
  plateFlat.delete();
  const plate = plateTurned.translate([0, T, H / 2]);
  plateTurned.delete();

  const parts: Solid[] = [plate];
  const hook = jHook(kernel, {
    width: parameters.hookWidth,
    root: parameters.hookRoot,
    projection: parameters.hookProjection,
    lipHeight: parameters.hookLip,
    lipThickness: LIP_THICKNESS_MM,
    fillet: HOOK_FILLET_MM,
    overlap: BOOLEAN_OVERLAP,
    segments: filletSegments,
  });
  parts.push(hook.translate([0, T, layout.hookArmZ]));
  hook.delete();

  if (parameters.controllerPocket) {
    const floor = jHook(kernel, {
      width: parameters.pocketWidth,
      root: parameters.pocketFloor,
      projection: parameters.pocketDepth,
      lipHeight: parameters.pocketLip,
      lipThickness: LIP_THICKNESS_MM,
      fillet: HOOK_FILLET_MM,
      overlap: BOOLEAN_OVERLAP,
      segments: filletSegments,
    });
    parts.push(floor.translate([0, T, layout.pocketZ]));
    floor.delete();
    const wallHeight = layout.pocketTop - layout.pocketZ;
    const wallAtOrigin = kernel.Manifold.cube(
      [POCKET_WALL_MM, parameters.pocketDepth + BOOLEAN_OVERLAP, wallHeight],
      true,
    );
    const wallX = parameters.pocketWidth / 2 - POCKET_WALL_MM / 2;
    const wallY = T + (parameters.pocketDepth - BOOLEAN_OVERLAP) / 2;
    const wallZ = layout.pocketZ + wallHeight / 2;
    parts.push(wallAtOrigin.translate([-wallX, wallY, wallZ]));
    parts.push(wallAtOrigin.translate([wallX, wallY, wallZ]));
    wallAtOrigin.delete();
  }

  const body = unionSolids(kernel, parts);
  const screws = screwCutters(
    kernel,
    [
      [0, layout.lowerScrewZ],
      [0, layout.upperScrewZ],
    ],
    {
      diameter: parameters.screwDiameter,
      headDiameter: layout.headDiameter,
      plateThickness: T,
      segments,
    },
  );
  const assembled = body.subtract(screws);
  body.delete();
  screws.delete();
  // Face the viewer: the hook and the pocket go toward -Y. Everything on the
  // mount is centered on X = 0, so the turn changes no position.
  const solid = assembled.rotate([0, 0, 180]);
  assembled.delete();
  return finishSolid(solid, parameters, "mount");
}
