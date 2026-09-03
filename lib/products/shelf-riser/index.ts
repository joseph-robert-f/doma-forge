import { beamLoadNewtons, loadNote } from "../../kernel/brackets";
import {
  filenameNumber,
  formatMillimeters,
  normalizeFromSpecs,
  shortHash,
  signatureFromSpecs,
} from "../shared";
import type { DerivedValue, ProductDefinition } from "../types";
import { SHELF_RISER_COPY, SHELF_RISER_ID } from "./copy";
import { generateShelfRiser } from "./geometry";
import { SHELF_RISER_PRESETS } from "./presets";
import {
  SHELF_RISER_DEFAULTS,
  SHELF_RISER_GROUPS,
  SHELF_RISER_SPECS,
  deriveLayout,
  type ShelfRiserParameters,
  type ShelfRiserSpecs,
} from "./schema";
import { validateShelfRiser } from "./validate";

/**
 * Geometry version 1 is the first shelf riser algorithm: a lightened deck
 * in its print pose, ribs over 150 mm spans, four gusseted posts, and
 * press-fit extensions when the riser is over 240 mm. Increase it whenever
 * equal parameters would produce a different mesh, and re-record the golden
 * test.
 */
export const SHELF_RISER_GEOMETRY_VERSION = 1;

function signature(parameters: ShelfRiserParameters): string {
  return signatureFromSpecs(
    SHELF_RISER_ID,
    SHELF_RISER_GEOMETRY_VERSION,
    SHELF_RISER_SPECS,
    parameters,
  );
}

function derive(parameters: ShelfRiserParameters): DerivedValue[] {
  const layout = deriveLayout(parameters);
  const ribCount = layout.ribsAcrossX.length + layout.ribsAcrossY.length;
  const longSpan = Math.max(layout.spanX, layout.spanY);
  const shortSide = Math.min(parameters.deckWidth, parameters.deckDepth);
  return [
    {
      id: "outside-dimensions",
      label: "Outside",
      value: `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm`,
    },
    {
      id: "legs",
      label: "Legs",
      value: layout.legs.ok
        ? `4 posts, ${formatMillimeters(parameters.legSection)} mm section, ${formatMillimeters(parameters.clearHeight)} mm clear`
        : "do not fit",
    },
    {
      id: "ribs",
      label: "Ribs",
      value:
        ribCount > 0
          ? `${ribCount}, because a span passes 150 mm`
          : Number.isFinite(longSpan)
            ? "none, every span is at most 150 mm"
            : "—",
    },
    {
      id: "pockets",
      label: "Deck pockets",
      value: layout.lightening
        ? `${layout.lightening.countX} × ${layout.lightening.countY}, ${formatMillimeters(layout.pocketDepth)} mm deep`
        : parameters.lightenDeck
          ? "none, the deck is too small inside the leg pads"
          : "none",
    },
    {
      id: "pieces",
      label: "Pieces",
      value: layout.split.split
        ? `5: the deck with ${formatMillimeters(layout.split.upperLength)} mm legs, and 4 extensions of ${formatMillimeters(layout.split.extensionLength)} mm with ${formatMillimeters(layout.split.pegSide)} mm pegs`
        : "1, the riser prints in one piece",
    },
    {
      id: "deck-load",
      label: "Load on the deck",
      value: loadNote(beamLoadNewtons(shortSide, parameters.deckThickness, longSpan)),
    },
  ];
}

export const shelfRiser: ProductDefinition<ShelfRiserSpecs> = {
  id: SHELF_RISER_ID,
  geometryVersion: SHELF_RISER_GEOMETRY_VERSION,
  label: "Shelf riser",
  family: "bracket",
  copy: SHELF_RISER_COPY,
  specs: SHELF_RISER_SPECS,
  groups: SHELF_RISER_GROUPS,
  defaults: SHELF_RISER_DEFAULTS,
  presets: SHELF_RISER_PRESETS,
  normalize: (input) => normalizeFromSpecs(SHELF_RISER_SPECS, SHELF_RISER_DEFAULTS, input),
  validate: validateShelfRiser,
  signature,
  derive,
  generate: generateShelfRiser,
  // No print-orientation hint: the riser is modeled in its print pose, deck
  // top on the bed and legs up, so the leg extensions beside it stand on
  // the bed in the same file. See D-1606.
  boundsContract: (parameters) => {
    const layout = deriveLayout(parameters);
    return {
      min: layout.layoutMin,
      max: layout.layoutMax,
      tolerance: 1e-3,
    };
  },
  filename: (parameters) => {
    const layout = deriveLayout(parameters);
    const size = [layout.outsideWidth, layout.outsideDepth, layout.outsideHeight]
      .map(filenameNumber)
      .join("x");
    return `drawerforge-${SHELF_RISER_ID}-${size}-${shortHash(signature(parameters))}.stl`;
  },
  summary: (parameters) => {
    const layout = deriveLayout(parameters);
    return `${formatMillimeters(layout.outsideWidth)} × ${formatMillimeters(layout.outsideDepth)} × ${formatMillimeters(layout.outsideHeight)} mm · ${formatMillimeters(parameters.clearHeight)} mm clear${layout.split.split ? " · 5 pieces" : ""}`;
  },
};

export { SHELF_RISER_COPY, SHELF_RISER_ID } from "./copy";
export { generateShelfRiser } from "./geometry";
export {
  EXTENSION_GAP_MM,
  RIB_DEPTH_MM,
  RIB_THICKNESS_MM,
  SHELF_RISER_DEFAULTS,
  SHELF_RISER_SPECS,
  deriveLayout,
  type ShelfRiserLayout,
  type ShelfRiserParameters,
} from "./schema";
export { validateShelfRiser } from "./validate";
