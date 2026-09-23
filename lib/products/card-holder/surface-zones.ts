import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  deriveCardHolderLayout,
  type CardHolderLayout,
  type CardHolderParameters,
} from "./schema";

/** Spare base material outside the full tilted slot footprints. */
export function surfaceZones(
  parameters: CardHolderParameters,
  layout: CardHolderLayout = deriveCardHolderLayout(parameters),
): SurfaceZone[] {
  const pitch = layout.pitch;
  if (!pitch.ok) return [];
  const edge = Math.max(parameters.cornerRadius + 0.5, parameters.wallThickness + 2.5);
  const keepouts = Array.from({ length: parameters.slotCount }, (_, index) => {
    const x = pitch.firstCenter + index * pitch.pitch;
    return {
      kind: "rect" as const,
      min: [x - layout.slotFootprint / 2, -layout.slotLength / 2] as [number, number],
      max: [x + layout.slotFootprint / 2, layout.slotLength / 2] as [number, number],
    };
  });
  return [{
    kind: "plane",
    id: "base",
    axis: "z",
    center: parameters.holderHeight / 2,
    thickness: parameters.holderHeight + BOOLEAN_OVERLAP * 2,
    u: [-parameters.holderWidth / 2 + edge, parameters.holderWidth / 2 - edge],
    v: [-parameters.holderDepth / 2 + edge, parameters.holderDepth / 2 - edge],
    keepouts,
  }];
}
