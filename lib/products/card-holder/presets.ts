import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  CARD_HOLDER_DEFAULTS,
  CARD_HOLDER_SPECS,
  type CardHolderParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<CardHolderParameters>,
): ProductPreset<CardHolderParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(CARD_HOLDER_SPECS, CARD_HOLDER_DEFAULTS, {
      ...CARD_HOLDER_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * The card sizes are typical outside sizes for each format, not a brand's.
 * Measure your own card with a caliper and adjust the thickness and the width.
 */
export const CARD_HOLDER_PRESETS: ProductPreset<CardHolderParameters>[] = [
  preset("memory-cards", "Memory cards", "Twelve slots for 2.1 mm cards", {
    holderWidth: 100,
    holderDepth: 32,
    holderHeight: 20,
    cardGauge: 2.1,
    slotClearance: 0.4,
    cardWidth: 24,
    slotCount: 12,
    slotDepth: 14,
    slotTilt: 10,
  }),
  preset("game-cartridges", "Game cartridges", "Six slots for 9 mm cartridges", {
    holderWidth: 100,
    holderDepth: 70,
    holderHeight: 28,
    cardGauge: 9,
    slotClearance: 0.6,
    cardWidth: 60,
    slotCount: 6,
    slotDepth: 22,
    slotTilt: 8,
  }),
  preset("cassettes", "Cassettes", "Six slots for 12 mm cassettes", {
    holderWidth: 120,
    holderDepth: 74,
    holderHeight: 30,
    cardGauge: 12,
    slotClearance: 0.6,
    cardWidth: 64,
    slotCount: 6,
    slotDepth: 25,
    slotTilt: 6,
    cornerRadius: 4,
  }),
];
