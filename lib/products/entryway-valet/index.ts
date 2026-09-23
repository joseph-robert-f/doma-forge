import { entrywayValetSurfaceZones } from "./surface-zones";
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
import { ENTRYWAY_VALET_COPY, ENTRYWAY_VALET_ID } from "./copy";
import { ENTRYWAY_VALET_PRESETS } from "./presets";
import {
  ENTRYWAY_VALET_DEFAULTS,
  ENTRYWAY_VALET_GROUPS,
  ENTRYWAY_VALET_SPECS,
  SLOT_LIP_THICKNESS_MM,
  deriveLayout,
  solveLastWell,
  type EntrywayValetParameters,
  type EntrywayValetSpecs,
} from "./schema";
import { validateEntrywayValet } from "./validate";

/**
 * Geometry version 1 is the first entryway valet algorithm: the rounded
 * shell with uneven wells along the front, a slot lip, and an angled rest
 * wedge along the back, clipped to the shell. Increase it whenever equal
 * parameters would produce a different mesh, and re-record the golden test.
 */
export const ENTRYWAY_VALET_GEOMETRY_VERSION = 1;

function signature(parameters: EntrywayValetParameters): string {
  return signatureFromSpecs(
    ENTRYWAY_VALET_ID,
    ENTRYWAY_VALET_GEOMETRY_VERSION,
    ENTRYWAY_VALET_SPECS,
    parameters,
  );
}

function derive(parameters: EntrywayValetParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  return [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "wells",
      label: "Wells",
      value: layout.wellsFit
        ? `${layout.wellCount}: ${layout.wellWidths.map((width) => formatMillimeters(width)).join(", ")} mm wide, ${formatMillimeters(parameters.wellDepth)} mm deep`
        : "do not fit",
    },
    {
      id: "rest",
      label: "Phone rest",
      value: Number.isFinite(layout.wedgeTopDepth)
        ? `${formatMillimeters(parameters.restAngle, 0)} degrees back, ${formatMillimeters(parameters.restHeight)} mm tall, ${formatMillimeters(layout.wedgeTopDepth)} mm thick at the top, ${formatMillimeters(parameters.slotWidth)} mm slot`
        : "—",
    },
    {
      id: "rest-load",
      label: "Push on the rest top",
      value: loadNote(
        cantileverLoadNewtons(
          layout.innerWidth,
          layout.wedgeTopDepth,
          parameters.restHeight,
        ),
      ),
    },
  ];
}

export const entrywayValet: ProductDefinition<EntrywayValetSpecs> = {
  id: ENTRYWAY_VALET_ID,
  geometryVersion: ENTRYWAY_VALET_GEOMETRY_VERSION,
  label: "Entryway valet",
  family: "shelled-tray",
  copy: ENTRYWAY_VALET_COPY,
  specs: ENTRYWAY_VALET_SPECS,
  groups: ENTRYWAY_VALET_GROUPS,
  defaults: ENTRYWAY_VALET_DEFAULTS,
  surfaceZones: entrywayValetSurfaceZones,
  presets: ENTRYWAY_VALET_PRESETS,
  // The solved width is written into the last well, so the field, the
  // signature, and the mesh carry one number (D-1415).
  normalize: (input) =>
    solveLastWell(
      normalizeFromSpecs(ENTRYWAY_VALET_SPECS, ENTRYWAY_VALET_DEFAULTS, input),
    ),
  validate: validateEntrywayValet,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<EntrywayValetParameters>(ENTRYWAY_VALET_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // The walls and the dividers are parameters, so the key rule finds them.
  // The slot lip ahead of the phone slot is a fixed ridge, always built at
  // SLOT_LIP_THICKNESS_MM, and the rest wedge thins toward its top as it
  // leans back, a solved thickness the key rule cannot see either (D-1703).
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(ENTRYWAY_VALET_SPECS, parameters);
    walls.push({
      key: "slot-lip",
      label: "Slot lip thickness",
      value: SLOT_LIP_THICKNESS_MM,
    });
    const layout = deriveLayout(parameters);
    if (
      Number.isFinite(layout.wedgeTopDepth) &&
      layout.wedgeTopDepth > 0
    ) {
      walls.push({
        key: "rest-wedge-top",
        label: "Rest wedge top thickness",
        value: layout.wedgeTopDepth,
      });
    }
    return walls;
  },
  // The modeled pose is the print pose: base on the bed, wells and rest
  // up. The rest face leans back, so it points up and forward.
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
    return `drawerforge-${ENTRYWAY_VALET_ID}-${size}-${layout.wellCount}wells-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${layout.wellCount} wells · ${formatMillimeters(parameters.restAngle, 0)}° rest`;
  },
};

export { ENTRYWAY_VALET_COPY, ENTRYWAY_VALET_ID } from "./copy";
export {
  ENTRYWAY_VALET_DEFAULTS,
  ENTRYWAY_VALET_SPECS,
  MINIMUM_WELL_MM,
  REST_MINIMUM_TOP_MM,
  SLOT_LIP_HEIGHT_MM,
  SLOT_LIP_THICKNESS_MM,
  deriveLayout,
  solveLastWell,
  type EntrywayValetLayout,
  type EntrywayValetParameters,
} from "./schema";
export { validateEntrywayValet } from "./validate";
