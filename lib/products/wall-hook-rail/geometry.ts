import { unionSolids } from "../../kernel/arrays";
import { hullGusset, jHook, screwCutters } from "../../kernel/brackets";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP } from "../../kernel/shell";
import {
  HOOK_FILLET_MM,
  LIP_THICKNESS_MM,
  QUALITY_SEGMENTS,
  couponParameters,
  deriveLayout,
  type WallHookRailParameters,
} from "./schema";
import { validateWallHookRail } from "./validate";

/**
 * Builds the rail as one solid: the plate against the wall, the hooks along
 * its bottom, the optional shelf on its gussets along its top, minus the
 * screw bores. The rail is assembled with the wall at Y = 0 and the hooks
 * toward +Y, then turned 180 degrees about Z, so the finished part has the
 * plate in Y from minus its thickness to 0 and the hooks toward -Y, the
 * side the viewer faces. X is centered on the rail, Z is up from the rail
 * bottom. The part prints turned -90 degrees about X, plate on the bed and
 * hooks up, which is what `printOrientation` says.
 */
export async function generateWallHookRail(
  parameters: WallHookRailParameters,
): Promise<GeneratedModel<WallHookRailParameters>> {
  const validation = validateWallHookRail(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  return buildWallHookRail(parameters);
}

/**
 * Builds without validating. The coupon uses this with a plate shorter than
 * the spec range allows, after the rail's own parameters have validated.
 */
export async function buildWallHookRail(
  parameters: WallHookRailParameters,
): Promise<GeneratedModel<WallHookRailParameters>> {
  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  if (!layout.screws.ok || !layout.hooks?.ok) {
    throw new Error("The hooks or the screws do not fit the rail.");
  }
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];
  const T = parameters.plateThickness;
  const L = parameters.railLength;
  const H = parameters.railHeight;

  // The plate outline in the X-Z plane, extruded along Y. The same outline,
  // extruded deep, clips every front feature so the shelf and the gussets
  // follow the rounded plate corners.
  const outline = roundedRectangle(
    kernel,
    L,
    H,
    parameters.cornerRadius,
    segments,
  );
  const plateFlat = outline.extrude(T);
  const plateTurned = plateFlat.rotate([90, 0, 0]);
  plateFlat.delete();
  const plate = plateTurned.translate([0, T, H / 2]);
  plateTurned.delete();
  const clipDepth = layout.outsideDepth + BOOLEAN_OVERLAP * 2;
  const clipFlat = outline.extrude(clipDepth);
  outline.delete();
  const clipTurned = clipFlat.rotate([90, 0, 0]);
  clipFlat.delete();
  const clip = clipTurned.translate([0, clipDepth - BOOLEAN_OVERLAP, H / 2]);
  clipTurned.delete();

  const front: Solid[] = [];
  const hookTemplate = jHook(kernel, {
    width: parameters.hookWidth,
    root: parameters.hookRoot,
    projection: parameters.hookProjection,
    lipHeight: parameters.hookLip,
    lipThickness: LIP_THICKNESS_MM,
    fillet: HOOK_FILLET_MM,
    overlap: BOOLEAN_OVERLAP,
    segments: Math.max(2, Math.round(segments / 4)),
  });
  for (const x of layout.hookCenters) {
    front.push(hookTemplate.translate([x, T, layout.armZ]));
  }
  hookTemplate.delete();

  if (parameters.keyShelf) {
    const shelfAtOrigin = kernel.Manifold.cube(
      [L, parameters.shelfDepth + BOOLEAN_OVERLAP, layout.shelfThickness],
      true,
    );
    front.push(
      shelfAtOrigin.translate([
        0,
        T + (parameters.shelfDepth - BOOLEAN_OVERLAP) / 2,
        layout.shelfUnderside + layout.shelfThickness / 2,
      ]),
    );
    shelfAtOrigin.delete();
    const gussetTemplate = hullGusset(kernel, {
      thickness: T,
      rise: layout.gussetRise,
      run: layout.gussetRun,
      overlap: BOOLEAN_OVERLAP,
    });
    for (const x of layout.gussetCenters) {
      front.push(gussetTemplate.translate([x, T, layout.shelfUnderside]));
    }
    gussetTemplate.delete();
  }

  const features = unionSolids(kernel, front);
  const clipped = features.intersect(clip);
  features.delete();
  clip.delete();
  const body = unionSolids(kernel, [plate, clipped]);

  const screws = screwCutters(
    kernel,
    layout.screws.positions.map((x) => [x, layout.screwZ] as const),
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
  // Face the viewer: the hooks go toward -Y. The hook row, the screw row,
  // and the gussets are symmetric about X = 0, so the turn changes no
  // position the layout reports.
  const solid = assembled.rotate([0, 0, 180]);
  assembled.delete();
  return finishSolid(solid, parameters, "rail");
}

/**
 * The fit-test coupon: the single hook on a short plate that
 * `couponParameters` describes, at the rail's own root, projection, lip,
 * and plate thickness. The rail's parameters are validated first, because
 * the coupon exists to test them.
 */
export async function generateWallHookRailCoupon(
  parameters: WallHookRailParameters,
): Promise<GeneratedModel<WallHookRailParameters>> {
  const validation = validateWallHookRail(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  return buildWallHookRail(couponParameters(parameters));
}
