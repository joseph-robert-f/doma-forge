import type {
  EnumSpec,
  LayoutSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The narrowest well the valet builds. */
export const MINIMUM_WELL_MM = 25;
/** The ridge in front of the slot: its height above the base and its thickness. */
export const SLOT_LIP_HEIGHT_MM = 6;
export const SLOT_LIP_THICKNESS_MM = 2;
/** The rest wedge must keep this much material at its top. */
export const REST_MINIMUM_TOP_MM = 4;

export const ENTRYWAY_VALET_SPECS = {
  valetWidth: {
    kind: "number",
    label: "Valet width",
    shortLabel: "Width",
    min: 120,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  valetDepth: {
    kind: "number",
    label: "Valet depth",
    shortLabel: "Depth",
    min: 80,
    max: 250,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  valetHeight: {
    kind: "number",
    label: "Wall height",
    shortLabel: "Height",
    min: 20,
    max: 80,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  wellWidths: {
    kind: "layout",
    label: "Well widths",
    shortLabel: "Wells",
    description:
      "One width per well, left to right. The last well takes the width that is left inside the valet, so its own value is only a starting point.",
    minCount: 1,
    maxCount: 5,
    min: MINIMUM_WELL_MM,
    max: 350,
    step: 0.5,
    unit: "mm",
    newValue: 50,
  } satisfies LayoutSpec,
  wellDepth: {
    kind: "number",
    label: "Well depth, front to back",
    shortLabel: "Well depth",
    min: 30,
    max: 200,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  slotWidth: {
    kind: "number",
    label: "Phone slot width",
    shortLabel: "Slot",
    min: 6,
    max: 25,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  restHeight: {
    kind: "number",
    label: "Rest height",
    shortLabel: "Rest height",
    min: 30,
    max: 120,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  restAngle: {
    kind: "number",
    label: "Rest angle from vertical",
    shortLabel: "Rest angle",
    min: 8,
    max: 25,
    step: 1,
    unit: "",
  } satisfies NumberSpec,
  wallThickness: {
    kind: "number",
    label: "Outer wall thickness",
    shortLabel: "Outer walls",
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
  dividerThickness: {
    kind: "number",
    label: "Divider thickness",
    shortLabel: "Dividers",
    min: 1.2,
    max: 4,
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
    hint: "Standard balances smooth corners with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
} as const;

export type EntrywayValetSpecs = typeof ENTRYWAY_VALET_SPECS;
export type EntrywayValetParameters = ParametersOf<EntrywayValetSpecs>;
export type EntrywayValetKey = keyof EntrywayValetSpecs & string;

export const ENTRYWAY_VALET_DEFAULTS: EntrywayValetParameters = {
  valetWidth: 240,
  valetDepth: 150,
  valetHeight: 40,
  wellWidths: [80, 60, 92],
  wellDepth: 70,
  slotWidth: 12,
  restHeight: 70,
  restAngle: 15,
  wallThickness: 2,
  baseThickness: 2.4,
  dividerThickness: 2,
  cornerRadius: 6,
  meshQuality: "standard",
};

export const ENTRYWAY_VALET_GROUPS: ParameterGroup<EntrywayValetKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description: "The outside of the valet. Measure the table it stands on.",
    keys: ["valetWidth", "valetDepth", "valetHeight"],
  },
  {
    id: "wells",
    index: "02",
    title: "Wells",
    description:
      "The wells run along the front. Give each one the width of what goes in it, and set how deep the well row is from front to back.",
    keys: ["wellWidths", "wellDepth"],
  },
  {
    id: "rest",
    index: "03",
    title: "Phone rest",
    description:
      "The rest is a wedge along the back. The phone's bottom edge sits in the slot in front of it, and the phone leans back on the wedge.",
    keys: ["slotWidth", "restHeight", "restAngle"],
  },
  {
    id: "construction",
    index: "04",
    title: "Construction",
    description: "The walls, the base, the dividers, and the corners.",
    keys: ["wallThickness", "baseThickness", "dividerThickness", "cornerRadius", "meshQuality"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface EntrywayValetLayout {
  outsideWidth: number;
  outsideDepth: number;
  /** The taller of the walls and the rest. */
  outsideHeight: number;
  innerWidth: number;
  innerDepth: number;
  wellCount: number;
  fixedWidths: number[];
  wellWidths: number[];
  /** The X center of each divider between two wells. */
  dividerPositions: number[];
  solvedWidth: number;
  widestFixedWell: number;
  /** True when every built well is finite and at least the minimum. */
  wellsFit: boolean;
  /** Y of the front inner face. */
  frontInner: number;
  /** Y of the center of the divider between the wells and the rest zone. */
  backDividerY: number;
  /** Y where the rest zone starts, behind that divider. */
  restZoneStart: number;
  /** Y of the back inner face. */
  backInner: number;
  /** The rest zone depth: the lip, the slot, and the wedge base. */
  restZoneDepth: number;
  /** Y of the slot lip center. */
  lipY: number;
  /** Y of the wedge face at the base top. */
  wedgeFootY: number;
  /** The wedge depth at the base and at the top. */
  wedgeBaseDepth: number;
  wedgeTopDepth: number;
  /** The well depth that leaves the rest its minimum top thickness. */
  maximumWellDepth: number;
  numbersOk: boolean;
}

const NUMBER_KEYS = [
  "valetWidth",
  "valetDepth",
  "valetHeight",
  "wellDepth",
  "slotWidth",
  "restHeight",
  "restAngle",
  "wallThickness",
  "baseThickness",
  "dividerThickness",
  "cornerRadius",
] as const;

export function numbersAreFinite(parameters: EntrywayValetParameters): boolean {
  return NUMBER_KEYS.every((key) => Number.isFinite(parameters[key]));
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Solves the whole layout from the parameters. Pure, and it never throws: a
 * cleared field holds NaN, and the layout then reports `wellsFit: false`
 * and NaN depths. Validation, the derived values, and generation read this
 * one function.
 */
export function deriveLayout(parameters: EntrywayValetParameters): EntrywayValetLayout {
  const numbersOk = numbersAreFinite(parameters);
  const widths = Array.isArray(parameters.wellWidths) ? parameters.wellWidths : [];
  const wellCount = Math.max(1, widths.length);
  const innerWidth = parameters.valetWidth - parameters.wallThickness * 2;
  const innerDepth = parameters.valetDepth - parameters.wallThickness * 2;
  const fixedWidths = widths.slice(0, Math.max(0, widths.length - 1));
  const dividerSpan = (wellCount - 1) * parameters.dividerThickness;
  const solvedWidth = innerWidth - dividerSpan - sum(fixedWidths);
  const wellWidths = [...fixedWidths, solvedWidth];
  const dividerPositions: number[] = [];
  let edge = -innerWidth / 2;
  for (let index = 0; index < wellWidths.length - 1; index += 1) {
    edge += wellWidths[index];
    dividerPositions.push(edge + parameters.dividerThickness / 2);
    edge += parameters.dividerThickness;
  }
  let widestFixed = -1;
  fixedWidths.forEach((width, index) => {
    if (!Number.isFinite(width)) return;
    if (widestFixed < 0 || width > fixedWidths[widestFixed]) widestFixed = index;
  });
  const frontInner = -parameters.valetDepth / 2 + parameters.wallThickness;
  const backInner = parameters.valetDepth / 2 - parameters.wallThickness;
  const backDividerY = frontInner + parameters.wellDepth + parameters.dividerThickness / 2;
  const restZoneStart = frontInner + parameters.wellDepth + parameters.dividerThickness;
  const restZoneDepth = backInner - restZoneStart;
  const lipY = restZoneStart + SLOT_LIP_THICKNESS_MM / 2;
  const wedgeFootY = restZoneStart + SLOT_LIP_THICKNESS_MM + parameters.slotWidth;
  const wedgeBaseDepth = backInner - wedgeFootY;
  const lean = Math.tan((parameters.restAngle * Math.PI) / 180);
  const wedgeTopDepth =
    wedgeBaseDepth - (parameters.restHeight - parameters.baseThickness) * lean;
  const maximumWellDepth =
    innerDepth -
    parameters.dividerThickness -
    SLOT_LIP_THICKNESS_MM -
    parameters.slotWidth -
    REST_MINIMUM_TOP_MM -
    (parameters.restHeight - parameters.baseThickness) * lean;
  return {
    outsideWidth: parameters.valetWidth,
    outsideDepth: parameters.valetDepth,
    outsideHeight: Math.max(parameters.valetHeight, parameters.restHeight),
    innerWidth,
    innerDepth,
    wellCount,
    fixedWidths,
    wellWidths,
    dividerPositions,
    solvedWidth,
    widestFixedWell: widestFixed + 1,
    wellsFit: wellWidths.every(
      (width) => Number.isFinite(width) && width >= MINIMUM_WELL_MM - 1e-9,
    ),
    frontInner,
    backDividerY,
    restZoneStart,
    backInner,
    restZoneDepth,
    lipY,
    wedgeFootY,
    wedgeBaseDepth,
    wedgeTopDepth,
    maximumWellDepth,
    numbersOk,
  };
}

/**
 * Writes the solved width back into the last well, so the value the user
 * sees, the value the file name hashes, and the value the geometry builds
 * are one number, exactly as the remote caddy does (D-1415).
 */
export function solveLastWell(parameters: EntrywayValetParameters): EntrywayValetParameters {
  const widths = parameters.wellWidths;
  if (!Array.isArray(widths) || widths.length === 0) return parameters;
  const solved = deriveLayout(parameters).solvedWidth;
  if (!Number.isFinite(solved)) return parameters;
  const rounded = Math.round(solved * 1000) / 1000;
  if (widths[widths.length - 1] === rounded) return parameters;
  const next = [...widths];
  next[next.length - 1] = rounded;
  return { ...parameters, wellWidths: next };
}
