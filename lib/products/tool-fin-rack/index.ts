import { surfaceZones } from "./surface-zones";
import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { loadGeometry } from "../geometry-registry";
import { TOOL_FIN_RACK_COPY, TOOL_FIN_RACK_ID } from "./copy";
import { TOOL_FIN_RACK_PRESETS } from "./presets";
import {
  FIN_FILLET_WIDTH_MM,
  TOOL_FIN_RACK_DEFAULTS,
  TOOL_FIN_RACK_GROUPS,
  TOOL_FIN_RACK_SPECS,
  deriveLayout,
  type ToolFinRackParameters,
  type ToolFinRackSpecs,
} from "./schema";
import { validateToolFinRack } from "./validate";

/**
 * Geometry version 1 is the first tool fin rack algorithm: rounded base
 * slab, one filleted fin array unioned onto it. Increase it whenever equal
 * parameters would produce a different mesh, and re-record the golden test.
 */
export const TOOL_FIN_RACK_GEOMETRY_VERSION = 1;

function signature(parameters: ToolFinRackParameters): string {
  return signatureFromSpecs(
    TOOL_FIN_RACK_ID,
    TOOL_FIN_RACK_GEOMETRY_VERSION,
    TOOL_FIN_RACK_SPECS,
    parameters,
  );
}

function derive(parameters: ToolFinRackParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  const values: DerivedValue[] = [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "fin-pitch",
      label: "Fin pitch",
      value: layout.finLayout.ok
        ? `${formatMillimeters(layout.finLayout.pitch)} mm, gap ${formatMillimeters(layout.finLayout.web)} mm`
        : "does not fit",
    },
    {
      id: "fin-gap-at-foot",
      label: "Blade gap at the fillet foot",
      // The fillet strip is FIN_FILLET_WIDTH_MM wider on each side than
      // the fin itself, so the gap between two fins is narrower there
      // than the plain gap the pitch derives, by twice that width.
      value: layout.finLayout.ok
        ? `${formatMillimeters(layout.finLayout.web - 2 * FIN_FILLET_WIDTH_MM)} mm`
        : "does not fit",
    },
    {
      id: "fin-length",
      label: "Fin length, front to back",
      value: `${formatMillimeters(layout.finLength)} mm`,
    },
  ];
  return values;
}

export const toolFinRack: ProductDefinition<ToolFinRackSpecs> = {
  id: TOOL_FIN_RACK_ID,
  geometryVersion: TOOL_FIN_RACK_GEOMETRY_VERSION,
  label: "Tool fin rack",
  family: "comb-array",
  copy: TOOL_FIN_RACK_COPY,
  specs: TOOL_FIN_RACK_SPECS,
  groups: TOOL_FIN_RACK_GROUPS,
  defaults: TOOL_FIN_RACK_DEFAULTS,
  surfaceZones,
  presets: TOOL_FIN_RACK_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(TOOL_FIN_RACK_SPECS, TOOL_FIN_RACK_DEFAULTS, input),
  validate: validateToolFinRack,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<ToolFinRackParameters>(TOOL_FIN_RACK_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // The outside width is rackWidth and the outside depth is rackDepth, one
  // to one. The fin gap is not compensated.
  compensable: { x: ["rackWidth"], y: ["rackDepth"] },
  boundsContract: (parameters) => {
    const layout = deriveLayout(parameters);
    return {
      min: [-parameters.rackWidth / 2, -parameters.rackDepth / 2, 0],
      max: [
        parameters.rackWidth / 2,
        parameters.rackDepth / 2,
        layout.outsideHeight,
      ],
      tolerance: 1e-3,
    };
  },
  filename: (parameters) => {
    const layout = deriveLayout(parameters);
    const size = [
      parameters.rackWidth,
      parameters.rackDepth,
      layout.outsideHeight,
    ]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${TOOL_FIN_RACK_ID}-${size}-${parameters.finCount}fins-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(parameters.rackWidth)} × ${formatMillimeters(parameters.rackDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${parameters.finCount} fins`;
  },
};

export { TOOL_FIN_RACK_COPY, TOOL_FIN_RACK_ID } from "./copy";
export {
  FIN_FILLET_HEIGHT_MM,
  FIN_FILLET_WIDTH_MM,
  MAXIMUM_HEIGHT_TO_THICKNESS,
  MINIMUM_WEB_MM,
  TOOL_FIN_RACK_DEFAULTS,
  TOOL_FIN_RACK_SPECS,
  deriveLayout,
  footprintClearsOuterSlab,
  type ToolFinRackLayout,
  type ToolFinRackParameters,
} from "./schema";
export { validateToolFinRack } from "./validate";
