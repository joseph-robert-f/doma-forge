import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  DRAWER_RISER_DEFAULTS,
  DRAWER_RISER_SPECS,
  HEADROOM_MM,
  deriveLayout,
  drawerRiser,
  type DrawerRiserParameters,
} from "../lib/products/drawer-riser";
import { LEG_MAXIMUM_SLENDERNESS } from "../lib/kernel/leg-plan";
import {
  normalizePrinterProfile,
  thinWallIssues,
  wallLikeKeys,
} from "../lib/printer-profile";
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

const { normalize, validate, generate } = drawerRiser;

// Recorded at geometryVersion 1 for the defaults; version 2 changes only
// patterned floor openings, so the solid-default mesh remains the same.
const GOLDEN_TRIANGLES = 1184;
const GOLDEN_VOLUME = 280931.83;

function withChanges(
  changes: Partial<DrawerRiserParameters>,
): DrawerRiserParameters {
  return normalize({ ...DRAWER_RISER_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<DrawerRiserParameters> = {
  drawerWidth: 80,
  drawerDepth: 80,
  drawerUsableHeight: 40,
  clearancePerSide: 0,
  clearHeight: 10,
  trayHeight: 10,
  legSection: 8,
  rows: 1,
  columns: 1,
  wallThickness: 1.6,
  baseThickness: 1.6,
  dividerThickness: 1.2,
  cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<DrawerRiserParameters> = {
  drawerWidth: 600,
  drawerDepth: 600,
  drawerUsableHeight: 300,
  clearancePerSide: 3,
  clearHeight: 150,
  trayHeight: 120,
  legSection: 40,
  rows: 6,
  columns: 8,
  wallThickness: 4,
  baseThickness: 6,
  dividerThickness: 4,
  cornerRadius: 20,
};

describe("drawer riser parameters", () => {
  it("ships the drawer presets in order", () => {
    expect(drawerRiser.presets.map((preset) => preset.id)).toEqual([
      "desk-drawer",
      "deep-workshop-drawer",
      "narrow-drawer",
    ]);
  });

  it("stacks the legs, the deck, and the tray into the whole height", () => {
    const layout = deriveLayout(DRAWER_RISER_DEFAULTS);
    expect(layout.outsideWidth).toBe(299);
    expect(layout.outsideDepth).toBe(199);
    expect(layout.deckZ).toBe(45);
    expect(layout.outsideHeight).toBeCloseTo(45 + 2.4 + 35, 10);
    expect(layout.heightBudget).toBe(120 - HEADROOM_MM);
  });

  it("places four legs inside the deck corners, clear of the rounded corner", () => {
    const parameters = DRAWER_RISER_DEFAULTS;
    const layout = deriveLayout(parameters);
    expect(layout.legs.ok).toBe(true);
    if (!layout.legs.ok) return;
    // The inset is the larger of the corner radius and the gusset, so the
    // flare at the top of a post never stands out past the deck edge.
    expect(layout.legGusset).toBe(9);
    expect(layout.legInset).toBe(9);
    expect(layout.legs.centers).toEqual([
      [-134.5, -84.5],
      [134.5, -84.5],
      [134.5, 84.5],
      [-134.5, 84.5],
    ]);
    for (const [x, y] of layout.legs.centers) {
      const half = parameters.legSection / 2 + layout.legGusset;
      expect(Math.abs(x) + half).toBeLessThanOrEqual(layout.outsideWidth / 2);
      expect(Math.abs(y) + half).toBeLessThanOrEqual(layout.outsideDepth / 2);
    }
  });

  it("accepts a leg exactly at the slenderness limit and refuses one over it", () => {
    // 12 mm section carries 144 mm of clear height.
    const atLimit = withChanges({
      legSection: 12,
      clearHeight: 12 * LEG_MAXIMUM_SLENDERNESS,
      trayHeight: 20,
      drawerUsableHeight: 200,
    });
    expect(validate(atLimit).valid).toBe(true);
    const overLimit = {
      ...atLimit,
      clearHeight: 12 * LEG_MAXIMUM_SLENDERNESS + 1,
    };
    const result = validate(overLimit);
    expect(result.valid).toBe(false);
    expect(result.byField.legSection?.[0]).toBe(
      "A 145 mm leg of 12 mm section buckles. Keep the leg height at most 12 times the section. Use a section of at least 12.1 mm, or a clear height of at most 144 mm.",
    );
  });

  it("accepts the smallest leg section and refuses a smaller one", () => {
    expect(validate(withChanges({ legSection: 8 })).valid).toBe(true);
    expect(
      validate(withChanges({ legSection: 7 })).byField.legSection?.[0],
    ).toBe("Leg section must be between 8 and 40 mm.");
  });

  it("refuses legs that leave no gap on the short side", () => {
    // 101 mm inside, 10 mm gusset inset and a 40 mm post on each side: 1 mm.
    const tight = {
      drawerWidth: 200,
      drawerDepth: 102,
      legSection: 40,
      clearHeight: 20,
    };
    const result = validate(withChanges(tight));
    expect(result.byField.legSection?.[0]).toBe(
      "Legs of 40 mm leave 1 mm between the two posts on the short side. Use a smaller leg section, or a larger drawer.",
    );
    expect(validate(withChanges({ ...tight, drawerDepth: 111 })).valid).toBe(
      true,
    );
  });

  it("keeps the riser under the usable height, naming the field and the fix", () => {
    // 45 + 2.4 + 35 = 82.4 mm. A usable height of 87 mm leaves 82 mm.
    expect(validate(withChanges({ drawerUsableHeight: 88 })).valid).toBe(true);
    const result = validate(withChanges({ drawerUsableHeight: 87 }));
    expect(result.valid).toBe(false);
    expect(result.byField.clearHeight?.[0]).toBe(
      "The riser is 82.4 mm tall. It must be at most 82 mm: the drawer usable height 87 mm minus 5 mm. Lower the clear height by 0.4 mm, lower the tray, or measure the drawer again.",
    );
  });

  it("rejects a compartment grid under the minimum size", () => {
    const result = validate(
      withChanges({
        columns: 8,
        rows: 6,
        drawerWidth: 90,
        drawerDepth: 80,
        dividerThickness: 4,
      }),
    );
    expect(result.byField.columns?.[0]).toMatch(
      /^Each compartment must be at least 10 mm wide\./,
    );
    expect(result.byField.rows?.[0]).toMatch(
      /^Each compartment must be at least 10 mm deep\./,
    );
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "drawerWidth",
      "drawerDepth",
      "drawerUsableHeight",
      "clearancePerSide",
      "clearHeight",
      "trayHeight",
      "legSection",
      "rows",
      "columns",
    ] as const) {
      const cleared = { ...DRAWER_RISER_DEFAULTS, [key]: Number.NaN };
      expect(() => drawerRiser.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    expect(
      drawerRiser.derive({
        ...DRAWER_RISER_DEFAULTS,
        legSection: Number.NaN,
      })[2].value,
    ).toBe("do not fit");
    expect(
      drawerRiser
        .derive({ ...DRAWER_RISER_DEFAULTS, drawerWidth: Number.NaN })
        .find((value) => value.id === "longest-bridge")?.value,
    ).toBe("—");
  });

  it("creates a deterministic filename with the whole height and the grid", () => {
    expect(drawerRiser.filename(DRAWER_RISER_DEFAULTS)).toMatch(
      /^drawerforge-drawer-riser-299x199x82p4-2x2-[0-9a-f]{6}\.stl$/,
    );
    expect(drawerRiser.filename(withChanges({ legSection: 14 }))).not.toBe(
      drawerRiser.filename(DRAWER_RISER_DEFAULTS),
    );
  });

  it("derives the outside size, the compartments, the legs, and the height used", () => {
    expect(
      drawerRiser.derive(DRAWER_RISER_DEFAULTS).map((value) => value.value),
    ).toEqual([
      "299 × 199 × 82.4 mm",
      "≈ 146.5 × 96.5 mm",
      "4 posts, 12 mm section, 45 mm clear",
      "96.5 mm, the compartment ceiling",
      "82.4 mm of 115 mm",
    ]);
    expect(drawerRiser.summary(DRAWER_RISER_DEFAULTS)).toBe(
      "299 × 199 × 82.4 mm · 2 × 2 · 45 mm clear",
    );
  });

  it("carries the print pose, and says what the pose bridges", () => {
    expect(drawerRiser.printOrientation?.rotationDegrees).toEqual({
      x: 180,
      y: 0,
      z: 0,
    });
    const note = drawerRiser.printOrientation?.note ?? "";
    expect(note).toMatch(/rim goes on the bed/);
    expect(note).toMatch(/legs point up/);
    // The pose does not make the part support-free: the deck over each
    // compartment is a bridge, and the note must say so. See D-1408.
    expect(note).toMatch(/bridge/);
    expect(note).not.toMatch(/no supports/i);
  });

  it("reports the longest bridge as the shorter compartment side", () => {
    expect(deriveLayout(DRAWER_RISER_DEFAULTS).longestBridge).toBe(96.5);
    // More rows shorten the compartment, and with it the bridge.
    expect(deriveLayout(withChanges({ rows: 4 })).longestBridge).toBeCloseTo(
      47.25,
      10,
    );
    expect(
      drawerRiser
        .derive(withChanges({ rows: 4 }))
        .find((value) => value.id === "longest-bridge")?.value,
    ).toBe("47.3 mm, the compartment ceiling");
  });

  it("compensates the drawer width and the drawer depth", () => {
    expect(drawerRiser.compensable).toEqual({
      x: ["drawerWidth"],
      y: ["drawerDepth"],
    });
  });
});

describe("drawer riser geometry", () => {
  const fixtures: Array<[string, Partial<DrawerRiserParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["single compartment", { rows: 1, columns: 1 }],
    [
      "tall legs",
      {
        clearHeight: 100,
        trayHeight: 30,
        legSection: 14,
        drawerUsableHeight: 150,
      },
    ],
    ["square corners", { cornerRadius: 0 }],
  ];

  it.each(fixtures)(
    "creates a finite, outward, closed %s riser",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      expect(validate(parameters).valid).toBe(true);
      const layout = deriveLayout(parameters);
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
      expect(size.x).toBeCloseTo(layout.outsideWidth, 4);
      expect(size.y).toBeCloseTo(layout.outsideDepth, 4);
      expect(size.z).toBeCloseTo(layout.outsideHeight, 4);
      expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
      const contract = drawerRiser.boundsContract(parameters);
      expect(model.bounds[0]).toEqual(contract.min);
      expect(model.bounds[1]).toEqual(contract.max);

      for (const edge of closedEdgeCounts(geometry)) {
        expect(edge.count).toBe(2);
        expect(edge.balance).toBe(0);
      }
      geometry.dispose();
    },
  );

  it("refuses the conflict case instead of building it", async () => {
    await expect(
      generate(withChanges({ drawerUsableHeight: 87 })),
    ).rejects.toThrow(/The riser is 82.4 mm tall/);
  });

  it("shows four posts in a slice through the clear height and none above the deck", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const legs = horizontalSliceTopology(model.mesh, layout.deckZ / 2);
    expect(legs).toMatchObject({ contours: 4, solidComponents: 4, holes: 0 });
    for (const [x, y] of layout.legs.ok ? layout.legs.centers : []) {
      expect(legs.containsSolid([x, y])).toBe(true);
    }
    expect(legs.containsSolid([0, 0])).toBe(false);
    // Just above the deck the part is one closed tray with its compartments.
    const tray = horizontalSliceTopology(
      model.mesh,
      layout.deckZ + parameters.baseThickness + parameters.trayHeight / 2,
    );
    expect(tray).toMatchObject({
      contours: 1 + parameters.rows * parameters.columns,
      solidComponents: 1,
      holes: parameters.rows * parameters.columns,
    });
  });

  it("keeps the deck solid between the legs and the compartments", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const deck = horizontalSliceTopology(
      model.mesh,
      layout.deckZ + parameters.baseThickness / 2,
    );
    expect(deck).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
  });

  it("widens each leg into the deck with a gusset", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const low = horizontalSliceTopology(model.mesh, layout.deckZ / 2);
    const high = horizontalSliceTopology(model.mesh, layout.deckZ - 1);
    const corner = layout.legs.ok ? layout.legs.centers[0] : [0, 0];
    const outward: [number, number] = [
      corner[0] - parameters.legSection / 2 - 1,
      corner[1] - parameters.legSection / 2 - 1,
    ];
    expect(low.containsSolid(outward)).toBe(false);
    expect(high.containsSolid(outward)).toBe(true);
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

  it("builds the largest riser inside the kernel time budget", async () => {
    const parameters = withChanges({ ...MAXIMUM_CASE, meshQuality: "fine" });
    await generate(withChanges({}));
    const started = performance.now();
    const model = await generate(parameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // The measured value in this environment is in
    // 22_FAMILY_A_EXTENSIONS_NOTES.md. Two seconds leaves room for a slower
    // runner while a regression to the threshold's size fails.
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
    const model = await generate(normalize(DRAWER_RISER_DEFAULTS));
    expect(drawerRiser.geometryVersion).toBe(2);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(
      0.001,
    );
    expect(model.bounds).toEqual([
      [-149.5, -99.5, 0],
      [149.5, 99.5, 82.4],
    ]);
  });
});

describe("printed walls", () => {
  it("adds the leg section to the key-name walls", () => {
    const walls = drawerRiser.printedWalls!(DRAWER_RISER_DEFAULTS);
    const byKey = new Map(walls.map((wall) => [wall.key, wall.value]));
    expect(byKey.get("leg-section")).toBeCloseTo(
      DRAWER_RISER_DEFAULTS.legSection,
    );
    for (const key of wallLikeKeys(DRAWER_RISER_SPECS)) {
      expect(byKey.has(key), `${key} missing`).toBe(true);
    }
  });

  it("flags a thin leg section", () => {
    // The leg section's own spec range never goes under 8 mm (leg-plan's
    // minimum section), so a 1.5 mm nozzle's 3 mm floor never catches it.
    // A wider nozzle demonstrates the same rule against the schema's own
    // floor, with the leg section at that floor.
    const parameters = { ...DRAWER_RISER_DEFAULTS, legSection: 8 };
    expect(drawerRiser.validate(parameters).valid).toBe(true);
    const profile = normalizePrinterProfile({ nozzleDiameter: 4.5 });
    const issues = thinWallIssues(
      drawerRiser.printedWalls!(parameters),
      profile,
    );
    expect(issues.some((issue) => issue.text.includes("Leg section"))).toBe(
      true,
    );
  });

  it("does not throw for a cleared leg section, and reports only finite values", () => {
    const cleared = { ...DRAWER_RISER_DEFAULTS, legSection: Number.NaN };
    const walls = drawerRiser.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isFinite(wall.value))).toBe(true);
    expect(walls.some((wall) => wall.key === "leg-section")).toBe(false);
  });
});
