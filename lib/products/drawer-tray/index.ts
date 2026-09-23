import { drawerTraySurfaceZones } from "./surface-zones";
import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import { loadGeometry } from "../geometry-registry";
import type { ProductDefinition } from "../types";
import { DRAWER_TRAY_COPY, DRAWER_TRAY_ID } from "./copy";
import { DRAWER_TRAY_PRESETS } from "./presets";
import {
  DRAWER_TRAY_DEFAULTS,
  DRAWER_TRAY_GROUPS,
  FIT_TEST_COUPON_HEIGHT,
  DRAWER_TRAY_SPECS,
  deriveDimensions,
  type DrawerTrayParameters,
  type DrawerTraySpecs,
} from "./schema";
import { validateDrawerTray } from "./validate";

/**
 * Geometry version 1 is the original DrawerForge tray algorithm. Version 2
 * keeps patterned floor openings inside the rounded cavity. Version 3 keeps
 * the finger scoop clear of grid dividers. Increase it whenever equal
 * parameters would produce a different mesh.
 */
export const DRAWER_TRAY_GEOMETRY_VERSION = 3;

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
  copy: DRAWER_TRAY_COPY,
  specs: DRAWER_TRAY_SPECS,
  groups: DRAWER_TRAY_GROUPS,
  defaults: DRAWER_TRAY_DEFAULTS,
  surfaceZones: drawerTraySurfaceZones,
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
  generate: (parameters) =>
    loadGeometry<DrawerTrayParameters>(DRAWER_TRAY_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  coupon: (parameters) =>
    loadGeometry<DrawerTrayParameters>(DRAWER_TRAY_ID).then((geometry) =>
      geometry.coupon!(parameters),
    ),
  // The coupon is a perimeter ring with the tray's footprint, FIT_TEST_COUPON_HEIGHT tall.
  couponBoundsContract: (parameters) => {
    const derived = deriveDimensions(parameters);
    return {
      min: [-derived.outsideWidth / 2, -derived.outsideDepth / 2, 0],
      max: [
        derived.outsideWidth / 2,
        derived.outsideDepth / 2,
        FIT_TEST_COUPON_HEIGHT,
      ],
      tolerance: 1e-3,
    };
  },
  // The outside width follows drawerWidth, and the outside depth follows
  // drawerDepth, one to one: a millimeter added here is a millimeter added
  // to the printed part. Clearance, walls, and dividers are not compensated.
  compensable: { x: ["drawerWidth"], y: ["drawerDepth"] },
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

export { DRAWER_TRAY_COPY, DRAWER_TRAY_ID } from "./copy";
export {
  DRAWER_TRAY_DEFAULTS,
  DRAWER_TRAY_SPECS,
  FIT_TEST_COUPON_HEIGHT,
  FIT_TEST_COUPON_MINIMUM_WALL,
  deriveDimensions,
  getCouponWallThickness,
  type DerivedDimensions,
  type DrawerTrayParameters,
} from "./schema";
export { validateDrawerTray } from "./validate";
