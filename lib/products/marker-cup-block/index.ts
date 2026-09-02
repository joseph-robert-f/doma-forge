import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { MARKER_CUP_BLOCK_COPY, MARKER_CUP_BLOCK_ID } from "./copy";
import { generateMarkerCupBlock } from "./geometry";
import { MARKER_CUP_BLOCK_PRESETS } from "./presets";
import {
  MARKER_CUP_BLOCK_DEFAULTS,
  MARKER_CUP_BLOCK_GROUPS,
  MARKER_CUP_BLOCK_SPECS,
  deriveLayout,
  type MarkerCupBlockParameters,
  type MarkerCupBlockSpecs,
} from "./schema";
import { validateMarkerCupBlock } from "./validate";

/**
 * Geometry version 1 is the first marker cup block algorithm: rounded slab,
 * one tilted-bore array, underside pockets. Increase it whenever equal
 * parameters would produce a different mesh, and re-record the golden test.
 */
export const MARKER_CUP_BLOCK_GEOMETRY_VERSION = 1;

function signature(parameters: MarkerCupBlockParameters): string {
  return signatureFromSpecs(
    MARKER_CUP_BLOCK_ID,
    MARKER_CUP_BLOCK_GEOMETRY_VERSION,
    MARKER_CUP_BLOCK_SPECS,
    parameters,
  );
}

function derive(parameters: MarkerCupBlockParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  const values: DerivedValue[] = [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
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
    id: "base-under-bores",
    label: "Base under bores",
    value: `${formatMillimeters(layout.baseUnderBores)} mm`,
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

export const markerCupBlock: ProductDefinition<MarkerCupBlockSpecs> = {
  id: MARKER_CUP_BLOCK_ID,
  geometryVersion: MARKER_CUP_BLOCK_GEOMETRY_VERSION,
  label: "Marker and brush cup block",
  family: "comb-array",
  copy: MARKER_CUP_BLOCK_COPY,
  specs: MARKER_CUP_BLOCK_SPECS,
  groups: MARKER_CUP_BLOCK_GROUPS,
  defaults: MARKER_CUP_BLOCK_DEFAULTS,
  presets: MARKER_CUP_BLOCK_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(MARKER_CUP_BLOCK_SPECS, MARKER_CUP_BLOCK_DEFAULTS, input),
  validate: validateMarkerCupBlock,
  signature,
  derive,
  generate: generateMarkerCupBlock,
  // The outside width is blockWidth and the outside depth is blockDepth,
  // one to one. The bores are not compensated; see 20_KERNEL_MODULES_NOTES.md
  // open issue 1, which applies here too.
  compensable: { x: ["blockWidth"], y: ["blockDepth"] },
  boundsContract: (parameters) => ({
    min: [-parameters.blockWidth / 2, -parameters.blockDepth / 2, 0],
    max: [parameters.blockWidth / 2, parameters.blockDepth / 2, parameters.blockHeight],
    tolerance: 1e-3,
  }),
  filename: (parameters) => {
    const size = [parameters.blockWidth, parameters.blockDepth, parameters.blockHeight]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${MARKER_CUP_BLOCK_ID}-${size}-${parameters.rows}x${parameters.cupsPerRow}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) =>
    `${formatMillimeters(parameters.blockWidth)} × ${formatMillimeters(parameters.blockDepth)} × ${formatMillimeters(parameters.blockHeight)} mm · ${parameters.rows} × ${parameters.cupsPerRow} cups`,
};

export { MARKER_CUP_BLOCK_COPY, MARKER_CUP_BLOCK_ID } from "./copy";
export { generateMarkerCupBlock } from "./geometry";
export {
  CHAMFER_MM,
  MARKER_CUP_BLOCK_DEFAULTS,
  MARKER_CUP_BLOCK_SPECS,
  MAXIMUM_TILT_DEGREES,
  MINIMUM_WEB_MM,
  boreFloorSemiAxes,
  boreFloorY,
  boreMouthSemiAxes,
  deriveLayout,
  footprintClearsOuterWall,
  type MarkerCupBlockLayout,
  type MarkerCupBlockParameters,
} from "./schema";
export { validateMarkerCupBlock } from "./validate";
