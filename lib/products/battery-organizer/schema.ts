import { planLightening, type LighteningPlan } from "../../kernel/lightening";
import { solvePitch, type PitchResult } from "../../kernel/arrays";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

export type CellShape = "round" | "slot";

/** Material that must stay between two wells and around the array. */
export const MINIMUM_WEB_MM = 2.5;
/** The finger relief is a wider, shallow counterbore at the top of every well. */
export const FINGER_RELIEF_DEPTH_MM = 3;
/** Extra diameter (round) or extra width and length (slot) at the relief. */
export const FINGER_RELIEF_WIDEN_MM = 6;
/** Underside pocket rules. A pocket ceiling is a bridge; keep it short. */
export const LIGHTENING_MAXIMUM_SPAN_MM = 40;
export const LIGHTENING_WEB_MM = 2.5;
export const LIGHTENING_POCKET_RADIUS_MM = 2;

export const BATTERY_ORGANIZER_SPECS = {
  organizerWidth: {
    kind: "number",
    label: "Organizer width",
    shortLabel: "Width",
    min: 60,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  organizerDepth: {
    kind: "number",
    label: "Organizer depth",
    shortLabel: "Depth",
    min: 40,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  organizerHeight: {
    kind: "number",
    label: "Organizer height",
    shortLabel: "Height",
    min: 20,
    max: 100,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  rows: {
    kind: "number",
    label: "Well rows",
    shortLabel: "Rows",
    min: 1,
    max: 4,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  cellsPerRow: {
    kind: "number",
    label: "Cells per row",
    shortLabel: "Cells per row",
    min: 1,
    max: 12,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  cellDiameter: {
    kind: "number",
    label: "Cell diameter",
    shortLabel: "Diameter",
    min: 5,
    max: 40,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  cellLength: {
    kind: "number",
    label: "Cell length",
    shortLabel: "Length",
    min: 2,
    max: 70,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  cellShape: {
    kind: "enum",
    label: "Cell shape",
    options: [
      { value: "round", label: "Round, stands upright in a bore" },
      { value: "slot", label: "Coin cell, stands on edge in a slot" },
    ],
    hint: "A coin cell lies flat, so it stands on edge: the diameter runs vertical, the length is its thickness.",
  } satisfies EnumSpec<CellShape>,
  exposedHeight: {
    kind: "number",
    label: "Cell height left exposed",
    shortLabel: "Exposed",
    min: 3,
    max: 30,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  clearancePerSide: {
    kind: "number",
    label: "Clearance per side",
    shortLabel: "Clearance",
    min: 0,
    max: 3,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  fingerRelief: {
    kind: "boolean",
    label: "Finger relief",
    description: `A wider, ${FINGER_RELIEF_DEPTH_MM} mm deep counterbore at the top of every well, so a fingertip can reach the cell.`,
  } satisfies BooleanSpec,
  wallThickness: {
    kind: "number",
    label: "Rim wall thickness",
    shortLabel: "Rim",
    min: 1.2,
    max: 4,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  baseThickness: {
    kind: "number",
    label: "Base under the wells",
    shortLabel: "Base",
    min: 1.2,
    max: 6,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  cornerRadius: {
    kind: "number",
    label: "Outer corner radius",
    shortLabel: "Corner radius",
    min: 0,
    max: 20,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  lightenUnderside: {
    kind: "boolean",
    label: "Underside pockets",
    description: `Pockets under the base save material. Each pocket ceiling bridges at most ${LIGHTENING_MAXIMUM_SPAN_MM} mm.`,
  } satisfies BooleanSpec,
  meshQuality: {
    kind: "enum",
    label: "Mesh quality",
    options: [
      { value: "draft", label: "Draft" },
      { value: "standard", label: "Standard" },
      { value: "fine", label: "Fine" },
    ],
    hint: "Standard balances round wells with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
} as const;

export type BatteryOrganizerSpecs = typeof BATTERY_ORGANIZER_SPECS;
export type BatteryOrganizerParameters = ParametersOf<BatteryOrganizerSpecs>;
export type BatteryOrganizerKey = keyof BatteryOrganizerSpecs & string;

export const BATTERY_ORGANIZER_DEFAULTS: BatteryOrganizerParameters = {
  organizerWidth: 120,
  organizerDepth: 85,
  organizerHeight: 45,
  rows: 3,
  cellsPerRow: 4,
  cellDiameter: 14.5,
  cellLength: 50.5,
  cellShape: "round",
  exposedHeight: 12,
  clearancePerSide: 0.5,
  fingerRelief: true,
  wallThickness: 2,
  baseThickness: 2.4,
  cornerRadius: 4,
  lightenUnderside: true,
  meshQuality: "standard",
};

export const BATTERY_ORGANIZER_GROUPS: ParameterGroup<BatteryOrganizerKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description: "The outside of the organizer. Measure the space it goes into.",
    keys: ["organizerWidth", "organizerDepth", "organizerHeight"],
  },
  {
    id: "cells",
    index: "02",
    title: "Cells",
    description:
      "Rows run front to back. Row 1 is at the front. Every well holds the same cell.",
    keys: [
      "rows",
      "cellsPerRow",
      "cellDiameter",
      "cellLength",
      "cellShape",
      "exposedHeight",
      "clearancePerSide",
      "fingerRelief",
    ],
  },
  {
    id: "construction",
    index: "03",
    title: "Construction",
    description: "The rim, the base, the corners, and the underside.",
    keys: [
      "wallThickness",
      "baseThickness",
      "cornerRadius",
      "lightenUnderside",
      "meshQuality",
    ],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface CornerConflict {
  /** One-based row number. */
  row: number;
  /** The largest corner radius that keeps this row's wells inside the wall, in whole 0.5 mm steps. */
  maximumCornerRadius: number;
}

/**
 * True when an axis-aligned rectangle of half-width `semiX` and half-depth
 * `semiY`, centered at (`x`, `y`), stays inside the rounded outer profile
 * with at least `wall` of material, on the straight sides and at the
 * rounded corners.
 *
 * The corner test uses the far corner of the rectangle, `(|x| + semiX,
 * |y| + semiY)`, against the arc the wall-inset profile draws at that
 * corner. This is exact for a rectangle or a square well and conservative
 * for a round well, since the bounding box reaches further into the corner
 * than a circle does. A check keyed to the well's center point instead of
 * its far corner would wrongly call a row centered on an axis clear no
 * matter how far its footprint actually reaches (found while building the
 * tool fin rack's single centered row; see 21_WAVE_1_PRODUCTS_NOTES.md).
 */
export function footprintClearsOuterWall(
  x: number,
  y: number,
  semiX: number,
  semiY: number,
  width: number,
  depth: number,
  cornerRadius: number,
  wall: number,
): boolean {
  const farX = Math.abs(x) + semiX;
  const farY = Math.abs(y) + semiY;
  if (farX > width / 2 - wall + 1e-9) return false;
  if (farY > depth / 2 - wall + 1e-9) return false;
  const dx = Math.max(0, farX - (width / 2 - cornerRadius));
  const dy = Math.max(0, farY - (depth / 2 - cornerRadius));
  if (dx === 0 || dy === 0) return true;
  const arcRadius = Math.max(0, cornerRadius - wall);
  return Math.hypot(dx, dy) <= arcRadius + 1e-9;
}

/**
 * The length of the cell along the axis that stands vertical in the well.
 * A round cell stands on its own length; a coin cell stands on edge, so its
 * diameter is what runs vertical.
 */
export function standingLength(shape: CellShape, diameter: number, length: number): number {
  return shape === "slot" ? diameter : length;
}

/**
 * The well footprint's half-extents at the outside face, before the finger
 * relief widening. A round well is a circle; a slot well is a rectangle,
 * narrow (the cell's length plus clearance) along X and long (the cell's
 * diameter plus clearance) along Y, so a row of coin cells packs by
 * thickness and rows separate by diameter.
 */
export function cellFootprint(
  shape: CellShape,
  diameter: number,
  length: number,
  clearancePerSide: number,
): { semiX: number; semiY: number } {
  const diameterHalf = diameter / 2 + clearancePerSide;
  if (shape === "round") return { semiX: diameterHalf, semiY: diameterHalf };
  return { semiX: length / 2 + clearancePerSide, semiY: diameterHalf };
}

export interface BatteryOrganizerLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  /** The span inside the rim on each axis. */
  innerWidth: number;
  innerDepth: number;
  /** The well layout along X for each row (every row shares the same cell). */
  rowLayouts: PitchResult[];
  /** The row layout along Y. */
  rowSpacing: PitchResult;
  /** How deep the cell's standing length sinks into the well. */
  boreDepth: number;
  /** Material under the well floors: the base when pockets exist, else the whole slab below the floor. */
  baseUnderWells: number;
  /** The wells that a large outer corner would cut open. */
  cornerConflicts: CornerConflict[];
  /** The pocket grid, or null when the organizer gets no pockets. */
  lightening: LighteningPlan | null;
}

export function lighteningOptions(parameters: BatteryOrganizerParameters, segments: number) {
  return {
    width: parameters.organizerWidth,
    depth: parameters.organizerDepth,
    cornerRadius: parameters.cornerRadius,
    rim: parameters.wallThickness,
    pocketDepth:
      parameters.organizerHeight -
      Math.max(
        0,
        standingLength(parameters.cellShape, parameters.cellDiameter, parameters.cellLength) -
          parameters.exposedHeight,
      ) -
      parameters.baseThickness,
    maximumSpan: LIGHTENING_MAXIMUM_SPAN_MM,
    web: LIGHTENING_WEB_MM,
    pocketRadius: LIGHTENING_POCKET_RADIUS_MM,
    segments,
  };
}

/**
 * Solves the whole layout from the parameters. Pure. A rejected pitch stays
 * in the result as `ok: false` so validation can name the field, and
 * generation refuses it.
 */
export function deriveLayout(parameters: BatteryOrganizerParameters): BatteryOrganizerLayout {
  const innerWidth = parameters.organizerWidth - parameters.wallThickness * 2;
  const innerDepth = parameters.organizerDepth - parameters.wallThickness * 2;
  const rows = Number.isInteger(parameters.rows) ? Math.max(1, parameters.rows) : 1;
  const count = Number.isInteger(parameters.cellsPerRow)
    ? Math.max(1, parameters.cellsPerRow)
    : 1;
  const diameter =
    Number.isFinite(parameters.cellDiameter) && parameters.cellDiameter > 0
      ? parameters.cellDiameter
      : 1;
  const length =
    Number.isFinite(parameters.cellLength) && parameters.cellLength > 0
      ? parameters.cellLength
      : 1;
  const clearance = Number.isFinite(parameters.clearancePerSide)
    ? Math.max(0, parameters.clearancePerSide)
    : 0;
  const solvable = Number.isFinite(innerWidth) && Number.isFinite(innerDepth);
  const unsolved = (): PitchResult => ({
    ok: false,
    web: Number.NaN,
    minimumWeb: MINIMUM_WEB_MM,
  });

  const footprint = cellFootprint(parameters.cellShape, diameter, length, clearance);
  const xCutterSize = footprint.semiX * 2;
  const yCutterSize = footprint.semiY * 2;

  const rowLayouts: PitchResult[] = [];
  for (let index = 0; index < rows; index += 1) {
    rowLayouts.push(
      solvable
        ? solvePitch({
            span: innerWidth,
            count,
            cutterSize: xCutterSize,
            minimumWeb: MINIMUM_WEB_MM,
          })
        : unsolved(),
    );
  }

  const rowSpacing = solvable
    ? solvePitch({
        span: innerDepth,
        count: rows,
        cutterSize: yCutterSize,
        minimumWeb: MINIMUM_WEB_MM,
      })
    : unsolved();

  const boreDepth = Math.max(
    0,
    standingLength(parameters.cellShape, diameter, length) - parameters.exposedHeight,
  );
  const lightening = parameters.lightenUnderside
    ? planLightening(lighteningOptions(parameters, QUALITY_SEGMENTS.standard))
    : null;

  const cornerConflicts = findCornerConflicts(
    parameters,
    rowLayouts,
    rowSpacing,
    count,
    diameter,
    length,
    clearance,
  );

  return {
    outsideWidth: parameters.organizerWidth,
    outsideDepth: parameters.organizerDepth,
    outsideHeight: parameters.organizerHeight,
    innerWidth,
    innerDepth,
    rowLayouts,
    rowSpacing,
    boreDepth,
    baseUnderWells: lightening
      ? parameters.baseThickness
      : parameters.organizerHeight - boreDepth,
    lightening,
    cornerConflicts,
  };
}

/**
 * Checks the end wells of every row against the rounded outer corners and
 * the straight walls, at the finger relief's widened footprint when it is
 * on. For a row that fails, the largest passing corner radius is found by
 * stepping down in 0.5 mm steps, the corner radius field's own step.
 */
function findCornerConflicts(
  parameters: BatteryOrganizerParameters,
  rowLayouts: PitchResult[],
  rowSpacing: PitchResult,
  count: number,
  diameter: number,
  length: number,
  clearance: number,
): CornerConflict[] {
  if (!rowSpacing.ok || !Number.isFinite(parameters.cornerRadius)) return [];
  const widen = parameters.fingerRelief ? FINGER_RELIEF_WIDEN_MM : 0;
  const footprint = cellFootprint(parameters.cellShape, diameter, length, clearance);
  const semiX = footprint.semiX + widen / 2;
  const semiY = footprint.semiY + widen / 2;
  const conflicts: CornerConflict[] = [];
  rowLayouts.forEach((rowLayout, index) => {
    if (!rowLayout.ok) return;
    const y = rowSpacing.firstCenter + index * rowSpacing.pitch;
    const xEnds = [rowLayout.firstCenter, rowLayout.firstCenter + (count - 1) * rowLayout.pitch];
    const clears = (cornerRadius: number) =>
      xEnds.every((x) =>
        footprintClearsOuterWall(
          x,
          y,
          semiX,
          semiY,
          parameters.organizerWidth,
          parameters.organizerDepth,
          cornerRadius,
          parameters.wallThickness,
        ),
      );
    if (clears(parameters.cornerRadius)) return;
    let maximumCornerRadius = Math.floor(parameters.cornerRadius * 2) / 2;
    while (maximumCornerRadius > 0 && !clears(maximumCornerRadius)) {
      maximumCornerRadius -= 0.5;
    }
    conflicts.push({ row: index + 1, maximumCornerRadius: Math.max(0, maximumCornerRadius) });
  });
  return conflicts;
}
