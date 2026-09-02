import type { ManifoldToplevel } from "manifold-3d";
import type { Solid } from "./manifold";
import { chamferedCircle } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";

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
    throw new Error("solvePitch needs a finite span, a positive cutter size, and a whole count of at least 1.");
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

export interface CutterArrayOptions {
  /** Center-to-center distance along X. Ignored when countX is 1. */
  pitchX: number;
  /** Center-to-center distance along Y. Ignored when countY is 1. */
  pitchY: number;
  countX: number;
  countY: number;
  /** Where the first cutter's local origin lands. */
  origin: [number, number, number];
}

/**
 * Builds one cutter with `factory`, places `countX` by `countY` translated
 * copies on the pitch grid, and unions them in one batch. The factory's
 * solid is deleted here. The returned solid belongs to the caller.
 */
export function cutterArray(
  kernel: ManifoldToplevel,
  factory: () => Solid,
  options: CutterArrayOptions,
): Solid {
  const { pitchX, pitchY, countX, countY, origin } = options;
  if (!Number.isInteger(countX) || !Number.isInteger(countY) || countX < 1 || countY < 1) {
    throw new Error("cutterArray needs whole counts of at least 1 on both axes.");
  }
  const template = factory();
  const copies: Solid[] = [];
  for (let row = 0; row < countY; row += 1) {
    for (let column = 0; column < countX; column += 1) {
      copies.push(
        template.translate([
          origin[0] + column * pitchX,
          origin[1] + row * pitchY,
          origin[2],
        ]),
      );
    }
  }
  template.delete();
  return unionSolids(kernel, copies);
}

/**
 * One batched union. Every input is deleted; a single input is returned as
 * is. An empty list is an error because there is nothing to return.
 */
export function unionSolids(kernel: ManifoldToplevel, solids: Solid[]): Solid {
  if (solids.length === 0) {
    throw new Error("unionSolids needs at least one solid.");
  }
  if (solids.length === 1) return solids[0];
  const union = kernel.Manifold.union(solids);
  for (const solid of solids) solid.delete();
  return union;
}

export interface BoreCutterOptions {
  diameter: number;
  /** How far the bore goes down from the top face. */
  depth: number;
  /** Chamfer leg at the mouth, in millimeters. Zero for a plain bore. */
  chamfer: number;
  segments: number;
  /** Z of the face the bore enters. The cutter overshoots it. */
  topZ: number;
}

/**
 * A flat-bottomed bore cutter that enters a face at `topZ` and goes down
 * `depth`, with an optional 45 degree chamfer at the mouth. Its X and Y
 * origin is the bore axis, so it drops straight into `cutterArray`.
 */
export function boreCutter(
  kernel: ManifoldToplevel,
  options: BoreCutterOptions,
): Solid {
  const radius = options.diameter / 2;
  const bodyAtOrigin = kernel.Manifold.cylinder(
    options.depth + BOOLEAN_OVERLAP,
    radius,
    radius,
    options.segments,
  );
  const body = bodyAtOrigin.translate([0, 0, options.topZ - options.depth]);
  bodyAtOrigin.delete();
  if (options.chamfer <= 0) return body;
  const coneAtOrigin = chamferedCircle(kernel, radius, options.chamfer, options.segments);
  const cone = coneAtOrigin.translate([0, 0, options.topZ - options.chamfer]);
  coneAtOrigin.delete();
  return unionSolids(kernel, [body, cone]);
}
