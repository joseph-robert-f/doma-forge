import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  PARTS_BIN_DEFAULTS,
  PARTS_BIN_SPECS,
  type PartsBinParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<PartsBinParameters>,
): ProductPreset<PartsBinParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(PARTS_BIN_SPECS, PARTS_BIN_DEFAULTS, {
      ...PARTS_BIN_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Each preset is named by the work it does. Measure your own shelf and your
 * own parts, then adjust the size.
 */
export const PARTS_BIN_PRESETS: ProductPreset<PartsBinParameters>[] = [
  preset(
    "garage-shelf",
    "Garage shelf bin",
    "A deep bin for bulk fasteners on a garage shelf",
    {
      binWidth: 200,
      binDepth: 150,
      binHeight: 110,
      wallThickness: 3.4,
      baseThickness: 3.2,
      lipHeight: 5,
      cornerRadius: 4,
    },
  ),
  preset(
    "craft-room-small-parts",
    "Craft room small parts bin",
    "A shallow bin for beads, clips, and small craft parts",
    {
      binWidth: 110,
      binDepth: 80,
      binHeight: 45,
      wallThickness: 3.2,
      baseThickness: 2.4,
      lipHeight: 3,
      lipWallThickness: 1,
      stackClearance: 0.25,
      cornerRadius: 2.5,
    },
  ),
  preset(
    "workbench-loose-hardware",
    "Workbench loose hardware bin",
    "A wide open bin for loose hardware at a workbench, without a lip",
    {
      binWidth: 240,
      binDepth: 120,
      binHeight: 60,
      stacking: false,
      wallThickness: 2,
      baseThickness: 2.4,
      labelLedge: false,
      cornerRadius: 6,
    },
  ),
];
