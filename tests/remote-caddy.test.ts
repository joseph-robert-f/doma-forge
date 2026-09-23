import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import { PRINTER_PROFILE_DEFAULTS, thinWallIssues } from "../lib/printer-profile";
import {
  MINIMUM_WELL_MM,
  REMOTE_CADDY_DEFAULTS,
  deriveLayout,
  remoteCaddy,
  type RemoteCaddyParameters,
} from "../lib/products/remote-caddy";
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

const { normalize, validate, generate } = remoteCaddy;

// Recorded at geometryVersion 1 for the defaults; version 2 changes only
// patterned floor openings, so the solid-default mesh remains the same.
const GOLDEN_TRIANGLES = 288;
const GOLDEN_VOLUME = 498253.12;

function withChanges(changes: Partial<RemoteCaddyParameters>): RemoteCaddyParameters {
  return normalize({ ...REMOTE_CADDY_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<RemoteCaddyParameters> = {
  caddyWidth: 80, caddyDepth: 60, caddyHeight: 20, wellWidths: [38.2, 38.2],
  wellDepth: 10, frontWallHeight: 14, wallThickness: 1.2, baseThickness: 1.2,
  dividerThickness: 1.2, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<RemoteCaddyParameters> = {
  caddyWidth: 400, caddyDepth: 300, caddyHeight: 120,
  wellWidths: [75, 75, 75, 75, 76], wellDepth: 110, frontWallHeight: 60,
  wallThickness: 4, baseThickness: 6, dividerThickness: 4, cornerRadius: 20,
};

describe("remote caddy parameters", () => {
  it("ships the shelf presets in order", () => {
    expect(remoteCaddy.presets.map((preset) => preset.id)).toEqual([
      "three-remotes",
      "two-controllers",
      "five-wells",
    ]);
  });

  it("solves the last well so the wells and the dividers fill the inside", () => {
    const layout = deriveLayout(withChanges({ caddyWidth: 220, wellWidths: [50, 60, 40] }));
    // 220 - 2 * 2 = 216 inside; two dividers of 2 mm leave 212 for the wells.
    expect(layout.innerWidth).toBe(216);
    expect(layout.wellWidths).toEqual([50, 60, 102]);
    expect(layout.solvedWidth).toBe(102);
    const total =
      layout.wellWidths.reduce((sum, width) => sum + width, 0) +
      (layout.wellCount - 1) * 2;
    expect(total).toBeCloseTo(layout.innerWidth, 10);
  });

  it("places one divider between every pair of wells", () => {
    const layout = deriveLayout(withChanges({ wellWidths: [70, 70, 72] }));
    expect(layout.dividerPositions).toEqual([-37, 35]);
    expect(deriveLayout(withChanges({ wellWidths: [107, 107] })).dividerPositions).toEqual([0]);
  });

  it("writes the solved width into the last well, so the field and the mesh agree", () => {
    // 216 inside, two dividers of 2 mm: the last well takes 212 - 50 - 60.
    expect(normalize({ ...REMOTE_CADDY_DEFAULTS, wellWidths: [50, 60, 40] }).wellWidths).toEqual([
      50, 60, 102,
    ]);
    // A cleared well cannot be solved, so the list is left as the user left it.
    const cleared = normalize({
      ...REMOTE_CADDY_DEFAULTS,
      wellWidths: [Number.NaN, 60, 40],
    }).wellWidths;
    expect(Number.isNaN(cleared[0])).toBe(true);
    expect(cleared[2]).toBe(40);
    // Normalizing twice changes nothing, and the presets already agree.
    expect(normalize(normalize(REMOTE_CADDY_DEFAULTS))).toEqual(normalize(REMOTE_CADDY_DEFAULTS));
    for (const preset of remoteCaddy.presets) {
      expect(normalize(preset.parameters)).toEqual(preset.parameters);
    }
  });

  it("rejects a layout that does not fit and names the well to shrink", () => {
    const result = validate(withChanges({ caddyWidth: 220, wellWidths: [100, 95, 40] }));
    expect(result.valid).toBe(false);
    // The message that names the fix comes first, so the form shows it. The
    // solved width is in the list now, so the spec range reports it as well.
    expect(result.byField.wellWidths).toEqual([
      `Well 3 is solved to 17 mm, and every well must be at least ${MINIMUM_WELL_MM} mm wide. Shrink well 1 by 8 mm, remove a well, or make the caddy 8 mm wider.`,
      "Well 3 must be between 25 and 300 mm.",
    ]);
    // The named fix works: eight millimeters off well 1 makes the layout fit.
    expect(validate(withChanges({ caddyWidth: 220, wellWidths: [92, 95, 40] })).valid).toBe(true);
  });

  it("offers only the fixes that lead to a legal layout", () => {
    // Well 1 cannot give up 5 mm and stay at 25 mm, so no shrink is offered.
    const narrow = validate(
      withChanges({ caddyWidth: 80, wallThickness: 2, dividerThickness: 2, wellWidths: [26, 26, 26] }),
    );
    expect(narrow.byField.wellWidths?.[0]).toBe(
      "Well 3 is solved to 20 mm, and every well must be at least 25 mm wide. Remove a well, or make the caddy 5 mm wider.",
    );
    // Two wells are the fewest, so no removal is offered.
    const twoWells = validate(
      withChanges({ caddyWidth: 80, wallThickness: 2, dividerThickness: 2, wellWidths: [60, 14] }),
    );
    expect(twoWells.byField.wellWidths?.[0]).toBe(
      "Well 2 is solved to 14 mm, and every well must be at least 25 mm wide. Shrink well 1 by 11 mm, or make the caddy 11 mm wider.",
    );
  });

  it("names the widest well that holds a number, not a cleared well 1", () => {
    const layout = deriveLayout({
      ...REMOTE_CADDY_DEFAULTS,
      wellWidths: [Number.NaN, 70, 72],
    });
    expect(layout.widestFixedWell).toBe(2);
  });

  it("accepts a solved well exactly at the minimum width", () => {
    // 216 inside, two dividers of 2 mm: 100 + 87 + 25 = 212.
    expect(validate(withChanges({ wellWidths: [100, 87, 30] })).valid).toBe(true);
    expect(withChanges({ wellWidths: [100, 87, 30] }).wellWidths).toEqual([100, 87, 25]);
    expect(deriveLayout(withChanges({ wellWidths: [100, 87, 30] })).solvedWidth).toBe(25);
    expect(validate(withChanges({ wellWidths: [100, 87.5, 30] })).valid).toBe(false);
  });

  it("rejects a well the user typed under the minimum width", () => {
    const result = validate(withChanges({ wellWidths: [20, 70, 72] }));
    expect(result.byField.wellWidths?.[0]).toBe("Well 1 must be between 25 and 300 mm.");
  });

  it("rejects fewer than two wells and more than five", () => {
    expect(validate({ ...REMOTE_CADDY_DEFAULTS, wellWidths: [200] }).byField.wellWidths).toEqual([
      "Wells must hold between 2 and 5 wells.",
    ]);
    expect(
      validate({ ...REMOTE_CADDY_DEFAULTS, wellWidths: [30, 30, 30, 30, 30, 30] })
        .byField.wellWidths?.[0],
    ).toBe("Wells must hold between 2 and 5 wells.");
  });

  it("rejects a well deeper than the height minus the base, naming the field", () => {
    const result = validate(withChanges({ wellDepth: 58 }));
    expect(result.byField.wellDepth?.[0]).toBe(
      "Well depth must be at most 57.6 mm, so that 2.4 mm of base stays under the wells.",
    );
  });

  it("rejects a front wall below the well floor or above the caddy", () => {
    const low = validate(withChanges({ frontWallHeight: 17 }));
    expect(low.byField.frontWallHeight?.[0]).toBe(
      "Front wall height must be at least 18 mm, so the wall stands 3 mm above the well floor at 15 mm.",
    );
    expect(validate(withChanges({ frontWallHeight: 18 })).valid).toBe(true);
    const high = validate(withChanges({ frontWallHeight: 61 }));
    expect(high.byField.frontWallHeight?.[0]).toBe(
      "Front wall height must be at most the caddy height, 60 mm.",
    );
  });

  it("accepts every corner radius the spec allows, at the smallest caddy", () => {
    // The corner radius maximum is 20 mm and the smallest side is 60 mm, so
    // the radius can never pass half the shorter side. No extra rule is needed.
    expect(validate(withChanges({ caddyDepth: 60, cornerRadius: 20 })).valid).toBe(true);
    expect(validate(withChanges({ caddyDepth: 60, cornerRadius: 21 })).byField.cornerRadius?.[0]).toBe(
      "Corner radius must be between 0 and 20 mm.",
    );
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "caddyWidth",
      "caddyDepth",
      "caddyHeight",
      "wellDepth",
      "frontWallHeight",
      "wallThickness",
      "dividerThickness",
    ] as const) {
      const cleared = { ...REMOTE_CADDY_DEFAULTS, [key]: Number.NaN };
      expect(() => remoteCaddy.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
    const clearedWell = { ...REMOTE_CADDY_DEFAULTS, wellWidths: [70, Number.NaN, 72] };
    expect(() => remoteCaddy.derive(clearedWell)).not.toThrow();
    expect(validate(clearedWell).byField.wellWidths).toEqual(["Well 2 must be a number."]);
    expect(remoteCaddy.derive({ ...REMOTE_CADDY_DEFAULTS, caddyWidth: Number.NaN })[1].value).toBe(
      "does not fit",
    );
  });

  it("creates a deterministic filename with the size and the well count", () => {
    expect(remoteCaddy.filename(withChanges({ caddyWidth: 220.5, wellWidths: [70, 70, 72] }))).toMatch(
      /^drawerforge-remote-caddy-220p5x130x60-3w-[0-9a-f]{6}\.stl$/,
    );
    expect(remoteCaddy.filename(withChanges({ wellWidths: [65, 75, 72] }))).not.toBe(
      remoteCaddy.filename(REMOTE_CADDY_DEFAULTS),
    );
  });

  it("derives the outside size, the solved wells, the base, and the front wall", () => {
    expect(remoteCaddy.derive(REMOTE_CADDY_DEFAULTS).map((value) => value.value)).toEqual([
      "220 × 130 × 60 mm",
      "70 × 70 × 72 mm",
      "15 mm",
      "25 mm, 10 mm above the floor",
    ]);
    expect(remoteCaddy.summary(REMOTE_CADDY_DEFAULTS)).toBe("220 × 130 × 60 mm · 3 wells");
  });
});

describe("remote caddy printed walls", () => {
  const printer = { ...PRINTER_PROFILE_DEFAULTS, nozzleDiameter: 0.8 };

  it("reports the outer walls, actual base under wells, and dividers", () => {
    expect(remoteCaddy.printedWalls!(REMOTE_CADDY_DEFAULTS)).toEqual([
      { key: "wallThickness", label: "Outer wall thickness", value: 2 },
      { key: "baseThickness", label: "Base under wells", value: 15 },
      { key: "dividerThickness", label: "Divider thickness", value: 2 },
    ]);
  });

  it("keeps printed thicknesses independent of the front wall height", () => {
    const lowered = withChanges({ frontWallHeight: 18 });
    const fullHeight = withChanges({ frontWallHeight: 60 });
    expect(validate(lowered).valid).toBe(true);
    expect(validate(fullHeight).valid).toBe(true);
    expect(remoteCaddy.printedWalls!(lowered)).toEqual(
      remoteCaddy.printedWalls!(fullHeight),
    );
    expect(remoteCaddy.printedWalls!(lowered).map((wall) => wall.key)).not.toContain(
      "frontWallHeight",
    );
  });

  it("does not reject a thin minimum base setting when the actual floor is thick", () => {
    const parameters = withChanges({ baseThickness: 1.2 });
    expect(validate(parameters).valid).toBe(true);
    expect(thinWallIssues(remoteCaddy.printedWalls!(parameters), printer)).toEqual([]);
  });

  it.each([
    { wellDepth: 58.8, ids: ["wall-baseThickness"] },
    { wellDepth: 58.4, ids: [] },
  ])(
    "checks the actual floor against two nozzle widths at well depth $wellDepth",
    ({ wellDepth, ids }) => {
      const parameters = withChanges({ baseThickness: 1.2, wellDepth });
      expect(validate(parameters).valid).toBe(true);
      const issues = thinWallIssues(remoteCaddy.printedWalls!(parameters), printer);
      expect(issues.map((issue) => issue.id)).toEqual(ids);
      if (issues.length) {
        expect(issues[0].text).toBe(
          "Base under wells is 1.2 mm. A 0.8 mm nozzle needs at least 1.6 mm. A thin wall is weak.",
        );
      }
    },
  );

  it.each(["wallThickness", "dividerThickness"] as const)(
    "still rejects a thin %s",
    (key) => {
      const parameters = withChanges({ [key]: 1.2 });
      expect(validate(parameters).valid).toBe(true);
      expect(
        thinWallIssues(remoteCaddy.printedWalls!(parameters), printer).map((issue) => issue.id),
      ).toEqual([`wall-${key}`]);
    },
  );

  it.each([{ wellWidths: [] }, { wellWidths: [216] }])(
    "omits dividers from an incomplete layout with wells $wellWidths",
    ({ wellWidths }) => {
      // Normalization pads short lists; inspect the incomplete field as-is.
      const parameters = { ...REMOTE_CADDY_DEFAULTS, wellWidths };
      expect(validate(parameters).valid).toBe(false);
      expect(remoteCaddy.printedWalls!(parameters).map((wall) => wall.key)).toEqual([
        "wallThickness",
        "baseThickness",
      ]);
    },
  );

  it("tolerates cleared dimensions and wells without inventing thin-wall errors", () => {
    const cleared = withChanges({
      caddyHeight: Number.NaN,
      wallThickness: Number.NaN,
      dividerThickness: Number.NaN,
      wellWidths: [Number.NaN, Number.NaN],
    });
    const walls = remoteCaddy.printedWalls!(cleared);
    expect(walls.every((wall) => Number.isNaN(wall.value))).toBe(true);
    expect(thinWallIssues(walls, printer)).toEqual([]);
    expect(validate(cleared).valid).toBe(false);
  });
});

describe("remote caddy geometry", () => {
  const fixtures: Array<[string, Partial<RemoteCaddyParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["two wells", { wellWidths: [107, 107] }],
    ["five wells", { caddyWidth: 320, wellWidths: [60, 60, 60, 60, 68] }],
    ["full height front wall", { frontWallHeight: 60 }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s caddy", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const size = analysis.bounds.getSize(new THREE.Vector3());

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.triangleCount).toBeGreaterThan(0);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(parameters.caddyWidth, 4);
    expect(size.y).toBeCloseTo(parameters.caddyDepth, 4);
    expect(size.z).toBeCloseTo(parameters.caddyHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    const contract = remoteCaddy.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    await expect(generate(withChanges({ wellWidths: [100, 95, 40] }))).rejects.toThrow(
      /Well 3 is solved to 17 mm/,
    );
  });

  it.each([
    ["default", {}, 3],
    ["two wells", { wellWidths: [107, 107] }, 2],
    ["five wells", { caddyWidth: 320, wellWidths: [60, 60, 60, 60, 68] }, 5],
  ] as Array<[string, Partial<RemoteCaddyParameters>, number]>)(
    "shows one contour per well in a slice through the %s wells",
    async (_name, changes, wells) => {
      const parameters = withChanges(changes);
      const layout = deriveLayout(parameters);
      const model = await generate(parameters);
      // Between the well floor and the top of the front wall, so the wells
      // are closed on every side.
      const z = (layout.floorZ + parameters.frontWallHeight) / 2;
      const topology = horizontalSliceTopology(model.mesh, z);
      expect({
        contours: topology.contours,
        solidComponents: topology.solidComponents,
        holes: topology.holes,
      }).toEqual({ contours: 1 + wells, solidComponents: 1, holes: wells });
    },
  );

  it("lowers the front wall without lowering the sides or the back", async () => {
    const parameters = withChanges({});
    const model = await generate(parameters);
    // Above the front wall the slice is an open U: one contour and no hole.
    const above = horizontalSliceTopology(
      model.mesh,
      (parameters.frontWallHeight + parameters.caddyHeight) / 2,
    );
    expect(above).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
    expect(above.containsSolid([0, -parameters.caddyDepth / 2 + 1])).toBe(false);
    expect(above.containsSolid([0, parameters.caddyDepth / 2 - 1])).toBe(true);
  });

  it("keeps the wells solid under the floor", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const base = horizontalSliceTopology(model.mesh, layout.floorZ / 2);
    expect(base).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
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

  it("builds the largest caddy inside the kernel time budget", async () => {
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

  it("gives the model its own copy of the well widths", async () => {
    const parameters = withChanges({});
    const model = await generate(parameters);
    expect(model.parameters.wellWidths).toEqual(parameters.wellWidths);
    expect(model.parameters.wellWidths).not.toBe(parameters.wellWidths);
    parameters.wellWidths[0] = 999;
    expect(model.parameters.wellWidths[0]).toBe(70);
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
    expect(parsed.getAttribute("position").count).toBe(geometry.getAttribute("position").count);
    parsed.dispose();
    geometry.dispose();
  });

  it("matches the solid-default golden record at geometry version 2", async () => {
    const model = await generate(normalize(REMOTE_CADDY_DEFAULTS));
    expect(remoteCaddy.geometryVersion).toBe(2);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-110, -65, 0],
      [110, 65, 60],
    ]);
  });
});
