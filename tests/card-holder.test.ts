import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import { getKernel } from "../lib/kernel/manifold";
import { wallLikeKeys } from "../lib/printer-profile";
import {
  CARD_HOLDER_DEFAULTS,
  MINIMUM_WEB_MM,
  cardHolder,
  deriveCardHolderLayout,
  pointClearsCorner,
  slotCutter,
  type CardHolderParameters,
} from "../lib/products/card-holder";
import { inspectBinaryStl, serializeBinaryStl } from "../lib/stl";
import {
  analyzeBufferGeometry,
  modelToBufferGeometry,
} from "../lib/three-geometry";
import {
  closedEdgeCounts,
  connectedComponentCount,
  horizontalSliceTopology,
} from "./helpers/mesh-checks";

const { normalize, validate, generate } = cardHolder;

// Recorded at geometryVersion 1 for the defaults. A change here is a geometry
// change: bump CARD_HOLDER_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 268;
const GOLDEN_VOLUME = 314885.38;

function withChanges(changes: Partial<CardHolderParameters>): CardHolderParameters {
  return normalize({ ...CARD_HOLDER_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<CardHolderParameters> = {
  holderWidth: 40, holderDepth: 20, holderHeight: 8, cardGauge: 0.5,
  slotClearance: 0.1, cardWidth: 10, slotCount: 1, slotDepth: 3, slotTilt: 0,
  wallThickness: 1.6, baseThickness: 1.2, cornerRadius: 0, meshQuality: "draft",
};
const MAXIMUM_CASE: Partial<CardHolderParameters> = {
  holderWidth: 400, holderDepth: 300, holderHeight: 80, cardGauge: 6,
  slotClearance: 1.5, cardWidth: 200, slotCount: 10, slotDepth: 60,
  slotTilt: 20, wallThickness: 4, baseThickness: 6, cornerRadius: 20,
  meshQuality: "fine",
};
const CORNER_CASE: Partial<CardHolderParameters> = {
  holderWidth: 100, holderDepth: 40, holderHeight: 24, cardWidth: 30,
  slotCount: 8, slotDepth: 12, cornerRadius: 20,
};

describe("card holder parameters", () => {
  it("ships the card-size presets in order", () => {
    expect(cardHolder.presets.map((preset) => preset.id)).toEqual([
      "memory-cards",
      "game-cartridges",
      "cassettes",
    ]);
  });

  it("names only the printed walls as walls, not the card", () => {
    // The printer profile finds a printed wall by key. A card is not a
    // printed wall, so the card's key is "cardGauge" and rule 9 leaves it
    // alone. See 23_REVOLVED_FORMS_NOTES.md, D-1519.
    expect(wallLikeKeys(cardHolder.specs).sort()).toEqual([
      "baseThickness",
      "wallThickness",
    ]);
    expect(cardHolder.specs.cardGauge.label).toBe("Card thickness");
    expect(
      validate(withChanges({ cardGauge: 0.5, slotClearance: 0.1 })).valid,
    ).toBe(true);
  });

  it("keeps the tilt between 0 and 20 degrees", () => {
    expect(cardHolder.specs.slotTilt.min).toBe(0);
    expect(cardHolder.specs.slotTilt.max).toBe(20);
    expect(validate({ ...CARD_HOLDER_DEFAULTS, slotTilt: 25 }).byField.slotTilt).toHaveLength(
      1,
    );
  });

  it("adds the clearance to the card thickness and to the card width", () => {
    const layout = deriveCardHolderLayout(withChanges({}));
    expect(layout.slotWidth).toBeCloseTo(2.6, 9);
    expect(layout.slotLength).toBeCloseTo(24.4, 9);
  });

  it("widens the footprint of a tilted slot by its lean at the floor", () => {
    const upright = deriveCardHolderLayout(withChanges({ slotTilt: 0 }));
    expect(upright.slotFootprint).toBeCloseTo(upright.slotWidth, 9);
    expect(upright.floorOffset).toBe(0);
    expect(upright.pivotOffset).toBeCloseTo(0, 9);
    const tilted = deriveCardHolderLayout(withChanges({ slotTilt: 20 }));
    const radians = (20 * Math.PI) / 180;
    expect(tilted.floorOffset).toBeCloseTo(14 * Math.tan(radians), 9);
    expect(tilted.mouthWidth).toBeCloseTo(2.6 / Math.cos(radians), 9);
    expect(tilted.slotFootprint).toBeCloseTo(
      2.6 * Math.cos(radians) + 14 * Math.tan(radians),
      9,
    );
    expect(tilted.slotFootprint).toBeGreaterThan(upright.slotFootprint);
  });

  it("rejects slots that do not fit the width, naming the slot count", () => {
    const result = validate(withChanges({ slotCount: 24, slotTilt: 20 }));
    expect(result.valid).toBe(false);
    expect(result.byField.slotCount?.[0]).toBe(
      "24 slots of 7.5 mm do not fit in the 176 mm inside the rim. Use fewer slots, less tilt, a shallower slot, or a wider holder.",
    );
    const tight = validate(withChanges({ slotCount: 24 }));
    expect(tight.byField.slotCount?.[0]).toBe(
      `24 slots of 5 mm leave a web of 2.2 mm. Keep at least ${MINIMUM_WEB_MM} mm between slots. Use fewer slots, less tilt, a shallower slot, or a wider holder.`,
    );
  });

  it("rejects a slot deeper than the height minus the base, naming the field", () => {
    const result = validate(withChanges({ slotDepth: 28 }));
    expect(result.byField.slotDepth?.[0]).toBe(
      "Slot depth must be at most 27.6 mm, so that 2.4 mm of base stays under the slots. Use a shallower slot, a taller holder, or a thinner base.",
    );
  });

  it("rejects a card that is wider than the space inside the rim", () => {
    const result = validate(withChanges({ cardWidth: 60 }));
    expect(result.byField.cardWidth?.[0]).toBe(
      "A 60 mm card needs a 60.4 mm slot, and only 56 mm is inside the rim. Use a deeper holder, a thinner rim, or a narrower card.",
    );
  });

  it("rejects a corner radius that cuts into an end slot, naming the largest that fits", () => {
    const result = validate(withChanges(CORNER_CASE));
    expect(result.valid).toBe(false);
    expect(result.byField.cornerRadius).toHaveLength(1);
    expect(result.byField.cornerRadius?.[0]).toBe(
      "Corner radius 20 mm cuts into the end slots. Use at most 17 mm, a shorter card width, or fewer slots.",
    );
    expect(validate(withChanges({ ...CORNER_CASE, cornerRadius: 17 })).valid).toBe(true);
    expect(validate(withChanges({ ...CORNER_CASE, cornerRadius: 17.5 })).valid).toBe(false);
  });

  it("clears a point that is not in the corner region", () => {
    expect(pointClearsCorner(0, 0, 100, 40, 20, 2)).toBe(true);
    expect(pointClearsCorner(45, 0, 100, 40, 20, 2)).toBe(true);
    expect(pointClearsCorner(41.8, 15.2, 100, 40, 20, 2)).toBe(false);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "holderWidth",
      "holderDepth",
      "holderHeight",
      "cardGauge",
      "cardWidth",
      "slotCount",
      "slotDepth",
      "slotTilt",
      "cornerRadius",
    ] as const) {
      const cleared = { ...CARD_HOLDER_DEFAULTS, [key]: Number.NaN };
      expect(() => cardHolder.derive(cleared)).not.toThrow();
      expect(() => cardHolder.summary(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    expect(
      cardHolder.derive({ ...CARD_HOLDER_DEFAULTS, holderWidth: Number.NaN })[2].value,
    ).toBe("does not fit");
    // A cleared count must never print "NaN slots".
    const clearedCount = { ...CARD_HOLDER_DEFAULTS, slotCount: Number.NaN };
    expect(cardHolder.summary(clearedCount)).toMatch(/· — slots$/);
    expect(cardHolder.summary(withChanges({ slotCount: 1 }))).toMatch(/· 1 slot$/);
    for (const value of cardHolder.derive(clearedCount)) {
      expect(value.value).not.toMatch(/NaN/);
    }
  });

  it("creates a deterministic filename with the size and the slot count", () => {
    expect(cardHolder.filename(withChanges({}))).toMatch(
      /^drawerforge-card-holder-180x60x30-10s-[0-9a-f]{6}\.stl$/,
    );
    expect(cardHolder.filename(withChanges({ slotTilt: 12 }))).not.toBe(
      cardHolder.filename(withChanges({})),
    );
  });

  it("derives the slot, the pitch, the lean, and the base", () => {
    expect(cardHolder.derive(withChanges({})).map((value) => value.value)).toEqual([
      "180 × 60 × 30 mm",
      "2.6 × 24.4 mm",
      "16.5 mm, web 11.4 mm",
      "2.5 mm",
      "16 mm",
    ]);
  });
});

describe("the tilted slot cutter", () => {
  it("puts the slot floor exactly the slot depth below the top face", async () => {
    const kernel = await getKernel();
    for (const tiltDegrees of [0, 5, 10, 20]) {
      const parameters = withChanges({ slotTilt: tiltDegrees });
      const layout = deriveCardHolderLayout(parameters);
      const cutter = slotCutter(kernel, {
        slotWidth: layout.slotWidth,
        slotLength: layout.slotLength,
        slotDepth: parameters.slotDepth,
        tiltDegrees,
        topZ: parameters.holderHeight,
      });
      const box = cutter.boundingBox();
      expect(box.min[2]).toBeCloseTo(
        parameters.holderHeight - parameters.slotDepth,
        5,
      );
      expect(box.max[2]).toBeGreaterThan(parameters.holderHeight);
      // The slot's own length along Y never changes with the tilt.
      expect(box.min[1]).toBeCloseTo(-layout.slotLength / 2, 5);
      expect(box.max[1]).toBeCloseTo(layout.slotLength / 2, 5);
      cutter.delete();
    }
  });
});

describe("card holder geometry", () => {
  const fixtures: Array<[string, Partial<CardHolderParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["upright slots", { slotTilt: 0 }],
    ["full tilt", { slotTilt: 20 }],
    ["one slot", { slotCount: 1 }],
    ["packed row", { holderWidth: 260, slotCount: 24, slotTilt: 20 }],
    ["corner case", { ...CORNER_CASE, cornerRadius: 17 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s holder", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(parameters.holderWidth, 4);
    expect(size.y).toBeCloseTo(parameters.holderDepth, 4);
    expect(size.z).toBeCloseTo(parameters.holderHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    const contract = cardHolder.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    await expect(generate(withChanges({ slotCount: 24, slotTilt: 20 }))).rejects.toThrow(
      /24 slots of 7.5 mm do not fit in the 176 mm inside the rim/,
    );
  });

  it.each(fixtures)(
    "keeps every %s slot inside the slab, from the mouth to the floor",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const model = await generate(parameters);
      const slots = Math.round(parameters.slotCount);
      const floorZ = parameters.holderHeight - parameters.slotDepth;
      for (let step = 1; step < 10; step += 1) {
        const z = floorZ + (parameters.slotDepth * step) / 10;
        const topology = horizontalSliceTopology(model.mesh, z);
        // One outer contour and one closed hole per slot at every depth. A
        // slot that reached the rim would merge with the outside and drop the
        // hole count.
        expect({ z, contours: topology.contours, holes: topology.holes }).toEqual({
          z,
          contours: 1 + slots,
          holes: slots,
        });
        expect(topology.solidComponents).toBe(1);
      }
      // Under the slot floor the section is solid.
      const under = horizontalSliceTopology(model.mesh, floorZ / 2);
      expect(under).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
    },
  );

  it("keeps every end slot closed at the largest corner radius validation accepts", async () => {
    const rejected = withChanges(CORNER_CASE);
    const message = validate(rejected).byField.cornerRadius?.[0] ?? "";
    const maximum = Number(message.match(/at most ([\d.]+) mm/)?.[1]);
    const parameters = withChanges({ ...CORNER_CASE, cornerRadius: maximum });
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const topology = horizontalSliceTopology(
      model.mesh,
      parameters.holderHeight - parameters.slotDepth / 2,
    );
    expect(topology.holes).toBe(parameters.slotCount);
    expect(topology.solidComponents).toBe(1);
  });

  it("leans the slot floor away from the mouth", async () => {
    const parameters = withChanges({ slotCount: 1, slotTilt: 20 });
    const layout = deriveCardHolderLayout(parameters);
    const model = await generate(parameters);
    const mouth = horizontalSliceTopology(model.mesh, parameters.holderHeight - 0.2);
    const middle = horizontalSliceTopology(
      model.mesh,
      parameters.holderHeight - parameters.slotDepth / 2,
    );
    // The slot's own axis meets the top face at the pivot, and the single
    // slot's footprint is centered on the origin, so the pivot is the layout's
    // pivot offset. At the mouth the gap sits on the pivot. Halfway down it
    // has moved along −X by half the lean.
    expect(layout.pivotOffset).toBeGreaterThan(0);
    expect(mouth.containsSolid([layout.pivotOffset, 0])).toBe(false);
    expect(middle.containsSolid([layout.pivotOffset, 0])).toBe(true);
    expect(
      middle.containsSolid([layout.pivotOffset - layout.floorOffset / 2, 0]),
    ).toBe(false);
  });

  it("increases round-feature fidelity with mesh quality", async () => {
    const counts: number[] = [];
    for (const meshQuality of ["draft", "standard", "fine"] as const) {
      const model = await generate(withChanges({ meshQuality }));
      counts.push(model.mesh.triVerts.length / 3);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("builds a packed row of fine slots inside the kernel time budget", async () => {
    const parameters = withChanges({
      holderWidth: 400, holderDepth: 220, holderHeight: 60, cardWidth: 200,
      slotCount: 24, slotDepth: 20, slotTilt: 10, cornerRadius: 20,
      meshQuality: "fine",
    });
    expect(validate(parameters).valid).toBe(true);
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(parameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    expect(elapsed).toBeLessThan(2_000);
  });

  it("round-trips the exact preview triangles through binary STL", async () => {
    const model = await generate(withChanges({}));
    const geometry = modelToBufferGeometry(model);
    const data = serializeBinaryStl(geometry);
    const inspected = inspectBinaryStl(data);
    geometry.computeBoundingBox();
    expect(inspected.triangleCount).toBe(geometry.getAttribute("position").count / 3);
    expect(inspected.finite).toBe(true);
    expect(inspected.minimumNormalAlignment).toBeGreaterThan(0.99999);
    expect(inspected.bounds.min.distanceTo(geometry.boundingBox!.min)).toBeLessThan(1e-5);
    expect(inspected.bounds.max.distanceTo(geometry.boundingBox!.max)).toBeLessThan(1e-5);
    const parsed = new STLLoader().parse(data);
    expect(parsed.getAttribute("position").count).toBe(
      geometry.getAttribute("position").count,
    );
    parsed.dispose();
    geometry.dispose();
  });

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(CARD_HOLDER_DEFAULTS));
    expect(cardHolder.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-90, -30, 0],
      [90, 30, 30],
    ]);
  });
});
