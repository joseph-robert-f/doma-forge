import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  DRAWER_TRAY_DEFAULTS,
  DRAWER_TRAY_SPECS,
  type DrawerTrayParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<DrawerTrayParameters>,
): ProductPreset<DrawerTrayParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(DRAWER_TRAY_SPECS, DRAWER_TRAY_DEFAULTS, {
      ...DRAWER_TRAY_DEFAULTS,
      ...overrides,
    }),
  };
}

export const DRAWER_TRAY_PRESETS: ProductPreset<DrawerTrayParameters>[] = [
  preset("tools", "Hand tools", "Long, roomy lanes for drivers and pliers", {
    drawerWidth: 360,
    drawerDepth: 260,
    organizerHeight: 55,
    cornerRadius: 10,
    rows: 2,
    columns: 4,
    dividerThickness: 2.2,
  }),
  preset("desk-supplies", "Desk supplies", "Balanced everyday compartments", {
    drawerWidth: 320,
    drawerDepth: 220,
    organizerHeight: 45,
    rows: 2,
    columns: 3,
  }),
  preset("hardware", "Hardware", "A dense grid for small parts", {
    organizerHeight: 38,
    rows: 4,
    columns: 4,
    fingerScoop: false,
  }),
];
