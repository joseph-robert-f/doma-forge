import { isSurfacePatternActive } from "../../surface-patterns";
import { surfaceZones } from "./surface-zones";
import { beamLoadNewtons, loadNote } from "../../kernel/bracket-rules";
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
import { SHELF_RISER_COPY, SHELF_RISER_ID } from "./copy";
import { SHELF_RISER_PRESETS } from "./presets";
import {
  LIGHTENING_WEB_MM,
  RIB_THICKNESS_MM,
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
 * press-fit extensions when the riser is over the one-piece height, 240 mm
 * by default. Increase it whenever
 * equal parameters would produce a different mesh, and re-record the golden
 * test.
 */
export const SHELF_RISER_GEOMETRY_VERSION = 2;

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
        : isSurfacePatternActive(parameters.surfaceTreatments, "deck")
          ? "none, deck pattern replaces underside pockets"
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
      value: loadNote(
        beamLoadNewtons(shortSide, parameters.deckThickness, longSpan),
      ),
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
  surfaceZones,
  presets: SHELF_RISER_PRESETS,
  normalize: (input) =>
    normalizeFromSpecs(SHELF_RISER_SPECS, SHELF_RISER_DEFAULTS, input),
  validate: validateShelfRiser,
  signature,
  derive,
  generate: (parameters) =>
    loadGeometry<ShelfRiserParameters>(SHELF_RISER_ID).then((geometry) =>
      geometry.generate(parameters),
    ),
  // The deck thickness is the only wall-like parameter the key rule finds.
  // Everything else here is solved or fixed, and the key rule misses all of
  // it, so the product reports it (D-1703): the leg section, a load-bearing
  // column; the rib thickness, fixed whenever a span over 150 mm gets a
  // rib; the lightening web between deck pockets; the deck skin left over a
  // pocket, which is thinner than the deck thickness the specs report; and
  // the press-fit socket wall, whenever the riser is tall enough to split.
  // The gusset only widens the post toward the deck and the shelf thickness
  // and the gusset thickness both equal the deck thickness exactly, so none
  // of those adds a value the deck thickness has not already reported.
  printedWalls: (parameters) => {
    const walls = wallsFromSpecs(SHELF_RISER_SPECS, parameters);
    const layout = deriveLayout(parameters);
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
    if (layout.ribsAcrossX.length > 0 || layout.ribsAcrossY.length > 0) {
      walls.push({
        key: "rib-thickness",
        label: "Rib thickness",
        value: RIB_THICKNESS_MM,
      });
    }
    if (layout.lightening) {
      walls.push({
        key: "lightening-web",
        label: "Web between deck pockets",
        value: LIGHTENING_WEB_MM,
      });
      // The skin left over a pocket is solved from the deck thickness, not
      // set by a parameter, so nothing else in this list reports it. It is
      // the thinnest printed wall in a lightened riser at every deck
      // thickness up to 4 mm, the default included. See S15 finding F-3.
      walls.push({
        key: "deck-skin",
        label: "Deck over a pocket",
        value: parameters.deckThickness - layout.pocketDepth,
      });
    }
    if (layout.split.split) {
      // The wall the geometry builds, not the nominal socket wall: the
      // socket is the peg plus the press-fit clearance, so each wall is
      // that much thinner. See S15 finding F-3.
      walls.push({
        key: "socket-wall",
        label: "Press-fit socket wall",
        value: (parameters.legSection - layout.split.socketSide) / 2,
      });
    }
    return walls;
  },
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
    const size = [
      layout.outsideWidth,
      layout.outsideDepth,
      layout.outsideHeight,
    ]
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
export {
  EXTENSION_GAP_MM,
  LIGHTENING_WEB_MM,
  RIB_DEPTH_MM,
  RIB_THICKNESS_MM,
  SHELF_RISER_DEFAULTS,
  SHELF_RISER_SPECS,
  deriveLayout,
  type ShelfRiserLayout,
  type ShelfRiserParameters,
} from "./schema";
export { validateShelfRiser } from "./validate";
