import { cantileverLoadNewtons, loadNote } from "../../kernel/bracket-rules";
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
import { WALL_HOOK_RAIL_COPY, WALL_HOOK_RAIL_ID } from "./copy";
import { WALL_HOOK_RAIL_PRESETS } from "./presets";
import {
  HOOK_GAP_MM,
  LIP_THICKNESS_MM,
  WALL_HOOK_RAIL_DEFAULTS,
  WALL_HOOK_RAIL_GROUPS,
  WALL_HOOK_RAIL_SPECS,
  couponParameters,
  deriveLayout,
  type WallHookRailParameters,
  type WallHookRailSpecs,
} from "./schema";
import { validateWallHookRail } from "./validate";

/**
 * Geometry version 1 is the first wall hook rail algorithm: a rounded plate
 * with filleted J-hooks along the bottom, countersunk screw bores, and an
 * optional shelf on hull gussets. Increase it whenever equal parameters
 * would produce a different mesh, and re-record the golden test.
 */
export const WALL_HOOK_RAIL_GEOMETRY_VERSION = 1;

function signature(parameters: WallHookRailParameters): string {
  return signatureFromSpecs(
    WALL_HOOK_RAIL_ID,
    WALL_HOOK_RAIL_GEOMETRY_VERSION,
    WALL_HOOK_RAIL_SPECS,
    parameters,
  );
}

function derive(parameters: WallHookRailParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  const hookLoad = cantileverLoadNewtons(
    parameters.hookWidth,
    parameters.hookRoot,
    parameters.hookProjection,
  );
  const values: DerivedValue[] = [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "hook-pitch",
      label: "Hook pitch",
      value: layout.hooks?.ok
        ? `${formatMillimeters(layout.hooks.pitch)} mm, ${formatMillimeters(layout.hooks.web)} mm between hooks`
        : `does not fit, each gap must be at least ${HOOK_GAP_MM} mm`,
    },
    {
      id: "screw-row",
      label: "Screw row",
      value: !layout.screws.ok
        ? "does not fit"
        : parameters.screwCount === 1
          ? `1 screw, ${formatMillimeters(layout.screwZ)} mm up from the bottom`
          : `${parameters.screwCount} at ${formatMillimeters(parameters.screwSpacing)} mm, ${formatMillimeters(layout.screwZ)} mm up from the bottom`,
    },
    {
      id: "hook-load",
      label: "Load per hook",
      value: layout.hookRule.ok ? loadNote(hookLoad) : "breaks the hook rule",
    },
  ];
  if (parameters.keyShelf) {
    values.push({
      id: "shelf-load",
      label: "Load on the shelf",
      value: loadNote(
        cantileverLoadNewtons(
          parameters.railLength,
          layout.shelfThickness,
          parameters.shelfDepth,
        ),
      ),
    });
  }
  return values;
}

export const wallHookRail: ProductDefinition<WallHookRailSpecs> = {
  id: WALL_HOOK_RAIL_ID,
  geometryVersion: WALL_HOOK_RAIL_GEOMETRY_VERSION,
  label: "Wall hook rail",
  family: "bracket",
  copy: WALL_HOOK_RAIL_COPY,
  specs: WALL_HOOK_RAIL_SPECS,
  groups: WALL_HOOK_RAIL_GROUPS,
  defaults: WALL_HOOK_RAIL_DEFAULTS,
  presets: WALL_HOOK_RAIL_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(WALL_HOOK_RAIL_SPECS, WALL_HOOK_RAIL_DEFAULTS, input),
  validate: validateWallHookRail,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<WallHookRailParameters>(WALL_HOOK_RAIL_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  coupon: (parameters) =>
    loadGeometry<WallHookRailParameters>(WALL_HOOK_RAIL_ID).then((geometry) =>
      geometry.coupon!(parameters),
    ),
  couponBoundsContract: (parameters) => {
    const layout = deriveLayout(couponParameters(parameters));
    return {
      min: [-layout.outsideWidth / 2, -layout.outsideDepth, 0],
      max: [layout.outsideWidth / 2, 0, layout.outsideHeight],
      tolerance: 1e-3,
    };
  },
  // The modeled pose is the pose on the wall, hooks toward -Y. The print
  // pose turns the part -90 degrees about X: the wall face of the plate goes
  // on the bed and the hooks point up. Every hook arm then stands vertical,
  // and the only face that points down is the 45 degree ramp under each
  // lip. See D-1604.
  printOrientation: {
    rotationDegrees: { x: -90, y: 0, z: 0 },
    note: "Print the rail with the plate flat on the bed and the hooks pointing up. Every hook arm stands vertical, and the only face that points down is the 45 degree ramp under each lip.",
  },
  // The plate is a parameter, so the key rule finds it. The lip at the top
  // of every hook is always LIP_THICKNESS_MM, and its key holds neither
  // "wall" nor "thickness", so the product reports it (D-1703). The shelf
  // gusset and the shelf itself both build at the plate thickness exactly
  // (`thickness: T` in the gusset, `shelfThickness = T`), so neither adds a
  // value the plate thickness has not already reported.
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(WALL_HOOK_RAIL_SPECS, parameters);
    walls.push({
      key: "lip",
      label: "Lip thickness",
      value: LIP_THICKNESS_MM,
    });
    return walls;
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
    const size = [
      layout.outsideWidth,
      layout.outsideDepth,
      layout.outsideHeight,
    ]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${WALL_HOOK_RAIL_ID}-${size}-${parameters.hookCount}hooks-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${parameters.hookCount} hooks · ${parameters.screwCount} screws at ${formatMillimeters(parameters.screwSpacing)} mm`;
  },
};

export { WALL_HOOK_RAIL_COPY, WALL_HOOK_RAIL_ID } from "./copy";
export {
  HOOK_BOTTOM_MARGIN_MM,
  HOOK_FILLET_MM,
  HOOK_GAP_MM,
  LIP_THICKNESS_MM,
  WALL_HOOK_RAIL_DEFAULTS,
  WALL_HOOK_RAIL_SPECS,
  deriveLayout,
  type WallHookRailLayout,
  type WallHookRailParameters,
} from "./schema";
export { validateWallHookRail } from "./validate";
