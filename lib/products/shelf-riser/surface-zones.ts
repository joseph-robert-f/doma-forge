import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  RIB_THICKNESS_MM,
  deriveLayout,
  type ShelfRiserLayout,
  type ShelfRiserParameters,
} from "./schema";

/** Central deck, outside leg/gusset pads and all strengthening rib strips. */
export function surfaceZones(
  parameters: ShelfRiserParameters,
  layout: ShelfRiserLayout = deriveLayout(parameters),
): SurfaceZone[] {
  if (!layout.legs.ok) return [];
  const { deckWidth, deckDepth, deckThickness, legSection } = parameters;
  const edge = layout.legInset + legSection + layout.legGusset + 2.5;
  const ribHalf = RIB_THICKNESS_MM / 2 + 2.5;
  const keepouts = [
    ...layout.ribsAcrossX.map((x) => ({
      kind: "rect" as const,
      min: [x - ribHalf, -deckDepth / 2] as [number, number],
      max: [x + ribHalf, deckDepth / 2] as [number, number],
    })),
    ...layout.ribsAcrossY.map((y) => ({
      kind: "rect" as const,
      min: [-deckWidth / 2, y - ribHalf] as [number, number],
      max: [deckWidth / 2, y + ribHalf] as [number, number],
    })),
  ];
  return [{
    kind: "plane",
    id: "deck",
    axis: "z",
    center: deckThickness / 2,
    thickness: deckThickness + BOOLEAN_OVERLAP * 2,
    u: [-deckWidth / 2 + edge, deckWidth / 2 - edge],
    v: [-deckDepth / 2 + edge, deckDepth / 2 - edge],
    keepouts,
  }];
}
