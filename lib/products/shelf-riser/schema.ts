import {
  ONE_PIECE_HEIGHT_MM,
  RIB_SPAN_MM,
  planLegSplit,
  planRibs,
  type LegSplitPlan,
} from "../../kernel/brackets";
import {
  LEG_MAXIMUM_SLENDERNESS,
  LEG_MINIMUM_SECTION_MM,
  planLegPosts,
  type LegPlan,
} from "../../kernel/legs";
import { planLightening, type LighteningPlan } from "../../kernel/lightening";
import type {
  BooleanSpec,
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** The corner radius of a leg post. */
export const LEG_CORNER_RADIUS_MM = 2;
/** The gusset leg, as a part of the leg section. */
export const LEG_GUSSET_RATIO = 0.75;
/** The smallest inset from the deck edge to the outside face of a post. */
export const MINIMUM_LEG_INSET_MM = 2;
/** A rib under the deck: its thickness along the deck and its depth below it. */
export const RIB_THICKNESS_MM = 3;
export const RIB_DEPTH_MM = 12;
/** The deck material left over a lightening pocket. */
export const DECK_MINIMUM_SKIN_MM = 2;
/** Lightening pockets: the longest ceiling, the web between pockets, the pocket corner. */
export const LIGHTENING_MAXIMUM_SPAN_MM = 40;
export const LIGHTENING_WEB_MM = 4;
export const LIGHTENING_POCKET_RADIUS_MM = 3;
/** Material around the pocket field beyond the leg pads. */
export const LIGHTENING_MARGIN_MM = 2;
/** The gap between the deck and a leg extension in the print layout. */
export const EXTENSION_GAP_MM = 10;

export const SHELF_RISER_SPECS = {
  deckWidth: {
    kind: "number",
    label: "Deck width",
    shortLabel: "Width",
    min: 100,
    max: 600,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  deckDepth: {
    kind: "number",
    label: "Deck depth",
    shortLabel: "Depth",
    min: 80,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  deckThickness: {
    kind: "number",
    label: "Deck thickness",
    shortLabel: "Deck",
    min: 3,
    max: 10,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  clearHeight: {
    kind: "number",
    label: "Clear height under the deck",
    shortLabel: "Clear height",
    min: 30,
    max: 350,
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
  lightenDeck: {
    kind: "boolean",
    label: "Lighten the deck",
    description: "Pockets in the deck underside, inside the leg pads, with ceilings at most 40 mm.",
  } satisfies BooleanSpec,
  cornerRadius: {
    kind: "number",
    label: "Deck corner radius",
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

export type ShelfRiserSpecs = typeof SHELF_RISER_SPECS;
export type ShelfRiserParameters = ParametersOf<ShelfRiserSpecs>;
export type ShelfRiserKey = keyof ShelfRiserSpecs & string;

export const SHELF_RISER_DEFAULTS: ShelfRiserParameters = {
  deckWidth: 300,
  deckDepth: 200,
  deckThickness: 4,
  clearHeight: 120,
  legSection: 14,
  lightenDeck: true,
  cornerRadius: 6,
  meshQuality: "standard",
};

export const SHELF_RISER_GROUPS: ParameterGroup<ShelfRiserKey>[] = [
  {
    id: "deck",
    index: "01",
    title: "Deck",
    description: "The deck size. Measure the shelf and what stands on it.",
    keys: ["deckWidth", "deckDepth", "deckThickness"],
  },
  {
    id: "legs",
    index: "02",
    title: "Legs",
    description:
      "The clear height is the space under the deck. A leg buckles when it is too slender, so the clear height is at most 12 times the leg section. Over 240 mm in all, the legs split into press-fit extensions.",
    keys: ["clearHeight", "legSection"],
  },
  {
    id: "construction",
    index: "03",
    title: "Construction",
    description: "The deck underside, the corners, and the curve detail.",
    keys: ["lightenDeck", "cornerRadius", "meshQuality"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface ShelfRiserLayout {
  outsideWidth: number;
  outsideDepth: number;
  /** The whole riser as used: the deck plus the clear height. */
  outsideHeight: number;
  /** The four posts, or the reason the legs are refused. */
  legs: LegPlan;
  legInset: number;
  legGusset: number;
  /** The clear span between two leg pads along X and along Y. */
  spanX: number;
  spanY: number;
  /** Rib centers, from the deck center: ribs across X stand at these X. */
  ribsAcrossX: number[];
  /** Ribs across Y stand at these Y. */
  ribsAcrossY: number[];
  /** The pocket plan, or null when the deck is not lightened or too small. */
  lightening: LighteningPlan | null;
  /** The lightening rim, from the deck edge to the pocket field. */
  lighteningRim: number;
  pocketDepth: number;
  split: LegSplitPlan;
  /** The length of the leg that stands on the deck body. */
  deckLegLength: number;
  /**
   * The bounds of the whole print layout: the deck body, and the four leg
   * extensions beside it when the legs split.
   */
  layoutMin: [number, number, number];
  layoutMax: [number, number, number];
  /** The X center of the extension row and the Y center of each extension. */
  extensionX: number;
  extensionYs: number[];
  numbersOk: boolean;
}

const NUMBER_KEYS = [
  "deckWidth",
  "deckDepth",
  "deckThickness",
  "clearHeight",
  "legSection",
  "cornerRadius",
] as const;

export function numbersAreFinite(parameters: ShelfRiserParameters): boolean {
  return NUMBER_KEYS.every((key) => Number.isFinite(parameters[key]));
}

export function lighteningOptions(
  parameters: ShelfRiserParameters,
  rim: number,
  pocketDepth: number,
  segments: number,
) {
  return {
    width: parameters.deckWidth,
    depth: parameters.deckDepth,
    cornerRadius: parameters.cornerRadius,
    rim,
    pocketDepth,
    maximumSpan: LIGHTENING_MAXIMUM_SPAN_MM,
    web: LIGHTENING_WEB_MM,
    pocketRadius: LIGHTENING_POCKET_RADIUS_MM,
    segments,
  };
}

/**
 * Solves the whole layout from the parameters. Pure, and it never throws: a
 * cleared field holds NaN, and the layout then carries NaN values and a
 * refused leg plan. Validation, the derived values, and generation read this
 * one function.
 */
export function deriveLayout(parameters: ShelfRiserParameters): ShelfRiserLayout {
  const numbersOk = numbersAreFinite(parameters);
  const { deckWidth, deckDepth, deckThickness, clearHeight, legSection } = parameters;
  const legGusset = Math.min(legSection * LEG_GUSSET_RATIO, clearHeight / 2);
  const legInset = Math.max(MINIMUM_LEG_INSET_MM, parameters.cornerRadius, legGusset);
  const legs = planLegPosts({
    deckWidth,
    deckDepth,
    section: legSection,
    height: clearHeight,
    inset: legInset,
  });
  const spanX = deckWidth - 2 * (legInset + legSection);
  const spanY = deckDepth - 2 * (legInset + legSection);
  const lighteningRim = legInset + legSection + 2 * legGusset + LIGHTENING_MARGIN_MM;
  const pocketDepth = deckThickness - Math.max(DECK_MINIMUM_SKIN_MM, deckThickness / 2);
  const lightening =
    parameters.lightenDeck && numbersOk
      ? planLightening(
          lighteningOptions(parameters, lighteningRim, pocketDepth, QUALITY_SEGMENTS.standard),
        )
      : null;
  const split = planLegSplit({ deckThickness, clearHeight, section: legSection });
  const deckLegLength = split.split ? split.upperLength : clearHeight;
  const extensionPitch = legSection + EXTENSION_GAP_MM;
  const extensionX = deckWidth / 2 + EXTENSION_GAP_MM + legSection / 2;
  const extensionYs = split.split
    ? [-1.5, -0.5, 0.5, 1.5].map((index) => index * extensionPitch)
    : [];
  const deckBodyHeight = deckThickness + deckLegLength;
  const layoutMin: [number, number, number] = [
    -deckWidth / 2,
    -Math.max(deckDepth / 2, split.split ? 1.5 * extensionPitch + legSection / 2 : 0),
    0,
  ];
  const layoutMax: [number, number, number] = [
    split.split ? extensionX + legSection / 2 : deckWidth / 2,
    -layoutMin[1],
    split.split
      ? Math.max(deckBodyHeight, split.extensionLength + split.pegLength)
      : deckBodyHeight,
  ];
  return {
    outsideWidth: deckWidth,
    outsideDepth: deckDepth,
    outsideHeight: deckThickness + clearHeight,
    legs,
    legInset,
    legGusset,
    spanX,
    spanY,
    ribsAcrossX: planRibs(spanX),
    ribsAcrossY: planRibs(spanY),
    lightening,
    lighteningRim,
    pocketDepth,
    split,
    deckLegLength,
    layoutMin,
    layoutMax,
    extensionX,
    extensionYs,
    numbersOk,
  };
}

export { LEG_MAXIMUM_SLENDERNESS, LEG_MINIMUM_SECTION_MM, ONE_PIECE_HEIGHT_MM, RIB_SPAN_MM };
