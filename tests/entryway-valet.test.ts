import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ENTRYWAY_VALET_DEFAULTS,
  ENTRYWAY_VALET_SPECS,
  SLOT_LIP_THICKNESS_MM,
  deriveLayout,
  entrywayValet,
  type EntrywayValetParameters,
} from "../lib/products/entryway-valet";
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

const { normalize, validate, generate } = entrywayValet;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump ENTRYWAY_VALET_GEOMETRY_VERSION and re-record on purpose.
const GOLDEN_TRIANGLES = 266;
const GOLDEN_VOLUME = 1006792.52;

function withChanges(changes: Partial<EntrywayValetParameters>): EntrywayValetParameters {
  return normalize({ ...ENTRYWAY_VALET_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<EntrywayValetParameters> = {
  valetWidth: 120, valetDepth: 80, valetHeight: 20, wellWidths: [100], wellDepth: 30, slotWidth: 6,
  restHeight: 30, restAngle: 8, wallThickness: 1.6, baseThickness: 1.6, dividerThickness: 1.2,
  cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<EntrywayValetParameters> = {
  valetWidth: 400, valetDepth: 250, valetHeight: 80, wellWidths: [60, 60, 60, 60, 100], wellDepth: 150,
  slotWidth: 25, restHeight: 120, restAngle: 25, wallThickness: 4, baseThickness: 6,
  dividerThickness: 4, cornerRadius: 20,
};

describe("entryway valet parameters", () => {
  it("ships the valet presets in order, each with its last well solved", () => {
    expect(entrywayValet.presets.map((preset) => preset.id)).toEqual([
      "keys-watch-phone",
      "family-entry",
      "desk-valet",
    ]);
    for (const preset of entrywayValet.presets) {
      expect(normalize(preset.parameters)).toEqual(preset.parameters);
    }
  });

  it("solves the last well and writes it into the list", () => {
    expect(withChanges({ wellWidths: [80, 60, 10] }).wellWidths).toEqual([80, 60, 92]);
    expect(withChanges({ wellWidths: [80, 60, 92] })).toEqual(ENTRYWAY_VALET_DEFAULTS);
    expect(deriveLayout(ENTRYWAY_VALET_DEFAULTS).dividerPositions.map((x) => Number(x.toFixed(6)))).toEqual([
      -37, 25,
    ]);
  });

  it("lays the wells along the front and the rest along the back", () => {
    const layout = deriveLayout(ENTRYWAY_VALET_DEFAULTS);
    expect(layout.innerWidth).toBe(236);
    expect(layout.innerDepth).toBe(146);
    expect(layout.frontInner).toBe(-73);
    expect(layout.backDividerY).toBe(-2);
    expect(layout.restZoneStart).toBe(-1);
    expect(layout.lipY).toBe(0);
    expect(layout.wedgeFootY).toBe(13);
    expect(layout.wedgeBaseDepth).toBe(60);
    expect(layout.wedgeTopDepth).toBeCloseTo(41.887, 3);
    expect(layout.maximumWellDepth).toBeCloseTo(107.887, 3);
    expect(layout.outsideHeight).toBe(70);
  });

  it("refuses a solved well under 25 mm with only the fixes that work", () => {
    const result = validate(withChanges({ wellWidths: [120, 100, 12] }));
    expect(result.byField.wellWidths?.[0]).toBe(
      "Well 3 is solved to 12 mm, and every well must be at least 25 mm wide. Shrink well 1 by 13 mm, remove a well, or make the valet 13 mm wider.",
    );
    expect(validate(withChanges({ wellWidths: [120, 87, 25] })).valid).toBe(true);
  });

  it("keeps 4 mm at the top of the rest, naming the deepest well row that does", () => {
    expect(validate(withChanges({ wellDepth: 107 })).valid).toBe(true);
    const result = validate(withChanges({ wellDepth: 108 }));
    expect(result.byField.wellDepth?.[0]).toBe(
      "The rest is 3.9 mm thick at its top, and it must keep 4 mm. Use a well depth of at most 107.9 mm, a lower rest, a smaller rest angle, or a deeper valet.",
    );
    // A steeper lean thins the top too.
    expect(validate(withChanges({ wellDepth: 107, restAngle: 25 })).valid).toBe(false);
    // When no legal well depth can save the rest, the message moves to the
    // rest and names no impossible depth.
    const hopeless = validate(
      withChanges({ valetWidth: 120, valetDepth: 80, wellWidths: [116], wellDepth: 30, slotWidth: 25, restHeight: 120, restAngle: 25, baseThickness: 1.6 }),
    );
    expect(hopeless.byField.wellDepth).toBeUndefined();
    expect(hopeless.byField.restHeight?.[0]).toMatch(
      /^The rest is -[\d.]+ mm thick at its top, and it must keep 4 mm\. No well depth allows this rest\. Use a lower rest, a smaller rest angle, or a deeper valet\.$/,
    );
  });

  it("keeps the rest at least as tall as the walls", () => {
    expect(validate(withChanges({ restHeight: 40 })).valid).toBe(true);
    expect(validate(withChanges({ restHeight: 39 })).byField.restHeight?.[0]).toBe(
      "Rest height must be at least the wall height, 40 mm, so the rest stands above the back wall.",
    );
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "valetWidth", "valetDepth", "valetHeight", "wellDepth", "slotWidth", "restHeight", "restAngle",
      "wallThickness", "baseThickness", "dividerThickness", "cornerRadius",
    ] as const) {
      const cleared = { ...ENTRYWAY_VALET_DEFAULTS, [key]: Number.NaN };
      expect(() => entrywayValet.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    expect(() => entrywayValet.derive({ ...ENTRYWAY_VALET_DEFAULTS, wellWidths: [Number.NaN, 60, 92] })).not.toThrow();
  });

  it("derives the size, the wells, the rest, and the load", () => {
    expect(entrywayValet.derive(ENTRYWAY_VALET_DEFAULTS).map((value) => value.value)).toEqual([
      "240 × 150 × 70 mm",
      "3: 80, 60, 92 mm wide, 70 mm deep",
      "15 degrees back, 70 mm tall, 41.9 mm thick at the top, 12 mm slot",
      "5 kg or more at 3 perimeters in PLA, approximate. This app rates nothing above 5 kg.",
    ]);
    expect(entrywayValet.summary(ENTRYWAY_VALET_DEFAULTS)).toBe("240 × 150 × 70 mm · 3 wells · 15° rest");
  });

  it("creates a deterministic filename with the well count", () => {
    expect(entrywayValet.filename(ENTRYWAY_VALET_DEFAULTS)).toMatch(
      /^drawerforge-entryway-valet-240x150x70-3wells-[0-9a-f]{6}\.stl$/,
    );
    expect(entrywayValet.filename(withChanges({ wellWidths: [80, 152] }))).toMatch(/-2wells-/);
  });

  it("prints in its modeled pose and carries no compensation", () => {
    expect(entrywayValet.printOrientation).toBeUndefined();
    expect(entrywayValet.compensable).toBeUndefined();
  });
});

describe("entryway valet geometry", () => {
  const fixtures: Array<[string, Partial<EntrywayValetParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["family entry", entrywayValet.presets[1].parameters],
    ["desk valet", entrywayValet.presets[2].parameters],
    ["one well", { wellWidths: [236] }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s valet", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());
    expect(model.status).toBe("NoError");
    expect(analysis.finite).toBe(true);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(layout.outsideWidth, 4);
    expect(size.y).toBeCloseTo(layout.outsideDepth, 4);
    expect(size.z).toBeCloseTo(layout.outsideHeight, 4);
    const contract = entrywayValet.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);
    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it.each(fixtures)("has no face over 45 degrees on the bed: %s", async (_name, changes) => {
    const model = await generate(withChanges(changes));
    const faces = overhangFaces(model.mesh, entrywayValet.printOrientation);
    expect(faces, describeOverhangs(faces)).toEqual([]);
  });

  it("shows three wells and the slot as holes, and the leaning rest above the walls", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    // Through the lip: the wall ring, the dividers, the lip, and the wedge
    // leave three wells and the slot.
    const low = horizontalSliceTopology(model.mesh, parameters.baseThickness + 3);
    expect(low).toMatchObject({ solidComponents: 1, holes: 4 });
    expect(low.containsSolid([0, layout.lipY])).toBe(true);
    expect(low.containsSolid([0, layout.lipY + 1 + parameters.slotWidth / 2])).toBe(false);
    expect(low.containsSolid([0, layout.wedgeFootY + 5])).toBe(true);
    // Above the lip, the slot opens into the well row's back wall only through
    // the divider: still three wells and the slot cavity.
    const mid = horizontalSliceTopology(model.mesh, 20);
    expect(mid).toMatchObject({ solidComponents: 1, holes: 4 });
    // Above the walls only the wedge remains, and its face has leaned back.
    const lean = Math.tan((parameters.restAngle * Math.PI) / 180);
    const z = parameters.valetHeight + 5;
    const faceY = layout.wedgeFootY + (z - parameters.baseThickness) * lean;
    const top = horizontalSliceTopology(model.mesh, z);
    expect(top).toMatchObject({ contours: 1, holes: 0 });
    expect(top.containsSolid([0, faceY + 1])).toBe(true);
    expect(top.containsSolid([0, faceY - 1])).toBe(false);
    // The wedge follows the rounded corner at the back.
    const corner = parameters.cornerRadius;
    expect(top.containsSolid([parameters.valetWidth / 2 - 0.5, parameters.valetDepth / 2 - 0.5])).toBe(false);
    expect(top.containsSolid([parameters.valetWidth / 2 - corner, parameters.valetDepth / 2 - corner])).toBe(true);
  });

  it("refuses the thin rest case instead of building it", async () => {
    await expect(generate(withChanges({ wellDepth: 108 }))).rejects.toThrow(/thick at its top/);
  });

  it("builds the largest valet inside the kernel time budget", async () => {
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(withChanges({ ...MAXIMUM_CASE, meshQuality: "fine" }));
    expect(model.status).toBe("NoError");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(ENTRYWAY_VALET_DEFAULTS));
    expect(entrywayValet.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-120, -75, 0],
      [120, 75, 70],
    ]);
  });
});

describe("printed walls", () => {
  it("adds the slot lip and the rest wedge top at the defaults", () => {
    const layout = deriveLayout(ENTRYWAY_VALET_DEFAULTS);
    const walls = entrywayValet.printedWalls!(ENTRYWAY_VALET_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("slot-lip")).toBeCloseTo(SLOT_LIP_THICKNESS_MM);
    expect(byKey.get("rest-wedge-top")).toBeCloseTo(layout.wedgeTopDepth);
    for (const key of wallLikeKeys(ENTRYWAY_VALET_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("flags the fixed slot lip as thin at a 1.5 mm nozzle", () => {
    // The slot lip is fixed at 2 mm, under a 1.5 mm nozzle's 3 mm floor,
    // at the defaults already: the rest wedge top stays well above 4 mm
    // by REST_MINIMUM_TOP_MM's own rule, so only the lip is thin here.
    const profile = normalizePrinterProfile({ nozzleDiameter: 1.5 });
    const issues = thinWallIssues(
      entrywayValet.printedWalls!(ENTRYWAY_VALET_DEFAULTS),
      profile,
    );
    expect(
      issues.some((issue) => issue.text.includes("Slot lip thickness")),
    ).toBe(true);
  });

  it("does not throw for a cleared field, and reports only finite values", () => {
    const cleared = { ...ENTRYWAY_VALET_DEFAULTS, restHeight: Number.NaN };
    const walls = entrywayValet.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
    expect(walls.some((wall) => wall.key === "rest-wedge-top")).toBe(false);
  });
});
