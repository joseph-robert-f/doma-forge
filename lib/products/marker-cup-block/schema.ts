import { defaultSurfaceTreatments, isSurfacePatternActive, surfaceTreatmentSpec } from "../../surface-patterns";
import {
  planLightening,
  type LighteningPlan,
} from "../../kernel/lightening-plan";
import { solvePitch, type PitchResult } from "../../kernel/pitch";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** Material that must stay between two bores and around the array. */
export const MINIMUM_WEB_MM = 2.5;
/** The 45 degree lead-in at the mouth of a chamfered bore. */
export const CHAMFER_MM = 0.8;
/** Underside pocket rules. A pocket ceiling is a bridge; keep it short. */
export const LIGHTENING_MAXIMUM_SPAN_MM = 40;
export const LIGHTENING_WEB_MM = 2.5;
export const LIGHTENING_POCKET_RADIUS_MM = 2;
/** The tilt range: 0 is upright, 15 leans every cup back, away from the user. */
export const MAXIMUM_TILT_DEGREES = 15;

export const MARKER_CUP_BLOCK_SPECS = {
  blockWidth: {
    kind: "number",
    label: "Block width",
    shortLabel: "Width",
    min: 60,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  blockDepth: {
    kind: "number",
    label: "Block depth",
    shortLabel: "Depth",
    min: 40,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  blockHeight: {
    kind: "number",
    label: "Block height",
    shortLabel: "Height",
    min: 20,
    max: 130,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  rows: {
    kind: "number",
    label: "Cup rows",
    shortLabel: "Rows",
    min: 1,
    max: 4,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  cupsPerRow: {
    kind: "number",
    label: "Cups per row",
    shortLabel: "Cups per row",
    min: 1,
    max: 12,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  boreDiameter: {
    kind: "number",
    label: "Bore diameter",
    shortLabel: "Bore",
    min: 5,
    max: 35,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  boreDepth: {
    kind: "number",
    label: "Bore depth",
    shortLabel: "Bore depth",
    min: 8,
    max: 110,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  tiltDegrees: {
    kind: "number",
    label: "Bore tilt, degrees back from vertical",
    shortLabel: "Tilt",
    min: 0,
    max: MAXIMUM_TILT_DEGREES,
    step: 1,
    unit: "",
  } satisfies NumberSpec,
  chamfer: {
    kind: "boolean",
    label: "Chamfered bore mouths",
    description: `A ${CHAMFER_MM} mm lead-in at the top of every bore.`,
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
    label: "Base under the bores",
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
    description: `Pockets under the base save material. Each pocket ceiling bridges at most ${LIGHTENING_MAXIMUM_SPAN_MM} mm. A patterned base omits these pockets.`,
  } satisfies BooleanSpec,
  meshQuality: {
    kind: "enum",
    label: "Mesh quality",
    options: [
      { value: "draft", label: "Draft" },
      { value: "standard", label: "Standard" },
      { value: "fine", label: "Fine" },
    ],
    hint: "Standard balances round bores with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
  surfaceTreatments: surfaceTreatmentSpec([
      { id: "base", label: "Base", description: "Spare material between the tilted bores. A pattern omits underside pockets." },
    ]),
} as const;

export type MarkerCupBlockSpecs = typeof MARKER_CUP_BLOCK_SPECS;
export type MarkerCupBlockParameters = ParametersOf<MarkerCupBlockSpecs>;
export type MarkerCupBlockKey = keyof MarkerCupBlockSpecs & string;

export const MARKER_CUP_BLOCK_DEFAULTS: MarkerCupBlockParameters = {
  blockWidth: 120,
  blockDepth: 90,
  blockHeight: 70,
  rows: 2,
  cupsPerRow: 4,
  boreDiameter: 20,
  boreDepth: 45,
  tiltDegrees: 8,
  chamfer: true,
  wallThickness: 2,
  baseThickness: 2.4,
  cornerRadius: 6,
  lightenUnderside: true,
  meshQuality: "standard",
  surfaceTreatments: defaultSurfaceTreatments(MARKER_CUP_BLOCK_SPECS.surfaceTreatments),
};

export const MARKER_CUP_BLOCK_GROUPS: ParameterGroup<MarkerCupBlockKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description: "The outside of the block. Measure the space it goes into.",
    keys: ["blockWidth", "blockDepth", "blockHeight"],
  },
  {
    id: "cups",
    index: "02",
    title: "Cups",
    description:
      "Rows run front to back. Row 1 is at the front. Every cup shares one bore diameter.",
    keys: [
      "rows",
      "cupsPerRow",
      "boreDiameter",
      "boreDepth",
      "tiltDegrees",
      "chamfer",
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
  {
    id: "surface",
    index: "04",
    title: "Surface",
    description: "Choose solid, holed, or mesh regions for this print.",
    keys: ["surfaceTreatments"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

const DEGREES_TO_RADIANS = Math.PI / 180;

export interface CornerConflict {
  /** One-based row number. */
  row: number;
  /**
   * The largest corner radius that keeps this row's cups inside the wall,
   * in 0.5 mm steps. 0 when even a square corner does not clear — the
   * straight wall itself is too close, not the rounding — in which case
   * `maximumTiltDegrees` or `maximumBoreDepth` names the fix instead.
   */
  maximumCornerRadius: number;
  /** Set only when `maximumCornerRadius` is 0: the largest tilt, in whole degrees, that clears at the field's own corner radius. Null when no smaller tilt helps either. */
  maximumTiltDegrees?: number | null;
  /** Set only when `maximumCornerRadius` is 0 and no tilt helps: the largest bore depth, in 0.5 mm steps, that clears. Null when nothing found. */
  maximumBoreDepth?: number | null;
}

/**
 * True when an axis-aligned ellipse of half-width `semiX` and half-depth
 * `semiY`, centered at (`x`, `y`), stays inside the rounded outer profile
 * with at least `wall` of material, on the straight sides and at the
 * rounded corners.
 *
 * The corner test uses the far corner of the ellipse's own bounding box,
 * `(|x| + semiX, |y| + semiY)`, against the arc that the wall-inset
 * profile draws at that corner. This is exact for an axis-aligned
 * rectangle (`footprintClearsOuterWall` doubles as that test when semiX or
 * semiY is the shape's own half-extent, not a circle's radius) and
 * conservative for an ellipse, since the bounding box reaches further into
 * the corner than the ellipse itself does. A check keyed to the shape's
 * center point instead of its far corner would wrongly call a row centered
 * on an axis clear no matter how far its footprint actually reaches.
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
 * The mouth of a bore tilted by `tiltRadians` about the X axis is where the
 * flat top face cuts the tilted cylindrical wall: an ellipse centered on the
 * nominal (untilted) axis position, unchanged along X and stretched along Y
 * by `1 / cos(tilt)`.
 */
export function boreMouthSemiAxes(radius: number, tiltRadians: number) {
  return { semiX: radius, semiY: radius / Math.cos(tiltRadians) };
}

/**
 * The Y position of the bore axis where it exits at the floor: the axis
 * walks toward the front, `depth * sin(tilt)` from the nominal (untilted)
 * position, matching the tilt direction `tiltedBoreCutter` builds in
 * `geometry.ts` (rotated by `-tiltDegrees`, so a positive tilt swings the
 * floor toward negative Y while a marker resting in the cup visibly leans
 * the other way, toward positive Y, back and away from the user). The
 * matching Z drop is `depth * cos(tilt)` at the floor's own center, so the
 * exit point is short of a full vertical `depth` under the mouth; see
 * `boreVerticalReach` for the floor disc's own lowest point, which dips
 * further. See `boreFloorSemiAxes` for the floor's footprint around this
 * center.
 */
export function boreFloorY(
  nominalY: number,
  depth: number,
  tiltRadians: number,
): number {
  return nominalY - depth * Math.sin(tiltRadians);
}

export function boreFloorSemiAxes(radius: number, tiltRadians: number) {
  return { semiX: radius, semiY: radius * Math.cos(tiltRadians) };
}

/**
 * The deepest vertical point the whole tilted bore reaches below the
 * mouth: the floor disc's own center sits `depth * cos(tilt)` down, but
 * the disc is tilted too, so its low edge — at radius `boreRadius`,
 * whichever side of the axis the tilt carries lowest — dips a further
 * `boreRadius * sin(tilt)`. `chamferExtra` (0 when the chamfer is off)
 * widens the radius term to the mouth's own widest point, so the same
 * formula bounds the whole cutter, floor and chamfered mouth alike; it is
 * a small over-estimate near the mouth (the chamfer's own radius does not
 * apply at the floor) and exact at the floor, so it never under-states how
 * much base or pocket-ceiling material a bore actually needs beneath it.
 */
export function boreVerticalReach(
  boreDepth: number,
  tiltRadians: number,
  boreRadius: number,
  chamferExtra: number,
): number {
  return (
    boreDepth * Math.cos(tiltRadians) +
    (boreRadius + chamferExtra) * Math.sin(tiltRadians)
  );
}

export interface MarkerCupBlockLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  /** The span inside the rim on each axis. */
  innerWidth: number;
  innerDepth: number;
  /** The cup layout along X for each row (every row shares the same bore diameter). */
  rowLayouts: PitchResult[];
  /** The row layout along Y, solved with the tilted mouth's elongated Y footprint. */
  rowSpacing: PitchResult;
  /** Material under the bore floors: the base when pockets exist, else the whole slab below the shallowest floor. */
  baseUnderBores: number;
  /** The cups that a large outer corner, or the tilt, would cut open. */
  cornerConflicts: CornerConflict[];
  /** The pocket grid, or null when the block gets no pockets. */
  lightening: LighteningPlan | null;
}

/** `parameters.chamfer` widens the mouth by this much; 0 when it is off. */
export function chamferExtraFor(parameters: MarkerCupBlockParameters): number {
  return parameters.chamfer ? CHAMFER_MM : 0;
}

export function lighteningOptions(
  parameters: MarkerCupBlockParameters,
  segments: number,
) {
  const tiltRadians = Number.isFinite(parameters.tiltDegrees)
    ? parameters.tiltDegrees * DEGREES_TO_RADIANS
    : 0;
  const diameter =
    Number.isFinite(parameters.boreDiameter) && parameters.boreDiameter > 0
      ? parameters.boreDiameter
      : 1;
  const reach = Number.isFinite(parameters.boreDepth)
    ? boreVerticalReach(
        parameters.boreDepth,
        tiltRadians,
        diameter / 2,
        chamferExtraFor(parameters),
      )
    : 0;
  return {
    width: parameters.blockWidth,
    depth: parameters.blockDepth,
    cornerRadius: parameters.cornerRadius,
    rim: parameters.wallThickness,
    // The bore's own deepest reach, not just its floor center's vertical
    // drop: a tilted floor disc dips further at its low edge, and a
    // chamfered mouth is wider still. See `boreVerticalReach`.
    pocketDepth: parameters.blockHeight - reach - parameters.baseThickness,
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
export function deriveLayout(
  parameters: MarkerCupBlockParameters,
): MarkerCupBlockLayout {
  const innerWidth = parameters.blockWidth - parameters.wallThickness * 2;
  const innerDepth = parameters.blockDepth - parameters.wallThickness * 2;
  const rows = Number.isInteger(parameters.rows)
    ? Math.max(1, parameters.rows)
    : 1;
  const count = Number.isInteger(parameters.cupsPerRow)
    ? Math.max(1, parameters.cupsPerRow)
    : 1;
  const diameter =
    Number.isFinite(parameters.boreDiameter) && parameters.boreDiameter > 0
      ? parameters.boreDiameter
      : 1;
  const tiltRadians = Number.isFinite(parameters.tiltDegrees)
    ? parameters.tiltDegrees * DEGREES_TO_RADIANS
    : 0;
  const solvable = Number.isFinite(innerWidth) && Number.isFinite(innerDepth);
  const unsolved = (): PitchResult => ({
    ok: false,
    web: Number.NaN,
    minimumWeb: MINIMUM_WEB_MM,
  });

  const rowLayouts: PitchResult[] = [];
  for (let index = 0; index < rows; index += 1) {
    rowLayouts.push(
      solvable
        ? solvePitch({
            span: innerWidth,
            count,
            cutterSize: diameter,
            minimumWeb: MINIMUM_WEB_MM,
          })
        : unsolved(),
    );
  }

  // Rows are spaced along Y using the tilted mouth's elongated Y extent, so
  // adjacent rows keep the minimum web even though a tilted mouth is wider
  // than the bore diameter.
  const mouthDiameterY = solvable
    ? 2 * boreMouthSemiAxes(diameter / 2, tiltRadians).semiY
    : diameter;
  const rowSpacing = solvable
    ? solvePitch({
        span: innerDepth,
        count: rows,
        cutterSize: mouthDiameterY,
        minimumWeb: MINIMUM_WEB_MM,
      })
    : unsolved();

  const lightening = parameters.lightenUnderside && !isSurfacePatternActive(parameters.surfaceTreatments, "base")
    ? planLightening(lighteningOptions(parameters, QUALITY_SEGMENTS.standard))
    : null;

  const cornerConflicts = findCornerConflicts(
    parameters,
    rowLayouts,
    rowSpacing,
    count,
    diameter,
    tiltRadians,
  );

  return {
    outsideWidth: parameters.blockWidth,
    outsideDepth: parameters.blockDepth,
    outsideHeight: parameters.blockHeight,
    innerWidth,
    innerDepth,
    rowLayouts,
    rowSpacing,
    baseUnderBores: lightening
      ? parameters.baseThickness
      : parameters.blockHeight -
        boreVerticalReach(
          parameters.boreDepth,
          tiltRadians,
          diameter / 2,
          chamferExtraFor(parameters),
        ),
    lightening,
    cornerConflicts,
  };
}

/**
 * Checks the end cups of every row, at both the mouth and the tilted bore
 * floor, against the rounded outer corners and the straight walls. A
 * chamfered mouth is wider by the chamfer, so that is the radius checked at
 * the mouth. For a row that fails, the largest passing corner radius is
 * found by stepping down in 0.5 mm steps, the corner radius field's own
 * step.
 */
/**
 * True when both the mouth and the tilted floor of the cup at row `index`
 * clear the outer wall, at a given tilt (its own radians and the row
 * spacing solved for it) and a given corner radius. `xEnds` (the row's own
 * two end columns, unaffected by tilt) and `boreDepth` are separate
 * parameters so the corner-radius, tilt, and depth searches below can each
 * hold everything else fixed and vary only their own field.
 */
function clearsOuterWallAt(
  parameters: MarkerCupBlockParameters,
  radius: number,
  mouthExtra: number,
  boreDepth: number,
  tiltRadians: number,
  spacing: PitchResult & { ok: true },
  index: number,
  xEnds: number[],
  cornerRadius: number,
): boolean {
  const mouth = boreMouthSemiAxes(radius + mouthExtra, tiltRadians);
  const floor = boreFloorSemiAxes(radius, tiltRadians);
  const nominalY = spacing.firstCenter + index * spacing.pitch;
  const floorY = boreFloorY(nominalY, boreDepth, tiltRadians);
  return xEnds.every(
    (x) =>
      footprintClearsOuterWall(
        x,
        nominalY,
        mouth.semiX,
        mouth.semiY,
        parameters.blockWidth,
        parameters.blockDepth,
        cornerRadius,
        parameters.wallThickness,
      ) &&
      footprintClearsOuterWall(
        x,
        floorY,
        floor.semiX,
        floor.semiY,
        parameters.blockWidth,
        parameters.blockDepth,
        cornerRadius,
        parameters.wallThickness,
      ),
  );
}

/**
 * Checks the end cups of every row, at both the mouth and the tilted bore
 * floor, against the rounded outer corners and the straight walls. A
 * chamfered mouth is wider by the chamfer, so that is the radius checked at
 * the mouth. For a row that fails, the largest passing corner radius is
 * found by stepping down in 0.5 mm steps, the corner radius field's own
 * step.
 *
 * When even a square corner (radius 0) does not clear, the straight wall
 * itself is too close: no corner radius fixes that, so a smaller corner
 * radius is never offered as the fix. Instead the tilt is stepped down, in
 * whole degrees, to find the largest tilt that clears at the field's own
 * corner radius; if no tilt helps, the bore depth is stepped down, in
 * 0.5 mm steps, the same way.
 */
function findCornerConflicts(
  parameters: MarkerCupBlockParameters,
  rowLayouts: PitchResult[],
  rowSpacing: PitchResult,
  count: number,
  diameter: number,
  tiltRadians: number,
): CornerConflict[] {
  if (!rowSpacing.ok || !Number.isFinite(parameters.cornerRadius)) return [];
  const mouthExtra = chamferExtraFor(parameters);
  const radius = diameter / 2;
  const conflicts: CornerConflict[] = [];

  rowLayouts.forEach((rowLayout, index) => {
    if (!rowLayout.ok) return;
    const xEnds = [
      rowLayout.firstCenter,
      rowLayout.firstCenter + (count - 1) * rowLayout.pitch,
    ];
    const clears = (cornerRadius: number) =>
      clearsOuterWallAt(
        parameters,
        radius,
        mouthExtra,
        parameters.boreDepth,
        tiltRadians,
        rowSpacing,
        index,
        xEnds,
        cornerRadius,
      );
    if (clears(parameters.cornerRadius)) return;

    if (clears(0)) {
      let maximumCornerRadius = Math.floor(parameters.cornerRadius * 2) / 2;
      while (maximumCornerRadius > 0 && !clears(maximumCornerRadius)) {
        maximumCornerRadius -= 0.5;
      }
      conflicts.push({
        row: index + 1,
        maximumCornerRadius: Math.max(0, maximumCornerRadius),
      });
      return;
    }

    // The straight wall itself is too close; a rounder or squarer corner
    // makes no difference. Look for a smaller tilt that clears instead,
    // re-solving the row spacing at each candidate, since the row-to-row
    // web depends on the tilted mouth's own width.
    let maximumTiltDegrees: number | null = null;
    for (
      let candidate = Math.ceil(parameters.tiltDegrees) - 1;
      candidate >= 0;
      candidate -= 1
    ) {
      const candidateTiltRadians = candidate * DEGREES_TO_RADIANS;
      const candidateSpacing = solvePitch({
        span: parameters.blockDepth - parameters.wallThickness * 2,
        count: rowLayouts.length,
        cutterSize: 2 * boreMouthSemiAxes(radius, candidateTiltRadians).semiY,
        minimumWeb: MINIMUM_WEB_MM,
      });
      if (!candidateSpacing.ok) continue;
      if (
        clearsOuterWallAt(
          parameters,
          radius,
          mouthExtra,
          parameters.boreDepth,
          candidateTiltRadians,
          candidateSpacing,
          index,
          xEnds,
          parameters.cornerRadius,
        )
      ) {
        maximumTiltDegrees = candidate;
        break;
      }
    }
    if (maximumTiltDegrees !== null) {
      conflicts.push({
        row: index + 1,
        maximumCornerRadius: 0,
        maximumTiltDegrees,
      });
      return;
    }

    // Even upright does not clear: the tilt was never the cause. Try a
    // shallower bore instead, at the field's own tilt and corner radius;
    // only the floor's position depends on depth, not the mouth.
    let maximumBoreDepth: number | null = null;
    for (
      let candidate = Math.floor((parameters.boreDepth - 0.5) * 2) / 2;
      candidate >= 0;
      candidate -= 0.5
    ) {
      if (
        clearsOuterWallAt(
          parameters,
          radius,
          mouthExtra,
          candidate,
          tiltRadians,
          rowSpacing,
          index,
          xEnds,
          parameters.cornerRadius,
        )
      ) {
        maximumBoreDepth = candidate;
        break;
      }
    }
    conflicts.push({
      row: index + 1,
      maximumCornerRadius: 0,
      maximumTiltDegrees: null,
      maximumBoreDepth,
    });
  });
  return conflicts;
}
