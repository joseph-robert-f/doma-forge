import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  MARKER_CUP_BLOCK_DEFAULTS,
  MARKER_CUP_BLOCK_SPECS,
  type MarkerCupBlockParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<MarkerCupBlockParameters>,
): ProductPreset<MarkerCupBlockParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(MARKER_CUP_BLOCK_SPECS, MARKER_CUP_BLOCK_DEFAULTS, {
      ...MARKER_CUP_BLOCK_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Bore diameters are typical outside diameters for each item. Measure your
 * own markers and brushes and adjust the bore diameter.
 */
export const MARKER_CUP_BLOCK_PRESETS: ProductPreset<MarkerCupBlockParameters>[] = [
  preset(
    "fine-markers",
    "Fine markers",
    "Two rows of narrow, upright cups for fine markers",
    {
      blockWidth: 110,
      blockDepth: 80,
      blockHeight: 55,
      rows: 2,
      cupsPerRow: 5,
      boreDiameter: 13,
      boreDepth: 35,
      tiltDegrees: 0,
    },
  ),
  preset(
    "wide-markers-tilted",
    "Wide markers, tilted",
    "One row of wide cups, tilted back for an easy reach",
    {
      blockWidth: 180,
      blockDepth: 60,
      blockHeight: 60,
      rows: 1,
      cupsPerRow: 6,
      boreDiameter: 24,
      boreDepth: 40,
      tiltDegrees: 15,
      lightenUnderside: false,
    },
  ),
  preset(
    "brush-cups",
    "Brush cups",
    "Two rows of deep, tilted cups for round brushes",
    {
      blockWidth: 130,
      blockDepth: 100,
      blockHeight: 90,
      rows: 2,
      cupsPerRow: 3,
      boreDiameter: 22,
      boreDepth: 70,
      tiltDegrees: 10,
    },
  ),
];
