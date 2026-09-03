import { beamLoadNewtons, cantileverLoadNewtons, loadNote } from "../../kernel/brackets";
import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { HEADPHONE_MOUNT_COPY, HEADPHONE_MOUNT_ID } from "./copy";
import { generateHeadphoneMount } from "./geometry";
import { HEADPHONE_MOUNT_PRESETS } from "./presets";
import {
  HEADPHONE_MOUNT_DEFAULTS,
  HEADPHONE_MOUNT_GROUPS,
  HEADPHONE_MOUNT_SPECS,
  deriveLayout,
  type HeadphoneMountParameters,
  type HeadphoneMountSpecs,
} from "./schema";
import { validateHeadphoneMount } from "./validate";

/**
 * Geometry version 1 is the first headphone mount algorithm: a rounded
 * plate, one wide filleted J-hook, an optional pocket built as a wider
 * J-hook with two side walls, and two countersunk screw bores on the center
 * line. Increase it whenever equal parameters would produce a different
 * mesh, and re-record the golden test.
 */
export const HEADPHONE_MOUNT_GEOMETRY_VERSION = 1;

function signature(parameters: HeadphoneMountParameters): string {
  return signatureFromSpecs(
    HEADPHONE_MOUNT_ID,
    HEADPHONE_MOUNT_GEOMETRY_VERSION,
    HEADPHONE_MOUNT_SPECS,
    parameters,
  );
}

function derive(parameters: HeadphoneMountParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  const values: DerivedValue[] = [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "hook-opening",
      label: "Hook opening",
      value: Number.isFinite(layout.hookOpening)
        ? `${formatMillimeters(layout.hookOpening)} mm between the plate and the lip, for a ${formatMillimeters(parameters.bandGauge)} mm band`
        : "—",
    },
    {
      id: "screw-spacing",
      label: "Screw spacing",
      value: Number.isFinite(layout.upperScrewZ - layout.lowerScrewZ)
        ? `2 on the center line, ${formatMillimeters(layout.upperScrewZ - layout.lowerScrewZ)} mm apart`
        : "—",
    },
    {
      id: "hook-load",
      label: "Load on the hook",
      value: layout.hookRule.ok
        ? loadNote(
            cantileverLoadNewtons(
              parameters.hookWidth,
              parameters.hookRoot,
              parameters.hookProjection,
            ),
          )
        : "breaks the hook rule",
    },
  ];
  if (parameters.controllerPocket) {
    values.push({
      id: "pocket-load",
      label: "Load in the pocket",
      value: loadNote(
        beamLoadNewtons(parameters.pocketDepth, parameters.pocketFloor, parameters.pocketWidth),
      ),
    });
  }
  return values;
}

export const headphoneMount: ProductDefinition<HeadphoneMountSpecs> = {
  id: HEADPHONE_MOUNT_ID,
  geometryVersion: HEADPHONE_MOUNT_GEOMETRY_VERSION,
  label: "Headphone and controller mount",
  family: "bracket",
  copy: HEADPHONE_MOUNT_COPY,
  specs: HEADPHONE_MOUNT_SPECS,
  groups: HEADPHONE_MOUNT_GROUPS,
  defaults: HEADPHONE_MOUNT_DEFAULTS,
  presets: HEADPHONE_MOUNT_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(HEADPHONE_MOUNT_SPECS, HEADPHONE_MOUNT_DEFAULTS, input),
  validate: validateHeadphoneMount,
  signature,
  derive,
  generate: generateHeadphoneMount,
  // The modeled pose is the pose on the wall, hook and pocket toward -Y.
  // The print pose turns the part -90 degrees about X: the wall face goes on
  // the bed, and the hook and the pocket point up. The pocket floor and its
  // side walls then stand vertical, and the only faces that point down are
  // the two 45 degree lip ramps. See D-1604.
  printOrientation: {
    rotationDegrees: { x: -90, y: 0, z: 0 },
    note: "Print the mount with the plate flat on the bed and the hook and the pocket pointing up. The hook arm, the pocket floor, and the pocket walls stand vertical, and the only faces that point down are the 45 degree ramps under the two lips.",
  },
  boundsContract: (parameters) => {
    const layout = deriveLayout(parameters);
    return {
      min: [-layout.outsideWidth / 2, -layout.outsideDepth, 0],
      max: [layout.outsideWidth / 2, 0, layout.outsideHeight],
      tolerance: 1e-3,
    };
  },
  filename: (parameters) => {
    const layout = deriveLayout(parameters);
    const size = [layout.outsideWidth, layout.outsideDepth, layout.outsideHeight]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${HEADPHONE_MOUNT_ID}-${size}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${formatMillimeters(parameters.hookWidth)} mm hook${parameters.controllerPocket ? ` · ${formatMillimeters(parameters.pocketWidth)} mm pocket` : ""}`;
  },
};

export { HEADPHONE_MOUNT_COPY, HEADPHONE_MOUNT_ID } from "./copy";
export { generateHeadphoneMount } from "./geometry";
export {
  BAND_CLEARANCE_MM,
  BAND_SLIP_MM,
  HEADPHONE_MOUNT_DEFAULTS,
  HEADPHONE_MOUNT_SPECS,
  HOOK_FILLET_MM,
  LIP_THICKNESS_MM,
  POCKET_WALL_MM,
  deriveLayout,
  type HeadphoneMountLayout,
  type HeadphoneMountParameters,
} from "./schema";
export { validateHeadphoneMount } from "./validate";
