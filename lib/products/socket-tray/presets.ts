import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  SOCKET_TRAY_DEFAULTS,
  SOCKET_TRAY_SPECS,
  type SocketTrayParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<SocketTrayParameters>,
): ProductPreset<SocketTrayParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(SOCKET_TRAY_SPECS, SOCKET_TRAY_DEFAULTS, {
      ...SOCKET_TRAY_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Bore sizes are typical outside diameters for each drive size, not a
 * brand's. Measure your own set and adjust the row diameters.
 */
export const SOCKET_TRAY_PRESETS: ProductPreset<SocketTrayParameters>[] = [
  preset(
    "quarter-inch",
    "Quarter-inch drive set",
    "Two rows for small sockets, 13 and 17 mm bores",
    {
      trayWidth: 170,
      trayDepth: 90,
      trayHeight: 24,
      rows: 2,
      holesPerRow: 7,
      boreDiameter1: 13,
      boreDiameter2: 17,
      boreDepth: 16,
    },
  ),
  preset(
    "half-inch",
    "Half-inch drive set",
    "Two rows for large sockets, 27 and 33 mm bores",
    {
      trayWidth: 260,
      trayDepth: 130,
      trayHeight: 32,
      rows: 2,
      holesPerRow: 6,
      boreDiameter1: 27,
      boreDiameter2: 33,
      boreDepth: 22,
    },
  ),
  preset("driver-bits", "Driver bits", "One row of twelve shallow 7.5 mm bores", {
    trayWidth: 150,
    trayDepth: 40,
    trayHeight: 18,
    rows: 1,
    holesPerRow: 12,
    boreDiameter1: 7.5,
    boreDepth: 12,
    lightenUnderside: false,
  }),
];
