import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  PLANT_SAUCER_DEFAULTS,
  PLANT_SAUCER_SPECS,
  type PlantSaucerParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<PlantSaucerParameters>,
): ProductPreset<PlantSaucerParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(PLANT_SAUCER_SPECS, PLANT_SAUCER_DEFAULTS, {
      ...PLANT_SAUCER_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * The inner diameter of each preset is a common nursery pot base plus 2 mm.
 * Measure your own pot and adjust the inner diameter.
 */
export const PLANT_SAUCER_PRESETS: ProductPreset<PlantSaucerParameters>[] = [
  preset("small-pot", "Small pot, 90 mm base", "A 92 mm floor with a 10 mm rim", {
    innerDiameter: 92,
    rimHeight: 10,
    liftRibs: 2,
    ribHeight: 2.5,
    wallThickness: 1.8,
    baseThickness: 2,
  }),
  preset(
    "medium-pot",
    "Medium pot, 140 mm base",
    "A 142 mm floor with a 14 mm rim and an overflow notch",
    {
      innerDiameter: 142,
      rimHeight: 14,
      overflowNotch: true,
      liftRibs: 3,
      ribHeight: 3,
    },
  ),
  preset(
    "large-pot",
    "Large pot, 190 mm base",
    "A 192 mm floor with a 20 mm rim and four ribs",
    {
      innerDiameter: 192,
      rimHeight: 20,
      taperDegrees: 8,
      liftRibs: 4,
      ribHeight: 4,
      wallThickness: 2.4,
      baseThickness: 3,
    },
  ),
];
