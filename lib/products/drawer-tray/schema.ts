import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

export const DRAWER_TRAY_SPECS = {
  drawerWidth: {
    kind: "number",
    label: "Drawer interior width",
    shortLabel: "Drawer width",
    min: 80,
    max: 600,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  drawerDepth: {
    kind: "number",
    label: "Drawer interior depth",
    shortLabel: "Drawer depth",
    min: 80,
    max: 600,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  clearancePerSide: {
    kind: "number",
    label: "Fit clearance per side",
    shortLabel: "Clearance",
    min: 0,
    max: 5,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  organizerHeight: {
    kind: "number",
    label: "Organizer height",
    shortLabel: "Height",
    min: 15,
    max: 120,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  wallThickness: {
    kind: "number",
    label: "Outer wall thickness",
    shortLabel: "Outer walls",
    min: 1.2,
    max: 6,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  baseThickness: {
    kind: "number",
    label: "Base thickness",
    shortLabel: "Base",
    min: 1.2,
    max: 8,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  dividerThickness: {
    kind: "number",
    label: "Divider thickness",
    shortLabel: "Dividers",
    min: 1.2,
    max: 6,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  cornerRadius: {
    kind: "number",
    label: "Outer corner radius",
    shortLabel: "Corner radius",
    min: 1,
    max: 40,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  rows: {
    kind: "number",
    label: "Compartment rows",
    shortLabel: "Rows",
    min: 1,
    max: 6,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  columns: {
    kind: "number",
    label: "Compartment columns",
    shortLabel: "Columns",
    min: 1,
    max: 8,
    step: 1,
    unit: "",
    integer: true,
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
  fingerScoop: {
    kind: "boolean",
    label: "Front finger scoop",
    description: "A shallow notch that stays safely above the base.",
  } satisfies BooleanSpec,
} as const;

export type DrawerTraySpecs = typeof DRAWER_TRAY_SPECS;
export type DrawerTrayParameters = ParametersOf<DrawerTraySpecs>;
export type DrawerTrayKey = keyof DrawerTraySpecs & string;

export const DRAWER_TRAY_DEFAULTS: DrawerTrayParameters = {
  drawerWidth: 300,
  drawerDepth: 200,
  clearancePerSide: 0.5,
  organizerHeight: 50,
  wallThickness: 2,
  baseThickness: 2,
  dividerThickness: 2,
  cornerRadius: 8,
  rows: 2,
  columns: 3,
  meshQuality: "standard",
  fingerScoop: true,
};

export const DRAWER_TRAY_GROUPS: ParameterGroup<DrawerTrayKey>[] = [
  {
    id: "fit",
    index: "01",
    title: "Fit",
    description: "Start with the clear inside measurements of your drawer.",
    keys: ["drawerWidth", "drawerDepth", "clearancePerSide"],
  },
  {
    id: "build",
    index: "02",
    title: "Build",
    description: "Set the tray profile and printable shell.",
    keys: ["organizerHeight", "wallThickness", "baseThickness", "cornerRadius"],
  },
  {
    id: "divide",
    index: "03",
    title: "Divide",
    description: "Create an even grid of practical compartments.",
    keys: ["rows", "columns", "dividerThickness"],
  },
  {
    id: "finish",
    index: "04",
    title: "Finish",
    description: "Choose curve detail and an optional front access notch.",
    keys: ["meshQuality", "fingerScoop"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface DerivedDimensions {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  compartmentWidth: number;
  compartmentDepth: number;
}

export function deriveDimensions(
  parameters: DrawerTrayParameters,
): DerivedDimensions {
  const outsideWidth = parameters.drawerWidth - parameters.clearancePerSide * 2;
  const outsideDepth = parameters.drawerDepth - parameters.clearancePerSide * 2;
  const compartmentWidth =
    (outsideWidth -
      parameters.wallThickness * 2 -
      (parameters.columns - 1) * parameters.dividerThickness) /
    parameters.columns;
  const compartmentDepth =
    (outsideDepth -
      parameters.wallThickness * 2 -
      (parameters.rows - 1) * parameters.dividerThickness) /
    parameters.rows;
  return {
    outsideWidth,
    outsideDepth,
    outsideHeight: parameters.organizerHeight,
    compartmentWidth,
    compartmentDepth,
  };
}

/** The coupon ring height, in millimeters. Independent of organizer height. */
export const FIT_TEST_COUPON_HEIGHT = 5;

/** No ring wall is ever thinner than this, whatever the tray wall setting is. */
export const FIT_TEST_COUPON_MINIMUM_WALL = 2;

/**
 * The coupon's ring wall thickness: the tray's own outer wall thickness, or
 * the print-safe minimum, whichever is larger.
 */
export function getCouponWallThickness(
  parameters: DrawerTrayParameters,
): number {
  return Math.max(FIT_TEST_COUPON_MINIMUM_WALL, parameters.wallThickness);
}
