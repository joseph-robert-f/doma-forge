import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  ENTRYWAY_VALET_DEFAULTS,
  ENTRYWAY_VALET_SPECS,
  solveLastWell,
  type EntrywayValetParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<EntrywayValetParameters>,
): ProductPreset<EntrywayValetParameters> {
  return {
    id,
    label,
    description,
    parameters: solveLastWell(
      normalizeFromSpecs(ENTRYWAY_VALET_SPECS, ENTRYWAY_VALET_DEFAULTS, {
        ...ENTRYWAY_VALET_DEFAULTS,
        ...overrides,
      }),
    ),
  };
}

/**
 * Every preset keeps the rest thick enough at its top. Measure your own
 * phone and set the slot before you print.
 */
export const ENTRYWAY_VALET_PRESETS: ProductPreset<EntrywayValetParameters>[] = [
  preset("keys-watch-phone", "Keys, watch, phone", "Three wells and a phone rest", {}),
  preset("family-entry", "Family entry", "Four wells across a wide tray", {
    valetWidth: 320,
    valetDepth: 160,
    wellWidths: [70, 70, 70, 100],
    wellDepth: 75,
  }),
  preset("desk-valet", "Desk valet", "One wide well and a steep phone rest", {
    valetWidth: 160,
    valetDepth: 120,
    valetHeight: 30,
    wellWidths: [156],
    wellDepth: 55,
    restHeight: 60,
    restAngle: 10,
  }),
];
