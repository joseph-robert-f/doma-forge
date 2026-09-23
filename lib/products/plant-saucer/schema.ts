import { defaultSurfaceTreatments, surfaceTreatmentSpec } from "../../surface-patterns";
import type { BedLimit, PrintContext } from "../../printer-profile";
import {
  REVOLVE_SEGMENTS,
  buildVesselProfile,
  rimArcSegments,
  type VesselProfile,
} from "../../kernel/vessel-profile";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/**
 * The largest inner diameter the app offers. The plan's rule is "the bed less
 * 12 mm". The field limit is static, so the number comes from the profile
 * default bed of 220 mm; validation reads the saved bed (S14, D-1802). See 23_REVOLVED_FORMS_NOTES.md, D-1503.
 */
export const SAUCER_BED_WIDTH_MM = 220;
export const SAUCER_BED_MARGIN_MM = 12;
export const SAUCER_MAXIMUM_INNER_DIAMETER_MM =
  SAUCER_BED_WIDTH_MM - SAUCER_BED_MARGIN_MM;

/** A lift rib crosses the whole floor through the center. This is its width. */
export const RIB_WIDTH_MM = 3;
/** The chord the overflow notch cuts through the rim. */
export const NOTCH_WIDTH_MM = 12;
/** The deepest an overflow notch cuts down from the top of the rim. */
export const NOTCH_MAXIMUM_DEPTH_MM = 4;
/** Material that must stay above a lift rib, under the rim. */
export const RIB_HEADROOM_MM = 1;
/** The least water depth a saucer is built with. */
export const MINIMUM_HOLDING_DEPTH_MM = 3;

/**
 * The widest a saucer may be across the rim. With a known bed it is the
 * smaller bed axis less the margin; otherwise the 220 mm reference bed
 * (D-1802). Same shape as the pot's `maximumPotDiameter`.
 */
export function maximumSaucerDiameter(context?: PrintContext): BedLimit {
  const bed = context?.bed;
  const usable = Boolean(bed && Number.isFinite(bed.x) && Number.isFinite(bed.y));
  const bedWidth = usable && bed ? Math.min(bed.x, bed.y) : SAUCER_BED_WIDTH_MM;
  return { limit: bedWidth - SAUCER_BED_MARGIN_MM, bedWidth, known: usable };
}
/** The pot base is this much smaller than the saucer floor it sits on. */
export const POT_BASE_GAP_MM = 2;

export const PLANT_SAUCER_SPECS = {
  innerDiameter: {
    kind: "number",
    label: "Inner floor diameter",
    shortLabel: "Inner diameter",
    min: 60,
    max: SAUCER_MAXIMUM_INNER_DIAMETER_MM,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  rimHeight: {
    kind: "number",
    label: "Rim height",
    shortLabel: "Rim height",
    min: 8,
    max: 40,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  taperDegrees: {
    kind: "number",
    label: "Wall taper from vertical",
    shortLabel: "Taper",
    min: 3,
    max: 12,
    step: 0.5,
    unit: "",
  } satisfies NumberSpec,
  rimRadius: {
    kind: "number",
    label: "Rolled rim radius",
    shortLabel: "Rim radius",
    min: 0,
    max: 3,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  overflowNotch: {
    kind: "boolean",
    label: "Overflow notch",
    description: `A ${NOTCH_WIDTH_MM} mm notch in one side of the rim. Extra water leaves through the notch.`,
  } satisfies BooleanSpec,
  liftRibs: {
    kind: "number",
    label: "Lift ribs",
    shortLabel: "Ribs",
    min: 0,
    max: 6,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  ribHeight: {
    kind: "number",
    label: "Lift rib height",
    shortLabel: "Rib height",
    min: 1,
    max: 8,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  wallThickness: {
    kind: "number",
    label: "Wall thickness",
    shortLabel: "Wall",
    min: 1.6,
    max: 4,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  baseThickness: {
    kind: "number",
    label: "Floor thickness",
    shortLabel: "Floor",
    min: 1.6,
    max: 6,
    step: 0.1,
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
    hint: "Standard gives 96 segments around the saucer.",
  } satisfies EnumSpec<MeshQuality>,
  surfaceTreatments: surfaceTreatmentSpec([
      { id: "floor", label: "Floor", description: "Open the saucer floor. Water will drain through it." },
      { id: "wall", label: "Sloped wall", description: "Open the sloped sidewall. The saucer will no longer retain water." },
    ],
    "Patterns are real openings. The saucer will no longer retain water."),
} as const;

export type PlantSaucerSpecs = typeof PLANT_SAUCER_SPECS;
export type PlantSaucerParameters = ParametersOf<PlantSaucerSpecs>;
export type PlantSaucerKey = keyof PlantSaucerSpecs & string;

export const PLANT_SAUCER_DEFAULTS: PlantSaucerParameters = {
  innerDiameter: 160,
  rimHeight: 15,
  taperDegrees: 6,
  rimRadius: 1,
  overflowNotch: false,
  liftRibs: 2,
  ribHeight: 3,
  wallThickness: 2,
  baseThickness: 2.4,
  meshQuality: "standard",
  surfaceTreatments: defaultSurfaceTreatments(PLANT_SAUCER_SPECS.surfaceTreatments),
};

export const PLANT_SAUCER_GROUPS: ParameterGroup<PlantSaucerKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description:
      "The floor holds the pot. Measure the base of the pot and add 2 mm. The inner diameter stops at 208 mm, the 220 mm bed less 12 mm. The outside of the saucer must stay under the same 208 mm.",
    keys: ["innerDiameter", "rimHeight"],
  },
  {
    id: "rim",
    index: "02",
    title: "Rim",
    description:
      "The wall opens upward. The rolled rim is a bead that rolls inward, so the outside stays clear of overhangs.",
    keys: ["taperDegrees", "rimRadius", "overflowNotch"],
  },
  {
    id: "ribs",
    index: "03",
    title: "Lift ribs",
    description: `Each rib crosses the floor through the center and is ${RIB_WIDTH_MM} mm wide. The ribs hold the pot above the water. Set the count to 0 for a flat floor.`,
    keys: ["liftRibs", "ribHeight"],
  },
  {
    id: "construction",
    index: "04",
    title: "Construction",
    description: "The wall, the floor, and the mesh.",
    keys: ["wallThickness", "baseThickness", "meshQuality"],
  },
  {
    id: "surface",
    index: "05",
    title: "Surface",
    description: "Choose solid, holed, or mesh regions for this print.",
    keys: ["surfaceTreatments"],
  },
];

/** Segments in one revolution, per mesh quality. */
export const QUALITY_SEGMENTS = REVOLVE_SEGMENTS;

export interface PlantSaucerLayout {
  /** The revolved profile, or null when the numbers do not make a saucer. */
  profile: VesselProfile | null;
  /** Outer radius at Z = 0. */
  outerRadiusAtBase: number;
  /** The widest outside diameter. */
  outsideDiameter: number;
  /** The clear diameter of the floor, where the pot sits. */
  innerDiameter: number;
  /** The largest pot base this saucer takes. */
  potBaseDiameter: number;
  /** The narrowest clear diameter at the rim. */
  openingDiameter: number;
  /** The bead radius after the kernel clamp. */
  rimRadius: number;
  /** True when the clamp reduced the requested bead radius. */
  rimRadiusClamped: boolean;
  /** Depth of the overflow notch below the top of the rim. Zero when it is off. */
  notchDepth: number;
  /** Height of the floor of the overflow notch. */
  notchFloorZ: number;
  /** Water depth from the floor to the lowest point of the rim. */
  holdingDepth: number;
  /** Height of the top of a lift rib. */
  ribTopZ: number;
  /** The most a rib may stand above the floor. */
  maximumRibHeight: number;
  /** The least rim height these settings allow, notch included. */
  minimumRimHeight: number;
}

/**
 * The least rim height that leaves MINIMUM_HOLDING_DEPTH_MM of water above the
 * floor. Water stops at the notch floor, so the notch raises the answer:
 * solve `depth − min(NOTCH_MAXIMUM_DEPTH_MM, depth / 2) ≥ minimum` for the
 * cavity depth.
 */
export function minimumRimHeight(
  baseThickness: number,
  overflowNotch: boolean,
): number {
  if (!overflowNotch) return baseThickness + MINIMUM_HOLDING_DEPTH_MM;
  const shallow = 2 * MINIMUM_HOLDING_DEPTH_MM;
  const deep = MINIMUM_HOLDING_DEPTH_MM + NOTCH_MAXIMUM_DEPTH_MM;
  const depth = shallow <= 2 * NOTCH_MAXIMUM_DEPTH_MM ? shallow : deep;
  return baseThickness + depth;
}

/**
 * Solves the whole saucer from the parameters. Pure. It never throws: a
 * cleared field holds NaN until the user types again, and the layout then
 * reports a null profile so validation and the derived values can say so.
 */
export function deriveSaucerLayout(
  parameters: PlantSaucerParameters,
  segments: number = QUALITY_SEGMENTS.standard,
): PlantSaucerLayout {
  const radians = (parameters.taperDegrees * Math.PI) / 180;
  const horizontalWall = parameters.wallThickness / Math.cos(radians);
  // The user sets the floor diameter. The outer radius at Z = 0 follows the
  // same taper line back down to the bed.
  const outerRadiusAtBase =
    parameters.innerDiameter / 2 +
    horizontalWall -
    parameters.baseThickness * Math.tan(radians);
  const profile = buildVesselProfile({
    outerRadiusAtBase,
    height: parameters.rimHeight,
    wallThickness: parameters.wallThickness,
    baseThickness: parameters.baseThickness,
    taperDegrees: parameters.taperDegrees,
    rimRadius: parameters.rimRadius,
    rimSegments: rimArcSegments(segments),
  });
  const cavityDepth = parameters.rimHeight - parameters.baseThickness;
  const notchDepth = parameters.overflowNotch
    ? Math.min(NOTCH_MAXIMUM_DEPTH_MM, cavityDepth / 2)
    : 0;
  const notchFloorZ = parameters.rimHeight - notchDepth;
  return {
    profile,
    outerRadiusAtBase,
    outsideDiameter: profile ? profile.maximumRadius * 2 : Number.NaN,
    innerDiameter: parameters.innerDiameter,
    potBaseDiameter: parameters.innerDiameter - POT_BASE_GAP_MM,
    openingDiameter: profile ? profile.openingRadius * 2 : Number.NaN,
    rimRadius: profile ? profile.rimRadius : Number.NaN,
    rimRadiusClamped: profile ? profile.rimRadiusClamped : false,
    notchDepth,
    notchFloorZ,
    holdingDepth: notchFloorZ - parameters.baseThickness,
    ribTopZ: parameters.baseThickness + parameters.ribHeight,
    maximumRibHeight: cavityDepth - RIB_HEADROOM_MM,
    minimumRimHeight: minimumRimHeight(
      parameters.baseThickness,
      parameters.overflowNotch,
    ),
  };
}
