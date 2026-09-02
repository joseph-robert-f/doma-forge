import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  TOOL_FIN_RACK_DEFAULTS,
  TOOL_FIN_RACK_SPECS,
  type ToolFinRackParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<ToolFinRackParameters>,
): ProductPreset<ToolFinRackParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(TOOL_FIN_RACK_SPECS, TOOL_FIN_RACK_DEFAULTS, {
      ...TOOL_FIN_RACK_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Fin thickness and count are starting points for typical tool blades.
 * Measure your own tools and adjust; the fin gap must clear the widest
 * blade that slides in.
 */
export const TOOL_FIN_RACK_PRESETS: ProductPreset<ToolFinRackParameters>[] = [
  preset("pliers", "Pliers and cutters", "Five thick fins with a wide gap for plier jaws", {
    rackWidth: 170,
    rackDepth: 110,
    finCount: 5,
    finThickness: 4,
    finHeight: 55,
    baseThickness: 4,
  }),
  preset("files", "Files and screwdrivers", "Ten thin fins with a narrow, tight gap", {
    rackWidth: 200,
    rackDepth: 70,
    finCount: 10,
    finThickness: 2,
    finHeight: 25,
    baseThickness: 3,
  }),
  preset("wrenches", "Wrenches", "Four tall, thick fins for wrench heads", {
    rackWidth: 160,
    rackDepth: 130,
    finCount: 4,
    finThickness: 5,
    finHeight: 70,
    baseThickness: 5,
  }),
];
