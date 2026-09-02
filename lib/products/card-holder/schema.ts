import { solvePitch, type PitchResult } from "../../kernel/arrays";
import type {
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/** Material that must stay between two slots and around the slot array. */
export const MINIMUM_WEB_MM = 2.5;

export const CARD_HOLDER_SPECS = {
  holderWidth: {
    kind: "number",
    label: "Holder width",
    shortLabel: "Width",
    min: 40,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  holderDepth: {
    kind: "number",
    label: "Holder depth",
    shortLabel: "Depth",
    min: 20,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  holderHeight: {
    kind: "number",
    label: "Holder height",
    shortLabel: "Height",
    min: 8,
    max: 80,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  // The key is "cardGauge", not "cardThickness". The printer profile finds a
  // printed wall by key: a number parameter in millimeters whose key holds
  // "wall" or "thickness" is a wall (`wallLikeKeys` in lib/printer-profile.ts).
  // A card is not a printed wall, and governance rule 9 would refuse the
  // download for any card under two nozzle widths. The label the user reads is
  // still "Card thickness". See 23_REVOLVED_FORMS_NOTES.md, D-1519.
  cardGauge: {
    kind: "number",
    label: "Card thickness",
    shortLabel: "Card thickness",
    min: 0.5,
    max: 25,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  slotClearance: {
    kind: "number",
    label: "Slot clearance",
    shortLabel: "Clearance",
    min: 0.1,
    max: 1.5,
    step: 0.05,
    unit: "mm",
  } satisfies NumberSpec,
  cardWidth: {
    kind: "number",
    label: "Card width in the slot",
    shortLabel: "Card width",
    min: 10,
    max: 200,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  slotCount: {
    kind: "number",
    label: "Slots",
    shortLabel: "Slots",
    min: 1,
    max: 24,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  slotDepth: {
    kind: "number",
    label: "Slot depth",
    shortLabel: "Slot depth",
    min: 3,
    max: 60,
    step: 0.5,
    unit: "mm",
  } satisfies NumberSpec,
  slotTilt: {
    kind: "number",
    label: "Slot tilt from vertical",
    shortLabel: "Tilt",
    min: 0,
    max: 20,
    step: 1,
    unit: "",
  } satisfies NumberSpec,
  wallThickness: {
    kind: "number",
    label: "Rim wall thickness",
    shortLabel: "Rim",
    min: 1.6,
    max: 4,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  baseThickness: {
    kind: "number",
    label: "Base under the slots",
    shortLabel: "Base",
    min: 1.2,
    max: 6,
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
    hint: "Standard balances round corners with quick regeneration.",
  } satisfies EnumSpec<MeshQuality>,
} as const;

export type CardHolderSpecs = typeof CARD_HOLDER_SPECS;
export type CardHolderParameters = ParametersOf<CardHolderSpecs>;
export type CardHolderKey = keyof CardHolderSpecs & string;

export const CARD_HOLDER_DEFAULTS: CardHolderParameters = {
  holderWidth: 180,
  holderDepth: 60,
  holderHeight: 30,
  cardGauge: 2.2,
  slotClearance: 0.4,
  cardWidth: 24,
  slotCount: 10,
  slotDepth: 14,
  slotTilt: 10,
  wallThickness: 2,
  baseThickness: 2.4,
  cornerRadius: 3,
  meshQuality: "standard",
};

export const CARD_HOLDER_GROUPS: ParameterGroup<CardHolderKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description: "The outside of the holder. Measure the space it goes into.",
    keys: ["holderWidth", "holderDepth", "holderHeight"],
  },
  {
    id: "card",
    index: "02",
    title: "Card",
    description:
      "Measure one card with a caliper. The card width is the edge that goes into the slot. The clearance is added to the thickness and to the width.",
    keys: ["cardGauge", "slotClearance", "cardWidth"],
  },
  {
    id: "slots",
    index: "03",
    title: "Slots",
    description:
      "The slots run front to back and are spaced evenly. The tilt leans every card to one side.",
    keys: ["slotCount", "slotDepth", "slotTilt"],
  },
  {
    id: "construction",
    index: "04",
    title: "Construction",
    description: "The rim, the base, the corners, and the mesh.",
    keys: ["wallThickness", "baseThickness", "cornerRadius", "meshQuality"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

export interface CornerConflict {
  /** The largest corner radius that keeps the end slots inside the wall, in 0.5 mm steps. */
  maximumCornerRadius: number;
}

/**
 * True when the point (`x`, `y`) stays inside the rounded outer profile with
 * at least `wall` of material. Only the corner region needs the check; the
 * straight sides are covered by the rectangle the layout is solved in. This
 * is the socket tray's corner rule with a point in place of a bore.
 */
export function pointClearsCorner(
  x: number,
  y: number,
  width: number,
  depth: number,
  cornerRadius: number,
  wall: number,
): boolean {
  const dx = Math.max(0, Math.abs(x) - (width / 2 - cornerRadius));
  const dy = Math.max(0, Math.abs(y) - (depth / 2 - cornerRadius));
  if (dx === 0 || dy === 0) return true;
  return Math.hypot(dx, dy) + wall <= cornerRadius + 1e-9;
}

export interface CardHolderLayout {
  /** The span the slot array is solved in, along X. */
  innerWidth: number;
  /** The span the slot must fit in, along Y. */
  innerDepth: number;
  /** Card thickness plus the clearance. The gap the card sits in. */
  slotWidth: number;
  /** Card width plus the clearance. The slot's length along Y. */
  slotLength: number;
  /** The mouth of a tilted slot is wider than the slot itself. */
  mouthWidth: number;
  /** How far the floor of a tilted slot moves along −X. */
  floorOffset: number;
  /** The whole footprint of one slot along X, mouth and floor together. */
  slotFootprint: number;
  /** Where the slot's own axis meets the top face, measured from the footprint center. */
  pivotOffset: number;
  /** The array along X. */
  pitch: PitchResult;
  /** Material left under a slot floor. */
  baseUnderSlots: number;
  /** The deepest slot these settings allow. */
  maximumSlotDepth: number;
  /** The end slots that a large outer corner radius would cut open. */
  cornerConflict: CornerConflict | null;
}

/**
 * Solves the whole layout from the parameters. Pure. A rejected pitch stays
 * in the result as `ok: false` so validation can name the field, and
 * generation refuses it. It never throws on a cleared field.
 */
export function deriveCardHolderLayout(
  parameters: CardHolderParameters,
): CardHolderLayout {
  const innerWidth = parameters.holderWidth - parameters.wallThickness * 2;
  const innerDepth = parameters.holderDepth - parameters.wallThickness * 2;
  const slotWidth = parameters.cardGauge + parameters.slotClearance;
  const slotLength = parameters.cardWidth + parameters.slotClearance;
  const radians = (parameters.slotTilt * Math.PI) / 180;
  const mouthWidth = slotWidth / Math.cos(radians);
  const floorOffset = parameters.slotDepth * Math.tan(radians);
  // The mouth reaches +mouthWidth / 2 from the slot's axis. The other side
  // reaches the far corner of the tilted floor. The two together give a
  // footprint of slotWidth × cos(tilt) + slotDepth × tan(tilt). The footprint
  // is not centered on the axis, so the pivot sits to the +X side of the
  // footprint center by half the difference.
  const slotFootprint = slotWidth * Math.cos(radians) + floorOffset;
  const pivotOffset = slotFootprint / 2 - mouthWidth / 2;
  const count = Number.isInteger(parameters.slotCount)
    ? Math.max(1, parameters.slotCount)
    : 1;
  const solvable =
    Number.isFinite(innerWidth) &&
    Number.isFinite(slotFootprint) &&
    slotFootprint > 0;
  const pitch: PitchResult = solvable
    ? solvePitch({
        span: innerWidth,
        count,
        cutterSize: slotFootprint,
        minimumWeb: MINIMUM_WEB_MM,
      })
    : { ok: false, web: Number.NaN, minimumWeb: MINIMUM_WEB_MM };
  return {
    innerWidth,
    innerDepth,
    slotWidth,
    slotLength,
    mouthWidth,
    floorOffset,
    slotFootprint,
    pivotOffset,
    pitch,
    baseUnderSlots: parameters.holderHeight - parameters.slotDepth,
    maximumSlotDepth: parameters.holderHeight - parameters.baseThickness,
    cornerConflict: findCornerConflict(parameters, pitch, slotLength, slotFootprint, count),
  };
}

/**
 * Checks the four plan corners of each end slot against the rounded outer
 * corners. The corner that matters is the exit point at the slot floor: a
 * tilted slot reaches further along −X at its floor than at its mouth. For a
 * layout that fails, the largest passing corner radius is found by stepping
 * down in 0.5 mm steps, the corner radius field's own step.
 */
function findCornerConflict(
  parameters: CardHolderParameters,
  pitch: PitchResult,
  slotLength: number,
  slotFootprint: number,
  count: number,
): CornerConflict | null {
  if (!pitch.ok || !Number.isFinite(parameters.cornerRadius)) return null;
  if (!Number.isFinite(slotLength) || !Number.isFinite(slotFootprint)) return null;
  const centers = [pitch.firstCenter, pitch.firstCenter + (count - 1) * pitch.pitch];
  const points: Array<[number, number]> = [];
  for (const center of centers) {
    for (const x of [center - slotFootprint / 2, center + slotFootprint / 2]) {
      for (const y of [-slotLength / 2, slotLength / 2]) points.push([x, y]);
    }
  }
  const clears = (cornerRadius: number) =>
    points.every(([x, y]) =>
      pointClearsCorner(
        x,
        y,
        parameters.holderWidth,
        parameters.holderDepth,
        cornerRadius,
        parameters.wallThickness,
      ),
    );
  if (clears(parameters.cornerRadius)) return null;
  let maximumCornerRadius = Math.floor(parameters.cornerRadius * 2) / 2;
  while (maximumCornerRadius > 0 && !clears(maximumCornerRadius)) {
    maximumCornerRadius -= 0.5;
  }
  return { maximumCornerRadius: Math.max(0, maximumCornerRadius) };
}
