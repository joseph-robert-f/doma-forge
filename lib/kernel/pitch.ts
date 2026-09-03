/**
 * The pitch solver: pure arithmetic that lays cutters along a span and
 * reports the web it leaves. A product schema may import this module; it
 * never touches the kernel. The cutter builders live in `arrays.ts`.
 * See 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1701.
 */

const PITCH_EPSILON = 1e-6;

export interface PitchRequest {
  /** The usable length the cutters must fit inside, in millimeters. */
  span: number;
  /** How many cutters sit along the span. A whole number, at least 1. */
  count: number;
  /** The cutter's size along the span, in millimeters. */
  cutterSize: number;
  /** The smallest material the layout may leave between and around cutters. */
  minimumWeb: number;
}

export type PitchResult =
  | {
      ok: true;
      /** Center-to-center distance between cutters. */
      pitch: number;
      /** Material between two cutters and between a cutter and the span end. */
      web: number;
      /** Center of the first cutter, measured from the span's center. */
      firstCenter: number;
    }
  | {
      ok: false;
      /** The web the layout would leave; negative when the cutters overlap. */
      web: number;
      minimumWeb: number;
    };

/**
 * Lays `count` cutters of `cutterSize` evenly along `span`, with the same web
 * between neighbours as at each end. Rejects the layout when that web is
 * under `minimumWeb`. The caller turns a rejection into a message that names
 * its own field; the solver knows nothing about products.
 */
export function solvePitch(request: PitchRequest): PitchResult {
  const { span, count, cutterSize, minimumWeb } = request;
  if (
    !Number.isFinite(span) ||
    !Number.isFinite(cutterSize) ||
    !Number.isInteger(count) ||
    count < 1 ||
    cutterSize <= 0
  ) {
    throw new Error(
      "solvePitch needs a finite span, a positive cutter size, and a whole count of at least 1.",
    );
  }
  const web = (span - count * cutterSize) / (count + 1);
  if (web + PITCH_EPSILON < minimumWeb) {
    return { ok: false, web, minimumWeb };
  }
  return {
    ok: true,
    pitch: cutterSize + web,
    web,
    firstCenter: -span / 2 + web + cutterSize / 2,
  };
}
