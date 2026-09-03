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
 * it. The slab is deleted when a pocket is cut; it is returned untouched
 * when `planLightening` returns null.
 */
export function lightenUnderside(
  kernel: ManifoldToplevel,
  slab: Solid,
  options: LighteningOptions,
): { solid: Solid; plan: LighteningPlan | null } {
  const plan = planLightening(options);
  if (!plan) return { solid: slab, plan: null };

  const innerWidth = options.width - options.rim * 2;
  const innerDepth = options.depth - options.rim * 2;
  const pockets = cutterArray(
    kernel,
    () => {
      const profile = roundedRectangle(
        kernel,
        plan.spanX,
        plan.spanY,
        options.pocketRadius,
        options.segments,
      );
      const pocketAtOrigin = profile.extrude(
        plan.pocketDepth + BOOLEAN_OVERLAP,
      );
      profile.delete();
      const pocket = pocketAtOrigin.translate([0, 0, -BOOLEAN_OVERLAP]);
      pocketAtOrigin.delete();
      return pocket;
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
  );
  const clipProfile = roundedRectangle(
    kernel,
    innerWidth,
    innerDepth,
    Math.max(0, options.cornerRadius - options.rim),
    options.segments,
  );
  const clipAtOrigin = clipProfile.extrude(
    plan.pocketDepth + BOOLEAN_OVERLAP * 2,
  );
  clipProfile.delete();
  const clip = clipAtOrigin.translate([0, 0, -BOOLEAN_OVERLAP]);
  clipAtOrigin.delete();
  const clippedPockets = pockets.intersect(clip);
  pockets.delete();
  clip.delete();
  const solid = slab.subtract(clippedPockets);
  clippedPockets.delete();
  slab.delete();
  return { solid, plan };
}
