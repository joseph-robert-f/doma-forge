import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  PLANT_POT_DEFAULTS,
  PLANT_POT_SPECS,
  type PlantPotParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<PlantPotParameters>,
): ProductPreset<PlantPotParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(PLANT_POT_SPECS, PLANT_POT_DEFAULTS, {
      ...PLANT_POT_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Each preset names the base diameter, because the base is what the saucer
 * must match. Measure the space on the shelf and adjust the height.
 */
export const PLANT_POT_PRESETS: ProductPreset<PlantPotParameters>[] = [
  preset("seedling", "Seedling pot, 90 mm base", "A short pot with three 4 mm holes", {
    baseDiameter: 90,
    potHeight: 90,
    wallAngleDegrees: 7,
    drainHoles: 3,
    drainHoleDiameter: 4,
    wallThickness: 1.8,
    baseThickness: 2.4,
  }),
  preset("desk-pot", "Desk pot, 120 mm base", "The default pot with four 6 mm holes", {}),
  preset("deep-pot", "Deep pot, 150 mm base", "A tall pot with six 6 mm holes", {
    baseDiameter: 150,
    potHeight: 200,
    wallAngleDegrees: 5,
    drainHoles: 6,
    drainHoleDiameter: 6,
    wallThickness: 2.4,
    baseThickness: 3.5,
  }),
];
