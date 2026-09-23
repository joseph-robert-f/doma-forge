import { defaultSurfaceTreatments, surfaceTreatmentSpec } from "../../surface-patterns";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The outer wall a bin needs before it may carry another bin. */
export const MINIMUM_STACKING_WALL_MM = 1.6;
/**
 * The material the outer wall keeps around the underside recess. The lip
 * wall and the two clearances take the rest of the wall:
 * `lipWallThickness + 2 x stackClearance <= wallThickness - 0.8`.
 */
export const RECESS_WALL_RESERVE_MM = 0.8;

/** The label ledge is one boolean. These constants set its shape. */
export const LABEL_LEDGE_SHELF_MM = 1.6;
export const LABEL_LEDGE_SLOT_MM = 1.6;
export const LABEL_LEDGE_UPSTAND_MM = 1.2;
export const LABEL_LEDGE_PROJECTION_MM =
  LABEL_LEDGE_SLOT_MM + LABEL_LEDGE_UPSTAND_MM;
export const LABEL_LEDGE_HEIGHT_MM = 6;
/** The ledge keeps this much flat front face at each end, or the corner radius. */
export const LABEL_LEDGE_SIDE_INSET_MM = 2;

/** The front scoop is one boolean. These constants set its radius. */
export const SCOOP_MINIMUM_RADIUS_MM = 1.5;
export const SCOOP_MAXIMUM_RADIUS_MM = 12;
export const SCOOP_WIDTH_FRACTION = 0.075;
/** Wall the scoop leaves above the base. */
export const SCOOP_BASE_MARGIN_MM = 2;

/** Wall the bin keeps above the base, so the cavity is always usable. */
export const MINIMUM_WALL_ABOVE_BASE_MM = 4;

export const PARTS_BIN_SPECS = {
  binWidth: {
    kind: "number",
    label: "Bin width",
    shortLabel: "Width",
    min: 60,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  binDepth: {
    kind: "number",
    label: "Bin depth",
    shortLabel: "Depth",
    min: 60,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  binHeight: {
    kind: "number",
    label: "Bin height",
    shortLabel: "Height",
    min: 25,
    max: 200,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  stacking: {
    kind: "boolean",
    label: "Stacking lip",
    description:
      "A lip on the top rim and a matching recess in the underside. Two equal bins stack. Turn it off for a plain bin.",
  } satisfies BooleanSpec,
  lipHeight: {
    kind: "number",
    label: "Lip height",
    shortLabel: "Lip height",
    min: 2,
    max: 10,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  lipWallThickness: {
    kind: "number",
    label: "Lip wall thickness",
    shortLabel: "Lip wall",
    min: 0.8,
    max: 3,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  stackClearance: {
    kind: "number",
    label: "Stacking clearance per side",
    shortLabel: "Stack clearance",
    min: 0.1,
    max: 1,
    step: 0.05,
    unit: "mm",
  } satisfies NumberSpec,
  frontScoop: {
    kind: "boolean",
    label: "Front scoop",
    description: "A round notch in the front rim. It opens the bin for a hand.",
  } satisfies BooleanSpec,
  labelLedge: {
    kind: "boolean",
    label: "Front label ledge",
    description: `A ${LABEL_LEDGE_SLOT_MM} mm slot at the front foot. A card slides into it.`,
  } satisfies BooleanSpec,
  wallThickness: {
    kind: "number",
    label: "Outer wall thickness",
    shortLabel: "Outer walls",
    min: 1.2,
    max: 4,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  baseThickness: {
    kind: "number",
    label: "Base thickness",
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
  meshQuality: {
    kind: "enum",
    label: "Mesh quality",
    options: [
      { value: "draft", label: "Draft" },
      { value: "standard", label: "Standard" },
      { value: "fine", label: "Fine" },
    ],
    hint: "Standard balances round corners with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
  surfaceTreatments: surfaceTreatmentSpec([
      { id: "floor", label: "Floor", description: "Open the bin floor." },
      { id: "walls", label: "Walls", description: "Open usable body wall panels." },
    ]),
} as const;

export type PartsBinSpecs = typeof PARTS_BIN_SPECS;
export type PartsBinParameters = ParametersOf<PartsBinSpecs>;
export type PartsBinKey = keyof PartsBinSpecs & string;

export const PARTS_BIN_DEFAULTS: PartsBinParameters = {
  binWidth: 150,
  binDepth: 100,
  binHeight: 70,
  stacking: true,
  lipHeight: 4,
  lipWallThickness: 1.2,
  stackClearance: 0.3,
  frontScoop: true,
  labelLedge: true,
  wallThickness: 3.4,
  baseThickness: 3,
  cornerRadius: 3,
  meshQuality: "standard",
  surfaceTreatments: defaultSurfaceTreatments(PARTS_BIN_SPECS.surfaceTreatments),
};

export const PARTS_BIN_GROUPS: ParameterGroup<PartsBinKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description:
      "The outside of the bin body. Measure the shelf, then divide it into whole bins.",
    keys: ["binWidth", "binDepth", "binHeight"],
  },
  {
    id: "stack",
    index: "02",
    title: "Stack",
    description:
      "The lip and the recess. The clearance is the gap on each side of the lip.",
    keys: ["stacking", "lipHeight", "lipWallThickness", "stackClearance"],
  },
  {
    id: "front",
    index: "03",
    title: "Front",
    description: "The open front of the bin.",
    keys: ["frontScoop", "labelLedge"],
  },
  {
    id: "construction",
    index: "04",
    title: "Construction",
    description: "The walls, the base, the corners, and the curve detail.",
    keys: ["wallThickness", "baseThickness", "cornerRadius", "meshQuality"],
  },
  {
    id: "surface",
    index: "05",
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

/**
 * A rectangular ring, centered on the origin, between two rounded
 * rectangles. The lip is one ring of material. The recess is one ring of
 * removed material. A corner radius here is the radius the profile builder
 * receives; a negative value becomes a square corner, which only makes the
 * ring wider at that corner.
 */
export interface RingFrame {
  outerHalfWidth: number;
  outerHalfDepth: number;
  outerCornerRadius: number;
  innerHalfWidth: number;
  innerHalfDepth: number;
  innerCornerRadius: number;
  bottomZ: number;
  topZ: number;
}

export interface PartsBinLayout {
  /** The outside of the bin body, without the lip and without the ledge. */
  bodyWidth: number;
  bodyDepth: number;
  bodyHeight: number;
  /** The bounding box of the whole model, the lip and the ledge included. */
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  /** How far the label ledge stands in front of the bin. Zero when it is off. */
  ledgeProjection: number;
  /** How much height one more bin adds to a stack. */
  stackPitch: number;
  insideWidth: number;
  insideDepth: number;
  insideHeight: number;
  /** How far the lip stands inside the outer face, on every side. */
  lipOffset: number;
  /** The lip of this bin, in this bin's own coordinates. Null without the lip. */
  lip: RingFrame | null;
  /** The recess in the underside of this bin. Null without the lip. */
  recess: RingFrame | null;
  /** Wall left over after the lip wall and the two clearances. */
  wallRemainder: number;
  /** Half of the leftover wall: the material on each side of the recess. */
  wallBesideRecess: number;
  /** The largest lip wall the outer wall and the clearance allow. */
  maximumLipWall: number;
  /** The smallest outer wall this lip wall and this clearance allow. */
  minimumWall: number;
  /** The largest stacking clearance this outer wall and this lip wall allow. */
  maximumClearance: number;
  /** The front scoop radius. Zero when the scoop is off. */
  scoopRadius: number;
  /** How wide the label ledge is along X. Zero when the ledge is off. */
  ledgeWidth: number;
  /** False when a field is cleared, or when the lip does not fit the wall. */
  fits: boolean;
}

function ringFrame(
  halfWidth: number,
  halfDepth: number,
  cornerRadius: number,
  outerOffset: number,
  bandWidth: number,
  bottomZ: number,
  topZ: number,
): RingFrame {
  return {
    outerHalfWidth: halfWidth - outerOffset,
    outerHalfDepth: halfDepth - outerOffset,
    outerCornerRadius: cornerRadius - outerOffset,
    innerHalfWidth: halfWidth - outerOffset - bandWidth,
    innerHalfDepth: halfDepth - outerOffset - bandWidth,
    innerCornerRadius: cornerRadius - outerOffset - bandWidth,
    bottomZ,
    topZ,
  };
}

/**
 * The front scoop radius. It follows the drawer tray's rule: a fraction of
 * the width, capped at 12 mm, and always far enough above the base.
 */
export function scoopRadius(parameters: PartsBinParameters): number {
  if (!parameters.frontScoop) return 0;
  const wallAboveBase = parameters.binHeight - parameters.baseThickness;
  if (
    !Number.isFinite(parameters.binWidth) ||
    !Number.isFinite(wallAboveBase)
  ) {
    return Number.NaN;
  }
  return Math.max(
    SCOOP_MINIMUM_RADIUS_MM,
    Math.min(
      SCOOP_MAXIMUM_RADIUS_MM,
      parameters.binWidth * SCOOP_WIDTH_FRACTION,
      wallAboveBase - SCOOP_BASE_MARGIN_MM,
    ),
  );
}

/**
 * Solves the whole bin from the parameters. Pure, and it never throws: a
 * cleared field holds NaN until the user types again, and the layout then
 * reports `fits: false` with NaN sizes. The form calls `derive` on every
 * keystroke, so a throw here would take the page down.
 */
export function deriveLayout(parameters: PartsBinParameters): PartsBinLayout {
  const width = parameters.binWidth;
  const depth = parameters.binDepth;
  const height = parameters.binHeight;
  const wall = parameters.wallThickness;
  const base = parameters.baseThickness;
  const corner = parameters.cornerRadius;
  const stacking = parameters.stacking === true;
  const clearance = parameters.stackClearance;
  const lipWall = parameters.lipWallThickness;
  const lipHeight = stacking ? parameters.lipHeight : 0;

  const sizesOk = [width, depth, height, wall, base, corner].every((value) =>
    Number.isFinite(value),
  );
  const lipValuesOk = [clearance, lipWall, parameters.lipHeight].every(
    (value) => Number.isFinite(value),
  );
  const buildsLip = stacking && sizesOk && lipValuesOk;

  const lipOffset = buildsLip ? (wall - lipWall) / 2 : Number.NaN;
  const wallRemainder =
    stacking && lipValuesOk ? wall - lipWall - clearance * 2 : Number.NaN;
  const maximumLipWall =
    stacking && lipValuesOk
      ? wall - RECESS_WALL_RESERVE_MM - clearance * 2
      : Number.NaN;
  const minimumWall =
    stacking && lipValuesOk
      ? lipWall + clearance * 2 + RECESS_WALL_RESERVE_MM
      : Number.NaN;
  const maximumClearance =
    stacking && lipValuesOk
      ? (wall - RECESS_WALL_RESERVE_MM - lipWall) / 2
      : Number.NaN;

  const lip = buildsLip
    ? ringFrame(
        width / 2,
        depth / 2,
        corner,
        lipOffset,
        lipWall,
        height,
        height + lipHeight,
      )
    : null;
  const recess = buildsLip
    ? ringFrame(
        width / 2,
        depth / 2,
        corner,
        lipOffset - clearance,
        lipWall + clearance * 2,
        0,
        lipHeight + clearance,
      )
    : null;

  const ledgeProjection = parameters.labelLedge ? LABEL_LEDGE_PROJECTION_MM : 0;
  const ledgeWidth = parameters.labelLedge
    ? width - Math.max(corner, LABEL_LEDGE_SIDE_INSET_MM) * 2
    : 0;

  const fits =
    sizesOk &&
    (!stacking ||
      (lipValuesOk &&
        wall + 1e-9 >= MINIMUM_STACKING_WALL_MM &&
        wallRemainder + 1e-9 >= RECESS_WALL_RESERVE_MM));

  return {
    bodyWidth: width,
    bodyDepth: depth,
    bodyHeight: height,
    outsideWidth: width,
    outsideDepth: depth + ledgeProjection,
    outsideHeight: height + lipHeight,
    ledgeProjection,
    stackPitch: height,
    insideWidth: width - wall * 2,
    insideDepth: depth - wall * 2,
    insideHeight: height - base,
    lipOffset,
    lip,
    recess,
    wallRemainder,
    wallBesideRecess: wallRemainder / 2,
    maximumLipWall,
    minimumWall,
    maximumClearance,
    scoopRadius: scoopRadius(parameters),
    ledgeWidth,
    fits,
  };
}

/**
 * The recess of an identical bin that sits on this one, in this bin's
 * coordinates. Two bins stack when this frame encloses `layout.lip` with the
 * stacking clearance on every side. Returns null without the lip.
 */
export function stackedRecessFrame(layout: PartsBinLayout): RingFrame | null {
  if (!layout.recess) return null;
  return {
    ...layout.recess,
    bottomZ: layout.recess.bottomZ + layout.stackPitch,
    topZ: layout.recess.topZ + layout.stackPitch,
  };
}

/** The gap on each side between the lip of a bin and the recess above it. */
export interface StackFitClearances {
  /** Between the outer face of the lip and the outer wall of the recess. */
  outerWidth: number;
  outerDepth: number;
  outerCorner: number;
  /** Between the inner face of the lip and the inner wall of the recess. */
  innerWidth: number;
  innerDepth: number;
  innerCorner: number;
  /** Between the top of the lip and the roof of the recess. */
  top: number;
  /** Between the bottom of the lip and the mouth of the recess. Zero: the rims meet. */
  bottom: number;
}

/**
 * Measures the fit of one bin on an identical bin, from the pure layout
 * alone. Every value must equal the stacking clearance, except `bottom`:
 * the two rims meet there, which is the seat of the stack.
 */
export function stackFitClearances(
  layout: PartsBinLayout,
): StackFitClearances | null {
  const lip = layout.lip;
  const recess = stackedRecessFrame(layout);
  if (!lip || !recess) return null;
  return {
    outerWidth: recess.outerHalfWidth - lip.outerHalfWidth,
    outerDepth: recess.outerHalfDepth - lip.outerHalfDepth,
    outerCorner: recess.outerCornerRadius - lip.outerCornerRadius,
    innerWidth: lip.innerHalfWidth - recess.innerHalfWidth,
    innerDepth: lip.innerHalfDepth - recess.innerHalfDepth,
    innerCorner: lip.innerCornerRadius - recess.innerCornerRadius,
    top: recess.topZ - lip.topZ,
    bottom: lip.bottomZ - recess.bottomZ,
  };
}
