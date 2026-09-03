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
import { PLANT_SAUCER_COPY, PLANT_SAUCER_ID } from "./copy";
import { PLANT_SAUCER_PRESETS } from "./presets";
import {
  NOTCH_WIDTH_MM,
  PLANT_SAUCER_DEFAULTS,
  PLANT_SAUCER_GROUPS,
  PLANT_SAUCER_SPECS,
  QUALITY_SEGMENTS,
  RIB_WIDTH_MM,
  deriveSaucerLayout,
  type PlantSaucerParameters,
  type PlantSaucerSpecs,
} from "./schema";
import { validatePlantSaucer } from "./validate";

/**
 * Geometry version 1 is the first saucer algorithm: a revolved shell with a
 * rolled rim, lift ribs, and an optional overflow notch. Increase it whenever
 * equal parameters would produce a different mesh, and re-record the golden
 * test.
 */
export const PLANT_SAUCER_GEOMETRY_VERSION = 1;

function signature(parameters: PlantSaucerParameters): string {
  return signatureFromSpecs(
    PLANT_SAUCER_ID,
    PLANT_SAUCER_GEOMETRY_VERSION,
    PLANT_SAUCER_SPECS,
    parameters,
  );
}

function derive(parameters: PlantSaucerParameters): DerivedValue[] {
  const layout = deriveSaucerLayout(parameters);
  const number = (value: number) =>
    Number.isFinite(value) ? `${formatMillimeters(value)} mm` : "does not fit";
  return [
    {
      id: "outside-diameter",
      label: "Outside diameter",
      value: number(layout.outsideDiameter),
    },
    {
      id: "overall-height",
      label: "Overall height",
      value: number(parameters.rimHeight),
    },
    {
      id: "pot-base",
      label: "Pot base up to",
      value: number(layout.potBaseDiameter),
    },
    {
      id: "holding-depth",
      label: "Water depth",
      value: number(layout.holdingDepth),
    },
    {
      id: "opening-diameter",
      label: "Opening diameter",
      value: number(layout.openingDiameter),
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
    {
      id: "lift-ribs",
      label: "Lift ribs",
      value:
        !Number.isFinite(parameters.liftRibs) ||
        !Number.isFinite(parameters.ribHeight)
          ? "does not fit"
          : parameters.liftRibs >= 1
            ? `${parameters.liftRibs} across the floor, ${formatMillimeters(parameters.ribHeight)} mm high`
            : "none",
    },
  ];
}

/**
 * The bounds. Without the notch the revolved body reaches the widest radius
 * on the axes, so the box is exact. The notch removes the widest ring over a
 * chord of NOTCH_WIDTH_MM on the +X side, so the tolerance covers that chord
 * and the facet gap of the revolution.
 */
function boundsContract(parameters: PlantSaucerParameters): BoundsContract {
  const layout = deriveSaucerLayout(parameters);
  const radius = Number.isFinite(layout.outsideDiameter)
    ? layout.outsideDiameter / 2
    : 0;
  const segments =
    QUALITY_SEGMENTS[parameters.meshQuality] ?? QUALITY_SEGMENTS.standard;
  const half = NOTCH_WIDTH_MM / 2;
  const notchCut =
    layout.notchDepth > 0
      ? radius - Math.sqrt(Math.max(0, radius * radius - half * half))
      : 0;
  const facetGap =
    layout.notchDepth > 0
      ? radius * (1 - Math.cos((2 * Math.PI) / segments))
      : 0;
  return {
    min: [-radius, -radius, 0],
    max: [radius, radius, parameters.rimHeight],
    tolerance: notchCut + facetGap + 1e-3,
  };
}

export const plantSaucer: ProductDefinition<PlantSaucerSpecs> = {
  id: PLANT_SAUCER_ID,
  geometryVersion: PLANT_SAUCER_GEOMETRY_VERSION,
  label: "Plant pot saucer",
  family: "revolved",
  copy: PLANT_SAUCER_COPY,
  specs: PLANT_SAUCER_SPECS,
  groups: PLANT_SAUCER_GROUPS,
  defaults: PLANT_SAUCER_DEFAULTS,
  presets: PLANT_SAUCER_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(PLANT_SAUCER_SPECS, PLANT_SAUCER_DEFAULTS, input),
  validate: validatePlantSaucer,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<PlantSaucerParameters>(PLANT_SAUCER_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // A round part has one diameter, not an X size and a Y size. The contract
  // corrects a named parameter once per axis, so a diameter named on both
  // axes would take the correction twice. See 23_REVOLVED_FORMS_NOTES.md,
  // D-1511 and open issue 3. The saucer is not compensated.
  // A round part takes the mean of the X and Y corrections, once (D-1704).
  // The inner diameter is the fit to the pot base; the rim and the outside
  // follow it, so the whole saucer grows by the correction.
  compensable: { diameter: ["innerDiameter"] },
  // The wall and the floor are parameters, so the key rule finds them. Each
  // lift rib is fixed at RIB_WIDTH_MM wide, so the product reports that
  // width whenever the floor gets at least one rib (D-1703).
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(PLANT_SAUCER_SPECS, parameters);
    if (Number.isFinite(parameters.liftRibs) && parameters.liftRibs > 0) {
      walls.push({
        key: "rib-width",
        label: "Lift rib width",
        value: RIB_WIDTH_MM,
      });
    }
    return walls;
  },
  boundsContract,
  filename: (parameters) => {
    const size = [parameters.innerDiameter, parameters.rimHeight]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${PLANT_SAUCER_ID}-${size}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveSaucerLayout(parameters);
    const outside = Number.isFinite(layout.outsideDiameter)
      ? formatMillimeters(layout.outsideDiameter)
      : "—";
    return `${outside} mm across × ${formatMillimeters(parameters.rimHeight)} mm high · ${formatMillimeters(parameters.innerDiameter)} mm floor`;
  },
};

export { PLANT_SAUCER_COPY, PLANT_SAUCER_ID } from "./copy";
export {
  NOTCH_WIDTH_MM,
  PLANT_SAUCER_DEFAULTS,
  PLANT_SAUCER_SPECS,
  POT_BASE_GAP_MM,
  MINIMUM_HOLDING_DEPTH_MM,
  QUALITY_SEGMENTS as SAUCER_QUALITY_SEGMENTS,
  RIB_WIDTH_MM,
  SAUCER_MAXIMUM_INNER_DIAMETER_MM,
  deriveSaucerLayout,
  minimumRimHeight,
  type PlantSaucerLayout,
  type PlantSaucerParameters,
  maximumSaucerDiameter,
} from "./schema";
export { validatePlantSaucer } from "./validate";
