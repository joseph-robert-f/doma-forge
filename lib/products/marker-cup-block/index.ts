import { isSurfacePatternActive } from "../../surface-patterns";
import { surfaceZones } from "./surface-zones";
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
import { MARKER_CUP_BLOCK_COPY, MARKER_CUP_BLOCK_ID } from "./copy";
import { MARKER_CUP_BLOCK_PRESETS } from "./presets";
import {
  LIGHTENING_WEB_MM,
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
      : isSurfacePatternActive(parameters.surfaceTreatments, "base")
        ? "none, base pattern replaces underside pockets"
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
  surfaceZones,
  presets: MARKER_CUP_BLOCK_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(
      MARKER_CUP_BLOCK_SPECS,
      MARKER_CUP_BLOCK_DEFAULTS,
      input,
    ),
  validate: validateMarkerCupBlock,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<MarkerCupBlockParameters>(MARKER_CUP_BLOCK_ID).then(
      (geometry) => geometry.generate(parameters),
    ),
  // The outside width is blockWidth and the outside depth is blockDepth,
  // one to one. The bores are not compensated; see 20_KERNEL_MODULES_NOTES.md
  // open issue 1, which applies here too.
  compensable: { x: ["blockWidth"], y: ["blockDepth"] },
  // The rim and the base are parameters, so the key-name rule finds them.
  // The webs between cups in a row and between rows are solved by the pitch
  // solver, and the web between underside pockets is a fixed constant, so
  // none of the three is named by any parameter; the product reports them
  // itself (D-1703).
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(MARKER_CUP_BLOCK_SPECS, parameters);
    const layout = deriveLayout(parameters);
    const rowWebs = layout.rowLayouts
      .filter((row) => row.ok)
      .map((row) => row.web);
    if (parameters.cupsPerRow > 1 && rowWebs.length > 0) {
      walls.push({
        key: "bore-web",
        label: "Web between cups",
        value: Math.min(...rowWebs),
      });
    }
    if (layout.rowLayouts.length > 1 && layout.rowSpacing.ok) {
      walls.push({
        key: "row-web",
        label: "Web between rows",
        value: layout.rowSpacing.web,
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
    min: [-parameters.blockWidth / 2, -parameters.blockDepth / 2, 0],
    max: [
      parameters.blockWidth / 2,
      parameters.blockDepth / 2,
      parameters.blockHeight,
    ],
    tolerance: 1e-3,
  }),
  filename: (parameters) => {
    const size = [
      parameters.blockWidth,
      parameters.blockDepth,
      parameters.blockHeight,
    ]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${MARKER_CUP_BLOCK_ID}-${size}-${parameters.rows}x${parameters.cupsPerRow}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) =>
    `${formatMillimeters(parameters.blockWidth)} × ${formatMillimeters(parameters.blockDepth)} × ${formatMillimeters(parameters.blockHeight)} mm · ${parameters.rows} × ${parameters.cupsPerRow} cups`,
};

export { MARKER_CUP_BLOCK_COPY, MARKER_CUP_BLOCK_ID } from "./copy";
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
