import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { REMOTE_CADDY_COPY, REMOTE_CADDY_ID } from "./copy";
import { generateRemoteCaddy } from "./geometry";
import { REMOTE_CADDY_PRESETS } from "./presets";
import {
  REMOTE_CADDY_DEFAULTS,
  REMOTE_CADDY_GROUPS,
  REMOTE_CADDY_SPECS,
  deriveLayout,
  solveLastWell,
  type RemoteCaddyParameters,
  type RemoteCaddySpecs,
} from "./schema";
import { validateRemoteCaddy } from "./validate";

/**
 * Geometry version 1 is the first remote caddy algorithm: rounded shell,
 * dividers at solved positions, lowered front wall. Increase it whenever
 * equal parameters would produce a different mesh, and re-record the golden
 * test.
 */
export const REMOTE_CADDY_GEOMETRY_VERSION = 1;

function signature(parameters: RemoteCaddyParameters): string {
  return signatureFromSpecs(
    REMOTE_CADDY_ID,
    REMOTE_CADDY_GEOMETRY_VERSION,
    REMOTE_CADDY_SPECS,
    parameters,
  );
}

function derive(parameters: RemoteCaddyParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  return [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "well-widths",
      label: `Well widths (${layout.wellCount})`,
      value: layout.fits
        ? `${layout.wellWidths.map((width) => formatMillimeters(width)).join(" × ")} mm`
        : "does not fit",
    },
    {
      id: "base-under-wells",
      label: "Base under wells",
      value: `${formatMillimeters(layout.floorZ)} mm`,
    },
    {
      id: "front-wall",
      label: "Front wall",
      value: `${formatMillimeters(parameters.frontWallHeight)} mm, ${formatMillimeters(parameters.frontWallHeight - layout.floorZ)} mm above the floor`,
    },
  ];
}

export const remoteCaddy: ProductDefinition<RemoteCaddySpecs> = {
  id: REMOTE_CADDY_ID,
  geometryVersion: REMOTE_CADDY_GEOMETRY_VERSION,
  label: "Remote and controller caddy",
  family: "shelled-tray",
  copy: REMOTE_CADDY_COPY,
  specs: REMOTE_CADDY_SPECS,
  groups: REMOTE_CADDY_GROUPS,
  defaults: REMOTE_CADDY_DEFAULTS,
  presets: REMOTE_CADDY_PRESETS,
  // The last well is solved from the inside width, and normalization writes
  // that width back into the list, so the field, the signature, the file
  // name, and the mesh all carry one number. See D-1415.
  normalize: (input) =>
    solveLastWell(
      normalizeFromSpecs(REMOTE_CADDY_SPECS, REMOTE_CADDY_DEFAULTS, input),
    ),
  validate: validateRemoteCaddy,
  signature,
  derive,
  generate: generateRemoteCaddy,
  // The outside width is caddyWidth and the outside depth is caddyDepth, one
  // to one, the same semantics the drawer tray uses. The solved well takes
  // the correction on the width, so the wells the user typed keep their size.
  compensable: { x: ["caddyWidth"], y: ["caddyDepth"] },
  boundsContract: (parameters) => ({
    min: [-parameters.caddyWidth / 2, -parameters.caddyDepth / 2, 0],
    max: [
      parameters.caddyWidth / 2,
      parameters.caddyDepth / 2,
      parameters.caddyHeight,
    ],
    tolerance: 1e-3,
  }),
  filename: (parameters) => {
    const size = [
      parameters.caddyWidth,
      parameters.caddyDepth,
      parameters.caddyHeight,
    ]
      .map(filenameNumber)
      .join("x");
    const wells = deriveLayout(parameters).wellCount;
    return `drawerforge-${REMOTE_CADDY_ID}-${size}-${wells}w-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${layout.wellCount} wells`;
  },
};

export { REMOTE_CADDY_COPY, REMOTE_CADDY_ID } from "./copy";
export { generateRemoteCaddy } from "./geometry";
export {
  MINIMUM_FRONT_WALL_ABOVE_FLOOR_MM,
  MINIMUM_WELL_MM,
  REMOTE_CADDY_DEFAULTS,
  REMOTE_CADDY_SPECS,
  deriveLayout,
  solveLastWell,
  type RemoteCaddyLayout,
  type RemoteCaddyParameters,
} from "./schema";
export { validateRemoteCaddy } from "./validate";
