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
import { CARD_HOLDER_COPY, CARD_HOLDER_ID } from "./copy";
import { CARD_HOLDER_PRESETS } from "./presets";
import {
  CARD_HOLDER_DEFAULTS,
  CARD_HOLDER_GROUPS,
  CARD_HOLDER_SPECS,
  deriveCardHolderLayout,
  type CardHolderParameters,
  type CardHolderSpecs,
} from "./schema";
import { validateCardHolder } from "./validate";

/**
 * Geometry version 1 is the first card holder algorithm: a rounded slab minus
 * one array of tilted slot cutters. Increase it whenever equal parameters
 * would produce a different mesh, and re-record the golden test.
 */
export const CARD_HOLDER_GEOMETRY_VERSION = 1;

function signature(parameters: CardHolderParameters): string {
  return signatureFromSpecs(
    CARD_HOLDER_ID,
    CARD_HOLDER_GEOMETRY_VERSION,
    CARD_HOLDER_SPECS,
    parameters,
  );
}

function derive(parameters: CardHolderParameters): DerivedValue[] {
  const layout = deriveCardHolderLayout(parameters);
  const number = (value: number) =>
    Number.isFinite(value) ? `${formatMillimeters(value)} mm` : "does not fit";
  return [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(parameters.holderWidth)} × ${formatMillimeters(parameters.holderDepth)} × ${formatMillimeters(parameters.holderHeight)} mm`,
    },
    {
      id: "slot-size",
      label: "Slot",
      value: `${formatMillimeters(layout.slotWidth)} × ${formatMillimeters(layout.slotLength)} mm`,
    },
    {
      id: "slot-pitch",
      label: "Slot pitch",
      value: layout.pitch.ok
        ? `${formatMillimeters(layout.pitch.pitch)} mm, web ${formatMillimeters(layout.pitch.web)} mm`
        : "does not fit",
    },
    {
      id: "slot-lean",
      label: "Floor offset",
      value: number(layout.floorOffset),
    },
    {
      id: "base-under-slots",
      label: "Base under slots",
      value: number(layout.baseUnderSlots),
    },
  ];
}

export const cardHolder: ProductDefinition<CardHolderSpecs> = {
  id: CARD_HOLDER_ID,
  geometryVersion: CARD_HOLDER_GEOMETRY_VERSION,
  label: "Card and cartridge slot holder",
  family: "comb-array",
  copy: CARD_HOLDER_COPY,
  specs: CARD_HOLDER_SPECS,
  groups: CARD_HOLDER_GROUPS,
  defaults: CARD_HOLDER_DEFAULTS,
  presets: CARD_HOLDER_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(CARD_HOLDER_SPECS, CARD_HOLDER_DEFAULTS, input),
  validate: validateCardHolder,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<CardHolderParameters>(CARD_HOLDER_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // The outside width is holderWidth and the outside depth is holderDepth,
  // one to one. The slots are not compensated; the slot clearance is the
  // user's own fit allowance.
  compensable: { x: ["holderWidth"], y: ["holderDepth"] },
  // The rim and the base are parameters, so the key-name rule finds them.
  // The web between slots is solved by the pitch solver, not named by any
  // parameter, so the product reports it itself (D-1703).
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(CARD_HOLDER_SPECS, parameters);
    const layout = deriveCardHolderLayout(parameters);
    if (parameters.slotCount > 1 && layout.pitch.ok) {
      walls.push({
        key: "slot-web",
        label: "Web between slots",
        value: layout.pitch.web,
      });
    }
    return walls;
  },
  boundsContract: (parameters) => ({
    min: [-parameters.holderWidth / 2, -parameters.holderDepth / 2, 0],
    max: [
      parameters.holderWidth / 2,
      parameters.holderDepth / 2,
      parameters.holderHeight,
    ],
    tolerance: 1e-3,
  }),
  filename: (parameters) => {
    const size = [
      parameters.holderWidth,
      parameters.holderDepth,
      parameters.holderHeight,
    ]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${CARD_HOLDER_ID}-${size}-${parameters.slotCount}s-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const slots = !Number.isFinite(parameters.slotCount)
      ? "— slots"
      : parameters.slotCount === 1
        ? "1 slot"
        : `${parameters.slotCount} slots`;
    return `${formatMillimeters(parameters.holderWidth)} × ${formatMillimeters(parameters.holderDepth)} × ${formatMillimeters(parameters.holderHeight)} mm · ${slots}`;
  },
};

export { CARD_HOLDER_COPY, CARD_HOLDER_ID } from "./copy";
export {
  CARD_HOLDER_DEFAULTS,
  CARD_HOLDER_SPECS,
  MINIMUM_WEB_MM,
  deriveCardHolderLayout,
  pointClearsCorner,
  type CardHolderLayout,
  type CardHolderParameters,
} from "./schema";
export { validateCardHolder } from "./validate";
