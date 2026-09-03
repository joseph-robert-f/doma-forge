import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  HEADPHONE_MOUNT_DEFAULTS,
  HEADPHONE_MOUNT_SPECS,
  type HeadphoneMountParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<HeadphoneMountParameters>,
): ProductPreset<HeadphoneMountParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(HEADPHONE_MOUNT_SPECS, HEADPHONE_MOUNT_DEFAULTS, {
      ...HEADPHONE_MOUNT_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Every preset keeps the hook rule and the band opening. Measure your own
 * headband and controller before you print.
 */
export const HEADPHONE_MOUNT_PRESETS: ProductPreset<HeadphoneMountParameters>[] = [
  preset("headset-and-controller", "Headset and controller", "The wide hook with a pocket above it", {}),
  preset("headset-only", "Headset only", "The wide hook on a short plate, no pocket", {
    plateWidth: 60,
    plateHeight: 90,
    controllerPocket: false,
  }),
  preset("wide-controller", "Wide controller", "A deep pocket for a two-hand controller", {
    plateWidth: 180,
    plateHeight: 180,
    plateThickness: 6,
    hookWidth: 50,
    hookRoot: 12,
    hookProjection: 30,
    pocketWidth: 170,
    pocketDepth: 65,
    pocketLip: 16,
    pocketFloor: 6,
  }),
];
