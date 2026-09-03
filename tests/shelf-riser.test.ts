import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  SHELF_RISER_DEFAULTS,
  deriveLayout,
  shelfRiser,
  type ShelfRiserParameters,
} from "../lib/products/shelf-riser";
import { analyzeBufferGeometry, modelToBufferGeometry } from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";
import { describeOverhangs, overhangFaces } from "./helpers/print-pose";

const { normalize, validate, generate } = shelfRiser;

// Recorded at geometryVersion 1 for the defaults. A change here is a
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
    const split = deriveLayout(withChanges({ clearHeight: 237, legSection: 20 })).split;
    expect(split).toMatchObject({
      split: true,
      totalHeight: 241,
      upperLength: 236,
      extensionLength: 1,
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
    for (const key of ["deckWidth", "deckDepth", "deckThickness", "clearHeight", "legSection", "cornerRadius"] as const) {
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
    expect(shelfRiser.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-150, -100, 0],
      [150, 100, 124],
    ]);
  });
});
