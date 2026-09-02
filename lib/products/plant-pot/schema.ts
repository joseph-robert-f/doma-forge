import {
  REVOLVE_SEGMENTS,
  buildVesselProfile,
  rimArcSegments,
  type VesselProfile,
} from "../../kernel/revolve";
import type {
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/**
 * The widest the pot may be. The plan's rule for the saucer is "the bed less
 * 12 mm", and the pot and the saucer are a pair, so the pot takes the same
 * limit. A product cannot read the printer profile, so the number comes from
 * the profile default bed of 220 mm. See 23_REVOLVED_FORMS_NOTES.md, D-1503.
 */
export const POT_BED_WIDTH_MM = 220;
export const POT_BED_MARGIN_MM = 12;
export const POT_MAXIMUM_DIAMETER_MM = POT_BED_WIDTH_MM - POT_BED_MARGIN_MM;

/** The plan's print-risk rule for this product: the wall stays under 45 degrees. */
export const POT_MAXIMUM_WALL_ANGLE_DEGREES = 45;

/** Material that must stay between a drainage hole and the wall, or between two holes. */
export const DRAIN_WEB_MM = 2.5;

/** The saucer floor is this much wider than the pot base it holds. */
export const SAUCER_GAP_MM = 2;

export const PLANT_POT_SPECS = {
  baseDiameter: {
    kind: "number",
    label: "Outside diameter at the base",
    shortLabel: "Base diameter",
    min: 50,
    max: 200,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  potHeight: {
    kind: "number",
    label: "Pot height",
    shortLabel: "Height",
    min: 40,
    max: 220,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  wallAngleDegrees: {
    kind: "number",
    label: "Wall angle from vertical",
    shortLabel: "Wall angle",
    min: 0,
    max: POT_MAXIMUM_WALL_ANGLE_DEGREES,
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
  drainHoles: {
    kind: "number",
    label: "Drainage holes",
    shortLabel: "Holes",
    min: 1,
    max: 8,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  drainHoleDiameter: {
    kind: "number",
    label: "Drainage hole diameter",
    shortLabel: "Hole",
    min: 4,
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
    label: "Base thickness",
    shortLabel: "Base",
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
    hint: "Standard gives 96 segments around the pot.",
  } satisfies EnumSpec<MeshQuality>,
} as const;

export type PlantPotSpecs = typeof PLANT_POT_SPECS;
export type PlantPotParameters = ParametersOf<PlantPotSpecs>;
export type PlantPotKey = keyof PlantPotSpecs & string;

export const PLANT_POT_DEFAULTS: PlantPotParameters = {
  baseDiameter: 120,
  potHeight: 130,
  wallAngleDegrees: 6,
  rimRadius: 1,
  drainHoles: 4,
  drainHoleDiameter: 6,
  wallThickness: 2.2,
  baseThickness: 3,
  meshQuality: "standard",
};

export const PLANT_POT_GROUPS: ParameterGroup<PlantPotKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description:
      "The base sits on the saucer. The wall opens upward, so the rim is wider than the base.",
    keys: ["baseDiameter", "potHeight", "wallAngleDegrees", "rimRadius"],
  },
  {
    id: "drainage",
    index: "02",
    title: "Drainage",
    description:
      "The holes go through the flat base only. They never cut the wall. Each hole bridges its own diameter, so the range stops at 8 mm.",
    keys: ["drainHoles", "drainHoleDiameter"],
  },
  {
    id: "construction",
    index: "03",
    title: "Construction",
    description: "The wall, the base, and the mesh.",
    keys: ["wallThickness", "baseThickness", "meshQuality"],
  },
];

/** Segments in one revolution, per mesh quality. */
export const QUALITY_SEGMENTS = REVOLVE_SEGMENTS;

export interface PlantPotLayout {
  /** The revolved profile, or null when the numbers do not make a pot. */
  profile: VesselProfile | null;
  /** The widest outside diameter. It sits at the top of the wall. */
  widestDiameter: number;
  /** The clear radius of the flat base inside the wall. */
  innerFloorRadius: number;
  /** Depth from the top of the base to the top of the pot. */
  insideDepth: number;
  /** The circle the drainage holes sit on. Zero for a single center hole. */
  drainCircleRadius: number;
  /** Material between a hole and the wall. */
  wallWeb: number;
  /** Material between two neighbouring holes. Infinity for a single hole. */
  neighbourWeb: number;
  /** The saucer floor diameter that matches this pot. */
  saucerInnerDiameter: number;
  /** The bead radius after the kernel clamp. */
  rimRadius: number;
  /** True when the clamp reduced the requested bead radius. */
  rimRadiusClamped: boolean;
}

/**
 * Solves the whole pot from the parameters. Pure. It never throws: a cleared
 * field holds NaN until the user types again, and the layout then reports a
 * null profile and NaN webs so validation and the derived values can say so.
 */
export function derivePotLayout(
  parameters: PlantPotParameters,
  segments: number = QUALITY_SEGMENTS.standard,
): PlantPotLayout {
  const profile = buildVesselProfile({
    outerRadiusAtBase: parameters.baseDiameter / 2,
    height: parameters.potHeight,
    wallThickness: parameters.wallThickness,
    baseThickness: parameters.baseThickness,
    taperDegrees: parameters.wallAngleDegrees,
    rimRadius: parameters.rimRadius,
    rimSegments: rimArcSegments(segments),
  });
  const innerFloorRadius = profile ? profile.innerRadiusAtFloor : Number.NaN;
  const holes = Number.isInteger(parameters.drainHoles)
    ? Math.max(1, parameters.drainHoles)
    : 1;
  const holeRadius = parameters.drainHoleDiameter / 2;
  const drainCircleRadius = holes === 1 ? 0 : innerFloorRadius / 2;
  const wallWeb = innerFloorRadius - drainCircleRadius - holeRadius;
  const neighbourWeb =
    holes === 1
      ? Number.POSITIVE_INFINITY
      : 2 * drainCircleRadius * Math.sin(Math.PI / holes) -
        parameters.drainHoleDiameter;
  return {
    profile,
    widestDiameter: profile ? profile.maximumRadius * 2 : Number.NaN,
    innerFloorRadius,
    insideDepth: parameters.potHeight - parameters.baseThickness,
    drainCircleRadius,
    wallWeb,
    neighbourWeb,
    saucerInnerDiameter: parameters.baseDiameter + SAUCER_GAP_MM,
    rimRadius: profile ? profile.rimRadius : Number.NaN,
    rimRadiusClamped: profile ? profile.rimRadiusClamped : false,
  };
}

/** The center of each drainage hole, in millimeters, on the XY plane. */
export function drainHoleCenters(layout: PlantPotLayout, holes: number): Array<[number, number]> {
  if (holes <= 1) return [[0, 0]];
  const centers: Array<[number, number]> = [];
  for (let index = 0; index < holes; index += 1) {
    const angle = (2 * Math.PI * index) / holes;
    centers.push([
      layout.drainCircleRadius * Math.cos(angle),
      layout.drainCircleRadius * Math.sin(angle),
    ]);
  }
  return centers;
}
