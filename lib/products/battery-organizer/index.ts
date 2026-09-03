import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import { wallsFromSpecs } from "../../printer-profile";
import type { DerivedValue, ProductDefinition } from "../types";
import { loadGeometry } from "../geometry-registry";
import { BATTERY_ORGANIZER_COPY, BATTERY_ORGANIZER_ID } from "./copy";
import { BATTERY_ORGANIZER_PRESETS } from "./presets";
import {
  BATTERY_ORGANIZER_DEFAULTS,
  BATTERY_ORGANIZER_GROUPS,
  BATTERY_ORGANIZER_SPECS,
  FINGER_RELIEF_WIDEN_MM,
  LIGHTENING_WEB_MM,
  deriveLayout,
  type BatteryOrganizerParameters,
  type BatteryOrganizerSpecs,
} from "./schema";
import { validateBatteryOrganizer } from "./validate";

/**
 * Geometry version 1 is the first battery organizer algorithm: rounded
 * slab, one well array (round bore or rectangular slot) with an optional
 * finger relief counterbore, underside pockets. Increase it whenever equal
 * parameters would produce a different mesh, and re-record the golden test.
 */
export const BATTERY_ORGANIZER_GEOMETRY_VERSION = 1;

function signature(parameters: BatteryOrganizerParameters): string {
  return signatureFromSpecs(
    BATTERY_ORGANIZER_ID,
    BATTERY_ORGANIZER_GEOMETRY_VERSION,
    BATTERY_ORGANIZER_SPECS,
    parameters,
  );
}

function derive(parameters: BatteryOrganizerParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  const values: DerivedValue[] = [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "well-depth",
      label: "Well depth",
      value: `${formatMillimeters(layout.boreDepth)} mm`,
    },
  ];
  layout.rowLayouts.forEach((rowLayout, index) => {
    values.push({
      id: `row-${index + 1}-pitch`,
      label: `Row ${index + 1} pitch`,
      value: rowLayout.ok
        ? `${formatMillimeters(rowLayout.pitch)} mm, web ${formatMillimeters(rowLayout.web)} mm`
        : "does not fit",
    });
  });
  values.push({
    id: "base-under-wells",
    label: "Base under wells",
    value: `${formatMillimeters(layout.baseUnderWells)} mm`,
  });
  values.push({
    id: "underside-pockets",
    label: "Underside pockets",
    value: layout.lightening
      ? `${layout.lightening.countX} × ${layout.lightening.countY}, ${formatMillimeters(layout.lightening.pocketDepth)} mm deep`
      : "none",
  });
  return values;
}

export const batteryOrganizer: ProductDefinition<BatteryOrganizerSpecs> = {
  id: BATTERY_ORGANIZER_ID,
  geometryVersion: BATTERY_ORGANIZER_GEOMETRY_VERSION,
  label: "Battery organizer",
  family: "comb-array",
  copy: BATTERY_ORGANIZER_COPY,
  specs: BATTERY_ORGANIZER_SPECS,
  groups: BATTERY_ORGANIZER_GROUPS,
  defaults: BATTERY_ORGANIZER_DEFAULTS,
  presets: BATTERY_ORGANIZER_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(
      BATTERY_ORGANIZER_SPECS,
      BATTERY_ORGANIZER_DEFAULTS,
      input,
    ),
  validate: validateBatteryOrganizer,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<BatteryOrganizerParameters>(BATTERY_ORGANIZER_ID).then(
      (geometry) => geometry.generate(parameters),
    ),
  // The outside width is organizerWidth and the outside depth is
  // organizerDepth, one to one. The wells are not compensated; see
  // 20_KERNEL_MODULES_NOTES.md open issue 1, which applies here too.
  compensable: { x: ["organizerWidth"], y: ["organizerDepth"] },
  // The rim and the base are parameters, so the key-name rule finds them.
  // The webs between wells in a row and between rows are solved by the
  // pitch solver, narrowed further by the finger relief when it is on
  // (the relief widens each well's mouth, so it eats into the web the
  // plain footprint solved for; see RELIEF_MINIMUM_WEB_MM in validate.ts),
  // and the web between underside pockets is a fixed constant. None of the
  // three is named by any parameter, so the product reports them itself
  // (D-1703).
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(BATTERY_ORGANIZER_SPECS, parameters);
    const layout = deriveLayout(parameters);
    const widen = parameters.fingerRelief ? FINGER_RELIEF_WIDEN_MM : 0;
    const rowWebs = layout.rowLayouts
      .filter((row) => row.ok)
      .map((row) => row.web - widen);
    if (parameters.cellsPerRow > 1 && rowWebs.length > 0) {
      walls.push({
        key: "well-web",
        label: "Web between wells",
        value: Math.min(...rowWebs),
      });
    }
    if (layout.rowLayouts.length > 1 && layout.rowSpacing.ok) {
      walls.push({
        key: "row-web",
        label: "Web between rows",
        value: layout.rowSpacing.web - widen,
      });
    }
    if (layout.lightening) {
      walls.push({
        key: "pocket-web",
        label: "Web between underside pockets",
        value: LIGHTENING_WEB_MM,
      });
    }
    return walls;
  },
  boundsContract: (parameters) => ({
    min: [-parameters.organizerWidth / 2, -parameters.organizerDepth / 2, 0],
    max: [
      parameters.organizerWidth / 2,
      parameters.organizerDepth / 2,
      parameters.organizerHeight,
    ],
    tolerance: 1e-3,
  }),
  filename: (parameters) => {
    const size = [
      parameters.organizerWidth,
      parameters.organizerDepth,
      parameters.organizerHeight,
    ]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${BATTERY_ORGANIZER_ID}-${size}-${parameters.rows}x${parameters.cellsPerRow}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) =>
    `${formatMillimeters(parameters.organizerWidth)} × ${formatMillimeters(parameters.organizerDepth)} × ${formatMillimeters(parameters.organizerHeight)} mm · ${parameters.rows} × ${parameters.cellsPerRow} wells`,
};

export { BATTERY_ORGANIZER_COPY, BATTERY_ORGANIZER_ID } from "./copy";
export {
  BATTERY_ORGANIZER_DEFAULTS,
  BATTERY_ORGANIZER_SPECS,
  FINGER_RELIEF_DEPTH_MM,
  FINGER_RELIEF_WIDEN_MM,
  MINIMUM_WEB_MM,
  cellFootprint,
  deriveLayout,
  footprintClearsOuterWall,
  standingLength,
  type BatteryOrganizerLayout,
  type BatteryOrganizerParameters,
  type CellShape,
} from "./schema";
export { validateBatteryOrganizer } from "./validate";
