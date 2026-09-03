import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import { boreCutter, unionSolids } from "./arrays";
import type { Solid } from "./manifold";
import { polygon } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";

/**
 * The bracket family: a back plate against a wall, screw bores with
 * countersinks, hull gussets, and a J-profile hook with a filleted root.
 * The load rules come from 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 2.6.
 * They are validation rules, not warnings: a product refuses to build a hook
 * that breaks one.
 *
 * Coordinates for every builder here: the wall is the plane Y = 0, the plate
 * fills Y from 0 to its thickness, and a hook or a shelf projects along +Y.
 * X runs along the wall and Z is up. A product assembles its part in these
 * coordinates and then turns the whole part 180 degrees about Z, so the
 * finished part hangs on the wall with its hooks toward -Y, the side the
 * viewer's camera faces. It prints with the plate flat on the bed and the
 * hooks up, which is then a turn of -90 degrees about X.
 */

/** The smallest hook root, the section that carries the load across layers. */
export const HOOK_MINIMUM_ROOT_MM = 8;
/** The longest projection for one millimeter of root. */
export const HOOK_MAXIMUM_PROJECTION_RATIO = 2.5;
/** No hook projects further than this, whatever its root. */
export const HOOK_MAXIMUM_PROJECTION_MM = 60;
/** The narrowest hook that carries a headset band. */
export const HOOK_MINIMUM_WIDTH_MM = 20;
/** Clear material between a screw countersink and any edge or feature. */
export const SCREW_MINIMUM_EDGE_MM = 8;
/** A deck or shelf span over this gets ribs. */
export const RIB_SPAN_MM = 150;
/** The tallest body that prints in one piece on the reference bed. */
export const ONE_PIECE_HEIGHT_MM = 240;
/** Material each side of a press-fit socket. */
export const SOCKET_WALL_MM = 3;
/** Clearance each side of a press-fit peg. */
export const PRESS_FIT_CLEARANCE_MM = 0.1;
/** The smallest leg section that can carry a press-fit joint. */
export const SPLIT_MINIMUM_SECTION_MM = 12;

/**
 * The load model. A hook is a cantilever, a deck is a beam. The allowable
 * bending stress is 5 MPa, about a quarter of the layer adhesion strength
 * of PLA printed with three perimeters at 0.2 mm layers. See
 * 24_BRACKET_FAMILY_NOTES.md, section 2. Every number the app shows from
 * this model is approximate and names these assumptions.
 */
export const LOAD_ALLOWABLE_STRESS_MPA = 5;
export const LOAD_ASSUMED_PERIMETERS = 3;
export const LOAD_ASSUMED_MATERIAL = "PLA";
/** The app rates nothing above this. Loads over it are out of scope. */
export const LOAD_MAXIMUM_KG = 5;
const GRAVITY_M_PER_S2 = 9.81;

export interface HookRuleRequest {
  /** The hook thickness where it meets the plate. */
  root: number;
  /** How far the hook stands out from the plate face. */
  projection: number;
}

export type HookRuleResult =
  | { ok: true; maximumProjection: number; minimumRoot: number }
  | {
      ok: false;
      reason: "value" | "root" | "projection";
      /** The longest projection this root carries. */
      maximumProjection: number;
      /** The smallest root this projection needs. */
      minimumRoot: number;
    };

/**
 * The hook rule: root at least 8 mm, projection at most 2.5 times the root
 * and never over 60 mm. Pure, and it never throws: a cleared field holds
 * NaN, and the result then reports reason "value".
 */
export function checkHookRule(request: HookRuleRequest): HookRuleResult {
  const { root, projection } = request;
  const maximumProjection = Math.min(
    HOOK_MAXIMUM_PROJECTION_MM,
    root * HOOK_MAXIMUM_PROJECTION_RATIO,
  );
  const minimumRoot = Math.max(
    HOOK_MINIMUM_ROOT_MM,
    projection / HOOK_MAXIMUM_PROJECTION_RATIO,
  );
  if (!Number.isFinite(root) || !Number.isFinite(projection) || root <= 0 || projection <= 0) {
    return { ok: false, reason: "value", maximumProjection, minimumRoot };
  }
  if (root < HOOK_MINIMUM_ROOT_MM - 1e-9) {
    return { ok: false, reason: "root", maximumProjection, minimumRoot };
  }
  if (projection > maximumProjection + 1e-9) {
    return { ok: false, reason: "projection", maximumProjection, minimumRoot };
  }
  return { ok: true, maximumProjection, minimumRoot };
}

export interface JHookProfileOptions {
  /** The arm thickness at the plate. The arm keeps this thickness. */
  root: number;
  /** From the plate face to the outer face of the lip. */
  projection: number;
  /** How far the lip rises above the arm top. */
  lipHeight: number;
  /** The lip thickness at its top, along the projection. */
  lipThickness: number;
  /** The fillet radius at the root, above and below the arm. */
  fillet: number;
  /** How far the profile reaches into the plate, so the union has no seam. */
  overlap: number;
  /** Points on one quarter of a fillet arc. */
  segments: number;
}

/**
 * The J-hook outline in the (Y, Z) plane: the plate face is Y = 0 and the
 * arm bottom is Z = 0. The root is filleted above and below, so the load
 * path into the plate has no sharp corner. The lip's inner face is a 45
 * degree ramp from the arm top to the lip top, which is the steepest face
 * the print pose allows: with the plate on the bed the arm stands up, and
 * the ramp is the underside of the lip. The profile spans Z from -fillet
 * to root + lipHeight. Returns the points counter-clockwise.
 */
export function jHookProfilePoints(
  options: JHookProfileOptions,
): Array<[number, number]> {
  const { root, projection, lipHeight, lipThickness, fillet, overlap } = options;
  const values = [root, projection, lipHeight, lipThickness, fillet, overlap];
  if (
    !values.every((value) => Number.isFinite(value)) ||
    root <= 0 ||
    projection <= 0 ||
    lipHeight < 0 ||
    lipThickness < 0 ||
    fillet < 0 ||
    overlap < 0
  ) {
    throw new Error("jHookProfile needs finite, positive dimensions.");
  }
  const rampStart = projection - lipThickness - lipHeight;
  if (rampStart < fillet) {
    throw new Error(
      "jHookProfile needs a projection that leaves room for the fillet, the ramp, and the lip.",
    );
  }
  const arcPoints = Math.max(2, Math.round(options.segments));
  const arc = (
    centerY: number,
    centerZ: number,
    fromDegrees: number,
    toDegrees: number,
  ): Array<[number, number]> => {
    const points: Array<[number, number]> = [];
    for (let index = 0; index <= arcPoints; index += 1) {
      const angle =
        ((fromDegrees + ((toDegrees - fromDegrees) * index) / arcPoints) * Math.PI) / 180;
      points.push([centerY + fillet * Math.cos(angle), centerZ + fillet * Math.sin(angle)]);
    }
    return points;
  };
  const points: Array<[number, number]> = [];
  points.push([-overlap, -fillet]);
  if (fillet > 0) {
    // Bottom fillet: from the plate face down at -fillet, around to the arm bottom.
    points.push(...arc(fillet, -fillet, 180, 90));
  } else {
    points.push([0, 0]);
  }
  points.push([projection, 0]);
  points.push([projection, root + lipHeight]);
  points.push([projection - lipThickness, root + lipHeight]);
  if (lipHeight > 0) points.push([rampStart, root]);
  if (fillet > 0) {
    // Top fillet: from the arm top, around and up to the plate face.
    points.push(...arc(fillet, root + fillet, 270, 180));
  } else {
    points.push([0, root]);
  }
  points.push([-overlap, root + fillet]);
  return dedupe(points);
}

function dedupe(points: Array<[number, number]>): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last[0] - point[0]) < 1e-9 && Math.abs(last[1] - point[1]) < 1e-9) {
      continue;
    }
    result.push(point);
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (
    result.length > 1 &&
    Math.abs(first[0] - last[0]) < 1e-9 &&
    Math.abs(first[1] - last[1]) < 1e-9
  ) {
    result.pop();
  }
  return result;
}

export function jHookProfile(
  kernel: ManifoldToplevel,
  options: JHookProfileOptions,
): CrossSection {
  return polygon(kernel, jHookProfilePoints(options));
}

export interface JHookOptions extends JHookProfileOptions {
  /** The hook width along the wall, centered on X = 0. */
  width: number;
}

/**
 * A profile drawn in the (Y, Z) plane, extruded along X and centered on
 * X = 0. The cross-section's own X and Y become Y and Z; the extrusion
 * becomes X. The caller owns the solid.
 */
export function extrudeAlongX(
  kernel: ManifoldToplevel,
  profile: CrossSection,
  width: number,
): Solid {
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error("extrudeAlongX needs a finite, positive width.");
  }
  const alongZ = profile.extrude(width);
  // Local X to Y, local Y to Z, local Z to X: turn 90 about X, then 90 about Z.
  const turned = alongZ.rotate([90, 0, 90]);
  alongZ.delete();
  const centered = turned.translate([-width / 2, 0, 0]);
  turned.delete();
  return centered;
}

/**
 * One J-hook, centered on X = 0, its arm bottom at Z = 0 and its root at the
 * plate face Y = 0. The caller places it and owns it.
 */
export function jHook(kernel: ManifoldToplevel, options: JHookOptions): Solid {
  const profile = jHookProfile(kernel, options);
  const solid = extrudeAlongX(kernel, profile, options.width);
  profile.delete();
  return solid;
}

export interface ScrewCutterOptions {
  /** The through bore. */
  diameter: number;
  /** The countersink diameter at the plate face. */
  headDiameter: number;
  /** The plate thickness along Y. */
  plateThickness: number;
  segments: number;
}

/**
 * A screw cutter through the plate along Y, with a 90 degree countersink
 * that opens on the front face at Y = plateThickness. Its X and Z origin is
 * the screw axis. The caller places it and owns it.
 */
export function screwCutter(kernel: ManifoldToplevel, options: ScrewCutterOptions): Solid {
  const { diameter, headDiameter, plateThickness, segments } = options;
  if (
    ![diameter, headDiameter, plateThickness].every((value) => Number.isFinite(value)) ||
    diameter <= 0 ||
    headDiameter < diameter ||
    plateThickness <= 0
  ) {
    throw new Error("screwCutter needs a finite bore, a head at least as wide, and a plate.");
  }
  const alongZ = boreCutter(kernel, {
    diameter,
    depth: plateThickness + BOOLEAN_OVERLAP,
    chamfer: (headDiameter - diameter) / 2,
    segments,
    topZ: plateThickness,
  });
  // Turn -90 about X: local +Z becomes +Y, so the countersink faces +Y.
  const alongY = alongZ.rotate([-90, 0, 0]);
  alongZ.delete();
  return alongY;
}

/**
 * The cutters for every screw, unioned into one solid. Each position is
 * (X, Z) on the plate. The caller subtracts it from the plate and owns it.
 */
export function screwCutters(
  kernel: ManifoldToplevel,
  positions: ReadonlyArray<readonly [number, number]>,
  options: ScrewCutterOptions,
): Solid {
  if (positions.length === 0) throw new Error("screwCutters needs at least one screw.");
  const template = screwCutter(kernel, options);
  const placed = positions.map(([x, z]) => template.translate([x, 0, z]));
  template.delete();
  return unionSolids(kernel, placed);
}

export interface ScrewRowRequest {
  /** The plate length along the row. */
  plateWidth: number;
  count: number;
  /** Center to center between two screws. Ignored with one screw. */
  spacing: number;
  headDiameter: number;
}

export type ScrewRowPlan =
  | { ok: true; positions: number[]; margin: number }
  | {
      ok: false;
      reason: "value" | "margin";
      /** Material between the countersink edge and the plate end. */
      margin: number;
      /** The widest spacing that leaves the minimum margin. */
      maximumSpacing: number;
    };

/**
 * Centers `count` screws at `spacing` along a plate and checks that the
 * countersink of an end screw keeps the minimum edge material. Pure.
 */
export function planScrewRow(request: ScrewRowRequest): ScrewRowPlan {
  const { plateWidth, count, spacing, headDiameter } = request;
  const rowSpan = count > 1 ? (count - 1) * spacing : 0;
  const margin = (plateWidth - rowSpan - headDiameter) / 2;
  const maximumSpacing =
    count > 1 ? (plateWidth - headDiameter - 2 * SCREW_MINIMUM_EDGE_MM) / (count - 1) : 0;
  if (
    ![plateWidth, spacing, headDiameter].every((value) => Number.isFinite(value)) ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    return { ok: false, reason: "value", margin, maximumSpacing };
  }
  if (margin < SCREW_MINIMUM_EDGE_MM - 1e-9) {
    return { ok: false, reason: "margin", margin, maximumSpacing };
  }
  const positions: number[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push(-rowSpan / 2 + index * spacing);
  }
  return { ok: true, positions, margin };
}

export interface HullGussetOptions {
  /** The gusset thickness along X. */
  thickness: number;
  /** How far the gusset runs down the plate face from the shelf underside. */
  rise: number;
  /** How far the gusset runs out under the shelf from the plate face. */
  run: number;
  /** How far the gusset reaches into the plate and the shelf. */
  overlap: number;
}

/**
 * A triangular web between a plate face at Y = 0 and a shelf underside at
 * Z = 0: the hull of a thin strip on the plate and a thin strip under the
 * shelf. Centered on X = 0. The face between the two strips is the
 * hypotenuse, which faces out and down on the wall and out and up on the
 * bed. The caller places it and owns it.
 */
export function hullGusset(kernel: ManifoldToplevel, options: HullGussetOptions): Solid {
  const { thickness, rise, run, overlap } = options;
  if (
    ![thickness, rise, run, overlap].every((value) => Number.isFinite(value)) ||
    thickness <= 0 ||
    rise <= 0 ||
    run <= 0 ||
    overlap < 0
  ) {
    throw new Error("hullGusset needs a finite, positive thickness, rise, and run.");
  }
  // The two strips lie inside the wedge's own outline, Y from -overlap to
  // run and Z from -rise to overlap, so the hull adds nothing outside it.
  const skin = 0.01;
  const underShelfAtOrigin = kernel.Manifold.cube([thickness, run + overlap, skin], true);
  const underShelf = underShelfAtOrigin.translate([0, (run - overlap) / 2, overlap - skin / 2]);
  underShelfAtOrigin.delete();
  const onPlateAtOrigin = kernel.Manifold.cube([thickness, skin, rise + overlap], true);
  const onPlate = onPlateAtOrigin.translate([0, -overlap + skin / 2, (overlap - rise) / 2]);
  onPlateAtOrigin.delete();
  const wedge = kernel.Manifold.hull([underShelf, onPlate]);
  underShelf.delete();
  onPlate.delete();
  return wedge;
}

/**
 * Where the ribs go under a span. A span over RIB_SPAN_MM is divided into
 * equal bays no longer than that, and a rib stands at each boundary. The
 * positions are measured from the span's center. A span at or under the
 * limit needs no rib. Pure; a NaN span gives no rib.
 */
export function planRibs(span: number, maximumSpan = RIB_SPAN_MM): number[] {
  if (!Number.isFinite(span) || span <= maximumSpan + 1e-9) return [];
  const bays = Math.ceil(span / maximumSpan - 1e-9);
  const pitch = span / bays;
  const positions: number[] = [];
  for (let index = 1; index < bays; index += 1) {
    positions.push(-span / 2 + index * pitch);
  }
  return positions;
}

export interface LegSplitRequest {
  /** The deck thickness, which the one-piece body includes. */
  deckThickness: number;
  /** The clear leg height under the deck. */
  clearHeight: number;
  /** The square leg section. */
  section: number;
}

export type LegSplitPlan =
  | { split: false; totalHeight: number }
  | {
      split: true;
      totalHeight: number;
      /** The leg length that stays on the deck body. */
      upperLength: number;
      /** The leg length of each separate extension, not counting the peg. */
      extensionLength: number;
      /** The square peg side. */
      pegSide: number;
      /** How far the peg enters the socket. */
      pegLength: number;
      /** The square socket side, the peg plus the clearance. */
      socketSide: number;
    }
  | {
      split: false;
      totalHeight: number;
      /** The split is needed but refused: the section is too small, or the extension is too long. */
      reason: "section" | "height";
    };

/**
 * Splits each leg into a part that stays on the deck and a press-fit
 * extension when the whole riser is taller than one piece can print. The
 * deck body takes as much leg as the one-piece height allows, so the
 * extension is as short as possible. Pure.
 */
export function planLegSplit(request: LegSplitRequest): LegSplitPlan {
  const { deckThickness, clearHeight, section } = request;
  const totalHeight = deckThickness + clearHeight;
  if (!Number.isFinite(totalHeight) || totalHeight <= ONE_PIECE_HEIGHT_MM + 1e-9) {
    return { split: false, totalHeight };
  }
  if (!Number.isFinite(section) || section < SPLIT_MINIMUM_SECTION_MM - 1e-9) {
    return { split: false, totalHeight, reason: "section" };
  }
  const pegSide = section - 2 * SOCKET_WALL_MM;
  const pegLength = Math.max(10, Math.round(pegSide * 1.5));
  const upperLength = ONE_PIECE_HEIGHT_MM - deckThickness;
  const extensionLength = clearHeight - upperLength;
  if (extensionLength + pegLength > ONE_PIECE_HEIGHT_MM + 1e-9) {
    return { split: false, totalHeight, reason: "height" };
  }
  return {
    split: true,
    totalHeight,
    upperLength,
    extensionLength,
    pegSide,
    pegLength,
    socketSide: pegSide + 2 * PRESS_FIT_CLEARANCE_MM,
  };
}

/**
 * The load a cantilever carries at its tip, in newtons: the allowable
 * stress times the section modulus of the root, over the arm. Width and
 * thickness are the root section; `arm` is the distance from the root to
 * the load. NaN in, NaN out.
 */
export function cantileverLoadNewtons(width: number, thickness: number, arm: number): number {
  return (LOAD_ALLOWABLE_STRESS_MPA * width * thickness * thickness) / (6 * arm);
}

/**
 * The load a simply supported beam carries spread along its length, in
 * newtons. Width is the beam's width across the span, thickness its depth.
 */
export function beamLoadNewtons(width: number, thickness: number, span: number): number {
  return (8 * LOAD_ALLOWABLE_STRESS_MPA * width * thickness * thickness) / (6 * span);
}

export function newtonsToKilograms(newtons: number): number {
  return newtons / GRAVITY_M_PER_S2;
}

/**
 * The text for a load estimate. It always names the material and the
 * perimeter count the model assumes, and it never shows a number above
 * the 5 kg limit, because loads over that are out of scope.
 */
export function loadNote(newtons: number): string {
  if (!Number.isFinite(newtons) || newtons <= 0) return "—";
  const kilograms = newtonsToKilograms(newtons);
  const assumptions = `${LOAD_ASSUMED_PERIMETERS} perimeters in ${LOAD_ASSUMED_MATERIAL}, approximate`;
  if (kilograms >= LOAD_MAXIMUM_KG) {
    return `${LOAD_MAXIMUM_KG} kg or more at ${assumptions}. This app rates nothing above ${LOAD_MAXIMUM_KG} kg.`;
  }
  const shown = kilograms >= 1 ? kilograms.toFixed(1) : (Math.round(kilograms * 20) / 20).toFixed(2);
  return `about ${shown} kg at ${assumptions}`;
}
