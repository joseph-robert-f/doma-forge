import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { ProductDefinition } from "../types";
import { generateFitTestCoupon } from "./coupon";
import { generateDrawerTray } from "./geometry";
import { DRAWER_TRAY_PRESETS } from "./presets";
import {
  DRAWER_TRAY_DEFAULTS,
  DRAWER_TRAY_GROUPS,
  DRAWER_TRAY_SPECS,
  deriveDimensions,
  type DrawerTrayParameters,
  type DrawerTraySpecs,
} from "./schema";
import { validateDrawerTray } from "./validate";

export const DRAWER_TRAY_ID = "drawer-tray";

/**
 * Geometry version 1 is the original DrawerForge tray algorithm. Increase it
 * whenever equal parameters would produce a different mesh, and add a golden
 * test for the new version.
 */
export const DRAWER_TRAY_GEOMETRY_VERSION = 1;

function signature(parameters: DrawerTrayParameters): string {
  return signatureFromSpecs(
    DRAWER_TRAY_ID,
    DRAWER_TRAY_GEOMETRY_VERSION,
    DRAWER_TRAY_SPECS,
    parameters,
  );
}

export const drawerTray: ProductDefinition<DrawerTraySpecs> = {
  id: DRAWER_TRAY_ID,
  geometryVersion: DRAWER_TRAY_GEOMETRY_VERSION,
  label: "Drawer organizer tray",
  family: "shelled-tray",
  copy: {
    eyebrow: "Parametric tray builder",
    headline: "Fit every small thing into its place.",
    intro:
      "Enter your drawer measurements, choose a layout, and export a print-ready organizer—no CAD required.",
    presetLegend: "Start with a workshop preset",
    customPresetLabel: "Custom",
    customPresetDescription: "Your own measured layout",
    derivedTitle: "Your organizer",
    previewLabel: "Organizer preview",
  },
  specs: DRAWER_TRAY_SPECS,
  groups: DRAWER_TRAY_GROUPS,
  defaults: DRAWER_TRAY_DEFAULTS,
  presets: DRAWER_TRAY_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(DRAWER_TRAY_SPECS, DRAWER_TRAY_DEFAULTS, input),
  validate: validateDrawerTray,
  signature,
  derive: (parameters) => {
    const derived = deriveDimensions(parameters);
    return [
      {
        id: "outside-dimensions",
        label: "Outside",
        value: `${formatMillimeters(derived.outsideWidth)} × ${formatMillimeters(derived.outsideDepth)} × ${formatMillimeters(derived.outsideHeight)} mm`,
      },
      {
        id: "compartment-dimensions",
        label: "Each compartment",
        value: `≈ ${formatMillimeters(derived.compartmentWidth)} × ${formatMillimeters(derived.compartmentDepth)} mm`,
      },
    ];
  },
  generate: generateDrawerTray,
  coupon: generateFitTestCoupon,
  boundsContract: (parameters) => {
    const derived = deriveDimensions(parameters);
    return {
      min: [-derived.outsideWidth / 2, -derived.outsideDepth / 2, 0],
      max: [
        derived.outsideWidth / 2,
        derived.outsideDepth / 2,
        derived.outsideHeight,
      ],
      tolerance: 1e-3,
    };
  },
  filename: (parameters) => {
    const derived = deriveDimensions(parameters);
    const size = [
      derived.outsideWidth,
      derived.outsideDepth,
      derived.outsideHeight,
    ]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${DRAWER_TRAY_ID}-${size}-${parameters.rows}x${parameters.columns}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const derived = deriveDimensions(parameters);
    return `${formatMillimeters(derived.outsideWidth)} × ${formatMillimeters(derived.outsideDepth)} × ${formatMillimeters(derived.outsideHeight)} mm · ${parameters.rows} × ${parameters.columns}`;
  },
};

export { getFingerScoopRadius } from "./geometry";
export {
  FIT_TEST_COUPON_HEIGHT,
  FIT_TEST_COUPON_MINIMUM_WALL,
  buildFitTestCouponMesh,
  generateFitTestCoupon,
  getCouponWallThickness,
} from "./coupon";
export {
  DRAWER_TRAY_DEFAULTS,
  DRAWER_TRAY_SPECS,
  deriveDimensions,
  type DerivedDimensions,
  type DrawerTrayParameters,
} from "./schema";
export { validateDrawerTray } from "./validate";
