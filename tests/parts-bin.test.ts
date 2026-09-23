import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import { getKernel } from "../lib/kernel/manifold";
import { roundedRectangle } from "../lib/kernel/profiles";
import {
  normalizePrinterProfile,
  thinWallIssues,
  wallLikeKeys,
} from "../lib/printer-profile";
import {
  LABEL_LEDGE_HEIGHT_MM,
  LABEL_LEDGE_PROJECTION_MM,
  LABEL_LEDGE_SHELF_MM,
  LABEL_LEDGE_SLOT_MM,
  LABEL_LEDGE_UPSTAND_MM,
  PARTS_BIN_DEFAULTS,
  PARTS_BIN_SPECS,
  deriveLayout,
  partsBin,
  stackFitClearances,
  stackedRecessFrame,
  type PartsBinParameters,
  type RingFrame,
} from "../lib/products/parts-bin";
import { buildPartsBinSolid } from "../lib/products/parts-bin/geometry";
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

const { normalize, validate, generate } = partsBin;

// Recorded at geometryVersion 1 for the defaults; version 2 changes only
// patterned floor openings, so the solid-default mesh remains the same.
const GOLDEN_TRIANGLES = 688;
const GOLDEN_VOLUME = 154444.59;

function withChanges(changes: Partial<PartsBinParameters>): PartsBinParameters {
  return normalize({ ...PARTS_BIN_DEFAULTS, ...changes });
}

/** Every value at, or as near as the stacking rules allow to, its minimum. */
const MINIMUM_CASE: Partial<PartsBinParameters> = {
  binWidth: 60,
  binDepth: 60,
  binHeight: 25,
  lipHeight: 2,
  lipWallThickness: 0.8,
  stackClearance: 0.1,
  wallThickness: 1.8,
  baseThickness: 1.2,
  cornerRadius: 0,
};
/**
 * Every size at its maximum. The lip values are inside the rule with 0.2 mm
 * to spare; LIMIT_CASE covers the rule's boundary.
 */
const MAXIMUM_CASE: Partial<PartsBinParameters> = {
  binWidth: 400,
  binDepth: 300,
  binHeight: 200,
  lipHeight: 10,
  lipWallThickness: 2.4,
  stackClearance: 0.3,
  wallThickness: 4,
  baseThickness: 6,
  cornerRadius: 20,
};
/** Exactly on the rule: 3 + 2 x 0.1 = 4 − 0.8. The wall keeps 0.4 mm per side. */
const LIMIT_CASE: Partial<PartsBinParameters> = {
  wallThickness: 4,
  lipWallThickness: 3,
  stackClearance: 0.1,
  lipHeight: 10,
};
/** The wall is too thin for this lip wall and this clearance. */
const CONFLICT_CASE: Partial<PartsBinParameters> = { wallThickness: 2 };

describe("parts bin parameters", () => {
  it("ships the work-area presets in order", () => {
    expect(partsBin.presets.map((preset) => preset.id)).toEqual([
      "garage-shelf",
      "craft-room-small-parts",
      "workbench-loose-hardware",
    ]);
  });

  it("rejects a lip that leaves too little wall, and offers only the fixes that fit", () => {
    const result = validate(withChanges(CONFLICT_CASE));
    expect(result.valid).toBe(false);
    // A thinner lip wall would have to be 0.6 mm, under the field's 0.8 mm
    // minimum, and a smaller clearance would have to be 0 mm, under the
    // field's 0.1 mm minimum. Only the outer wall can fix this.
    expect(result.byField.lipWallThickness).toEqual([
      "A lip wall of 1.2 mm with two 0.3 mm clearances takes 1.8 mm of the 2 mm outer wall. " +
        "The recess must leave 0.8 mm of wall. Use an outer wall of at least 2.6 mm.",
    ]);
  });

  it("offers all three fixes when the three fields can each accept one", () => {
    const result = validate(withChanges({ lipWallThickness: 2.4 }));
    expect(result.byField.lipWallThickness?.[0]).toBe(
      "A lip wall of 2.4 mm with two 0.3 mm clearances takes 3 mm of the 3.4 mm outer wall. " +
        "The recess must leave 0.8 mm of wall. Use a lip wall of at most 2 mm, or an outer wall of at least 3.8 mm, " +
        "or a stacking clearance of at most 0.1 mm.",
    );
    expect(validate(withChanges({ lipWallThickness: 1.6 })).valid).toBe(true);
    expect(
      validate(withChanges({ lipWallThickness: 2, stackClearance: 0.1 })).valid,
    ).toBe(true);
  });

  it("leaves out an outer wall the field cannot hold", () => {
    // 3 + 2 x 0.5 + 0.8 = 4.8 mm, above the 4 mm maximum of the field.
    const result = validate(
      withChanges({
        wallThickness: 4,
        lipWallThickness: 3,
        stackClearance: 0.5,
      }),
    );
    expect(result.byField.lipWallThickness?.[0]).toBe(
      "A lip wall of 3 mm with two 0.5 mm clearances takes 4 mm of the 4 mm outer wall. " +
        "The recess must leave 0.8 mm of wall. Use a lip wall of at most 2.2 mm, " +
        "or a stacking clearance of at most 0.1 mm.",
    );
  });

  it("names two changes when no single field can fix the lip", () => {
    const result = validate(
      withChanges({
        wallThickness: 1.2,
        lipWallThickness: 3,
        stackClearance: 0.2,
        stacking: true,
      }),
    );
    expect(result.byField.lipWallThickness?.[0]).toMatch(
      /No single value fixes this\. Use a thinner lip wall and a thicker outer wall\.$/,
    );
  });

  it("accepts a lip exactly at the wall limit and rejects one step past it", () => {
    // 1.2 mm lip wall + 2 x 0.3 mm clearance + 0.8 mm reserve = 2.6 mm of wall.
    expect(validate(withChanges({ wallThickness: 2.6 })).valid).toBe(true);
    expect(validate(withChanges({ wallThickness: 2.5 })).valid).toBe(false);
  });

  it("rejects a wall under 1.6 mm while the bin stacks, and accepts it without the lip", () => {
    const result = validate(withChanges({ wallThickness: 1.5 }));
    expect(result.byField.wallThickness).toEqual([
      "Outer walls must be at least 1.6 mm when the bin stacks. A stacked bin carries the bins above it. " +
        "Use a thicker wall, or turn the stacking lip off.",
    ]);
    // The lip rule reports the same wall as well; both name their own field.
    expect(result.byField.lipWallThickness).toHaveLength(1);
    expect(
      validate(withChanges({ wallThickness: 1.5, stacking: false })).valid,
    ).toBe(true);
  });

  it("keeps the plain bin free of every stacking rule", () => {
    const plain = withChanges({ stacking: false, wallThickness: 1.2 });
    expect(validate(plain).valid).toBe(true);
    const layout = deriveLayout(plain);
    expect(layout.lip).toBeNull();
    expect(layout.recess).toBeNull();
    expect(layout.outsideHeight).toBe(layout.bodyHeight);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "binWidth",
      "binDepth",
      "binHeight",
      "wallThickness",
      "baseThickness",
      "lipHeight",
      "lipWallThickness",
      "stackClearance",
      "cornerRadius",
    ] as const) {
      const cleared = { ...PARTS_BIN_DEFAULTS, [key]: Number.NaN };
      expect(() => partsBin.derive(cleared)).not.toThrow();
      expect(() => deriveLayout(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    const cleared = partsBin.derive({
      ...PARTS_BIN_DEFAULTS,
      wallThickness: Number.NaN,
    });
    expect(cleared.find((value) => value.id === "stacking-lip")?.value).toBe(
      "does not fit",
    );
  });

  it("reports the outside size, the stack pitch, and every feature", () => {
    expect(
      partsBin.derive(PARTS_BIN_DEFAULTS).map((value) => value.value),
    ).toEqual([
      "150 × 102.8 × 74 mm",
      "150 × 100 × 70 mm",
      "70 mm per bin",
      "143.2 × 93.2 × 67 mm",
      "1.2 mm wide, 4 mm high, 0.3 mm clearance, 0.8 mm of wall on each side",
      "11.25 mm radius",
      "144 mm wide, 2.8 mm in front of the bin",
    ]);
    const plain = partsBin.derive(
      withChanges({ stacking: false, frontScoop: false, labelLedge: false }),
    );
    expect(plain.map((value) => value.value)).toEqual([
      "150 × 100 × 70 mm",
      "150 × 100 × 70 mm",
      "does not stack",
      "143.2 × 93.2 × 67 mm",
      "none",
      "none",
      "none",
    ]);
  });

  it("creates a deterministic filename with the size and the stacking state", () => {
    expect(partsBin.filename(withChanges({ binWidth: 150.5 }))).toMatch(
      /^drawerforge-parts-bin-150p5x100x70-stack-[0-9a-f]{6}\.stl$/,
    );
    expect(partsBin.filename(withChanges({ stacking: false }))).toMatch(
      /^drawerforge-parts-bin-150x100x70-plain-[0-9a-f]{6}\.stl$/,
    );
    expect(partsBin.filename(withChanges({ lipHeight: 5 }))).not.toBe(
      partsBin.filename(PARTS_BIN_DEFAULTS),
    );
  });

  it("states the true top of the model in the bounds contract", () => {
    const parameters = withChanges({});
    const contract = partsBin.boundsContract(parameters);
    // The lip stands on the rim, so the model is taller than the bin height.
    expect(contract.max[2]).toBe(parameters.binHeight + parameters.lipHeight);
    expect(contract.min[1]).toBe(-parameters.binDepth / 2 - 2.8);
    const plain = withChanges({ stacking: false, labelLedge: false });
    expect(partsBin.boundsContract(plain).max[2]).toBe(plain.binHeight);
    expect(partsBin.boundsContract(plain).min[1]).toBe(-plain.binDepth / 2);
  });
});

describe("printed walls", () => {
  it("reports the wall beside the recess and the label ledge's shelf and upstand, alongside the wall-like parameters", () => {
    const layout = deriveLayout(PARTS_BIN_DEFAULTS);
    const walls = partsBin.printedWalls!(PARTS_BIN_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall]));

    expect(layout.recess).not.toBeNull();
    expect(byKey.get("stacking-wall")?.label).toBe("Wall beside the recess");
    expect(byKey.get("stacking-wall")?.value).toBeCloseTo(
      layout.wallBesideRecess,
      9,
    );
    expect(byKey.get("ledge-shelf")?.label).toBe("Label ledge shelf");
    expect(byKey.get("ledge-shelf")?.value).toBeCloseTo(
      LABEL_LEDGE_SHELF_MM,
      9,
    );
    expect(byKey.get("ledge-upstand")?.label).toBe("Label ledge upstand");
    expect(byKey.get("ledge-upstand")?.value).toBeCloseTo(
      LABEL_LEDGE_UPSTAND_MM,
      9,
    );

    for (const key of wallLikeKeys(PARTS_BIN_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("ships defaults and stacking presets whose recess skin passes rule 9 at a 0.4 mm nozzle", () => {
    // The skin beside the recess is (wall − lip wall − 2 × clearance) / 2.
    // Rule 9 needs two nozzle widths, 0.8 mm at the default nozzle, so the
    // defaults and both stacking presets carry an outer wall that leaves
    // at least that (D-1713).
    const profile = normalizePrinterProfile({ nozzleDiameter: 0.4 });
    const sets = [
      PARTS_BIN_DEFAULTS,
      ...partsBin.presets.map((preset) => preset.parameters),
    ];
    for (const parameters of sets) {
      const layout = deriveLayout(parameters);
      if (layout.recess)
        expect(layout.wallBesideRecess).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(
        thinWallIssues(partsBin.printedWalls!(parameters), profile),
      ).toEqual([]);
    }
    expect(deriveLayout(PARTS_BIN_DEFAULTS).wallBesideRecess).toBeCloseTo(
      0.8,
      9,
    );
    // One step thinner on the outer wall and the same nozzle refuses it,
    // naming the skin.
    const thinner = withChanges({ wallThickness: 3.2 });
    expect(partsBin.validate(thinner).valid).toBe(true);
    const issues = thinWallIssues(partsBin.printedWalls!(thinner), profile);
    expect(
      issues.some((issue) =>
        issue.text.includes("Wall beside the recess is 0.7 mm"),
      ),
    ).toBe(true);
  });

  it("omits the stacking wall without the lip, and the ledge walls without the ledge", () => {
    const plain = withChanges({ stacking: false, labelLedge: false });
    const walls = partsBin.printedWalls!(plain);
    const keys = walls.map((wall) => wall.key);
    expect(keys).not.toContain("stacking-wall");
    expect(keys).not.toContain("ledge-shelf");
    expect(keys).not.toContain("ledge-upstand");
  });

  it("flags the default ledge walls against a 1.5 mm nozzle, on defaults the product validates", () => {
    // The label ledge is fixed by constants, not by any field, so the
    // defaults already leave both walls under 3 mm; no custom parameter
    // set is needed.
    expect(partsBin.validate(PARTS_BIN_DEFAULTS).valid).toBe(true);
    expect(LABEL_LEDGE_SHELF_MM).toBeLessThan(3);
    expect(LABEL_LEDGE_UPSTAND_MM).toBeLessThan(3);

    const profile = normalizePrinterProfile({ nozzleDiameter: 1.5 });
    const issues = thinWallIssues(
      partsBin.printedWalls!(PARTS_BIN_DEFAULTS),
      profile,
    );
    expect(
      issues.some((issue) => issue.text.includes("Label ledge shelf")),
    ).toBe(true);
    expect(
      issues.some((issue) => issue.text.includes("Label ledge upstand")),
    ).toBe(true);
  });

  it("does not throw and reports only finite values for a cleared field", () => {
    const cleared = { ...PARTS_BIN_DEFAULTS, binWidth: Number.NaN };
    const walls = partsBin.printedWalls!(cleared);
    for (const wall of walls) {
      expect(Number.isFinite(wall.value), wall.key).toBe(true);
    }
  });
});

describe("parts bin stacking fit", () => {
  const fixtures: Array<[string, Partial<PartsBinParameters>]> = [
    ["default", {}],
    ["minimum", MINIMUM_CASE],
    ["maximum", MAXIMUM_CASE],
    ["lip at the wall limit", LIMIT_CASE],
    ["square corners", { cornerRadius: 0 }],
    ["garage shelf preset", partsBin.presets[0].parameters],
    ["craft room preset", partsBin.presets[1].parameters],
  ];

  it.each(fixtures)(
    "encloses the lip of the %s bin in the recess above it, with the clearance on every side",
    (_name, changes) => {
      const parameters = withChanges(changes);
      expect(validate(parameters).valid).toBe(true);
      const layout = deriveLayout(parameters);
      const lip = layout.lip!;
      const recess = stackedRecessFrame(layout)!;
      const clearance = parameters.stackClearance;

      // The recess is wider than the lip on the outside, narrower on the
      // inside, and taller. So the recess encloses the lip.
      expect(recess.outerHalfWidth).toBeGreaterThan(lip.outerHalfWidth);
      expect(recess.outerHalfDepth).toBeGreaterThan(lip.outerHalfDepth);
      expect(recess.innerHalfWidth).toBeLessThan(lip.innerHalfWidth);
      expect(recess.innerHalfDepth).toBeLessThan(lip.innerHalfDepth);
      expect(recess.topZ).toBeGreaterThan(lip.topZ);
      expect(recess.bottomZ).toBeCloseTo(lip.bottomZ, 9);

      const fit = stackFitClearances(layout)!;
      expect(fit.outerWidth).toBeCloseTo(clearance, 9);
      expect(fit.outerDepth).toBeCloseTo(clearance, 9);
      expect(fit.outerCorner).toBeCloseTo(clearance, 9);
      expect(fit.innerWidth).toBeCloseTo(clearance, 9);
      expect(fit.innerDepth).toBeCloseTo(clearance, 9);
      expect(fit.innerCorner).toBeCloseTo(clearance, 9);
      expect(fit.top).toBeCloseTo(clearance, 9);
      // The two rims meet. That plane is the seat of the stack.
      expect(fit.bottom).toBe(0);
    },
  );

  it("keeps the recess inside the wall, with the reserve on each side", () => {
    for (const [, changes] of fixtures) {
      const parameters = withChanges(changes);
      const layout = deriveLayout(parameters);
      const recess = layout.recess!;
      const outerSkin = parameters.binWidth / 2 - recess.outerHalfWidth;
      const innerSkin =
        recess.innerHalfWidth -
        (parameters.binWidth / 2 - parameters.wallThickness);
      expect(outerSkin).toBeCloseTo(layout.wallBesideRecess, 9);
      expect(innerSkin).toBeCloseTo(layout.wallBesideRecess, 9);
      expect(layout.wallBesideRecess * 2).toBeGreaterThanOrEqual(0.8 - 1e-9);
    }
  });

  it.each(fixtures)(
    "builds two %s bins that do not collide when one stands on the other",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const layout = deriveLayout(parameters);
      const kernel = await getKernel();
      const lower = buildPartsBinSolid(kernel, parameters);
      const upper = lower.translate([0, 0, layout.stackPitch]);
      const overlap = lower.intersect(upper);
      // The rims meet on one plane, so the shared volume is zero.
      expect(Math.abs(overlap.volume())).toBeLessThan(1e-6);
      for (const solid of [upper, overlap]) solid.delete();

      // The proof is not empty: press the two bins 1 mm closer and they
      // share material, so the seat and the lip are real.
      const pressed = lower.translate([0, 0, layout.stackPitch - 1]);
      const collision = lower.intersect(pressed);
      expect(collision.volume()).toBeGreaterThan(1);
      for (const solid of [lower, pressed, collision]) solid.delete();
    },
  );

  it("keeps the clearance around the corners of the ring, at every corner radius", async () => {
    const kernel = await getKernel();
    const ring = (frame: RingFrame, segments: number) => {
      const outer = roundedRectangle(
        kernel,
        frame.outerHalfWidth * 2,
        frame.outerHalfDepth * 2,
        frame.outerCornerRadius,
        segments,
      );
      const inner = roundedRectangle(
        kernel,
        frame.innerHalfWidth * 2,
        frame.innerHalfDepth * 2,
        frame.innerCornerRadius,
        segments,
      );
      const band = outer.subtract(inner);
      outer.delete();
      inner.delete();
      return band;
    };
    /** Grows the lip until it leaves the recess. That size is the gap. */
    const smallestGap = (parameters: PartsBinParameters, segments: number) => {
      const layout = deriveLayout(parameters);
      const lip = ring(layout.lip!, segments);
      const recess = ring(layout.recess!, segments);
      let fitting = 0;
      let tight = 1;
      for (let step = 0; step < 32; step += 1) {
        const middle = (fitting + tight) / 2;
        const grown = lip.offset(middle, "Round", 2, 128);
        const outside = grown.subtract(recess);
        const fits = outside.isEmpty();
        grown.delete();
        outside.delete();
        if (fits) fitting = middle;
        else tight = middle;
      }
      lip.delete();
      recess.delete();
      return fitting;
    };
    const clearance = PARTS_BIN_DEFAULTS.stackClearance;
    // A square corner keeps the whole clearance. A round corner loses the
    // chord of the arc, and a finer mesh loses less of it.
    expect(smallestGap(withChanges({ cornerRadius: 0 }), 24)).toBeCloseTo(
      clearance,
      3,
    );
    const standard = smallestGap(withChanges({}), 24);
    const fine = smallestGap(withChanges({ meshQuality: "fine" }), 48);
    expect(standard).toBeGreaterThan(clearance - 0.01);
    expect(standard).toBeLessThanOrEqual(clearance);
    expect(fine).toBeGreaterThan(standard);
    expect(fine).toBeLessThanOrEqual(clearance);
  });

  it("holds the upper bin inside the stacking clearance", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const kernel = await getKernel();
    const bin = buildPartsBinSolid(kernel, parameters);
    const shift = (offset: number) => {
      const moved = bin.translate([offset, 0, layout.stackPitch]);
      const overlap = bin.intersect(moved);
      const volume = overlap.volume();
      moved.delete();
      overlap.delete();
      return volume;
    };
    // Inside the clearance the bin still drops on. Past it, the lip binds.
    expect(Math.abs(shift(parameters.stackClearance - 0.1))).toBeLessThan(1e-6);
    expect(shift(parameters.stackClearance + 0.2)).toBeGreaterThan(1);
    bin.delete();
  });
});

describe("parts bin geometry", () => {
  const fixtures: Array<[string, Partial<PartsBinParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["lip at the wall limit", LIMIT_CASE],
    ["plain bin without a lip", { stacking: false, wallThickness: 2 }],
    [
      "bin without a scoop or a ledge",
      { frontScoop: false, labelLedge: false },
    ],
    ["square corners", { cornerRadius: 0 }],
  ];

  it.each(fixtures)(
    "creates a finite, outward, closed %s bin",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      expect(validate(parameters).valid).toBe(true);
      const model = await generate(parameters);
      const geometry = modelToBufferGeometry(model);
      const analysis = analyzeBufferGeometry(geometry);
      const size = analysis.bounds.getSize(new THREE.Vector3());
      const layout = deriveLayout(parameters);

      expect(model.status).toBe("NoError");
      expect(model.volume).toBeGreaterThan(0);
      expect(analysis.finite).toBe(true);
      expect(analysis.triangleCount).toBeGreaterThan(0);
      expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
      expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
      expect(analysis.signedVolume).toBeGreaterThan(0);
      expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
      expect(size.x).toBeCloseTo(layout.outsideWidth, 4);
      expect(size.y).toBeCloseTo(layout.outsideDepth, 4);
      expect(size.z).toBeCloseTo(layout.outsideHeight, 4);
      expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
      // The contract carries its own tolerance. Compare against that, not by
      // equality: a size such as 152.8 mm is not exact in binary.
      const contract = partsBin.boundsContract(parameters);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(
          Math.abs(model.bounds[0][axis] - contract.min[axis]),
        ).toBeLessThan(contract.tolerance);
        expect(
          Math.abs(model.bounds[1][axis] - contract.max[axis]),
        ).toBeLessThan(contract.tolerance);
      }

      for (const edge of closedEdgeCounts(geometry)) {
        expect(edge.count).toBe(2);
        expect(edge.balance).toBe(0);
      }
      geometry.dispose();
    },
  );

  it("refuses the conflict case instead of building it", async () => {
    await expect(generate(withChanges(CONFLICT_CASE))).rejects.toThrow(
      /takes 1.8 mm of the 2 mm outer wall/,
    );
  });

  it.each([
    ["default", {}],
    ["minimum", MINIMUM_CASE],
    ["plain bin without a lip", { stacking: false, wallThickness: 2 }],
  ] as Array<[string, Partial<PartsBinParameters>]>)(
    "shows one outer contour and one cavity above the base of the %s bin",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const model = await generate(parameters);
      const layout = deriveLayout(parameters);
      const topology = horizontalSliceTopology(
        model.mesh,
        parameters.baseThickness + layout.insideHeight / 2,
      );
      expect({
        contours: topology.contours,
        solidComponents: topology.solidComponents,
        holes: topology.holes,
      }).toEqual({ contours: 2, solidComponents: 1, holes: 1 });
    },
  );

  it("shows a closed ring in a slice through the lip", async () => {
    const parameters = withChanges({ frontScoop: false });
    const model = await generate(parameters);
    const layout = deriveLayout(parameters);
    const topology = horizontalSliceTopology(
      model.mesh,
      layout.bodyHeight + parameters.lipHeight / 2,
    );
    expect({
      contours: topology.contours,
      solidComponents: topology.solidComponents,
      holes: topology.holes,
    }).toEqual({ contours: 2, solidComponents: 1, holes: 1 });
    // The ring is the lip, so a point in the middle of the bin is not solid.
    expect(topology.containsSolid([0, 0])).toBe(false);
    expect(topology.containsSolid([layout.lip!.outerHalfWidth - 0.6, 0])).toBe(
      true,
    );
  });

  it("opens the lip at the front when the scoop is on", async () => {
    const parameters = withChanges({});
    const model = await generate(parameters);
    const layout = deriveLayout(parameters);
    const topology = horizontalSliceTopology(
      model.mesh,
      layout.bodyHeight + parameters.lipHeight / 2,
    );
    // The scoop cuts the ring open, so the slice is one contour and no hole.
    expect({ contours: topology.contours, holes: topology.holes }).toEqual({
      contours: 1,
      holes: 0,
    });
    expect(topology.containsSolid([0, -layout.bodyDepth / 2 + 0.5])).toBe(
      false,
    );
  });

  it("shows the recess as a ring of removed material under the wall", async () => {
    // Without the label ledge, because the upstand of the ledge stands clear
    // of the bin above the shelf and would add its own contour to the slice.
    const parameters = withChanges({ labelLedge: false });
    const model = await generate(parameters);
    const layout = deriveLayout(parameters);
    const topology = horizontalSliceTopology(
      model.mesh,
      layout.recess!.topZ / 2,
    );
    // The outer contour, the recess, and the base inside the recess.
    expect({
      contours: topology.contours,
      solidComponents: topology.solidComponents,
      holes: topology.holes,
    }).toEqual({ contours: 3, solidComponents: 2, holes: 1 });
    const recessMiddle =
      (layout.recess!.outerHalfWidth + layout.recess!.innerHalfWidth) / 2;
    expect(topology.containsSolid([recessMiddle, 0])).toBe(false);
    expect(topology.containsSolid([0, 0])).toBe(true);
  });

  it("leaves the card slot open between the label ledge and the front face", async () => {
    const parameters = withChanges({});
    const model = await generate(parameters);
    const layout = deriveLayout(parameters);
    const frontY = -layout.bodyDepth / 2;
    // Above the shelf and above the recess, so the slice shows the wall of
    // the bin and the upstand of the ledge, and nothing else.
    const topology = horizontalSliceTopology(
      model.mesh,
      (layout.recess!.topZ + LABEL_LEDGE_HEIGHT_MM) / 2,
    );
    expect(topology.solidComponents).toBe(2);
    expect(topology.holes).toBe(1);
    expect(topology.containsSolid([0, frontY - LABEL_LEDGE_SLOT_MM / 2])).toBe(
      false,
    );
    expect(
      topology.containsSolid([0, frontY - LABEL_LEDGE_PROJECTION_MM + 0.6]),
    ).toBe(true);
    // The ledge stays under the rim of the shortest bin the schema allows,
    // so no bin can press its underside onto the ledge below it.
    expect(LABEL_LEDGE_HEIGHT_MM).toBeLessThan(PARTS_BIN_SPECS.binHeight.min);
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

  it("builds the largest fine bin inside the kernel time budget", async () => {
    const parameters = withChanges({ ...MAXIMUM_CASE, meshQuality: "fine" });
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(parameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // The measured value here is about 25 ms (21b_PARTS_BIN_SECTION.md).
    // Two seconds leaves room for a slower CI runner, and a regression to
    // the size of the one second threshold still fails.
    expect(elapsed).toBeLessThan(2_000);
  });

  it("round-trips the exact preview triangles through binary STL", async () => {
    const model = await generate(withChanges({}));
    const geometry = modelToBufferGeometry(model);
    const data = serializeBinaryStl(geometry);
    const inspected = inspectBinaryStl(data);
    geometry.computeBoundingBox();
    expect(inspected.triangleCount).toBe(
      geometry.getAttribute("position").count / 3,
    );
    expect(inspected.finite).toBe(true);
    expect(inspected.minimumNormalAlignment).toBeGreaterThan(0.99999);
    expect(
      inspected.bounds.min.distanceTo(geometry.boundingBox!.min),
    ).toBeLessThan(1e-5);
    expect(
      inspected.bounds.max.distanceTo(geometry.boundingBox!.max),
    ).toBeLessThan(1e-5);
    const parsed = new STLLoader().parse(data);
    expect(parsed.getAttribute("position").count).toBe(
      geometry.getAttribute("position").count,
    );
    parsed.dispose();
    geometry.dispose();
  });

  it("matches the solid-default golden record at geometry version 2", async () => {
    const model = await generate(normalize(PARTS_BIN_DEFAULTS));
    expect(partsBin.geometryVersion).toBe(2);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(
      0.001,
    );
    expect(model.bounds).toEqual([
      [-75, -52.8, 0],
      [75, 50, 74],
    ]);
  });
});
