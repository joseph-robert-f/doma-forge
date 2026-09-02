import {
  LEG_MAXIMUM_SLENDERNESS,
  LEG_MINIMUM_SECTION_MM,
  planLegPosts,
  type LegPlan,
} from "../../kernel/legs";
import type {
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The riser must stay this far under the usable height of the drawer. */
export const HEADROOM_MM = 5;
/** The smallest compartment the tray builds. */
export const MINIMUM_COMPARTMENT_MM = 10;
/** The corner radius of a leg post. A square post prints with sharp edges. */
export const LEG_CORNER_RADIUS_MM = 2;
/** The gusset leg, as a part of the leg section. */
export const LEG_GUSSET_RATIO = 0.75;
/** The smallest inset from the deck edge to the outside face of a post. */
export const MINIMUM_LEG_INSET_MM = 2;

export const DRAWER_RISER_SPECS = {
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
  drawerUsableHeight: {
    kind: "number",
    label: "Drawer usable height",
    shortLabel: "Usable height",
    min: 40,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  clearancePerSide: {
    kind: "number",
    label: "Fit clearance per side",
    shortLabel: "Clearance",
    min: 0,
    max: 3,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  clearHeight: {
    kind: "number",
    label: "Clear height under the tray",
    shortLabel: "Clear height",
    min: 10,
    max: 150,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  trayHeight: {
    kind: "number",
    label: "Tray height above the floor",
    shortLabel: "Tray height",
    min: 10,
    max: 120,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  legSection: {
    kind: "number",
    label: "Leg section",
    shortLabel: "Leg section",
    min: LEG_MINIMUM_SECTION_MM,
    max: 40,
    step: 1,
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
    label: "Deck thickness",
    shortLabel: "Deck",
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

export type DrawerRiserSpecs = typeof DRAWER_RISER_SPECS;
export type DrawerRiserParameters = ParametersOf<DrawerRiserSpecs>;
export type DrawerRiserKey = keyof DrawerRiserSpecs & string;

export const DRAWER_RISER_DEFAULTS: DrawerRiserParameters = {
  drawerWidth: 300,
  drawerDepth: 200,
  drawerUsableHeight: 120,
  clearancePerSide: 0.5,
  clearHeight: 45,
  trayHeight: 35,
  legSection: 12,
  rows: 2,
  columns: 2,
  wallThickness: 2,
  baseThickness: 2.4,
  dividerThickness: 2,
  cornerRadius: 4,
  meshQuality: "standard",
};

export const DRAWER_RISER_GROUPS: ParameterGroup<DrawerRiserKey>[] = [
  {
    id: "fit",
    index: "01",
    title: "Fit",
    description:
      "Measure the drawer inside. The usable height is the height you can use, from the drawer floor to the lowest point above it.",
    keys: ["drawerWidth", "drawerDepth", "drawerUsableHeight", "clearancePerSide"],
  },
  {
    id: "levels",
    index: "02",
    title: "Levels",
    description:
      "The clear height is the space the legs leave under the tray. Measure the tallest item that stays on the drawer floor.",
    keys: ["clearHeight", "trayHeight", "legSection"],
  },
  {
    id: "divide",
    index: "03",
    title: "Divide",
    description: "An even grid of compartments in the upper tray.",
    keys: ["rows", "columns", "dividerThickness"],
  },
  {
    id: "construction",
    index: "04",
    title: "Construction",
    description: "The walls, the deck, the corners, and the curve detail.",
    keys: ["wallThickness", "baseThickness", "cornerRadius", "meshQuality"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface DrawerRiserLayout {
  outsideWidth: number;
  outsideDepth: number;
  /** The whole riser: the legs, the deck, and the tray walls. */
  outsideHeight: number;
  /** Z of the deck underside. The legs stand from Z = 0 to here. */
  deckZ: number;
  compartmentWidth: number;
  compartmentDepth: number;
  /**
   * The longest unsupported span in the print pose: the shorter side of one
   * compartment. The riser prints rim down, so the deck over a compartment
   * bridges that span. See D-1408 and open issue 8.
   */
  longestBridge: number;
  /** The X centers of the column dividers, left to right. */
  columnPositions: number[];
  /** The Y centers of the row dividers, front to back. */
  rowPositions: number[];
  /** The four leg posts, or the reason the legs are refused. */
  legs: LegPlan;
  /** Distance from the deck edge to the outside face of a post. */
  legInset: number;
  /** The gusset leg on a post. */
  legGusset: number;
  /** The tallest riser this drawer allows: usable height minus the headroom. */
  heightBudget: number;
}

/**
 * Solves the whole layout from the parameters. Pure, and it never throws: a
 * cleared field holds NaN, and the layout then carries NaN values and a
 * refused leg plan. Validation, the derived values, and generation read this
 * one function.
 */
export function deriveLayout(parameters: DrawerRiserParameters): DrawerRiserLayout {
  const outsideWidth = parameters.drawerWidth - parameters.clearancePerSide * 2;
  const outsideDepth = parameters.drawerDepth - parameters.clearancePerSide * 2;
  const columns = Number.isInteger(parameters.columns)
    ? Math.max(1, parameters.columns)
    : 1;
  const rows = Number.isInteger(parameters.rows) ? Math.max(1, parameters.rows) : 1;
  const compartmentWidth =
    (outsideWidth -
      parameters.wallThickness * 2 -
      (columns - 1) * parameters.dividerThickness) /
    columns;
  const compartmentDepth =
    (outsideDepth -
      parameters.wallThickness * 2 -
      (rows - 1) * parameters.dividerThickness) /
    rows;
  const columnPositions: number[] = [];
  for (let column = 1; column < columns; column += 1) {
    columnPositions.push(
      -outsideWidth / 2 +
        parameters.wallThickness +
        column * (compartmentWidth + parameters.dividerThickness) -
        parameters.dividerThickness / 2,
    );
  }
  const rowPositions: number[] = [];
  for (let row = 1; row < rows; row += 1) {
    rowPositions.push(
      -outsideDepth / 2 +
        parameters.wallThickness +
        row * (compartmentDepth + parameters.dividerThickness) -
        parameters.dividerThickness / 2,
    );
  }
  const legGusset = Math.min(
    parameters.legSection * LEG_GUSSET_RATIO,
    parameters.clearHeight / 2,
  );
  // The inset holds two rules at once. At the corner radius or more, a post
  // corner stands on the straight part of the outline, clear of the rounded
  // deck corner. At the gusset or more, the flare at the top of the post
  // stays under the deck instead of standing out past its edge.
  const legInset = Math.max(
    MINIMUM_LEG_INSET_MM,
    parameters.cornerRadius,
    legGusset,
  );
  const legs = planLegPosts({
    deckWidth: outsideWidth,
    deckDepth: outsideDepth,
    section: parameters.legSection,
    height: parameters.clearHeight,
    inset: legInset,
  });
  return {
    outsideWidth,
    outsideDepth,
    outsideHeight:
      parameters.clearHeight + parameters.baseThickness + parameters.trayHeight,
    deckZ: parameters.clearHeight,
    compartmentWidth,
    compartmentDepth,
    longestBridge: Math.min(compartmentWidth, compartmentDepth),
    columnPositions,
    rowPositions,
    legs,
    legInset,
    legGusset,
    heightBudget: parameters.drawerUsableHeight - HEADROOM_MM,
  };
}

export { LEG_MAXIMUM_SLENDERNESS, LEG_MINIMUM_SECTION_MM };
