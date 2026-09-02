import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { SOCKET_TRAY_COPY, SOCKET_TRAY_ID } from "./copy";
import { generateSocketTray } from "./geometry";
import { SOCKET_TRAY_PRESETS } from "./presets";
import {
  SOCKET_TRAY_DEFAULTS,
  SOCKET_TRAY_GROUPS,
  SOCKET_TRAY_SPECS,
  deriveLayout,
  type SocketTrayParameters,
  type SocketTraySpecs,
} from "./schema";
import { validateSocketTray } from "./validate";

/**
 * Geometry version 1 is the first socket tray algorithm: rounded slab, one
 * bore array per row, underside pockets. Increase it whenever equal
 * parameters would produce a different mesh, and re-record the golden test.
 */
export const SOCKET_TRAY_GEOMETRY_VERSION = 1;

function signature(parameters: SocketTrayParameters): string {
  return signatureFromSpecs(
    SOCKET_TRAY_ID,
    SOCKET_TRAY_GEOMETRY_VERSION,
    SOCKET_TRAY_SPECS,
    parameters,
  );
}

function derive(parameters: SocketTrayParameters): DerivedValue[] {
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

export const socketTray: ProductDefinition<SocketTraySpecs> = {
  id: SOCKET_TRAY_ID,
  geometryVersion: SOCKET_TRAY_GEOMETRY_VERSION,
  label: "Bit, socket, and driver tray",
  family: "comb-array",
  copy: SOCKET_TRAY_COPY,
  specs: SOCKET_TRAY_SPECS,
  groups: SOCKET_TRAY_GROUPS,
  defaults: SOCKET_TRAY_DEFAULTS,
  presets: SOCKET_TRAY_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(SOCKET_TRAY_SPECS, SOCKET_TRAY_DEFAULTS, input),
  validate: validateSocketTray,
  signature,
  derive,
  generate: generateSocketTray,
  // The outside width is trayWidth and the outside depth is trayDepth, one
  // to one. The bores are not compensated; see 20_KERNEL_MODULES_NOTES.md.
  compensable: { x: ["trayWidth"], y: ["trayDepth"] },
  boundsContract: (parameters) => ({
    min: [-parameters.trayWidth / 2, -parameters.trayDepth / 2, 0],
    max: [parameters.trayWidth / 2, parameters.trayDepth / 2, parameters.trayHeight],
    tolerance: 1e-3,
  }),
  filename: (parameters) => {
    const size = [parameters.trayWidth, parameters.trayDepth, parameters.trayHeight]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${SOCKET_TRAY_ID}-${size}-${parameters.rows}x${parameters.holesPerRow}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) =>
    `${formatMillimeters(parameters.trayWidth)} × ${formatMillimeters(parameters.trayDepth)} × ${formatMillimeters(parameters.trayHeight)} mm · ${parameters.rows} × ${parameters.holesPerRow} bores`,
};

export { SOCKET_TRAY_COPY, SOCKET_TRAY_ID } from "./copy";
export { generateSocketTray } from "./geometry";
export {
  CHAMFER_MM,
  MINIMUM_WEB_MM,
  SOCKET_TRAY_DEFAULTS,
  SOCKET_TRAY_MAX_ROWS,
  SOCKET_TRAY_SPECS,
  activeRowDiameters,
  deriveLayout,
  type SocketTrayLayout,
  type SocketTrayParameters,
} from "./schema";
export { validateSocketTray } from "./validate";
