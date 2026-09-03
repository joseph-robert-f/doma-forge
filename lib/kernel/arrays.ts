import type { ManifoldToplevel } from "manifold-3d";
import type { Solid } from "./manifold";
import { chamferedCircle } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";

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
  if (
    !Number.isInteger(countX) ||
    !Number.isInteger(countY) ||
    countX < 1 ||
    countY < 1
  ) {
    throw new Error(
      "cutterArray needs whole counts of at least 1 on both axes.",
    );
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
  const coneAtOrigin = chamferedCircle(
    kernel,
    radius,
    options.chamfer,
    options.segments,
  );
  const cone = coneAtOrigin.translate([0, 0, options.topZ - options.chamfer]);
  coneAtOrigin.delete();
  return unionSolids(kernel, [body, cone]);
}

export interface DividerArrayOptions {
  /** Divider center positions along `axis`, in millimeters. */
  positions: readonly number[];
  /** Divider thickness along `axis`. */
  thickness: number;
  /** Divider length across `axis`. Add the overlap before you call. */
  length: number;
  /** Divider height. Add the overlap before you call. */
  height: number;
  /** Z of the divider center. */
  centerZ: number;
  /** The axis the positions run along. A divider stands across it. */
  axis?: "x" | "y";
}

/**
 * Dividers at explicit positions, unioned into one solid and clipped to
 * `outer`. This is the drawer tray's own construction: a full-length box per
 * divider, intersected with the outer body, so a divider follows the rounded
 * outer corners instead of cutting through them. A product solves the
 * positions in a pure layout function; this module places what it is given.
 *
 * `outer` is not deleted. An empty position list returns null, so a product
 * with one well needs no special case.
 */
export function dividerArrayAtPositions(
  kernel: ManifoldToplevel,
  outer: Solid,
  options: DividerArrayOptions,
): Solid | null {
  const { positions, thickness, length, height, centerZ } = options;
  if (positions.length === 0) return null;
  if (
    !Number.isFinite(thickness) ||
    !Number.isFinite(length) ||
    !Number.isFinite(height) ||
    !Number.isFinite(centerZ) ||
    thickness <= 0 ||
    length <= 0 ||
    height <= 0
  ) {
    throw new Error(
      "dividerArrayAtPositions needs a finite, positive thickness, length, and height.",
    );
  }
  if (positions.some((position) => !Number.isFinite(position))) {
    throw new Error("dividerArrayAtPositions needs finite positions.");
  }
  const alongX = (options.axis ?? "x") === "x";
  const size: [number, number, number] = alongX
    ? [thickness, length, height]
    : [length, thickness, height];
  const clipped = positions.map((position) => {
    const atOrigin = kernel.Manifold.cube(size, true);
    const positioned = atOrigin.translate(
      alongX ? [position, 0, centerZ] : [0, position, centerZ],
    );
    atOrigin.delete();
    const inside = positioned.intersect(outer);
    positioned.delete();
    return inside;
  });
  return unionSolids(kernel, clipped);
}
