/**
 * The lightening plan: how many underside pockets fit inside a rim. Pure;
 * a product schema may import this module. The pocket cutter lives in
 * `lightening.ts`. See 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1701.
 */

/** A pocket narrower than this is not worth the Boolean. */
export const MINIMUM_POCKET_SPAN = 8;
/** A pocket shallower than this saves nothing. */
export const MINIMUM_POCKET_DEPTH = 1;

export interface LighteningOptions {
  /** Outside width and depth of the slab, centered on the origin. */
  width: number;
  depth: number;
  /** Outer corner radius of the slab. The pockets are clipped inside it. */
  cornerRadius: number;
  /** Material left around the pockets, measured from the outside face. */
  rim: number;
  /** How far the pockets go up from Z = 0. */
  pocketDepth: number;
  /**
   * The longest bridge a pocket ceiling may span. A part prints with the
   * pockets on the bed, so each ceiling is a bridge; keep it short.
   */
  maximumSpan: number;
  /** Material between two pockets. */
  web: number;
  /** Corner radius of each pocket. Clamped to the pocket size. */
  pocketRadius: number;
  segments: number;
}

export interface LighteningPlan {
  countX: number;
  countY: number;
  spanX: number;
  spanY: number;
  pocketDepth: number;
}

/**
 * Chooses how many pockets fit inside the rim so that no pocket is wider
 * than `maximumSpan` on either axis. Returns null when the slab is too small
 * or the pocket too shallow to be worth cutting. Pure; no kernel needed.
 */
export function planLightening(
  options: LighteningOptions,
): LighteningPlan | null {
  const numbers = [
    options.width,
    options.depth,
    options.rim,
    options.pocketDepth,
    options.maximumSpan,
    options.web,
  ];
  if (!numbers.every((value) => Number.isFinite(value))) return null;
  const innerWidth = options.width - options.rim * 2;
  const innerDepth = options.depth - options.rim * 2;
  if (options.pocketDepth < MINIMUM_POCKET_DEPTH) return null;
  if (innerWidth < MINIMUM_POCKET_SPAN || innerDepth < MINIMUM_POCKET_SPAN) {
    return null;
  }
  const countFor = (inner: number) =>
    Math.max(
      1,
      Math.ceil((inner + options.web) / (options.maximumSpan + options.web)),
    );
  const countX = countFor(innerWidth);
  const countY = countFor(innerDepth);
  const spanX = (innerWidth - (countX - 1) * options.web) / countX;
  const spanY = (innerDepth - (countY - 1) * options.web) / countY;
  if (spanX < MINIMUM_POCKET_SPAN || spanY < MINIMUM_POCKET_SPAN) return null;
  return { countX, countY, spanX, spanY, pocketDepth: options.pocketDepth };
}
