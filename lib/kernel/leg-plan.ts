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
  const refuse = (
    reason: "value" | "section" | "slenderness" | "gap",
  ): LegPlan => ({
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
  if (slenderness > LEG_MAXIMUM_SLENDERNESS + 1e-9)
    return refuse("slenderness");
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
