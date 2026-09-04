import { solvePitch, type PitchResult } from "../../kernel/pitch";
import {
  HOOK_MAXIMUM_PROJECTION_MM,
  HOOK_MINIMUM_ROOT_MM,
  SCREW_MINIMUM_EDGE_MM,
  checkHookRule,
  planRibs,
  planScrewRow,
  type HookRuleResult,
  type ScrewRowPlan,
} from "../../kernel/bracket-rules";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The fillet radius at a hook root, above and below the arm. */
export const HOOK_FILLET_MM = 3;
/** The lip thickness at its top. */
export const LIP_THICKNESS_MM = 3;
/** Plate material under the bottom fillet of a hook. */
export const HOOK_BOTTOM_MARGIN_MM = 3;
/** The gap between two hooks, and from a hook to the rail end. */
export const HOOK_GAP_MM = 20;
/** The countersink diameter, as a multiple of the screw diameter. */
export const SCREW_HEAD_RATIO = 2;
/** The gusset rise and run under the shelf, as a part of the shelf depth. */
export const GUSSET_RATIO = 0.75;
/** The longest a gusset runs down the plate, so a deep shelf fits a short rail. */
export const GUSSET_MAXIMUM_RISE_MM = 40;

export const WALL_HOOK_RAIL_SPECS = {
  railLength: {
    kind: "number",
    label: "Rail length",
    shortLabel: "Length",
    min: 100,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  railHeight: {
    kind: "number",
    label: "Rail height",
    shortLabel: "Height",
    min: 30,
    max: 120,
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
  hookCount: {
    kind: "number",
    label: "Hook count",
    shortLabel: "Hooks",
    min: 1,
    max: 8,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  hookWidth: {
    kind: "number",
    label: "Hook width",
    shortLabel: "Hook width",
    min: 8,
    max: 30,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  hookRoot: {
    kind: "number",
    label: "Hook root",
    shortLabel: "Root",
    min: HOOK_MINIMUM_ROOT_MM,
    // 60 mm over 2.5 is 24 mm, so the root the hook rule asks for always fits.
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
    min: 0,
    max: 20,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  screwCount: {
    kind: "number",
    label: "Screw count",
    shortLabel: "Screws",
    min: 1,
    max: 4,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  screwSpacing: {
    kind: "number",
    label: "Screw spacing",
    shortLabel: "Screw spacing",
    min: 20,
    max: 380,
    step: 1,
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
  keyShelf: {
    kind: "boolean",
    label: "Key shelf",
    description:
      "A shelf along the top of the rail, with a gusset at each end.",
  } satisfies BooleanSpec,
  shelfDepth: {
    kind: "number",
    label: "Shelf depth",
    shortLabel: "Shelf depth",
    min: 20,
    max: 80,
    step: 1,
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
} as const;

export type WallHookRailSpecs = typeof WALL_HOOK_RAIL_SPECS;
export type WallHookRailParameters = ParametersOf<WallHookRailSpecs>;
export type WallHookRailKey = keyof WallHookRailSpecs & string;

export const WALL_HOOK_RAIL_DEFAULTS: WallHookRailParameters = {
  railLength: 240,
  railHeight: 50,
  plateThickness: 5,
  hookCount: 4,
  hookWidth: 12,
  hookRoot: 8,
  hookProjection: 20,
  hookLip: 6,
  screwCount: 2,
  screwSpacing: 160,
  screwDiameter: 4.5,
  keyShelf: false,
  shelfDepth: 40,
  cornerRadius: 4,
  meshQuality: "standard",
};

export const WALL_HOOK_RAIL_GROUPS: ParameterGroup<WallHookRailKey>[] = [
  {
    id: "rail",
    index: "01",
    title: "Rail",
    description: "The plate that goes against the wall.",
    keys: ["railLength", "railHeight", "plateThickness"],
  },
  {
    id: "hooks",
    index: "02",
    title: "Hooks",
    description:
      "The root is the hook thickness at the plate. It carries the load across the print layers, so the projection is at most 2.5 times the root and never over 60 mm.",
    keys: ["hookCount", "hookWidth", "hookRoot", "hookProjection", "hookLip"],
  },
  {
    id: "wall",
    index: "03",
    title: "Wall",
    description:
      "Measure the wall. The screw spacing is the distance between two screw centers. Every countersink keeps 8 mm of plate around it.",
    keys: ["screwCount", "screwSpacing", "screwDiameter"],
  },
  {
    id: "shelf",
    index: "04",
    title: "Shelf",
    description: "An optional shelf along the top, on gussets.",
    keys: ["keyShelf", "shelfDepth"],
  },
  {
    id: "construction",
    index: "05",
    title: "Construction",
    description: "The plate corners and the curve detail.",
    keys: ["cornerRadius", "meshQuality"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface WallHookRailLayout {
  outsideWidth: number;
  /** From the wall face to the furthest front face: the hook lip or the shelf. */
  outsideDepth: number;
  outsideHeight: number;
  /** Z of the arm bottom of every hook. The bottom fillet starts one fillet lower. */
  armZ: number;
  /** Z of the top of the hook root band, the top fillet included. */
  rootTop: number;
  /** Z of the lip top, in front of the plate. */
  lipTop: number;
  hookRule: HookRuleResult;
  /** The hook pitch along the rail, or the refusal. */
  hooks: PitchResult | null;
  /** The X center of every hook. */
  hookCenters: number[];
  headDiameter: number;
  /** The Z band the screw row may use: countersink edges stay inside it. */
  screwBandBottom: number;
  screwBandTop: number;
  /** The Z of the screw centers. */
  screwZ: number;
  screws: ScrewRowPlan;
  /** The Z of the shelf underside. Equal to the rail height without a shelf. */
  shelfUnderside: number;
  shelfThickness: number;
  gussetRise: number;
  gussetRun: number;
  /** The X center of every gusset under the shelf: both ends, then the ribs. */
  gussetCenters: number[];
  /** The smallest rail height that holds the hooks, the screws, and the shelf. */
  minimumHeight: number;
  /** Whether every number in the parameters is finite. */
  numbersOk: boolean;
}

const NUMBER_KEYS = [
  "railLength",
  "railHeight",
  "plateThickness",
  "hookCount",
  "hookWidth",
  "hookRoot",
  "hookProjection",
  "hookLip",
  "screwCount",
  "screwSpacing",
  "screwDiameter",
  "shelfDepth",
  "cornerRadius",
] as const;

export function numbersAreFinite(parameters: WallHookRailParameters): boolean {
  return NUMBER_KEYS.every((key) => Number.isFinite(parameters[key]));
}

/**
 * Solves the whole layout from the parameters. Pure, and it never throws: a
 * cleared field holds NaN, and the layout then carries NaN values and
 * refused plans. Validation, the derived values, and generation read this
 * one function.
 */
export function deriveLayout(
  parameters: WallHookRailParameters,
): WallHookRailLayout {
  const numbersOk = numbersAreFinite(parameters);
  const T = parameters.plateThickness;
  const armZ = HOOK_BOTTOM_MARGIN_MM + HOOK_FILLET_MM;
  const rootTop = armZ + parameters.hookRoot + HOOK_FILLET_MM;
  const lipTop = armZ + parameters.hookRoot + parameters.hookLip;
  const hookRule = checkHookRule({
    root: parameters.hookRoot,
    projection: parameters.hookProjection,
  });
  const hookCount = Number.isInteger(parameters.hookCount)
    ? Math.max(1, parameters.hookCount)
    : 1;
  const hooks =
    numbersOk && parameters.hookWidth > 0
      ? solvePitch({
          span: parameters.railLength,
          count: hookCount,
          cutterSize: parameters.hookWidth,
          minimumWeb: HOOK_GAP_MM,
        })
      : null;
  const hookCenters: number[] = [];
  if (hooks?.ok) {
    for (let index = 0; index < hookCount; index += 1) {
      hookCenters.push(hooks.firstCenter + index * hooks.pitch);
    }
  }
  const headDiameter = parameters.screwDiameter * SCREW_HEAD_RATIO;
  const shelfThickness = T;
  const gussetRun = parameters.keyShelf
    ? parameters.shelfDepth * GUSSET_RATIO
    : 0;
  const gussetRise = Math.min(gussetRun, GUSSET_MAXIMUM_RISE_MM);
  const shelfUnderside = parameters.keyShelf
    ? parameters.railHeight - shelfThickness
    : parameters.railHeight;
  // The screw band clears the whole hook, not only its root. A lip that
  // reaches above the root's top fillet stands in front of a countersink
  // measured from the root alone, and no screwdriver reaches it. See S15
  // finding F-2.
  const screwBandBottom = Math.max(rootTop, lipTop) + SCREW_MINIMUM_EDGE_MM;
  const screwBandTop = shelfUnderside - gussetRise - SCREW_MINIMUM_EDGE_MM;
  const screwZ = (screwBandBottom + screwBandTop) / 2;
  const screws = planScrewRow({
    plateWidth: parameters.railLength,
    count: Number.isInteger(parameters.screwCount) ? parameters.screwCount : 0,
    spacing: parameters.screwSpacing,
    headDiameter,
  });
  const minimumHeight =
    screwBandBottom +
    headDiameter +
    SCREW_MINIMUM_EDGE_MM +
    (parameters.keyShelf ? gussetRise + shelfThickness : 0);
  const gussetCenters: number[] = [];
  if (parameters.keyShelf && numbersOk) {
    const end = parameters.railLength / 2 - T / 2;
    gussetCenters.push(-end, end, ...planRibs(parameters.railLength - 2 * T));
  }
  return {
    outsideWidth: parameters.railLength,
    outsideDepth:
      T +
      Math.max(
        parameters.hookProjection,
        parameters.keyShelf ? parameters.shelfDepth : 0,
      ),
    outsideHeight: parameters.railHeight,
    armZ,
    rootTop,
    lipTop,
    hookRule,
    hooks,
    hookCenters,
    headDiameter,
    screwBandBottom,
    screwBandTop,
    screwZ,
    screws,
    shelfUnderside,
    shelfThickness,
    gussetRise,
    gussetRun,
    gussetCenters,
    minimumHeight,
    numbersOk,
  };
}

/** The projection a hook needs for its fillet, its ramp, and its lip. */
export function minimumProjection(parameters: WallHookRailParameters): number {
  return HOOK_FILLET_MM + LIP_THICKNESS_MM + parameters.hookLip;
}

/**
 * The fit-test coupon: one hook on a short plate with two screws, at the
 * same root, projection, lip, and plate thickness as the rail. Print it
 * first and hang the load on it. The hook rail coupon is a single hook.
 */
export function couponParameters(
  parameters: WallHookRailParameters,
): WallHookRailParameters {
  const railLength = Math.max(60, parameters.hookWidth + 2 * HOOK_GAP_MM);
  const headDiameter = deriveLayout(parameters).headDiameter;
  return {
    ...parameters,
    railLength,
    hookCount: 1,
    keyShelf: false,
    screwCount: 2,
    screwSpacing: Math.floor(railLength - headDiameter - 16),
  };
}
