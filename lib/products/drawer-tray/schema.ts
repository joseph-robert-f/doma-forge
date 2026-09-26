import { defaultSurfaceTreatments, surfaceTreatmentSpec } from "../../surface-patterns";
import type {
  AxisLayout,
  AxisLayoutSpec,
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
  rowLayout: {
    kind: "axisLayout",
    label: "Row depths",
    shortLabel: "Rows",
    itemLabel: "Row",
    direction: "front-to-back",
    minCount: 1,
    maxCount: 6,
    minSizeMm: 10,
    step: 0.1,
  } satisfies AxisLayoutSpec,
  columnLayout: {
    kind: "axisLayout",
    label: "Column widths",
    shortLabel: "Columns",
    itemLabel: "Column",
    direction: "left-to-right",
    minCount: 1,
    maxCount: 8,
    minSizeMm: 10,
    step: 0.1,
  } satisfies AxisLayoutSpec,
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
    description: "A shallow notch inside one front compartment, clear of dividers and the base.",
  } satisfies BooleanSpec,
  surfaceTreatments: surfaceTreatmentSpec([
      { id: "floor", label: "Floor", description: "Open the tray floor inside the compartments." },
      { id: "walls", label: "Outer walls", description: "Open usable outer wall panels." },
      { id: "dividers", label: "Dividers", description: "Open divider panels while keeping their joints solid." },
    ]),
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
  rowLayout: { mode: "even", count: 2 },
  columnLayout: { mode: "even", count: 3 },
  meshQuality: "standard",
  fingerScoop: true,
  surfaceTreatments: defaultSurfaceTreatments(DRAWER_TRAY_SPECS.surfaceTreatments),
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
    description: "Set even or measured widths and depths for your compartments.",
    keys: ["rowLayout", "columnLayout", "dividerThickness"],
  },
  {
    id: "finish",
    index: "04",
    title: "Finish",
    description: "Choose curve detail and an optional front access notch.",
    keys: ["meshQuality", "fingerScoop"],
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

export interface DerivedDimensions {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  compartmentWidth: number;
  compartmentDepth: number;
}

export interface AxisSpan {
  start: number;
  end: number;
  center: number;
  size: number;
}

export interface DerivedAxisLayout {
  sizesMm: number[];
  spans: AxisSpan[];
  dividerCenters: number[];
}

export interface DerivedTrayLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  insideWidth: number;
  insideDepth: number;
  columns: DerivedAxisLayout;
  rows: DerivedAxisLayout;
}

function deriveAxisLayout(
  layout: AxisLayout,
  outsideSize: number,
  wallThickness: number,
  dividerThickness: number,
  maxCount: number,
): DerivedAxisLayout {
  const insideSize = outsideSize - wallThickness * 2;
  // Validation reports a corrupt count. Bound derivation so an invalid edit
  // or imported value cannot allocate an enormous array before that check.
  const requestedCount = layout.mode === "even" ? layout.count : layout.fixedSizesMm.length + 1;
  const count = Number.isFinite(requestedCount)
    ? Math.max(1, Math.min(maxCount, Math.floor(requestedCount)))
    : 1;
  const availableForCompartments = insideSize - (count - 1) * dividerThickness;
  const sizesMm = layout.mode === "even"
    ? Array.from({ length: count }, () => availableForCompartments / count)
    : [
        ...layout.fixedSizesMm.slice(0, count - 1),
        availableForCompartments - layout.fixedSizesMm.slice(0, count - 1).reduce((sum, size) => sum + size, 0),
      ];
  let cursor = -outsideSize / 2 + wallThickness;
  const spans = sizesMm.map((size) => {
    const start = cursor;
    const end = start + size;
    cursor = end + dividerThickness;
    return { start, end, center: (start + end) / 2, size };
  });
  return {
    sizesMm,
    spans,
    dividerCenters: spans.slice(0, -1).map((span) => span.end + dividerThickness / 2),
  };
}

/** One coordinate system for the editor, validation, zones, and solid. */
export function deriveTrayLayout(parameters: DrawerTrayParameters): DerivedTrayLayout {
  const outsideWidth = parameters.drawerWidth - parameters.clearancePerSide * 2;
  const outsideDepth = parameters.drawerDepth - parameters.clearancePerSide * 2;
  return {
    outsideWidth,
    outsideDepth,
    outsideHeight: parameters.organizerHeight,
    insideWidth: outsideWidth - parameters.wallThickness * 2,
    insideDepth: outsideDepth - parameters.wallThickness * 2,
    columns: deriveAxisLayout(parameters.columnLayout, outsideWidth, parameters.wallThickness, parameters.dividerThickness, 8),
    rows: deriveAxisLayout(parameters.rowLayout, outsideDepth, parameters.wallThickness, parameters.dividerThickness, 6),
  };
}

export function deriveDimensions(
  parameters: DrawerTrayParameters,
): DerivedDimensions {
  const layout = deriveTrayLayout(parameters);
  return {
    outsideWidth: layout.outsideWidth,
    outsideDepth: layout.outsideDepth,
    outsideHeight: layout.outsideHeight,
    compartmentWidth: layout.columns.sizesMm[0] ?? Number.NaN,
    compartmentDepth: layout.rows.sizesMm[0] ?? Number.NaN,
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
