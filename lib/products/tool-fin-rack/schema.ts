import { solvePitch, type PitchResult } from "../../kernel/pitch";
import type {
  EnumSpec,
  MeshQuality,
  NumberSpec,
  ParameterGroup,
  ParametersOf,
} from "../types";

/**
 * The print-risk rule for this product (10_MULTI_PRODUCT_EXPANSION_PLAN.md
 * section 2.6): the gap between two fins, the web the pitch solver reports,
 * must be at least this so a tool blade has room to sit.
 */
export const MINIMUM_WEB_MM = 12;
/** The other print-risk rule: a tall, thin fin snaps under a tool handle. */
export const MAXIMUM_HEIGHT_TO_THICKNESS = 15;
/** Extra half-width the fillet strip adds on each side of a fin. */
export const FIN_FILLET_WIDTH_MM = 2;
/** How tall the fillet strip is, measured up from the base. */
export const FIN_FILLET_HEIGHT_MM = 3;

export const TOOL_FIN_RACK_SPECS = {
  rackWidth: {
    kind: "number",
    label: "Rack width",
    shortLabel: "Width",
    min: 60,
    max: 400,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  rackDepth: {
    kind: "number",
    label: "Rack depth",
    shortLabel: "Depth",
    min: 40,
    max: 300,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  finCount: {
    kind: "number",
    label: "Fin count",
    shortLabel: "Fins",
    min: 2,
    max: 20,
    step: 1,
    unit: "",
    integer: true,
  } satisfies NumberSpec,
  finThickness: {
    kind: "number",
    label: "Fin thickness",
    shortLabel: "Fin thickness",
    min: 1.5,
    max: 6,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  finHeight: {
    kind: "number",
    label: "Fin height",
    shortLabel: "Fin height",
    min: 10,
    max: 90,
    step: 1,
    unit: "mm",
  } satisfies NumberSpec,
  wallThickness: {
    kind: "number",
    label: "Edge margin",
    shortLabel: "Margin",
    min: 1.2,
    max: 4,
    step: 0.1,
    unit: "mm",
  } satisfies NumberSpec,
  baseThickness: {
    kind: "number",
    label: "Base slab thickness",
    shortLabel: "Base",
    // Narrowed from the shared construction group's 1.2 to 6 mm: the
    // print-risk rule for this product needs at least 3 mm under the fins.
    min: 3,
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

export type ToolFinRackSpecs = typeof TOOL_FIN_RACK_SPECS;
export type ToolFinRackParameters = ParametersOf<ToolFinRackSpecs>;
export type ToolFinRackKey = keyof ToolFinRackSpecs & string;

export const TOOL_FIN_RACK_DEFAULTS: ToolFinRackParameters = {
  rackWidth: 150,
  rackDepth: 90,
  finCount: 6,
  finThickness: 3,
  finHeight: 40,
  wallThickness: 2,
  baseThickness: 4,
  cornerRadius: 4,
  meshQuality: "standard",
};

export const TOOL_FIN_RACK_GROUPS: ParameterGroup<ToolFinRackKey>[] = [
  {
    id: "size",
    index: "01",
    title: "Size",
    description:
      "The outside of the base slab. Measure the shelf or drawer width.",
    keys: ["rackWidth", "rackDepth"],
  },
  {
    id: "fins",
    index: "02",
    title: "Fins",
    description:
      "Fins stand up from the base and run front to back. Measure the widest tool blade that must sit between two fins.",
    keys: ["finCount", "finThickness", "finHeight"],
  },
  {
    id: "construction",
    index: "03",
    title: "Construction",
    description: "The edge margin, the base, the corners, and the mesh.",
    keys: ["wallThickness", "baseThickness", "cornerRadius", "meshQuality"],
  },
];

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

/**
 * True when a rectangle of half-width `semiX` and half-depth `semiY`,
 * centered at (`x`, `y`), stays inside the rounded outer profile of the
 * base slab, on the straight sides and at the rounded corners, so a fin
 * near a corner keeps a full footprint of slab underneath it.
 *
 * The corner test uses the rectangle's own far corner, `(|x| + semiX,
 * |y| + semiY)`, against the arc the profile draws at that corner: this is
 * exact for an axis-aligned rectangle. A check keyed to the fin's center
 * point instead of its far corner would wrongly call the single, centered
 * row of fins clear no matter how close its ends actually come to the
 * corner, because the row's Y center never leaves the slab's centerline.
 */
export function footprintClearsOuterSlab(
  x: number,
  y: number,
  semiX: number,
  semiY: number,
  width: number,
  depth: number,
  cornerRadius: number,
): boolean {
  const farX = Math.abs(x) + semiX;
  const farY = Math.abs(y) + semiY;
  if (farX > width / 2 + 1e-9) return false;
  if (farY > depth / 2 + 1e-9) return false;
  const dx = Math.max(0, farX - (width / 2 - cornerRadius));
  const dy = Math.max(0, farY - (depth / 2 - cornerRadius));
  if (dx === 0 || dy === 0) return true;
  return Math.hypot(dx, dy) <= cornerRadius + 1e-9;
}

export interface CornerConflict {
  /** The largest corner radius that keeps every fin on the slab, in whole 0.5 mm steps. */
  maximumCornerRadius: number;
}

export interface ToolFinRackLayout {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  /** The span the fin row is solved inside, after the edge margin. */
  innerWidth: number;
  /** How far each fin runs front to back, after the edge margin on each side. */
  finLength: number;
  /** The fin layout along X: pitch, web, and the first fin's center. */
  finLayout: PitchResult;
  /** The largest corner radius that keeps every fin on the slab; null when the layout does not fit. */
  cornerConflict: CornerConflict | null;
}

/**
 * Solves the whole layout from the parameters. Pure. A rejected pitch stays
 * in the result as `ok: false` so validation can name the field, and
 * generation refuses it.
 */
export function deriveLayout(
  parameters: ToolFinRackParameters,
): ToolFinRackLayout {
  const innerWidth = parameters.rackWidth - parameters.wallThickness * 2;
  const finLength = parameters.rackDepth - parameters.wallThickness * 2;
  const count = Number.isInteger(parameters.finCount)
    ? Math.max(1, parameters.finCount)
    : 1;
  const thickness =
    Number.isFinite(parameters.finThickness) && parameters.finThickness > 0
      ? parameters.finThickness
      : 1;
  const solvable = Number.isFinite(innerWidth);
  const finLayout: PitchResult = solvable
    ? solvePitch({
        span: innerWidth,
        count,
        cutterSize: thickness,
        minimumWeb: MINIMUM_WEB_MM,
      })
    : { ok: false, web: Number.NaN, minimumWeb: MINIMUM_WEB_MM };

  let cornerConflict: CornerConflict | null = null;
  if (
    finLayout.ok &&
    Number.isFinite(parameters.cornerRadius) &&
    Number.isFinite(finLength)
  ) {
    const semiX = thickness / 2 + FIN_FILLET_WIDTH_MM;
    const semiY = finLength / 2;
    const xEnds = [
      finLayout.firstCenter,
      finLayout.firstCenter + (count - 1) * finLayout.pitch,
    ];
    const clears = (cornerRadius: number) =>
      xEnds.every((x) =>
        footprintClearsOuterSlab(
          x,
          0,
          semiX,
          semiY,
          parameters.rackWidth,
          parameters.rackDepth,
          cornerRadius,
        ),
      );
    if (!clears(parameters.cornerRadius)) {
      let maximumCornerRadius = Math.floor(parameters.cornerRadius * 2) / 2;
      while (maximumCornerRadius > 0 && !clears(maximumCornerRadius)) {
        maximumCornerRadius -= 0.5;
      }
      cornerConflict = {
        maximumCornerRadius: Math.max(0, maximumCornerRadius),
      };
    }
  }

  return {
    outsideWidth: parameters.rackWidth,
    outsideDepth: parameters.rackDepth,
    outsideHeight: parameters.baseThickness + parameters.finHeight,
    innerWidth,
    finLength,
    finLayout,
    cornerConflict,
  };
}
