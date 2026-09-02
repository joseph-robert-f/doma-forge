import type {
  EnumSpec,
  LayoutSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The narrowest well the caddy builds. A narrower well holds nothing. */
export const MINIMUM_WELL_MM = 25;
/** The front wall must stand this far above the well floor. */
export const MINIMUM_FRONT_WALL_ABOVE_FLOOR_MM = 3;

export const REMOTE_CADDY_SPECS = {
  caddyWidth: {
    kind: "number",
    label: "Caddy width",
    shortLabel: "Width",
    min: 80,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  caddyDepth: {
    kind: "number",
    label: "Caddy depth",
    shortLabel: "Depth",
    min: 60,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  caddyHeight: {
    kind: "number",
    label: "Caddy height",
    shortLabel: "Height",
    min: 20,
    max: 120,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  wellWidths: {
    kind: "layout",
    label: "Well widths",
    shortLabel: "Wells",
    description:
      "One width per well, front to back of the list, left to right in the caddy. The last well takes the width that is left inside the caddy, so its own value is only a starting point.",
    minCount: 2,
    maxCount: 5,
    min: MINIMUM_WELL_MM,
    max: 300,
    step: 0.5,
    unit: "mm",
    newValue: 50,
  } satisfies LayoutSpec,
  wellDepth: {
    kind: "number",
    label: "Well depth",
    shortLabel: "Well depth",
    min: 10,
    max: 110,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  frontWallHeight: {
    kind: "number",
    label: "Front wall height",
    shortLabel: "Front wall",
    min: 5,
    max: 120,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
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

export type RemoteCaddySpecs = typeof REMOTE_CADDY_SPECS;
export type RemoteCaddyParameters = ParametersOf<RemoteCaddySpecs>;
export type RemoteCaddyKey = keyof RemoteCaddySpecs & string;

export const REMOTE_CADDY_DEFAULTS: RemoteCaddyParameters = {
  caddyWidth: 220,
  caddyDepth: 130,
  caddyHeight: 60,
  wellWidths: [70, 70, 72],
  wellDepth: 45,
  frontWallHeight: 25,
  wallThickness: 2,
  baseThickness: 2.4,
  dividerThickness: 2,
  cornerRadius: 3,
  meshQuality: "standard",
};

export const REMOTE_CADDY_GROUPS: ParameterGroup<RemoteCaddyKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description: "The outside of the caddy. Measure the shelf it stands on.",
    keys: ["caddyWidth", "caddyDepth", "caddyHeight"],
  },
  {
    id: "wells",
    index: "02",
    title: "Wells",
    description:
      "One well per remote or controller. Measure the widest point of each item and add your own clearance.",
    keys: ["wellWidths", "wellDepth", "frontWallHeight"],
  },
  {
    id: "construction",
    index: "03",
    title: "Construction",
    description: "The walls, the base, the dividers, and the corners.",
    keys: [
      "wallThickness",
      "baseThickness",
      "dividerThickness",
      "cornerRadius",
      "meshQuality",
    ],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface RemoteCaddyLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  /** The span inside the outer walls, along X. */
  innerWidth: number;
  wellCount: number;
  /** The width the user typed for every well except the last. */
  fixedWidths: number[];
  /** The built widths, with the last well solved from the inner width. */
  wellWidths: number[];
  /** The X center of each divider, left to right. */
  dividerPositions: number[];
  /** Z of the well floor. Material under a well is this thick. */
  floorZ: number;
  /** The width the solve gave the last well. */
  solvedWidth: number;
  /** The one-based number of the widest well the user can shrink, or 0 when no well holds a number. */
  widestFixedWell: number;
  /** True when every built well is finite and at least the minimum. */
  fits: boolean;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Solves the whole layout from the parameters. Pure, and it never throws: a
 * cleared field holds NaN, and the layout then reports `fits: false` with
 * NaN widths. Validation, the derived values, and generation read this one
 * function, so generation refuses exactly what validation rejects.
 */
export function deriveLayout(parameters: RemoteCaddyParameters): RemoteCaddyLayout {
  const widths = Array.isArray(parameters.wellWidths) ? parameters.wellWidths : [];
  const wellCount = Math.max(1, widths.length);
  const innerWidth = parameters.caddyWidth - parameters.wallThickness * 2;
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
  const floorZ = parameters.caddyHeight - parameters.wellDepth;
  // The first finite well seeds the search, so a cleared well 1 never names
  // itself as the widest well.
  let widestFixed = -1;
  fixedWidths.forEach((width, index) => {
    if (!Number.isFinite(width)) return;
    if (widestFixed < 0 || width > fixedWidths[widestFixed]) widestFixed = index;
  });
  return {
    outsideWidth: parameters.caddyWidth,
    outsideDepth: parameters.caddyDepth,
    outsideHeight: parameters.caddyHeight,
    innerWidth,
    wellCount,
    fixedWidths,
    wellWidths,
    dividerPositions,
    floorZ,
    solvedWidth,
    widestFixedWell: widestFixed + 1,
    fits: wellWidths.every(
      (width) => Number.isFinite(width) && width >= MINIMUM_WELL_MM - 1e-9,
    ),
  };
}

/**
 * Writes the solved width back into the last well, so the value the user
 * sees, the value the file name hashes, and the value the geometry builds
 * are one number (D-1415). A layout that cannot be solved, because a field
 * is cleared, is returned as it is: the last well then keeps its width until
 * the user types a number again.
 */
export function solveLastWell(
  parameters: RemoteCaddyParameters,
): RemoteCaddyParameters {
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
