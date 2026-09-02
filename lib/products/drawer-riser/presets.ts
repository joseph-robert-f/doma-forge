import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  DRAWER_RISER_DEFAULTS,
  DRAWER_RISER_SPECS,
  type DrawerRiserParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<DrawerRiserParameters>,
): ProductPreset<DrawerRiserParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(DRAWER_RISER_SPECS, DRAWER_RISER_DEFAULTS, {
      ...DRAWER_RISER_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Every preset keeps the riser under the usable height it names. Measure
 * your own drawer and set the four fit values before you print.
 */
export const DRAWER_RISER_PRESETS: ProductPreset<DrawerRiserParameters>[] = [
  preset("desk-drawer", "Desk drawer", "A low riser over flat items", {
    drawerWidth: 320,
    drawerDepth: 220,
    drawerUsableHeight: 100,
    clearHeight: 35,
    trayHeight: 28,
    legSection: 12,
    rows: 2,
    columns: 3,
  }),
  preset("deep-workshop-drawer", "Deep workshop drawer", "A tall riser over boxed parts", {
    drawerWidth: 400,
    drawerDepth: 300,
    drawerUsableHeight: 180,
    clearHeight: 90,
    trayHeight: 45,
    legSection: 16,
    rows: 2,
    columns: 4,
    wallThickness: 2.4,
    baseThickness: 3,
    cornerRadius: 6,
  }),
  preset("narrow-drawer", "Narrow drawer", "Two long lanes over a shallow drawer", {
    drawerWidth: 180,
    drawerDepth: 260,
    drawerUsableHeight: 90,
    clearHeight: 30,
    trayHeight: 25,
    legSection: 10,
    rows: 1,
    columns: 2,
  }),
];
