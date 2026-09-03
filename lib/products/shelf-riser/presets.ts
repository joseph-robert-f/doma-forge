import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  SHELF_RISER_DEFAULTS,
  SHELF_RISER_SPECS,
  type ShelfRiserParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<ShelfRiserParameters>,
): ProductPreset<ShelfRiserParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(SHELF_RISER_SPECS, SHELF_RISER_DEFAULTS, {
      ...SHELF_RISER_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Every preset keeps the leg rule. Measure your own shelf and the items
 * under the riser before you print.
 */
export const SHELF_RISER_PRESETS: ProductPreset<ShelfRiserParameters>[] = [
  preset("shoe-stacker", "Shoe stacker", "A second level over a pair of shoes", {}),
  preset("cabinet-shelf", "Cabinet shelf", "A low, wide riser with ribs under the deck", {
    deckWidth: 400,
    deckDepth: 250,
    deckThickness: 5,
    clearHeight: 80,
    legSection: 12,
  }),
  preset("boot-riser", "Boot riser", "A tall riser with press-fit leg extensions", {
    deckWidth: 300,
    deckDepth: 200,
    deckThickness: 5,
    clearHeight: 300,
    legSection: 28,
  }),
];
