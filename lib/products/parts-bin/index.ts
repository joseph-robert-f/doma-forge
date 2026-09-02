import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { PARTS_BIN_COPY, PARTS_BIN_ID } from "./copy";
import { generatePartsBin } from "./geometry";
import { PARTS_BIN_PRESETS } from "./presets";
import {
  PARTS_BIN_DEFAULTS,
  PARTS_BIN_GROUPS,
  PARTS_BIN_SPECS,
  deriveLayout,
  type PartsBinParameters,
  type PartsBinSpecs,
} from "./schema";
import { validatePartsBin } from "./validate";

/**
 * Geometry version 1 is the first parts bin algorithm: the rounded shell,
 * the stacking lip, the underside recess, the front scoop, and the label
 * ledge. Increase it whenever equal parameters would produce a different
 * mesh, and re-record the golden test.
 */
export const PARTS_BIN_GEOMETRY_VERSION = 1;

function signature(parameters: PartsBinParameters): string {
  return signatureFromSpecs(
    PARTS_BIN_ID,
    PARTS_BIN_GEOMETRY_VERSION,
    PARTS_BIN_SPECS,
    parameters,
  );
}

const mm = (value: number) => formatMillimeters(value, 2);

function derive(parameters: PartsBinParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  return [
    {
      id: "outside-dimensions",
      // The lip stands above the bin height and the ledge stands in front of
      // the bin depth. This row is the bounding box of the printed part.
      label: "Outside, with the lip and the ledge",
      value: `${mm(layout.outsideWidth)} × ${mm(layout.outsideDepth)} × ${mm(layout.outsideHeight)} mm`,
    },
    {
      id: "bin-body",
      label: "Bin body",
      value: `${mm(layout.bodyWidth)} × ${mm(layout.bodyDepth)} × ${mm(layout.bodyHeight)} mm`,
    },
    {
      id: "stack-pitch",
      label: "Stack pitch",
      value: parameters.stacking
        ? `${mm(layout.stackPitch)} mm per bin`
        : "does not stack",
    },
    {
      id: "inside-dimensions",
      label: "Inside",
      value: `${mm(layout.insideWidth)} × ${mm(layout.insideDepth)} × ${mm(layout.insideHeight)} mm`,
    },
    {
      id: "stacking-lip",
      label: "Stacking lip",
      value:
        parameters.stacking && layout.fits
          ? `${mm(parameters.lipWallThickness)} mm wide, ${mm(parameters.lipHeight)} mm high, ${mm(parameters.stackClearance)} mm clearance, ${mm(layout.wallBesideRecess)} mm of wall on each side`
          : parameters.stacking
            ? "does not fit"
            : "none",
    },
    {
      id: "front-scoop",
      label: "Front scoop",
      value: parameters.frontScoop ? `${mm(layout.scoopRadius)} mm radius` : "none",
    },
    {
      id: "label-ledge",
      label: "Label ledge",
      value: parameters.labelLedge
        ? `${mm(layout.ledgeWidth)} mm wide, ${mm(layout.ledgeProjection)} mm in front of the bin`
        : "none",
    },
  ];
}

export const partsBin: ProductDefinition<PartsBinSpecs> = {
  id: PARTS_BIN_ID,
  geometryVersion: PARTS_BIN_GEOMETRY_VERSION,
  label: "Stackable parts bin",
  family: "shelled-tray",
  copy: PARTS_BIN_COPY,
  specs: PARTS_BIN_SPECS,
  groups: PARTS_BIN_GROUPS,
  defaults: PARTS_BIN_DEFAULTS,
  presets: PARTS_BIN_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(PARTS_BIN_SPECS, PARTS_BIN_DEFAULTS, input),
  validate: validatePartsBin,
  signature,
  derive,
  generate: generatePartsBin,
  // The outside width is binWidth and the outside depth is binDepth, one to
  // one. The label ledge stands in front of the corrected depth.
  compensable: { x: ["binWidth"], y: ["binDepth"] },
  boundsContract: (parameters) => {
    const layout = deriveLayout(parameters);
    return {
      min: [-layout.bodyWidth / 2, -layout.bodyDepth / 2 - layout.ledgeProjection, 0],
      // The lip stands on the top rim, so the model is taller than the bin
      // height by the lip height. The contract states the true top.
      max: [layout.bodyWidth / 2, layout.bodyDepth / 2, layout.outsideHeight],
      tolerance: 1e-3,
    };
  },
  filename: (parameters) => {
    const size = [parameters.binWidth, parameters.binDepth, parameters.binHeight]
      .map(filenameNumber)
      .join("x");
    const stack = parameters.stacking ? "stack" : "plain";
    return `drawerforge-${PARTS_BIN_ID}-${size}-${stack}-${shortHash(signature(parameters))}.stl`;
  },
  // The printed box, the lip and the ledge included, the same way the other
  // two products report their outside size.
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${parameters.stacking ? "stacks" : "single"}`;
  },
};

export { PARTS_BIN_COPY, PARTS_BIN_ID } from "./copy";
export { buildPartsBinSolid, generatePartsBin } from "./geometry";
export { PARTS_BIN_PRESETS } from "./presets";
export {
  LABEL_LEDGE_HEIGHT_MM,
  LABEL_LEDGE_PROJECTION_MM,
  LABEL_LEDGE_SHELF_MM,
  LABEL_LEDGE_SLOT_MM,
  MINIMUM_STACKING_WALL_MM,
  PARTS_BIN_DEFAULTS,
  PARTS_BIN_SPECS,
  RECESS_WALL_RESERVE_MM,
  deriveLayout,
  scoopRadius,
  stackFitClearances,
  stackedRecessFrame,
  type PartsBinLayout,
  type PartsBinParameters,
  type RingFrame,
  type StackFitClearances,
} from "./schema";
export { validatePartsBin } from "./validate";
