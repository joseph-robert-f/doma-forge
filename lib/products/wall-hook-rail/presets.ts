import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  WALL_HOOK_RAIL_DEFAULTS,
  WALL_HOOK_RAIL_SPECS,
  type WallHookRailParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<WallHookRailParameters>,
): ProductPreset<WallHookRailParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(WALL_HOOK_RAIL_SPECS, WALL_HOOK_RAIL_DEFAULTS, {
      ...WALL_HOOK_RAIL_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Every preset keeps the hook rule. Measure your wall and set the screw
 * spacing before you print.
 */
export const WALL_HOOK_RAIL_PRESETS: ProductPreset<WallHookRailParameters>[] = [
  preset("key-rail", "Key rail", "Four narrow hooks for keys and lanyards", {}),
  preset("bag-hooks", "Bag hooks", "Three wide hooks with a deeper reach", {
    railLength: 300,
    railHeight: 60,
    plateThickness: 6,
    hookCount: 3,
    hookWidth: 20,
    hookRoot: 10,
    hookProjection: 25,
    hookLip: 8,
    screwCount: 3,
    screwSpacing: 120,
  }),
  preset("key-shelf", "Key shelf", "Four hooks under a shelf on gussets", {
    railLength: 250,
    railHeight: 90,
    keyShelf: true,
    shelfDepth: 40,
    screwSpacing: 160,
  }),
];
