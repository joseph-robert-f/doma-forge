import { ResourceScope } from "./ownership";
import type { ManifoldToplevel } from "manifold-3d";
import { cutterArray } from "./arrays";
import type { Solid } from "./manifold";
import { roundedRectangle } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";
import {
  planLightening,
  type LighteningOptions,
  type LighteningPlan,
} from "./lightening-plan";

/**
 * Subtracts a grid of underside pockets from `slab`, leaving a base above
 * the pockets and a rim around them. The pocket grid is clipped to the
 * inner rounded profile (the outer profile inset by the rim), so a corner
 * pocket follows a large outer corner radius instead of cutting through
 * it. Consumes the slab, including on failure. The slab is deleted when a
 * pocket is cut; ownership is returned untouched when the plan is null.
 */
export function lightenUnderside(
  kernel: ManifoldToplevel,
  slab: Solid,
  options: LighteningOptions,
): { solid: Solid; plan: LighteningPlan | null } {
  const scope = new ResourceScope();
  try {
    scope.own(slab);
    const plan = planLightening(options);
    if (!plan) return { solid: scope.take(slab), plan: null };

    const innerWidth = options.width - options.rim * 2;
    const innerDepth = options.depth - options.rim * 2;
    const pockets = scope.own(cutterArray(
      kernel,
      () => {
        const profile = scope.own(roundedRectangle(
          kernel,
          plan.spanX,
          plan.spanY,
          options.pocketRadius,
          options.segments,
        ));
        const pocketAtOrigin = scope.own(profile.extrude(
          plan.pocketDepth + BOOLEAN_OVERLAP,
        ));
        scope.delete(profile);
        const pocket = scope.own(pocketAtOrigin.translate([0, 0, -BOOLEAN_OVERLAP]));
        scope.delete(pocketAtOrigin);
        return scope.take(pocket);
      },
      {
        pitchX: plan.spanX + options.web,
        pitchY: plan.spanY + options.web,
        countX: plan.countX,
        countY: plan.countY,
        origin: [
          -innerWidth / 2 + plan.spanX / 2,
          -innerDepth / 2 + plan.spanY / 2,
          0,
        ],
      },
    ));
    const clipProfile = scope.own(roundedRectangle(
      kernel,
      innerWidth,
      innerDepth,
      Math.max(0, options.cornerRadius - options.rim),
      options.segments,
    ));
    const clipAtOrigin = scope.own(clipProfile.extrude(
      plan.pocketDepth + BOOLEAN_OVERLAP * 2,
    ));
    scope.delete(clipProfile);
    const clip = scope.own(clipAtOrigin.translate([0, 0, -BOOLEAN_OVERLAP]));
    scope.delete(clipAtOrigin);
    const clippedPockets = scope.own(pockets.intersect(clip));
    scope.delete(pockets);
    scope.delete(clip);
    const solid = scope.own(slab.subtract(clippedPockets));
    scope.delete(clippedPockets);
    scope.delete(slab);
    return { solid: scope.take(solid), plan };
  } finally {
    scope.dispose();
  }
}
