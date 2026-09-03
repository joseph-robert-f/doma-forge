import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import { wallsFromSpecs } from "../../printer-profile";
import type { BoundsContract, DerivedValue, ProductDefinition } from "../types";
import { loadGeometry } from "../geometry-registry";
import { PLANT_POT_COPY, PLANT_POT_ID } from "./copy";
import { PLANT_POT_PRESETS } from "./presets";
import {
  PLANT_POT_DEFAULTS,
  PLANT_POT_GROUPS,
  PLANT_POT_SPECS,
  derivePotLayout,
  type PlantPotParameters,
  type PlantPotSpecs,
} from "./schema";
import { validatePlantPot } from "./validate";

/**
 * Geometry version 1 is the first pot algorithm: a revolved shell with a
 * rolled rim, minus the drainage holes through the flat base. Increase it
 * whenever equal parameters would produce a different mesh, and re-record the
 * golden test.
 */
export const PLANT_POT_GEOMETRY_VERSION = 1;

/** The id of the derived row that names the saucer for this pot. */
export const SAUCER_DERIVED_ID = "saucer-inner-diameter";

function signature(parameters: PlantPotParameters): string {
  return signatureFromSpecs(
    PLANT_POT_ID,
    PLANT_POT_GEOMETRY_VERSION,
    PLANT_POT_SPECS,
    parameters,
  );
}

function derive(parameters: PlantPotParameters): DerivedValue[] {
  const layout = derivePotLayout(parameters);
  const number = (value: number) =>
    Number.isFinite(value) ? `${formatMillimeters(value)} mm` : "does not fit";
  return [
    {
      id: "widest-diameter",
      label: "Widest diameter",
      value: number(layout.widestDiameter),
    },
    {
      id: "inside-depth",
      label: "Inside depth",
      value: number(layout.insideDepth),
    },
    {
      id: SAUCER_DERIVED_ID,
      label: "Matching saucer floor",
      value: number(layout.saucerInnerDiameter),
    },
    {
      id: "drain-holes",
      label: "Drainage",
      value:
        !Number.isFinite(layout.drainCircleRadius) ||
        !Number.isFinite(parameters.drainHoles)
          ? "does not fit"
          : parameters.drainHoles <= 1
            ? `1 hole of ${formatMillimeters(parameters.drainHoleDiameter)} mm at the center`
            : `${parameters.drainHoles} holes of ${formatMillimeters(parameters.drainHoleDiameter)} mm on a ${formatMillimeters(layout.drainCircleRadius * 2)} mm circle`,
    },
    {
      id: "rim-radius",
      label: "Rolled rim",
      value: !Number.isFinite(layout.rimRadius)
        ? "does not fit"
        : layout.rimRadius <= 0
          ? "square rim"
          : layout.rimRadiusClamped
            ? `${formatMillimeters(layout.rimRadius)} mm, reduced from ${formatMillimeters(parameters.rimRadius)} mm`
            : `${formatMillimeters(layout.rimRadius)} mm`,
    },
  ];
}

/**
 * The bounds. The widest ring of the revolution lands on both axes, and the
 * drainage holes are inside the base, so the box is exact.
 */
function boundsContract(parameters: PlantPotParameters): BoundsContract {
  const layout = derivePotLayout(parameters);
  const radius = Number.isFinite(layout.widestDiameter)
    ? layout.widestDiameter / 2
    : 0;
  return {
    min: [-radius, -radius, 0],
    max: [radius, radius, parameters.potHeight],
    tolerance: 1e-3,
  };
}

export const plantPot: ProductDefinition<PlantPotSpecs> = {
  id: PLANT_POT_ID,
  geometryVersion: PLANT_POT_GEOMETRY_VERSION,
  label: "Nursery plant pot",
  family: "revolved",
  copy: PLANT_POT_COPY,
  specs: PLANT_POT_SPECS,
  groups: PLANT_POT_GROUPS,
  defaults: PLANT_POT_DEFAULTS,
  presets: PLANT_POT_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(PLANT_POT_SPECS, PLANT_POT_DEFAULTS, input),
  validate: validatePlantPot,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<PlantPotParameters>(PLANT_POT_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // A round part has one diameter, not an X size and a Y size. See
  // 23_REVOLVED_FORMS_NOTES.md, D-1511 and open issue 3. The pot is not
  // compensated.
  // A round part takes the mean of the X and Y corrections, once (D-1704).
  // The base diameter sets the footprint, and the flare above it follows,
  // so the whole pot grows by the correction.
  compensable: { diameter: ["baseDiameter"] },
  // The wall and the base are parameters, so the key rule finds them. The
  // holes are drilled into the flat base only, and the base always holds at
  // least one hole, so the material the hole leaves is solved, not typed:
  // the web out to the wall, and, past one hole, the web to the next hole
  // around the circle (D-1703).
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(PLANT_POT_SPECS, parameters);
    const layout = derivePotLayout(parameters);
    if (Number.isFinite(layout.wallWeb) && layout.wallWeb > 0) {
      walls.push({
        key: "wall-web",
        label: "Web from a drain hole to the wall",
        value: layout.wallWeb,
      });
    }
    if (Number.isFinite(layout.neighbourWeb) && layout.neighbourWeb > 0) {
      walls.push({
        key: "neighbour-web",
        label: "Web between drain holes",
        value: layout.neighbourWeb,
      });
    }
    return walls;
  },
  boundsContract,
  filename: (parameters) => {
    const size = [parameters.baseDiameter, parameters.potHeight]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${PLANT_POT_ID}-${size}-${parameters.drainHoles}h-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = derivePotLayout(parameters);
    const widest = Number.isFinite(layout.widestDiameter)
      ? formatMillimeters(layout.widestDiameter)
      : "—";
    const holes = !Number.isFinite(parameters.drainHoles)
      ? "— holes"
      : parameters.drainHoles === 1
        ? "1 hole"
        : `${parameters.drainHoles} holes`;
    return `${formatMillimeters(parameters.baseDiameter)} mm base · ${widest} mm rim × ${formatMillimeters(parameters.potHeight)} mm high · ${holes}`;
  },
};

export { PLANT_POT_COPY, PLANT_POT_ID } from "./copy";
export {
  DRAIN_WEB_MM,
  PLANT_POT_DEFAULTS,
  PLANT_POT_SPECS,
  QUALITY_SEGMENTS as POT_QUALITY_SEGMENTS,
  SAUCER_GAP_MM,
  derivePotLayout,
  drainHoleCenters,
  type PlantPotLayout,
  type PlantPotParameters,
  maximumPotDiameter,
} from "./schema";
export { validatePlantPot } from "./validate";
