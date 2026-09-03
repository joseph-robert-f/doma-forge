import { describe, expect, it } from "vitest";
import {
  HOOK_MAXIMUM_PROJECTION_MM,
  HOOK_MINIMUM_ROOT_MM,
  ONE_PIECE_HEIGHT_MM,
  SCREW_MINIMUM_EDGE_MM,
  beamLoadNewtons,
  cantileverLoadNewtons,
  checkHookRule,
  jHookProfilePoints,
  loadNote,
  planLegSplit,
  planRibs,
  planScrewRow,
} from "../lib/kernel/bracket-rules";
import {
  extrudeAlongX,
  hullGusset,
  jHook,
  screwCutter,
  screwCutters,
} from "../lib/kernel/brackets";
import { getKernel } from "../lib/kernel/manifold";
import { polygon } from "../lib/kernel/profiles";
import { BOOLEAN_OVERLAP } from "../lib/kernel/shell";
import { finishSolid } from "../lib/kernel/mesh";
import { overhangFaces } from "./helpers/print-pose";

const SEGMENTS = 24;

describe("hook rule", () => {
  it("accepts the smallest root and refuses one step under it", () => {
    expect(
      checkHookRule({ root: HOOK_MINIMUM_ROOT_MM, projection: 20 }).ok,
    ).toBe(true);
    const refused = checkHookRule({
      root: HOOK_MINIMUM_ROOT_MM - 0.1,
      projection: 20,
    });
    expect(refused).toMatchObject({
      ok: false,
      reason: "root",
      minimumRoot: 8,
    });
  });

  it("accepts a projection at 2.5 times the root and refuses one step over it", () => {
    expect(checkHookRule({ root: 10, projection: 25 }).ok).toBe(true);
    const refused = checkHookRule({ root: 10, projection: 25.1 });
    expect(refused).toMatchObject({
      ok: false,
      reason: "projection",
      maximumProjection: 25,
      minimumRoot: 25.1 / 2.5,
    });
  });

  it("caps the projection at 60 mm whatever the root", () => {
    expect(
      checkHookRule({ root: 30, projection: HOOK_MAXIMUM_PROJECTION_MM }).ok,
    ).toBe(true);
    expect(
      checkHookRule({ root: 30, projection: HOOK_MAXIMUM_PROJECTION_MM + 0.1 }),
    ).toMatchObject({
      ok: false,
      reason: "projection",
      maximumProjection: 60,
    });
  });

  it("reports a cleared value without throwing", () => {
    expect(checkHookRule({ root: Number.NaN, projection: 20 })).toMatchObject({
      ok: false,
      reason: "value",
    });
  });
});

describe("J-hook profile", () => {
  const options = {
    root: 8,
    projection: 20,
    lipHeight: 6,
    lipThickness: 3,
    fillet: 3,
    overlap: BOOLEAN_OVERLAP,
    segments: 6,
  };

  it("spans the plate overlap to the projection, and the bottom fillet to the lip top", () => {
    const points = jHookProfilePoints(options);
    const ys = points.map(([y]) => y);
    const zs = points.map(([, z]) => z);
    expect(Math.min(...ys)).toBeCloseTo(-BOOLEAN_OVERLAP, 9);
    expect(Math.max(...ys)).toBeCloseTo(20, 9);
    expect(Math.min(...zs)).toBeCloseTo(-3, 9);
    expect(Math.max(...zs)).toBeCloseTo(8 + 6, 9);
  });

  it("puts the ramp at 45 degrees from the arm top to the lip top", () => {
    const points = jHookProfilePoints(options);
    const lipTopInner = points.findIndex(([y, z]) => y === 20 - 3 && z === 14);
    const rampFoot = points[lipTopInner + 1];
    expect(rampFoot).toEqual([20 - 3 - 6, 8]);
  });

  it("refuses a projection that leaves no room for the fillet, the ramp, and the lip", () => {
    expect(() => jHookProfilePoints({ ...options, projection: 11.9 })).toThrow(
      /room/,
    );
    expect(() =>
      jHookProfilePoints({ ...options, projection: 12 }),
    ).not.toThrow();
  });

  it("extrudes the profile along X, centered, with the profile in the Y-Z plane", async () => {
    const kernel = await getKernel();
    const hook = jHook(kernel, { ...options, width: 12, segments: SEGMENTS });
    const box = hook.boundingBox();
    expect(box.min[0]).toBeCloseTo(-6, 6);
    expect(box.max[0]).toBeCloseTo(6, 6);
    expect(box.min[1]).toBeCloseTo(-BOOLEAN_OVERLAP, 6);
    expect(box.max[1]).toBeCloseTo(20, 6);
    expect(box.min[2]).toBeCloseTo(-3, 6);
    expect(box.max[2]).toBeCloseTo(14, 6);
    expect(hook.status()).toBe("NoError");
    hook.delete();
  });

  it("keeps the handedness of an asymmetric profile through the turn", async () => {
    const kernel = await getKernel();
    // A right triangle: the long leg along local X (which becomes Y), the
    // short leg along local Y (which becomes Z).
    const profile = polygon(kernel, [
      [0, 0],
      [10, 0],
      [0, 4],
    ]);
    const solid = extrudeAlongX(kernel, profile, 6);
    profile.delete();
    const box = solid.boundingBox();
    expect(box.min).toEqual([-3, 0, 0]);
    expect(box.max[0]).toBeCloseTo(3, 6);
    expect(box.max[1]).toBeCloseTo(10, 6);
    expect(box.max[2]).toBeCloseTo(4, 6);
    expect(solid.volume()).toBeCloseTo(0.5 * 10 * 4 * 6, 4);
    solid.delete();
  });

  it("has no face over 45 degrees once turned onto its plate face", async () => {
    const kernel = await getKernel();
    const hook = jHook(kernel, { ...options, width: 12, segments: SEGMENTS });
    const model = finishSolid(hook, {}, "hook");
    const faces = overhangFaces(model.mesh, {
      rotationDegrees: { x: 90, y: 0, z: 0 },
      note: "",
    });
    expect(faces).toEqual([]);
  });
});

describe("screw cutters", () => {
  it("runs through the plate along Y with the countersink on the front face", async () => {
    const kernel = await getKernel();
    const cutter = screwCutter(kernel, {
      diameter: 4,
      headDiameter: 8,
      plateThickness: 5,
      segments: SEGMENTS,
    });
    const box = cutter.boundingBox();
    expect(box.min[1]).toBeCloseTo(-BOOLEAN_OVERLAP, 5);
    expect(box.max[1]).toBeCloseTo(5 + BOOLEAN_OVERLAP, 5);
    // The cone overshoots the face by the overlap, so it is wider than the head there.
    expect(box.max[0]).toBeCloseTo(4 + BOOLEAN_OVERLAP, 5);
    expect(box.max[2]).toBeCloseTo(4 + BOOLEAN_OVERLAP, 5);
    const plain = Math.PI * 2 * 2 * (5 + BOOLEAN_OVERLAP);
    expect(cutter.volume()).toBeGreaterThan(plain);
    cutter.delete();
  });

  it("places one cutter per (X, Z) position", async () => {
    const kernel = await getKernel();
    const cutters = screwCutters(
      kernel,
      [
        [-30, 10],
        [30, 10],
      ],
      {
        diameter: 4,
        headDiameter: 8,
        plateThickness: 5,
        segments: SEGMENTS,
      },
    );
    const box = cutters.boundingBox();
    expect(box.min[0]).toBeCloseTo(-34.2, 5);
    expect(box.max[0]).toBeCloseTo(34.2, 5);
    expect(box.min[2]).toBeCloseTo(10 - 4.2, 5);
    cutters.delete();
  });

  it("centers a screw row and refuses one whose end screw is too close to the plate end", () => {
    // 100 mm plate, 8.5 mm head: the widest spacing that keeps 8 mm is 75.5 mm.
    const plan = planScrewRow({
      plateWidth: 100,
      count: 2,
      spacing: 75.5,
      headDiameter: 8.5,
    });
    expect(plan).toMatchObject({ ok: true, positions: [-37.75, 37.75] });
    expect(plan.ok && plan.margin).toBeCloseTo(SCREW_MINIMUM_EDGE_MM, 9);
    const refused = planScrewRow({
      plateWidth: 100,
      count: 2,
      spacing: 75.6,
      headDiameter: 8.5,
    });
    expect(refused).toMatchObject({
      ok: false,
      reason: "margin",
      maximumSpacing: 75.5,
    });
    expect(
      planScrewRow({
        plateWidth: 100,
        count: 1,
        spacing: 0,
        headDiameter: 8.5,
      }),
    ).toMatchObject({
      ok: true,
      positions: [0],
    });
  });
});

describe("hull gusset", () => {
  it("is a wedge between the plate face and the shelf underside", async () => {
    const kernel = await getKernel();
    const gusset = hullGusset(kernel, {
      thickness: 4,
      rise: 30,
      run: 40,
      overlap: 0,
    });
    const box = gusset.boundingBox();
    expect(box.min[0]).toBeCloseTo(-2, 6);
    expect(box.max[0]).toBeCloseTo(2, 6);
    expect(box.min[1]).toBeCloseTo(0, 6);
    expect(box.max[1]).toBeCloseTo(40, 6);
    expect(box.min[2]).toBeCloseTo(-30, 6);
    expect(box.max[2]).toBeCloseTo(0, 6);
    // Half the box, within the thin strips the hull spans.
    expect(Math.abs(gusset.volume() - 0.5 * 4 * 30 * 40) / 2400).toBeLessThan(
      0.001,
    );
    const withOverlap = hullGusset(kernel, {
      thickness: 4,
      rise: 30,
      run: 40,
      overlap: 0.2,
    });
    const overlapBox = withOverlap.boundingBox();
    expect(overlapBox.min[1]).toBeCloseTo(-0.2, 6);
    expect(overlapBox.max[2]).toBeCloseTo(0.2, 6);
    withOverlap.delete();
    gusset.delete();
  });
});

describe("ribs and leg split", () => {
  it("adds a rib only when a span passes 150 mm", () => {
    expect(planRibs(150)).toEqual([]);
    expect(planRibs(150.5)).toEqual([0]);
    expect(planRibs(300)).toEqual([0]);
    expect(planRibs(301)).toEqual([
      -301 / 2 + 301 / 3,
      -301 / 2 + (2 * 301) / 3,
    ]);
    expect(planRibs(Number.NaN)).toEqual([]);
  });

  it("splits a leg only above the one-piece height, with the extension as short as possible", () => {
    expect(
      planLegSplit({ deckThickness: 4, clearHeight: 236, section: 12 }),
    ).toEqual({
      split: false,
      totalHeight: ONE_PIECE_HEIGHT_MM,
    });
    const split = planLegSplit({
      deckThickness: 4,
      clearHeight: 237,
      section: 12,
    });
    expect(split).toMatchObject({
      split: true,
      totalHeight: 241,
      upperLength: 236,
      extensionLength: 1,
      pegSide: 6,
      pegLength: 10,
      socketSide: 6.2,
    });
    expect(
      planLegSplit({ deckThickness: 4, clearHeight: 237, section: 11 }),
    ).toMatchObject({
      split: false,
      reason: "section",
    });
  });
});

describe("load model", () => {
  it("rates a hook as a cantilever and a deck as a beam", () => {
    // 12 mm wide, 8 mm root, 20 mm arm: 5 * 12 * 64 / (6 * 20) = 32 N.
    expect(cantileverLoadNewtons(12, 8, 20)).toBeCloseTo(32, 9);
    expect(beamLoadNewtons(300, 4, 400)).toBeCloseTo(
      (8 * 5 * 300 * 16) / (6 * 400),
      9,
    );
  });

  it("names the material and the perimeters, and never shows a number over 5 kg", () => {
    expect(loadNote(32)).toBe(
      "about 3.3 kg at 3 perimeters in PLA, approximate",
    );
    expect(loadNote(4)).toBe(
      "about 0.40 kg at 3 perimeters in PLA, approximate",
    );
    expect(loadNote(111)).toBe(
      "5 kg or more at 3 perimeters in PLA, approximate. This app rates nothing above 5 kg.",
    );
    expect(loadNote(Number.NaN)).toBe("—");
  });
});

describe("planLegSplit with a one-piece height", () => {
  it("keeps the constant as its default", () => {
    const plan = planLegSplit({ deckThickness: 4, clearHeight: 296, section: 28 });
    expect(plan).toMatchObject({ split: true, upperLength: ONE_PIECE_HEIGHT_MM - 4 });
  });

  it("does not split a riser at or under the one-piece height", () => {
    expect(
      planLegSplit({ deckThickness: 4, clearHeight: 296, section: 28, onePieceHeight: 300 }),
    ).toEqual({ split: false, totalHeight: 300 });
  });

  it("splits at a lower one-piece height with the deck body at that height", () => {
    const split = planLegSplit({ deckThickness: 4, clearHeight: 296, section: 28, onePieceHeight: 200 });
    expect(split).toMatchObject({ split: true, upperLength: 196, extensionLength: 100 });
  });

  it("gives no split for a one-piece height that is not a number", () => {
    expect(
      planLegSplit({ deckThickness: 4, clearHeight: 296, section: 28, onePieceHeight: Number.NaN }),
    ).toEqual({ split: false, totalHeight: 300 });
  });
});
