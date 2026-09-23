import { defaultSurfaceTreatments, surfaceTreatmentSpec } from "../../surface-patterns";
import {
  HOOK_MAXIMUM_PROJECTION_MM,
  HOOK_MINIMUM_ROOT_MM,
  HOOK_MINIMUM_WIDTH_MM,
  SCREW_MINIMUM_EDGE_MM,
  checkHookRule,
  type HookRuleResult,
} from "../../kernel/bracket-rules";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The fillet radius at the hook root and the pocket floor root. */
export const HOOK_FILLET_MM = 3;
/** The lip thickness at its top, on the hook and on the pocket. */
export const LIP_THICKNESS_MM = 3;
/** The pocket side wall thickness. */
export const POCKET_WALL_MM = 3;
/** Clearance between the band and the hook lip, along the projection. */
export const BAND_CLEARANCE_MM = 2;
/** Room above the hook lip, over the band, so the band slips on. */
export const BAND_SLIP_MM = 10;
/** Plate material beside the hook or the pocket, to the plate edge. */
export const SIDE_MARGIN_MM = 4;
/** The countersink diameter, as a multiple of the screw diameter. */
export const SCREW_HEAD_RATIO = 2;

export const HEADPHONE_MOUNT_SPECS = {
  plateWidth: {
    kind: "number",
    label: "Plate width",
    shortLabel: "Width",
    min: 60,
    max: 200,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  plateHeight: {
    kind: "number",
    label: "Plate height",
    shortLabel: "Height",
    min: 60,
    max: 250,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  plateThickness: {
    kind: "number",
    label: "Plate thickness",
    shortLabel: "Plate",
    min: 3,
    max: 8,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  hookWidth: {
    kind: "number",
    label: "Hook width",
    shortLabel: "Hook width",
    min: HOOK_MINIMUM_WIDTH_MM,
    max: 190,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  hookRoot: {
    kind: "number",
    label: "Hook root",
    shortLabel: "Root",
    min: HOOK_MINIMUM_ROOT_MM,
    max: 24,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  hookProjection: {
    kind: "number",
    label: "Hook projection",
    shortLabel: "Projection",
    min: 12,
    max: HOOK_MAXIMUM_PROJECTION_MM,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  hookLip: {
    kind: "number",
    label: "Hook lip height",
    shortLabel: "Lip",
    min: 4,
    max: 30,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  bandGauge: {
    kind: "number",
    label: "Headband thickness",
    shortLabel: "Band",
    min: 4,
    max: 40,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  controllerPocket: {
    kind: "boolean",
    label: "Controller pocket",
    description:
      "A pocket above the hook, with a floor, two side walls, and a lip.",
  } satisfies BooleanSpec,
  pocketWidth: {
    kind: "number",
    label: "Pocket width",
    shortLabel: "Pocket width",
    min: 40,
    max: 190,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  pocketDepth: {
    kind: "number",
    label: "Pocket depth",
    shortLabel: "Pocket depth",
    min: 20,
    max: 80,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  pocketLip: {
    kind: "number",
    label: "Pocket lip height",
    shortLabel: "Pocket lip",
    min: 4,
    max: 30,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  pocketFloor: {
    kind: "number",
    label: "Pocket floor",
    shortLabel: "Floor",
    min: 4,
    max: 10,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  screwDiameter: {
    kind: "number",
    label: "Screw bore diameter",
    shortLabel: "Screw bore",
    min: 3,
    max: 6,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  cornerRadius: {
    kind: "number",
    label: "Plate corner radius",
    shortLabel: "Corner radius",
    min: 0,
    max: 10,
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
    hint: "Standard balances smooth fillets with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
  surfaceTreatments: surfaceTreatmentSpec([
      { id: "plate", label: "Mounting plate", description: "Open free plate areas away from the screws and hook roots." },
      { id: "pocket", label: "Pocket", description: "Open free pocket surfaces." },
    ]),
} as const;

export type HeadphoneMountSpecs = typeof HEADPHONE_MOUNT_SPECS;
export type HeadphoneMountParameters = ParametersOf<HeadphoneMountSpecs>;
export type HeadphoneMountKey = keyof HeadphoneMountSpecs & string;

export const HEADPHONE_MOUNT_DEFAULTS: HeadphoneMountParameters = {
  plateWidth: 90,
  plateHeight: 150,
  plateThickness: 5,
  hookWidth: 40,
  hookRoot: 12,
  hookProjection: 30,
  hookLip: 12,
  bandGauge: 10,
  controllerPocket: true,
  pocketWidth: 70,
  pocketDepth: 40,
  pocketLip: 12,
  pocketFloor: 5,
  screwDiameter: 4.5,
  cornerRadius: 4,
  meshQuality: "standard",
  surfaceTreatments: defaultSurfaceTreatments(HEADPHONE_MOUNT_SPECS.surfaceTreatments),
};

export const HEADPHONE_MOUNT_GROUPS: ParameterGroup<HeadphoneMountKey>[] = [
  {
    id: "plate",
    index: "01",
    title: "Plate",
    description:
      "The plate that goes against the wall. Two screws sit on its center line, one near the bottom and one near the top.",
    keys: ["plateWidth", "plateHeight", "plateThickness", "screwDiameter"],
  },
  {
    id: "hook",
    index: "02",
    title: "Hook",
    description:
      "The wide hook the headband rests on. The root carries the load across the print layers, so the projection is at most 2.5 times the root and never over 60 mm. The opening between the plate and the lip must clear the band.",
    keys: ["hookWidth", "hookRoot", "hookProjection", "hookLip", "bandGauge"],
  },
  {
    id: "pocket",
    index: "03",
    title: "Pocket",
    description:
      "An optional pocket above the hook. Measure the controller: the pocket width is its width plus your clearance, and the depth is its thickness plus your clearance.",
    keys: [
      "controllerPocket",
      "pocketWidth",
      "pocketDepth",
      "pocketLip",
      "pocketFloor",
    ],
  },
  {
    id: "construction",
    index: "04",
    title: "Construction",
    description: "The plate corners and the curve detail.",
    keys: ["cornerRadius", "meshQuality"],
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

export interface HeadphoneMountLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  headDiameter: number;
  /** Z of the bottom screw center. */
  lowerScrewZ: number;
  /** Z of the top screw center. */
  upperScrewZ: number;
  /** Z of the hook arm bottom. */
  hookArmZ: number;
  /** Z of the top of the hook root band, the top fillet included. */
  hookRootTop: number;
  /** Z of the hook lip top. */
  hookLipTop: number;
  hookRule: HookRuleResult;
  /** The clear opening between the plate face and the lip, at the arm top. */
  hookOpening: number;
  /** The projection that clears the band with the set lip. */
  minimumProjection: number;
  /** Z of the pocket floor bottom. NaN without a pocket. */
  pocketZ: number;
  /** Z of the top of the pocket root band, the top fillet included. */
  pocketRootTop: number;
  /** Z of the pocket lip and side wall tops. */
  pocketTop: number;
  /** The widest hook or pocket the plate carries. */
  maximumFeatureWidth: number;
  /** The smallest plate height that holds everything with 8 mm around each screw. */
  minimumHeight: number;
  numbersOk: boolean;
}

const NUMBER_KEYS = [
  "plateWidth",
  "plateHeight",
  "plateThickness",
  "hookWidth",
  "hookRoot",
  "hookProjection",
  "hookLip",
  "bandGauge",
  "pocketWidth",
  "pocketDepth",
  "pocketLip",
  "pocketFloor",
  "screwDiameter",
  "cornerRadius",
] as const;

export function numbersAreFinite(
  parameters: HeadphoneMountParameters,
): boolean {
  return NUMBER_KEYS.every((key) => Number.isFinite(parameters[key]));
}

/**
 * Solves the whole layout from the parameters, bottom to top: the lower
 * screw, the hook, the band gap, the pocket, the upper screw. Pure, and it
 * never throws: a cleared field holds NaN, and the layout then carries NaN
 * values. Validation, the derived values, and generation read this one
 * function.
 */
export function deriveLayout(
  parameters: HeadphoneMountParameters,
): HeadphoneMountLayout {
  const numbersOk = numbersAreFinite(parameters);
  const headDiameter = parameters.screwDiameter * SCREW_HEAD_RATIO;
  const lowerScrewZ = SCREW_MINIMUM_EDGE_MM + headDiameter / 2;
  const hookArmZ =
    lowerScrewZ + headDiameter / 2 + SCREW_MINIMUM_EDGE_MM + HOOK_FILLET_MM;
  const hookRootTop = hookArmZ + parameters.hookRoot + HOOK_FILLET_MM;
  const hookLipTop = hookArmZ + parameters.hookRoot + parameters.hookLip;
  const hookRule = checkHookRule({
    root: parameters.hookRoot,
    projection: parameters.hookProjection,
  });
  const hookOpening =
    parameters.hookProjection - LIP_THICKNESS_MM - parameters.hookLip;
  const minimumProjection =
    LIP_THICKNESS_MM +
    parameters.hookLip +
    parameters.bandGauge +
    BAND_CLEARANCE_MM;
  const pocket = parameters.controllerPocket;
  const pocketZ = pocket
    ? hookLipTop + parameters.bandGauge + BAND_SLIP_MM + HOOK_FILLET_MM
    : Number.NaN;
  const pocketRootTop = pocket
    ? pocketZ + parameters.pocketFloor + HOOK_FILLET_MM
    : Number.NaN;
  const pocketTop = pocket
    ? pocketZ + parameters.pocketFloor + parameters.pocketLip
    : Number.NaN;
  // Without a pocket the upper screw clears the whole hook, not only its
  // root. A lip that reaches above the root's top fillet stands in front of
  // a countersink measured from the root alone, and no screwdriver reaches
  // it. See S15 finding F-2.
  const topOfFeatures = pocket
    ? Math.max(pocketRootTop, pocketTop)
    : Math.max(hookRootTop, hookLipTop);
  const upperScrewZ =
    parameters.plateHeight - SCREW_MINIMUM_EDGE_MM - headDiameter / 2;
  const minimumHeight =
    topOfFeatures +
    SCREW_MINIMUM_EDGE_MM +
    headDiameter +
    SCREW_MINIMUM_EDGE_MM;
  return {
    outsideWidth: parameters.plateWidth,
    outsideDepth:
      parameters.plateThickness +
      Math.max(parameters.hookProjection, pocket ? parameters.pocketDepth : 0),
    outsideHeight: parameters.plateHeight,
    headDiameter,
    lowerScrewZ,
    upperScrewZ,
    hookArmZ,
    hookRootTop,
    hookLipTop,
    hookRule,
    hookOpening,
    minimumProjection,
    pocketZ,
    pocketRootTop,
    pocketTop,
    maximumFeatureWidth: parameters.plateWidth - 2 * SIDE_MARGIN_MM,
    minimumHeight,
    numbersOk,
  };
}
