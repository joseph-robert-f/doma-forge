import { ResourceScope } from "../../kernel/ownership";
import { unionSolids } from "../../kernel/arrays";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { type ProfilePoint } from "../../kernel/vessel-profile";
import { revolveProfile, revolveShell } from "../../kernel/revolve";
import { BOOLEAN_OVERLAP } from "../../kernel/shell";
import {
  NOTCH_WIDTH_MM,
  QUALITY_SEGMENTS,
  RIB_WIDTH_MM,
  deriveSaucerLayout,
  type PlantSaucerParameters,
} from "./schema";
import { validatePlantSaucer } from "./validate";

/**
 * Builds the saucer as one solid: a revolved shell, plus the lift ribs
 * clipped to the cavity line, minus the optional overflow notch. Coordinates
 * are millimeters, the axis is Z, and the floor sits at Z = 0.
 */
export async function generatePlantSaucer(
  parameters: PlantSaucerParameters,
): Promise<GeneratedModel<PlantSaucerParameters>> {
  const scope = new ResourceScope();
  try {
    const validation = validatePlantSaucer(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }

    const kernel = await getKernel();
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const layout = deriveSaucerLayout(parameters, segments);
    const profile = layout.profile;
    if (!profile) throw new Error("These settings do not make a saucer.");

    const built = revolveShell(kernel, profile, segments);
    scope.own(built.outer);
    scope.own(built.cavity);
    scope.own(built.shell);
    scope.delete(built.outer);
    scope.delete(built.cavity);
    let solid = built.shell;

    const ribCount = Math.round(parameters.liftRibs);
    if (ribCount >= 1 && parameters.ribHeight > 0) {
      // The ribs stop on the cavity line, plus the hidden overlap, so each rib
      // ends buried in the wall instead of on top of it.
      const clipTopZ = layout.ribTopZ + BOOLEAN_OVERLAP;
      const clipPoints: ProfilePoint[] = [
        [0, 0],
        [profile.innerRadiusAtBase + BOOLEAN_OVERLAP, 0],
        [
          profile.innerRadiusAtBase +
          clipTopZ * profile.taperTangent +
          BOOLEAN_OVERLAP,
          clipTopZ,
        ],
        [0, clipTopZ],
      ];
      const clip = scope.own(revolveProfile(kernel, clipPoints, segments));
      const barLength = profile.maximumRadius * 2 + 4;
      const ribs: Solid[] = [];
      for (let index = 0; index < ribCount; index += 1) {
        const barAtOrigin = scope.own(kernel.Manifold.cube(
          [barLength, RIB_WIDTH_MM, layout.ribTopZ * 2],
          true,
        ));
        const turned = scope.own(barAtOrigin.rotate([0, 0, (index * 180) / ribCount]));
        scope.delete(barAtOrigin);
        const clipped = scope.own(turned.intersect(clip));
        scope.delete(turned);
        ribs.push(clipped);
      }
      scope.delete(clip);
      const ribSolid = scope.own(unionSolids(kernel, scope.takeAll(ribs)));
      const combined = scope.own(unionSolids(kernel, scope.takeAll([solid, ribSolid])));
      solid = combined;
    }

    if (layout.notchDepth > 0) {
      const cutterLength = profile.maximumRadius + 1;
      const cutterHeight =
        parameters.rimHeight - layout.notchFloorZ + BOOLEAN_OVERLAP;
      const cutterAtOrigin = scope.own(kernel.Manifold.cube(
        [cutterLength, NOTCH_WIDTH_MM, cutterHeight],
        true,
      ));
      const cutter = scope.own(cutterAtOrigin.translate([
        cutterLength / 2,
        0,
        layout.notchFloorZ + cutterHeight / 2,
      ]));
      scope.delete(cutterAtOrigin);
      const notched = scope.own(solid.subtract(cutter));
      scope.delete(cutter);
      scope.delete(solid);
      solid = notched;
    }

    return finishSolid(scope.take(solid), parameters, "saucer");
  } finally {
    scope.dispose();
  }
}
