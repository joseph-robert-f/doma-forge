import { drawerRiserSurfaceZones } from "./surface-zones";
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
import { DRAWER_RISER_COPY, DRAWER_RISER_ID } from "./copy";
import { DRAWER_RISER_PRESETS } from "./presets";
import {
  DRAWER_RISER_DEFAULTS,
  DRAWER_RISER_GROUPS,
  DRAWER_RISER_SPECS,
  deriveLayout,
  type DrawerRiserParameters,
  type DrawerRiserSpecs,
} from "./schema";
import { validateDrawerRiser } from "./validate";

/**
 * Geometry version 1 is the first drawer riser algorithm: four gusseted leg
 * posts under a rounded shell with an even divider grid. Increase it
 * whenever equal parameters would produce a different mesh, and re-record
 * the golden test.
 */
export const DRAWER_RISER_GEOMETRY_VERSION = 1;

function signature(parameters: DrawerRiserParameters): string {
  return signatureFromSpecs(
    DRAWER_RISER_ID,
    DRAWER_RISER_GEOMETRY_VERSION,
    DRAWER_RISER_SPECS,
    parameters,
  );
}

function derive(parameters: DrawerRiserParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  return [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "compartment-dimensions",
      label: "Each compartment",
      value: `≈ ${formatMillimeters(layout.compartmentWidth)} × ${formatMillimeters(layout.compartmentDepth)} mm`,
    },
    {
      id: "legs",
      label: "Legs",
      value: layout.legs.ok
        ? `4 posts, ${formatMillimeters(parameters.legSection)} mm section, ${formatMillimeters(parameters.clearHeight)} mm clear`
        : "do not fit",
    },
    {
      id: "longest-bridge",
      label: "Longest bridge",
      value: Number.isFinite(layout.longestBridge)
        ? `${formatMillimeters(layout.longestBridge)} mm, the compartment ceiling`
        : "—",
    },
    {
      id: "height-budget",
      label: "Height used",
      value: `${formatMillimeters(layout.outsideHeight)} mm of ${formatMillimeters(layout.heightBudget)} mm`,
    },
  ];
}

export const drawerRiser: ProductDefinition<DrawerRiserSpecs> = {
  id: DRAWER_RISER_ID,
  geometryVersion: DRAWER_RISER_GEOMETRY_VERSION,
  label: "Two-tier drawer riser",
  family: "shelled-tray",
  copy: DRAWER_RISER_COPY,
  specs: DRAWER_RISER_SPECS,
  groups: DRAWER_RISER_GROUPS,
  defaults: DRAWER_RISER_DEFAULTS,
  surfaceZones: drawerRiserSurfaceZones,
  presets: DRAWER_RISER_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(DRAWER_RISER_SPECS, DRAWER_RISER_DEFAULTS, input),
  validate: validateDrawerRiser,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<DrawerRiserParameters>(DRAWER_RISER_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // The outside width follows drawerWidth and the outside depth follows
  // drawerDepth, one to one, the same semantics the drawer tray uses.
  compensable: { x: ["drawerWidth"], y: ["drawerDepth"] },
  // Leg section is a printed column, but its key holds neither "wall" nor
  // "thickness", so the key rule misses it; it is reported here (D-1703).
  // The gusset only flares the post outward toward the deck, so its
  // material only ever grows past the leg section and needs no entry of
  // its own.
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(DRAWER_RISER_SPECS, parameters);
    if (
      Number.isFinite(parameters.legSection) &&
      parameters.legSection > 0
    ) {
      walls.push({
        key: "leg-section",
        label: "Leg section",
        value: parameters.legSection,
      });
    }
    return walls;
  },
  // The modeled pose is the pose in the drawer: legs down. The print pose
  // turns the part over. The tray rim then lies on the bed and the legs
  // point up, so every gusset carries the layer above it. The deck over each
  // compartment is a bridge; the derived values name its span. See D-1408.
  printOrientation: {
    rotationDegrees: { x: 180, y: 0, z: 0 },
    note: "Print the riser upside down. The tray rim goes on the bed and the legs point up. Every gusset is then self-supporting. The deck over each compartment is a bridge as wide as the compartment.",
  },
  boundsContract: (parameters) => {
    const layout = deriveLayout(parameters);
    return {
      min: [-layout.outsideWidth / 2, -layout.outsideDepth / 2, 0],
      max: [
        layout.outsideWidth / 2,
        layout.outsideDepth / 2,
        layout.outsideHeight,
      ],
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
    return `drawerforge-${DRAWER_RISER_ID}-${size}-${parameters.rows}x${parameters.columns}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${parameters.rows} × ${parameters.columns} · ${formatMillimeters(parameters.clearHeight)} mm clear`;
  },
};

export { DRAWER_RISER_COPY, DRAWER_RISER_ID } from "./copy";
export {
  DRAWER_RISER_DEFAULTS,
  DRAWER_RISER_SPECS,
  HEADROOM_MM,
  MINIMUM_COMPARTMENT_MM,
  deriveLayout,
  type DrawerRiserLayout,
  type DrawerRiserParameters,
} from "./schema";
export { validateDrawerRiser } from "./validate";
