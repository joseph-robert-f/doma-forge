import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  BATTERY_ORGANIZER_DEFAULTS,
  BATTERY_ORGANIZER_SPECS,
  type BatteryOrganizerParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<BatteryOrganizerParameters>,
): ProductPreset<BatteryOrganizerParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(BATTERY_ORGANIZER_SPECS, BATTERY_ORGANIZER_DEFAULTS, {
      ...BATTERY_ORGANIZER_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Cell diameters and lengths are typical outside sizes. Measure your own
 * cells and adjust. Each preset states the clearance per side it uses,
 * recorded here and in 21_WAVE_1_PRODUCTS_NOTES.md.
 */
export const BATTERY_ORGANIZER_PRESETS: ProductPreset<BatteryOrganizerParameters>[] = [
  preset("aa", "AA cells", "Three rows of four AA cells, 0.3 mm clearance per side", {
    organizerWidth: 140,
    organizerDepth: 90,
    organizerHeight: 45,
    rows: 3,
    cellsPerRow: 4,
    cellDiameter: 14.5,
    cellLength: 50.5,
    cellShape: "round",
    exposedHeight: 12,
    clearancePerSide: 0.3,
  }),
  preset("aaa", "AAA cells", "Three rows of five AAA cells, 0.3 mm clearance per side", {
    organizerWidth: 112,
    organizerDepth: 80,
    organizerHeight: 40,
    rows: 3,
    cellsPerRow: 5,
    cellDiameter: 10.5,
    cellLength: 44.5,
    cellShape: "round",
    exposedHeight: 10,
    clearancePerSide: 0.3,
  }),
  preset("c-cell", "C cells", "Two rows of four C cells, 0.4 mm clearance per side", {
    organizerWidth: 170,
    organizerDepth: 110,
    organizerHeight: 45,
    rows: 2,
    cellsPerRow: 4,
    cellDiameter: 26.2,
    cellLength: 50,
    cellShape: "round",
    exposedHeight: 12,
    clearancePerSide: 0.4,
  }),
  preset("d-cell", "D cells", "Two rows of four D cells, 0.4 mm clearance per side", {
    organizerWidth: 220,
    organizerDepth: 130,
    organizerHeight: 55,
    rows: 2,
    cellsPerRow: 4,
    cellDiameter: 34.2,
    cellLength: 61.5,
    cellShape: "round",
    exposedHeight: 14,
    clearancePerSide: 0.4,
    baseThickness: 3,
  }),
  preset("18650", "18650 cells", "Three rows of five 18650 cells, 0.3 mm clearance per side", {
    organizerWidth: 152,
    organizerDepth: 100,
    organizerHeight: 58,
    rows: 3,
    cellsPerRow: 5,
    cellDiameter: 18.6,
    cellLength: 65,
    cellShape: "round",
    exposedHeight: 14,
    clearancePerSide: 0.3,
  }),
  preset(
    "2032-coin",
    "2032 coin cells",
    "Two rows of five 2032 coin cells on edge, 0.4 mm clearance per side",
    {
      organizerWidth: 90,
      organizerDepth: 72,
      organizerHeight: 20,
      rows: 2,
      cellsPerRow: 5,
      cellDiameter: 20,
      cellLength: 3.2,
      cellShape: "slot",
      exposedHeight: 8,
      clearancePerSide: 0.4,
    },
  ),
];
