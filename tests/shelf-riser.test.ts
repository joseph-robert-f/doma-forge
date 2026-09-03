import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SOCKET_WALL_MM } from "../lib/kernel/bracket-rules";
import {
  LIGHTENING_WEB_MM,
  RIB_THICKNESS_MM,
  SHELF_RISER_DEFAULTS,
  SHELF_RISER_SPECS,
  deriveLayout,
  shelfRiser,
  type ShelfRiserParameters,
} from "../lib/products/shelf-riser";
import {
  normalizePrinterProfile,
  thinWallIssues,
  wallLikeKeys,
} from "../lib/printer-profile";
import { analyzeBufferGeometry, modelToBufferGeometry } from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";
import { describeOverhangs, overhangFaces } from "./helpers/print-pose";

const { normalize, validate, generate } = shelfRiser;

// Recorded at geometryVersion 1 for the defaults and unchanged at version 2 (S15: the defaults do not split). A change here is a
// geometry change: bump SHELF_RISER_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 2862;
const GOLDEN_VOLUME = 331378.7;

function withChanges(changes: Partial<ShelfRiserParameters>): ShelfRiserParameters {
  return normalize({ ...SHELF_RISER_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<ShelfRiserParameters> = {
  deckWidth: 100, deckDepth: 80, deckThickness: 3, clearHeight: 30, legSection: 8, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<ShelfRiserParameters> = {
  deckWidth: 600, deckDepth: 400, deckThickness: 10, clearHeight: 350, legSection: 40, cornerRadius: 20,
};

describe("shelf riser parameters", () => {
  it("ships the shelf presets in order", () => {
    expect(shelfRiser.presets.map((preset) => preset.id)).toEqual([
      "shoe-stacker",
      "cabinet-shelf",
      "boot-riser",
    ]);
  });

  it("plans the legs, the ribs, and the pockets for the defaults", () => {
    const layout = deriveLayout(SHELF_RISER_DEFAULTS);
    expect(layout.legGusset).toBe(10.5);
    expect(layout.legInset).toBe(10.5);
    expect(layout.legs.ok).toBe(true);
    if (!layout.legs.ok) return;
    expect(layout.legs.centers).toEqual([
      [-132.5, -82.5],
      [132.5, -82.5],
      [132.5, 82.5],
      [-132.5, 82.5],
    ]);
    expect(layout.spanX).toBe(251);
    expect(layout.spanY).toBe(151);
    expect(layout.ribsAcrossX).toEqual([0]);
    expect(layout.ribsAcrossY).toEqual([0]);
    expect(layout.lighteningRim).toBe(47.5);
    expect(layout.pocketDepth).toBe(2);
    expect(layout.lightening).toMatchObject({ countX: 5, countY: 3 });
    expect(layout.split).toEqual({ split: false, totalHeight: 124 });
  });

  it("adds a rib only when a span passes 150 mm", () => {
    // 200 wide, 14 mm legs inset 10.5: a 151 mm span, one rib. One less: none.
    expect(deriveLayout(withChanges({ deckWidth: 200 })).ribsAcrossX).toEqual([0]);
    expect(deriveLayout(withChanges({ deckWidth: 199 })).ribsAcrossX).toEqual([]);
    expect(deriveLayout(withChanges({ deckWidth: 600 })).ribsAcrossX).toHaveLength(3);
  });

  it("accepts a leg exactly at the slenderness limit and refuses one over it", () => {
    expect(validate(withChanges({ legSection: 10, clearHeight: 120 })).valid).toBe(true);
    const result = validate(withChanges({ legSection: 10, clearHeight: 121 }));
    expect(result.byField.legSection?.[0]).toBe(
      "A 121 mm leg of 10 mm section buckles. Keep the leg height at most 12 times the section. Use a section of at least 10.1 mm, or a clear height of at most 120 mm.",
    );
  });

  it("refuses legs that leave no gap on the short side", () => {
    expect(validate(withChanges({ deckDepth: 80, legSection: 20 })).valid).toBe(true);
    expect(validate(withChanges({ deckDepth: 79, legSection: 20 })).byField.legSection?.[0]).toBe(
      "Legs of 20 mm leave 9 mm between the two posts on the short side. Use a smaller leg section, or a larger deck.",
    );
  });

  it("splits the legs above 240 mm and keeps the extension as short as possible", () => {
    expect(deriveLayout(withChanges({ clearHeight: 236, legSection: 20 })).split).toEqual({
      split: false,
      totalHeight: 240,
    });
    // One millimetre over the one-piece height: the deck leg would take 236
    // mm and leave a 1 mm extension, so the deck leg stops at 216 and the
    // extension keeps the 21 mm peg length. See S15 finding F-5.
    const split = deriveLayout(withChanges({ clearHeight: 237, legSection: 20 })).split;
    expect(split).toMatchObject({
      split: true,
      totalHeight: 241,
      upperLength: 216,
      extensionLength: 21,
      pegSide: 14,
      pegLength: 21,
      socketSide: 14.2,
    });
    const boot = deriveLayout(shelfRiser.presets[2].parameters);
    expect(boot.split).toMatchObject({ split: true, upperLength: 235, extensionLength: 65, pegSide: 22 });
    expect(boot.extensionX).toBe(174);
    expect(boot.extensionYs).toEqual([-57, -19, 19, 57]);
    expect(boot.layoutMax).toEqual([188, 100, 240]);
  });

  it("names the press-fit section rule with the slenderness rule when both fail", () => {
    const result = validate(withChanges({ clearHeight: 237, legSection: 11 }));
    expect(result.byField.legSection).toHaveLength(2);
    expect(result.byField.legSection?.[1]).toMatch(/press-fit extension/);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of ["deckWidth", "deckDepth", "deckThickness", "clearHeight", "legSection", "onePieceHeight", "cornerRadius"] as const) {
      const cleared = { ...SHELF_RISER_DEFAULTS, [key]: Number.NaN };
      expect(() => shelfRiser.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
  });

  it("derives the size, the legs, the ribs, the pockets, the pieces, and the load", () => {
    expect(shelfRiser.derive(SHELF_RISER_DEFAULTS).map((value) => value.value)).toEqual([
      "300 × 200 × 124 mm",
      "4 posts, 14 mm section, 120 mm clear",
      "2, because a span passes 150 mm",
      "5 × 3, 2 mm deep",
      "1, the riser prints in one piece",
      "5 kg or more at 3 perimeters in PLA, approximate. This app rates nothing above 5 kg.",
    ]);
    expect(shelfRiser.derive(shelfRiser.presets[2].parameters)[4].value).toBe(
      "5: the deck with 235 mm legs, and 4 extensions of 65 mm with 22 mm pegs",
    );
    expect(shelfRiser.derive(withChanges({ lightenDeck: false }))[3].value).toBe("none");
    expect(shelfRiser.summary(shelfRiser.presets[2].parameters)).toBe(
      "300 × 200 × 305 mm · 300 mm clear · 5 pieces",
    );
  });

  it("creates a deterministic filename", () => {
    expect(shelfRiser.filename(SHELF_RISER_DEFAULTS)).toMatch(
      /^drawerforge-shelf-riser-300x200x124-[0-9a-f]{6}\.stl$/,
    );
  });

  it("is modeled in its print pose and carries no toggle or compensation", () => {
    expect(shelfRiser.printOrientation).toBeUndefined();
    expect(shelfRiser.compensable).toBeUndefined();
    expect(shelfRiser.copy.intro).toMatch(/as it prints/);
  });
});

describe("shelf riser geometry", () => {
  const fixtures: Array<[string, Partial<ShelfRiserParameters>, number]> = [
    ["minimum", MINIMUM_CASE, 1],
    ["default", {}, 1],
    ["maximum", MAXIMUM_CASE, 5],
    ["cabinet shelf", shelfRiser.presets[1].parameters, 1],
    ["boot riser", shelfRiser.presets[2].parameters, 5],
    ["solid deck", { lightenDeck: false }, 1],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s riser", async (_name, changes, pieces) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    expect(model.status).toBe("NoError");
    expect(analysis.finite).toBe(true);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(pieces);
    const contract = shelfRiser.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    expect(analysis.bounds.getSize(new THREE.Vector3()).z).toBeCloseTo(contract.max[2], 4);
    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it.each(fixtures)("has no face over 45 degrees on the bed: %s", async (_name, changes) => {
    const model = await generate(withChanges(changes));
    const faces = overhangFaces(model.mesh, shelfRiser.printOrientation);
    expect(faces, describeOverhangs(faces)).toEqual([]);
  });

  // S15 finding F-1. A rib face landing exactly on the deck outline, and on
  // the pocket-field edge, left the union with triangles whose three corners
  // were collinear. `finishSolid` drops them, so the viewer's mesh reader
  // takes the part and the closed-edge count comes back to two per edge.
  // Neither of these reaches the app through a preset, so the fixture list
  // above misses both.
  it.each([
    ["a rib face on the deck outline", { deckWidth: 600, deckDepth: 400, legSection: 20, cornerRadius: 0 }],
    ["a rib face on the pocket field", { deckWidth: 600, deckDepth: 400, legSection: 40, cornerRadius: 0 }],
  ] as Array<[string, Partial<ShelfRiserParameters>]>)(
    "leaves no triangle without area: %s",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      expect(validate(parameters).valid).toBe(true);
      const model = await generate(parameters);
      expect(model.status).toBe("NoError");
      const geometry = modelToBufferGeometry(model);
      const analysis = analyzeBufferGeometry(geometry);
      expect(analysis.finite).toBe(true);
      expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
      expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
      expect(analysis.signedVolume).toBeGreaterThan(0);
      for (const edge of closedEdgeCounts(geometry)) {
        expect(edge.count).toBe(2);
        expect(edge.balance).toBe(0);
      }
      geometry.dispose();
    },
  );

  it("fills every pocket a rib crosses, and stands four posts and two ribs on the underside", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    // Through the pockets: one deck outline; 15 pockets, cut by the two ribs
    // into 24 holes, so no rib bridges a pocket.
    const pockets = horizontalSliceTopology(model.mesh, parameters.deckThickness - layout.pocketDepth / 2);
    expect(pockets).toMatchObject({ solidComponents: 1, holes: 24 });
    expect(pockets.containsSolid([0, 0])).toBe(true);
    expect(pockets.containsSolid([0, 100 - layout.lighteningRim - 5])).toBe(true);
    // Above the underside, through the ribs: four posts and the rib cross.
    const ribs = horizontalSliceTopology(model.mesh, parameters.deckThickness + 6);
    expect(ribs).toMatchObject({ solidComponents: 5, holes: 0 });
    expect(ribs.containsSolid([0, 0])).toBe(true);
    // Above the ribs and the gussets: four posts only.
    const posts = horizontalSliceTopology(model.mesh, parameters.deckThickness + 30);
    expect(posts).toMatchObject({ contours: 4, solidComponents: 4, holes: 0 });
    if (layout.legs.ok) {
      for (const [x, y] of layout.legs.centers) expect(posts.containsSolid([x, y])).toBe(true);
    }
  });

  it("widens each post into the deck with a gusset that faces the bed", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const corner = layout.legs.ok ? layout.legs.centers[0] : [0, 0];
    const outward: [number, number] = [
      corner[0] - parameters.legSection / 2 - 1,
      corner[1] - parameters.legSection / 2 - 1,
    ];
    const low = horizontalSliceTopology(model.mesh, parameters.deckThickness + 1);
    const high = horizontalSliceTopology(model.mesh, parameters.deckThickness + layout.legGusset + 1);
    expect(low.containsSolid(outward)).toBe(true);
    expect(high.containsSolid(outward)).toBe(false);
  });

  it("sockets the deck legs and stands four pegged extensions beside the deck", async () => {
    const parameters = shelfRiser.presets[2].parameters;
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    expect(layout.split.split).toBe(true);
    if (!layout.split.split) return;
    const footZ = parameters.deckThickness + layout.split.upperLength;
    // Inside the sockets: four posts, each with a square hole.
    const sockets = horizontalSliceTopology(model.mesh, footZ - 5);
    expect(sockets).toMatchObject({ contours: 8, solidComponents: 4, holes: 4 });
    if (layout.legs.ok) {
      for (const [x, y] of layout.legs.centers) expect(sockets.containsSolid([x, y])).toBe(false);
    }
    // Through the pegs: four pegs beside four posts.
    const pegs = horizontalSliceTopology(model.mesh, layout.split.extensionLength + 5);
    expect(pegs).toMatchObject({ solidComponents: 8, holes: 0 });
    for (const y of layout.extensionYs) {
      expect(pegs.containsSolid([layout.extensionX, y])).toBe(true);
    }
    // On the bed: the deck and four feet.
    expect(horizontalSliceTopology(model.mesh, 1)).toMatchObject({ solidComponents: 5 });
  });

  it("refuses the buckling case instead of building it", async () => {
    await expect(generate(withChanges({ legSection: 10, clearHeight: 121 }))).rejects.toThrow(/buckles/);
  });

  it("builds the largest riser inside the kernel time budget", async () => {
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(withChanges({ ...MAXIMUM_CASE, meshQuality: "fine" }));
    expect(model.status).toBe("NoError");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(SHELF_RISER_DEFAULTS));
    expect(shelfRiser.geometryVersion).toBe(2);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-150, -100, 0],
      [150, 100, 124],
    ]);
  });
});

describe("printed walls", () => {
  it("adds the leg section, the rib, and the lightening web at the defaults", () => {
    const layout = deriveLayout(SHELF_RISER_DEFAULTS);
    expect(layout.ribsAcrossX.length + layout.ribsAcrossY.length).toBeGreaterThan(0);
    expect(layout.lightening).not.toBeNull();
    expect(layout.split.split).toBe(false);

    const walls = shelfRiser.printedWalls!(SHELF_RISER_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("leg-section")).toBeCloseTo(SHELF_RISER_DEFAULTS.legSection);
    expect(byKey.get("rib-thickness")).toBeCloseTo(RIB_THICKNESS_MM);
    expect(byKey.get("lightening-web")).toBeCloseTo(LIGHTENING_WEB_MM);
    // No socket wall: the defaults print in one piece.
    expect(byKey.has("socket-wall")).toBe(false);
    for (const key of wallLikeKeys(SHELF_RISER_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("adds the socket wall once the riser splits, as the geometry builds it", () => {
    const parameters = withChanges({ clearHeight: 237, legSection: 20 });
    expect(validate(parameters).valid).toBe(true);
    const split = deriveLayout(parameters).split;
    expect(split.split).toBe(true);
    const walls = shelfRiser.printedWalls!(parameters);
    const socketWall = walls.find((wall) => wall.key === "socket-wall");
    // The nominal wall is 3 mm, and the press-fit clearance takes 0.1 mm off
    // each side of the socket, so the printed wall is 2.9 mm. S15 F-3.
    expect(SOCKET_WALL_MM).toBe(3);
    expect(socketWall?.value).toBeCloseTo(2.9);
    expect(socketWall?.value).toBeCloseTo(
      (parameters.legSection - (split.split ? split.socketSide : 0)) / 2,
    );
  });

  it("reports the solved deck skin, which is thinner than the deck thickness", () => {
    // S15 finding F-3: the skin over a pocket is deckThickness minus the
    // solved pocket depth, 2 mm at the 4 mm default deck, and no parameter
    // carries it.
    const layout = deriveLayout(SHELF_RISER_DEFAULTS);
    const byKey = new Map(
      shelfRiser.printedWalls!(SHELF_RISER_DEFAULTS).map((wall) => [wall.key, wall.value]),
    );
    expect(byKey.get("deck-skin")).toBeCloseTo(
      SHELF_RISER_DEFAULTS.deckThickness - layout.pocketDepth,
    );
    expect(byKey.get("deck-skin")).toBeCloseTo(2);
    // No pockets, no skin to report.
    const solid = shelfRiser.printedWalls!(withChanges({ lightenDeck: false }));
    expect(solid.some((wall) => wall.key === "deck-skin")).toBe(false);
  });

  it("flags a thin rib at a wide enough nozzle", () => {
    // The rib thickness is fixed at 3 mm, exactly the floor a 1.5 mm
    // nozzle sets (two nozzle widths), so it is not itself thin there.
    // A slightly wider nozzle pushes the floor past the fixed rib and
    // demonstrates the same rule.
    const profile = normalizePrinterProfile({ nozzleDiameter: 1.6 });
    const issues = thinWallIssues(
      shelfRiser.printedWalls!(SHELF_RISER_DEFAULTS),
      profile,
    );
    expect(issues.some((issue) => issue.text.includes("Rib thickness"))).toBe(
      true,
    );
  });

  it("flags the deck skin alone at a 1.2 mm nozzle", () => {
    // A 1.2 mm nozzle sets a 2.4 mm floor: the 3 mm rib, the 4 mm web and
    // the 4 mm deck all clear it, and only the 2 mm skin over a pocket does
    // not. Before S15 finding F-3 this returned nothing at all.
    const issues = thinWallIssues(
      shelfRiser.printedWalls!(SHELF_RISER_DEFAULTS),
      normalizePrinterProfile({ nozzleDiameter: 1.2 }),
    );
    expect(issues.map((issue) => issue.id)).toEqual(["wall-deck-skin"]);
    expect(issues[0].text).toBe(
      "Deck over a pocket is 2 mm. A 1.2 mm nozzle needs at least 2.4 mm. A thin wall is weak.",
    );
  });

  it("passes the defaults and every preset at a 0.4 mm and a 0.6 mm nozzle", () => {
    const sets = [
      normalize(SHELF_RISER_DEFAULTS),
      ...shelfRiser.presets.map((preset) => preset.parameters),
    ];
    for (const nozzleDiameter of [0.4, 0.6]) {
      const profile = normalizePrinterProfile({ nozzleDiameter });
      for (const parameters of sets) {
        const issues = thinWallIssues(shelfRiser.printedWalls!(parameters), profile);
        expect(issues, `${nozzleDiameter} mm nozzle`).toEqual([]);
      }
    }
  });

  it("does not throw for a cleared leg section, and reports only finite values", () => {
    const cleared = { ...SHELF_RISER_DEFAULTS, legSection: Number.NaN };
    const walls = shelfRiser.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
    expect(walls.some((wall) => wall.key === "leg-section")).toBe(false);
  });
});

describe("one-piece height", () => {
  it("passes at its limits and fails one step over", () => {
    expect(shelfRiser.validate(withChanges({ onePieceHeight: 100 })).valid).toBe(true);
    expect(shelfRiser.validate(withChanges({ onePieceHeight: 500 })).valid).toBe(true);
    expect(shelfRiser.validate(withChanges({ onePieceHeight: 99 })).byField.onePieceHeight?.[0]).toBe(
      "One-piece height must be between 100 and 500 mm.",
    );
    expect(shelfRiser.validate(withChanges({ onePieceHeight: 501 })).valid).toBe(false);
  });

  it("moves the split with the setting, and reproduces the old mesh at the default", () => {
    const tall = withChanges({ clearHeight: 296, legSection: 28 });
    expect(deriveLayout(tall).split.split).toBe(true);
    const taller = withChanges({ clearHeight: 296, legSection: 28, onePieceHeight: 300 });
    expect(deriveLayout(taller).split).toEqual({ split: false, totalHeight: 300 });
    expect(shelfRiser.validate(taller).valid).toBe(true);
    expect(SHELF_RISER_DEFAULTS.onePieceHeight).toBe(240);
    // Both split refusals are reachable once the one-piece height can be
    // low: a leg under the 12 mm split minimum that is not slender, and an
    // extension longer than one piece.
    const thinLegs = withChanges({ clearHeight: 120, legSection: 10, onePieceHeight: 100 });
    expect(deriveLayout(thinLegs).split).toMatchObject({ split: false, reason: "section" });
    expect(shelfRiser.validate(thinLegs).byField.legSection?.[0]).toBe(
      "A riser 124 mm tall is over the 100 mm one-piece height, so each leg gets a press-fit extension. That joint needs a leg section of at least 12 mm. Use a larger section, or a clear height of at most 96 mm, or a larger one-piece height if your printer allows it.",
    );
    const shortLeg = withChanges({ deckThickness: 10, clearHeight: 95, legSection: 40, onePieceHeight: 102 });
    expect(deriveLayout(shortLeg).split).toMatchObject({ split: false, reason: "joint" });
    expect(shelfRiser.validate(shortLeg).byField.clearHeight?.[0]).toBe(
      "A riser 105 mm tall is over the 102 mm one-piece height, so each leg gets a press-fit extension. That joint needs 51 mm of leg on each side of it, and legs of 95 mm are too short for both. Use a clear height of at least 102 mm, a smaller leg section for a shorter peg, or a clear height of at most 92 mm so nothing splits.",
    );
    // Where two peg lengths would not print in one piece each, the message
    // does not offer that number; it names the one-piece height instead.
    const shortPiece = withChanges({ deckThickness: 3, clearHeight: 98, legSection: 40, onePieceHeight: 100 });
    expect(deriveLayout(shortPiece).split).toMatchObject({ split: false, reason: "joint" });
    expect(shelfRiser.validate(shortPiece).byField.clearHeight?.[0]).toBe(
      "A riser 101 mm tall is over the 100 mm one-piece height, so each leg gets a press-fit extension. That joint needs 51 mm of leg on each side of it, and legs of 98 mm are too short for both. Use a smaller leg section for a shorter peg, a larger one-piece height if your printer allows it, or a clear height of at most 97 mm so nothing splits.",
    );
    const tooShort = withChanges({ clearHeight: 296, legSection: 28, onePieceHeight: 100 });
    expect(deriveLayout(tooShort).split).toMatchObject({ split: false, reason: "height" });
    expect(shelfRiser.validate(tooShort).byField.clearHeight?.[0]).toBe(
      "A riser 300 mm tall needs a leg extension longer than one piece can print. Use a lower clear height.",
    );
  });

  it("refuses a one-piece height above the saved bed only when the riser is taller than the bed", () => {
    const low = { bed: { x: 220, y: 220, z: 200 }, nozzleDiameter: 0.4 };
    // The default riser is 124 mm tall and fits a 200 mm bed, so the
    // setting does not matter and nothing is refused (D-811, D-1803).
    expect(shelfRiser.validate(SHELF_RISER_DEFAULTS, low).valid).toBe(true);
    // A 300 mm riser at the default one-piece height lays out a 240 mm deck
    // body, taller than the bed: refused on the setting, with the fix.
    const tall = withChanges({ clearHeight: 296, legSection: 28 });
    const result = shelfRiser.validate(tall, low);
    expect(result.valid).toBe(false);
    expect(result.byField.onePieceHeight).toEqual([
      "Your bed is 200 mm high and the riser's deck body is 240 mm tall. Set the one-piece height to at most 200 mm so the legs split there, or raise the bed height in the printer profile if it is wrong.",
    ]);
    expect(shelfRiser.validate({ ...tall, onePieceHeight: 200 }, low).valid).toBe(true);
    // A 220 mm riser in one piece is also taller than the bed.
    const middling = withChanges({ clearHeight: 216, legSection: 20 });
    expect(shelfRiser.validate(middling, low).byField.onePieceHeight?.[0]).toContain(
      "deck body is 220 mm tall",
    );
    expect(shelfRiser.validate(SHELF_RISER_DEFAULTS, { bed: null, nozzleDiameter: 0.4 })).toEqual(
      shelfRiser.validate(SHELF_RISER_DEFAULTS),
    );
  });

  it("treats a cleared one-piece height as a missing number, without a split", () => {
    const cleared = withChanges({ onePieceHeight: Number.NaN });
    expect(deriveLayout(cleared).split).toEqual({ split: false, totalHeight: 124 });
    const result = shelfRiser.validate(cleared);
    expect(result.valid).toBe(false);
    expect(result.byField.onePieceHeight?.length).toBeGreaterThan(0);
  });
});
