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

/** The most rows a tray can hold. One bore-diameter field exists per row. */
export const SOCKET_TRAY_MAX_ROWS = 4;
/** Material that must stay between two bores and around the array. */
export const MINIMUM_WEB_MM = 2.5;
/** The 45 degree lead-in at the mouth of a chamfered bore. */
export const CHAMFER_MM = 0.8;
/** Underside pocket rules. A pocket ceiling is a bridge; keep it short. */
export const LIGHTENING_MAXIMUM_SPAN_MM = 40;
export const LIGHTENING_WEB_MM = 2.5;
export const LIGHTENING_POCKET_RADIUS_MM = 2;

const boreDiameterSpec = (row: number): NumberSpec => ({
  kind: "number",
  label: `Row ${row} bore diameter`,
  shortLabel: `Row ${row} bore`,
  min: 5,
  max: 40,
  step: 0.1,
  unit: "mm",
});

export const SOCKET_TRAY_SPECS = {
  trayWidth: {
    kind: "number",
    label: "Tray width",
    shortLabel: "Width",
    min: 60,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  trayDepth: {
    kind: "number",
    label: "Tray depth",
    shortLabel: "Depth",
    min: 40,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  trayHeight: {
    kind: "number",
    label: "Tray height",
    shortLabel: "Height",
    min: 10,
    max: 60,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  rows: {
    kind: "number",
    label: "Bore rows",
    shortLabel: "Rows",
    min: 1,
    max: SOCKET_TRAY_MAX_ROWS,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  holesPerRow: {
    kind: "number",
    label: "Bores per row",
    shortLabel: "Bores per row",
    min: 1,
    max: 12,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  boreDepth: {
    kind: "number",
    label: "Bore depth",
    shortLabel: "Bore depth",
    min: 3,
    max: 55,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  chamfer: {
    kind: "boolean",
    label: "Chamfered bore mouths",
    description: `A ${CHAMFER_MM} mm lead-in at the top of every bore.`,
  } satisfies BooleanSpec,
  boreDiameter1: boreDiameterSpec(1),
  boreDiameter2: boreDiameterSpec(2),
  boreDiameter3: boreDiameterSpec(3),
  boreDiameter4: boreDiameterSpec(4),
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
    hint: "Standard balances round bores with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
} as const;

export type SocketTraySpecs = typeof SOCKET_TRAY_SPECS;
export type SocketTrayParameters = ParametersOf<SocketTraySpecs>;
export type SocketTrayKey = keyof SocketTraySpecs & string;

export const SOCKET_TRAY_DEFAULTS: SocketTrayParameters = {
  trayWidth: 200,
  trayDepth: 110,
  trayHeight: 25,
  rows: 2,
  holesPerRow: 8,
  boreDepth: 18,
  chamfer: true,
  boreDiameter1: 13,
  boreDiameter2: 17,
  boreDiameter3: 22,
  boreDiameter4: 27,
  wallThickness: 2,
  baseThickness: 2.4,
  cornerRadius: 3,
  lightenUnderside: true,
  meshQuality: "standard",
};

export const SOCKET_TRAY_GROUPS: ParameterGroup<SocketTrayKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description: "The outside of the tray. Measure the space it goes into.",
    keys: ["trayWidth", "trayDepth", "trayHeight"],
  },
  {
    id: "bores",
    index: "02",
    title: "Bores",
    description: "Rows run front to back. Row 1 is at the front.",
    keys: ["rows", "holesPerRow", "boreDepth", "chamfer"],
  },
  {
    id: "diameters",
    index: "03",
    title: "Bore diameters",
    description:
      "One diameter per row. Measure the widest item in the row and add your clearance. A row above the row count is not built.",
    keys: ["boreDiameter1", "boreDiameter2", "boreDiameter3", "boreDiameter4"],
  },
  {
    id: "construction",
    index: "04",
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
  /** The largest corner radius that keeps this bore inside the wall, in whole 0.5 mm steps. */
  maximumCornerRadius: number;
}

/**
 * True when a bore of `radius` centered at (`x`, `y`) stays inside the
 * rounded outer profile with at least `wall` of material. Only the corner
 * region needs the check; the straight sides are covered by the inner
 * rectangle the layout is solved in.
 */
export function boreClearsCorner(
  x: number,
  y: number,
  radius: number,
  width: number,
  depth: number,
  cornerRadius: number,
  wall: number,
): boolean {
  const dx = Math.max(0, Math.abs(x) - (width / 2 - cornerRadius));
  const dy = Math.max(0, Math.abs(y) - (depth / 2 - cornerRadius));
  if (dx === 0 || dy === 0) return true;
  return Math.hypot(dx, dy) + radius + wall <= cornerRadius + 1e-9;
}

export interface SocketTrayLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  /** The span inside the rim on each axis. */
  innerWidth: number;
  innerDepth: number;
  /** One diameter per built row, front to back. */
  rowDiameters: number[];
  /** The bore layout along X for each built row. */
  rowLayouts: PitchResult[];
  /** The row layout along Y, solved for the widest bore. */
  rowSpacing: PitchResult;
  /** Material under the bore floors: the base when pockets exist, else the whole slab below the floor. */
  baseUnderBores: number;
  /** The bores that a large outer corner radius would cut open; empty when every bore is inside the wall. */
  cornerConflicts: CornerConflict[];
  /** How far an underside pocket may go up before it reaches the base. */
  pocketDepth: number;
  /** The pocket grid, or null when the tray gets no pockets. */
  lightening: LighteningPlan | null;
}

/** The bore diameters of the rows that are built, in row order. */
export function activeRowDiameters(parameters: SocketTrayParameters): number[] {
  const all = [
    parameters.boreDiameter1,
    parameters.boreDiameter2,
    parameters.boreDiameter3,
    parameters.boreDiameter4,
  ];
  const rows = Number.isInteger(parameters.rows)
    ? Math.min(Math.max(parameters.rows, 1), SOCKET_TRAY_MAX_ROWS)
    : 1;
  return all.slice(0, rows);
}

export function lighteningOptions(parameters: SocketTrayParameters, segments: number) {
  return {
    width: parameters.trayWidth,
    depth: parameters.trayDepth,
    cornerRadius: parameters.cornerRadius,
    rim: parameters.wallThickness,
    pocketDepth:
      parameters.trayHeight - parameters.boreDepth - parameters.baseThickness,
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
export function deriveLayout(parameters: SocketTrayParameters): SocketTrayLayout {
  const innerWidth = parameters.trayWidth - parameters.wallThickness * 2;
  const innerDepth = parameters.trayDepth - parameters.wallThickness * 2;
  const rowDiameters = activeRowDiameters(parameters);
  const count = Number.isInteger(parameters.holesPerRow)
    ? Math.max(1, parameters.holesPerRow)
    : 1;
  const safeDiameter = (diameter: number) =>
    Number.isFinite(diameter) && diameter > 0 ? diameter : 1;
  // A cleared field holds NaN until the user types again. The layout then
  // reports "does not fit" instead of asking the solver for a NaN span.
  const solvable = Number.isFinite(innerWidth) && Number.isFinite(innerDepth);
  const unsolved = (): PitchResult => ({
    ok: false,
    web: Number.NaN,
    minimumWeb: MINIMUM_WEB_MM,
  });
  const rowLayouts = rowDiameters.map((diameter) =>
    solvable
      ? solvePitch({
          span: innerWidth,
          count,
          cutterSize: safeDiameter(diameter),
          minimumWeb: MINIMUM_WEB_MM,
        })
      : unsolved(),
  );
  const rowSpacing = solvable
    ? solvePitch({
        span: innerDepth,
        count: rowDiameters.length,
        cutterSize: safeDiameter(Math.max(...rowDiameters)),
        minimumWeb: MINIMUM_WEB_MM,
      })
    : unsolved();
  const pocketDepth =
    parameters.trayHeight - parameters.boreDepth - parameters.baseThickness;
  const lightening = parameters.lightenUnderside
    ? planLightening(lighteningOptions(parameters, QUALITY_SEGMENTS.standard))
    : null;
  const cornerConflicts = findCornerConflicts(
    parameters,
    rowDiameters,
    rowLayouts,
    rowSpacing,
    count,
  );
  return {
    outsideWidth: parameters.trayWidth,
    outsideDepth: parameters.trayDepth,
    outsideHeight: parameters.trayHeight,
    innerWidth,
    innerDepth,
    rowDiameters,
    rowLayouts,
    rowSpacing,
    baseUnderBores: lightening
      ? parameters.baseThickness
      : parameters.trayHeight - parameters.boreDepth,
    pocketDepth,
    lightening,
    cornerConflicts,
  };
}

/**
 * Checks the end bores of every row against the rounded outer corners. A
 * chamfered mouth is wider by the chamfer, so that is the radius checked.
 * For a row that fails, the largest passing corner radius is found by
 * stepping down in 0.5 mm steps, the corner radius field's own step.
 */
function findCornerConflicts(
  parameters: SocketTrayParameters,
  rowDiameters: number[],
  rowLayouts: PitchResult[],
  rowSpacing: PitchResult,
  count: number,
): CornerConflict[] {
  if (!rowSpacing.ok || !Number.isFinite(parameters.cornerRadius)) return [];
  const mouthExtra = parameters.chamfer ? CHAMFER_MM : 0;
  const conflicts: CornerConflict[] = [];
  rowLayouts.forEach((rowLayout, index) => {
    if (!rowLayout.ok) return;
    const radius = rowDiameters[index] / 2 + mouthExtra;
    const y = rowSpacing.firstCenter + index * rowSpacing.pitch;
    const xEnds = [rowLayout.firstCenter, rowLayout.firstCenter + (count - 1) * rowLayout.pitch];
    const clears = (cornerRadius: number) =>
      xEnds.every((x) =>
        boreClearsCorner(
          x,
          y,
          radius,
          parameters.trayWidth,
          parameters.trayDepth,
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
