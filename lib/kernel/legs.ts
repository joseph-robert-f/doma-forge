import type { ManifoldToplevel } from "manifold-3d";
import { unionSolids } from "./arrays";
import type { Solid } from "./manifold";
import { roundedRectangle } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";

/**
 * Leg post builders. The rules and the post plan live in `leg-plan.ts`,
 * which a product schema imports; this module builds the solids.
 */

export interface LegPostOptions {
  /** The post centers, from `planLegPosts`. */
  centers: ReadonlyArray<readonly [number, number]>;
  /** The side of the square post. */
  section: number;
  /** The corner radius of the post section. */
  cornerRadius: number;
  /** The clear height under the deck. The post stands from Z = 0 to here. */
  height: number;
  /**
   * The gusset leg. The post flares out by this much on every side over the
   * top `gusset` millimeters, so the flare face is at 45 degrees.
   */
  gusset: number;
  segments: number;
}

/**
 * One post at the origin: a rounded square from Z = 0 up, and a hull gusset
 * between the post section and the wider deck pad at the top. The post
 * overshoots the deck underside by the Boolean overlap, so the union with
 * the deck has no coplanar faces. The caller owns the solid.
 */
export function legPost(
  kernel: ManifoldToplevel,
  options: LegPostOptions,
): Solid {
  const { section, cornerRadius, height, gusset, segments } = options;
  if (
    ![section, cornerRadius, height, gusset].every((value) =>
      Number.isFinite(value),
    ) ||
    section <= 0 ||
    height <= 0 ||
    gusset < 0
  ) {
    throw new Error("legPost needs a finite, positive section and height.");
  }
  const top = height + BOOLEAN_OVERLAP;
  const profile = roundedRectangle(
    kernel,
    section,
    section,
    cornerRadius,
    segments,
  );
  const shaft = profile.extrude(top);
  if (gusset <= 0) {
    profile.delete();
    return shaft;
  }
  // The gusset is the convex hull of the post section low down and the wider
  // pad at the deck. Hull, not a scaled extrusion, so the flare keeps the
  // rounded section at both ends.
  const plate = 0.01;
  const lowAtOrigin = profile.extrude(plate);
  const low = lowAtOrigin.translate([0, 0, Math.max(0, height - gusset)]);
  lowAtOrigin.delete();
  profile.delete();
  const padProfile = roundedRectangle(
    kernel,
    section + gusset * 2,
    section + gusset * 2,
    cornerRadius + gusset,
    segments,
  );
  const padAtOrigin = padProfile.extrude(plate);
  padProfile.delete();
  const pad = padAtOrigin.translate([0, 0, top - plate]);
  padAtOrigin.delete();
  const flare = kernel.Manifold.hull([low, pad]);
  low.delete();
  pad.delete();
  return unionSolids(kernel, [shaft, flare]);
}

/**
 * The four posts of a plan, with their gussets, unioned into one solid. The
 * result is four separate bodies until the caller unions it with the deck.
 */
export function legPosts(
  kernel: ManifoldToplevel,
  options: LegPostOptions,
): Solid {
  if (options.centers.length === 0) {
    throw new Error("legPosts needs at least one post center.");
  }
  const template = legPost(kernel, options);
  const placed = options.centers.map(([x, y]) => template.translate([x, y, 0]));
  template.delete();
  return unionSolids(kernel, placed);
}
