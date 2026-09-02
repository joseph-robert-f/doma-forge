import type { ManifoldToplevel } from "manifold-3d";
import { unionSolids } from "./arrays";
import type { Solid } from "./manifold";
import { roundedRectangle } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";

/**
 * Leg posts under a deck. Four rounded-square posts stand inside the corners
 * of the deck, and each post flares into the deck underside with a hull
 * gusset. The rules come from 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 2.6:
 * a leg buckles when it is too slender, so the leg height over the leg
 * section is at most 12 and the section is at least 8 mm.
 */

/** The largest leg height for one millimeter of leg section. */
export const LEG_MAXIMUM_SLENDERNESS = 12;
/** The smallest square section a leg may have. */
export const LEG_MINIMUM_SECTION_MM = 8;
/** The smallest gap the plan leaves between two opposite posts. */
export const LEG_MINIMUM_GAP_MM = 10;

export interface LegPlanRequest {
  /** The deck the legs stand under, at its outside size. */
  deckWidth: number;
  deckDepth: number;
  /** The side of the square post. */
  section: number;
  /** The clear height under the deck: the floor to the deck underside. */
  height: number;
  /** The distance from the deck edge to the outside face of a post. */
  inset: number;
}

export type LegPlan =
  | {
      ok: true;
      /** The four post centers, front left first, then clockwise. */
      centers: Array<[number, number]>;
      /** Height over section. At most LEG_MAXIMUM_SLENDERNESS. */
      slenderness: number;
      /** The gap between two opposite posts, on the shorter axis. */
      gap: number;
    }
  | {
      ok: false;
      /** Which rule refused the plan. The product writes the message. */
      reason: "value" | "section" | "slenderness" | "gap";
      /** Height over section. NaN when a value is not a number. */
      slenderness: number;
      /** The tallest leg this section carries. */
      maximumHeight: number;
      /** The smallest section this height needs. */
      minimumSection: number;
      /** The gap between two opposite posts. Negative when they overlap. */
      gap: number;
    };

/**
 * Solves the four post centers and checks the leg rules. Pure, and it never
 * throws: a cleared field holds NaN, and the plan then reports `ok: false`
 * with reason "value". The product turns a refusal into a message that names
 * its own field.
 */
export function planLegPosts(request: LegPlanRequest): LegPlan {
  const { deckWidth, deckDepth, section, height, inset } = request;
  const slenderness = height / section;
  const maximumHeight = section * LEG_MAXIMUM_SLENDERNESS;
  const minimumSection = Math.max(
    LEG_MINIMUM_SECTION_MM,
    height / LEG_MAXIMUM_SLENDERNESS,
  );
  const gap = Math.min(deckWidth, deckDepth) - 2 * (inset + section);
  const refuse = (reason: "value" | "section" | "slenderness" | "gap"): LegPlan => ({
    ok: false,
    reason,
    slenderness,
    maximumHeight,
    minimumSection,
    gap,
  });
  if (
    ![deckWidth, deckDepth, section, height, inset].every((value) =>
      Number.isFinite(value),
    ) ||
    section <= 0 ||
    height <= 0 ||
    inset < 0
  ) {
    return refuse("value");
  }
  if (section < LEG_MINIMUM_SECTION_MM) return refuse("section");
  if (slenderness > LEG_MAXIMUM_SLENDERNESS + 1e-9) return refuse("slenderness");
  if (gap < LEG_MINIMUM_GAP_MM) return refuse("gap");
  const x = deckWidth / 2 - inset - section / 2;
  const y = deckDepth / 2 - inset - section / 2;
  return {
    ok: true,
    centers: [
      [-x, -y],
      [x, -y],
      [x, y],
      [-x, y],
    ],
    slenderness,
    gap,
  };
}

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
export function legPost(kernel: ManifoldToplevel, options: LegPostOptions): Solid {
  const { section, cornerRadius, height, gusset, segments } = options;
  if (
    ![section, cornerRadius, height, gusset].every((value) => Number.isFinite(value)) ||
    section <= 0 ||
    height <= 0 ||
    gusset < 0
  ) {
    throw new Error("legPost needs a finite, positive section and height.");
  }
  const top = height + BOOLEAN_OVERLAP;
  const profile = roundedRectangle(kernel, section, section, cornerRadius, segments);
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
export function legPosts(kernel: ManifoldToplevel, options: LegPostOptions): Solid {
  if (options.centers.length === 0) {
    throw new Error("legPosts needs at least one post center.");
  }
  const template = legPost(kernel, options);
  const placed = options.centers.map(([x, y]) => template.translate([x, y, 0]));
  template.delete();
  return unionSolids(kernel, placed);
}
