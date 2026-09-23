import { ResourceScope } from "../../kernel/ownership";
import { unionSolids } from "../../kernel/arrays";
import { hullGusset, jHook, screwCutters } from "../../kernel/brackets";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP } from "../../kernel/shell";
import { applySurfacePatterns } from "../../kernel/surface-pattern";
import { surfaceZones } from "./surface-zones";
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
  const scope = new ResourceScope();
  try {
    const kernel = await getKernel();
    const layout = deriveLayout(parameters);
    if (!layout.screws.ok || !layout.hooks?.ok) {
      throw new Error("The hooks or the screws do not fit the rail.");
    }
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const T = parameters.plateThickness;
    const L = parameters.railLength;
    const H = parameters.railHeight;
    const zones = surfaceZones(parameters, layout);
    if (
      !parameters.keyShelf && parameters.surfaceTreatments.enabled &&
      parameters.surfaceTreatments.zones.shelf.mode !== "solid"
    ) {
      throw new Error("Enable the key shelf before adding a shelf pattern.");
    }

    // The plate outline in the X-Z plane, extruded along Y. The same outline,
    // extruded deep, clips every front feature so the shelf and the gussets
    // follow the rounded plate corners.
    const outline = scope.own(roundedRectangle(
      kernel,
      L,
      H,
      parameters.cornerRadius,
      segments,
    ));
    const plateFlat = scope.own(outline.extrude(T));
    const plateTurned = scope.own(plateFlat.rotate([90, 0, 0]));
    scope.delete(plateFlat);
    let plate = scope.own(plateTurned.translate([0, T, H / 2]));
    scope.delete(plateTurned);
    plate = applySurfacePatterns(kernel, scope, plate, {
      enabled: parameters.surfaceTreatments.enabled,
      zones: { plate: parameters.surfaceTreatments.zones.plate },
    }, zones.filter((zone) => zone.id === "plate"));
    const clipDepth = layout.outsideDepth + BOOLEAN_OVERLAP * 2;
    const clipFlat = scope.own(outline.extrude(clipDepth));
    scope.delete(outline);
    const clipTurned = scope.own(clipFlat.rotate([90, 0, 0]));
    scope.delete(clipFlat);
    const clip = scope.own(clipTurned.translate([0, clipDepth - BOOLEAN_OVERLAP, H / 2]));
    scope.delete(clipTurned);

    const front: Solid[] = [];
    const hookTemplate = scope.own(jHook(kernel, {
      width: parameters.hookWidth,
      root: parameters.hookRoot,
      projection: parameters.hookProjection,
      lipHeight: parameters.hookLip,
      lipThickness: LIP_THICKNESS_MM,
      fillet: HOOK_FILLET_MM,
      overlap: BOOLEAN_OVERLAP,
      segments: Math.max(2, Math.round(segments / 4)),
    }));
    for (const x of layout.hookCenters) {
      front.push(scope.own(hookTemplate.translate([x, T, layout.armZ])));
    }
    scope.delete(hookTemplate);

    if (parameters.keyShelf) {
      const shelfAtOrigin = scope.own(kernel.Manifold.cube(
        [L, parameters.shelfDepth + BOOLEAN_OVERLAP, layout.shelfThickness],
        true,
      ));
      let shelf = scope.own(shelfAtOrigin.translate([
          0,
          T + (parameters.shelfDepth - BOOLEAN_OVERLAP) / 2,
          layout.shelfUnderside + layout.shelfThickness / 2,
        ]));
      scope.delete(shelfAtOrigin);
      shelf = applySurfacePatterns(kernel, scope, shelf, {
        enabled: parameters.surfaceTreatments.enabled,
        zones: { shelf: parameters.surfaceTreatments.zones.shelf },
      }, zones.filter((zone) => zone.id === "shelf"));
      front.push(shelf);
      const gussetTemplate = scope.own(hullGusset(kernel, {
        thickness: T,
        rise: layout.gussetRise,
        run: layout.gussetRun,
        overlap: BOOLEAN_OVERLAP,
      }));
      for (const x of layout.gussetCenters) {
        front.push(scope.own(gussetTemplate.translate([x, T, layout.shelfUnderside])));
      }
      scope.delete(gussetTemplate);
    }

    const features = scope.own(unionSolids(kernel, scope.takeAll(front)));
    const clipped = scope.own(features.intersect(clip));
    scope.delete(features);
    scope.delete(clip);
    const body = scope.own(unionSolids(kernel, scope.takeAll([plate, clipped])));

    const screws = scope.own(screwCutters(
      kernel,
      layout.screws.positions.map((x) => [x, layout.screwZ] as const),
      {
        diameter: parameters.screwDiameter,
        headDiameter: layout.headDiameter,
        plateThickness: T,
        segments,
      },
    ));
    const assembled = scope.own(body.subtract(screws));
    scope.delete(body);
    scope.delete(screws);
    // Face the viewer: the hooks go toward -Y. The hook row, the screw row,
    // and the gussets are symmetric about X = 0, so the turn changes no
    // position the layout reports.
    const solid = scope.own(assembled.rotate([0, 0, 180]));
    scope.delete(assembled);
    return finishSolid(scope.take(solid), parameters, "rail");
  } finally {
    scope.dispose();
  }
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
  return buildWallHookRail({
    ...couponParameters(parameters),
    surfaceTreatments: { ...parameters.surfaceTreatments, enabled: false },
  });
}
