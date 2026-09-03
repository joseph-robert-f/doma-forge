import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import {
  MINIMUM_WEB_MM,
  TOOL_FIN_RACK_DEFAULTS,
  TOOL_FIN_RACK_SPECS,
  deriveLayout,
  toolFinRack,
  type ToolFinRackParameters,
} from "../lib/products/tool-fin-rack";
import { formatMillimeters } from "../lib/products/shared";
import { wallLikeKeys, wallsFromSpecs } from "../lib/printer-profile";
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

const { normalize, validate, generate } = toolFinRack;

// Recorded at geometryVersion 1 for the defaults. A change here is a
// geometry change: bump TOOL_FIN_RACK_GEOMETRY_VERSION and re-record on
// purpose.
const GOLDEN_TRIANGLES = 252;
const GOLDEN_VOLUME = 160238.77;

function withChanges(changes: Partial<ToolFinRackParameters>): ToolFinRackParameters {
  return normalize({ ...TOOL_FIN_RACK_DEFAULTS, ...changes });
}

const MINIMUM_CASE: Partial<ToolFinRackParameters> = {
  rackWidth: 60, rackDepth: 40, finCount: 2, finThickness: 1.5, finHeight: 10,
  wallThickness: 1.2, baseThickness: 3, cornerRadius: 0,
};
const MAXIMUM_CASE: Partial<ToolFinRackParameters> = {
  rackWidth: 400, rackDepth: 300, finCount: 20, finThickness: 6, finHeight: 90,
  wallThickness: 4, baseThickness: 6, cornerRadius: 20,
};
// A small slab with just enough fins that the row layout itself is fine,
// but a large corner radius still leaves an end fin overhanging past the
// rounded corner with no slab underneath it.
const CORNER_CONFLICT_CASE: Partial<ToolFinRackParameters> = {
  rackWidth: 110, rackDepth: 40, finCount: 6, finThickness: 3, finHeight: 20,
  wallThickness: 1.2, baseThickness: 3, cornerRadius: 20,
};

describe("tool fin rack parameters", () => {
  it("ships the tool-type presets in order", () => {
    expect(toolFinRack.presets.map((preset) => preset.id)).toEqual([
      "pliers",
      "files",
      "wrenches",
    ]);
  });

  it("solves the fin pitch from the width, the count, and the thickness", () => {
    const layout = deriveLayout(TOOL_FIN_RACK_DEFAULTS);
    expect(layout.finLayout.ok).toBe(true);
    if (layout.finLayout.ok) {
      expect(layout.finLayout.web).toBeGreaterThanOrEqual(MINIMUM_WEB_MM);
    }
  });

  it("rejects a fin taller than 15 times its thickness, naming the field", () => {
    const result = validate(withChanges({ finThickness: 3, finHeight: 46 }));
    expect(result.valid).toBe(false);
    expect(result.byField.finHeight?.[0]).toMatch(/Fin height must be at most 45 mm/);
    expect(validate(withChanges({ finThickness: 3, finHeight: 45 })).valid).toBe(true);
  });

  it("rejects fins whose gap is under the minimum, naming the fix", () => {
    const result = validate(withChanges({ finCount: 15 }));
    expect(result.valid).toBe(false);
    expect(result.byField.finCount?.[0]).toMatch(/fins of 3 mm/);
  });

  it("accepts a gap exactly at the minimum", () => {
    // Inside width for 5 fins of 3 mm at a 12 mm gap: 5 * 3 + 6 * 12 = 87.
    const exact = withChanges({ finCount: 5, rackWidth: 91, wallThickness: 2 });
    expect(deriveLayout(exact).finLayout).toMatchObject({ ok: true, web: 12 });
    expect(validate(exact).valid).toBe(true);
    expect(
      validate(withChanges({ finCount: 5, rackWidth: 90, wallThickness: 2 })).byField.finCount,
    ).toHaveLength(1);
  });

  it("derives and validates a cleared field without throwing", () => {
    for (const key of [
      "rackWidth", "rackDepth", "wallThickness", "finCount", "finThickness", "finHeight",
    ] as const) {
      const cleared = { ...TOOL_FIN_RACK_DEFAULTS, [key]: Number.NaN };
      expect(() => toolFinRack.derive(cleared)).not.toThrow();
      const result = validate(cleared);
      expect(result.valid).toBe(false);
      expect(result.byField[key]?.[0]).toMatch(/must be a number/);
    }
  });

  it("rejects a corner radius that leaves an end fin overhanging, naming the largest radius that fits", () => {
    const corner = withChanges(CORNER_CONFLICT_CASE);
    const result = validate(corner);
    expect(result.valid).toBe(false);
    expect(result.byField.cornerRadius?.[0]).toMatch(/leaves an end fin hanging/);
    const maximum = Number(result.byField.cornerRadius?.[0].match(/at most ([\d.]+) mm/)?.[1]);
    expect(Number.isFinite(maximum)).toBe(true);
    expect(validate({ ...corner, cornerRadius: maximum }).valid).toBe(true);
    expect(validate({ ...corner, cornerRadius: maximum + 0.5 }).valid).toBe(false);
  });

  it("creates a deterministic filename with the size and the fin count", () => {
    expect(toolFinRack.filename(withChanges({ rackWidth: 150.5 }))).toMatch(
      /^drawerforge-tool-fin-rack-150p5x90x44-6fins-[0-9a-f]{6}\.stl$/,
    );
    expect(toolFinRack.filename(withChanges({ finThickness: 4 }))).not.toBe(
      toolFinRack.filename(TOOL_FIN_RACK_DEFAULTS),
    );
  });

  it("derives the outside size, the fin pitch, and the fin length", () => {
    const values = toolFinRack.derive(TOOL_FIN_RACK_DEFAULTS);
    expect(values[0].value).toBe("150 × 90 × 44 mm");
    expect(values[1].label).toBe("Fin pitch");
    expect(values[1].value).toMatch(/^[\d.]+ mm, gap [\d.]+ mm$/);
  });

  it("derives the blade gap at the fillet foot as the pitch gap minus the fillet's own width", () => {
    const layout = deriveLayout(TOOL_FIN_RACK_DEFAULTS);
    expect(layout.finLayout.ok).toBe(true);
    if (!layout.finLayout.ok) return;
    const values = toolFinRack.derive(TOOL_FIN_RACK_DEFAULTS);
    const foot = values.find((value) => value.id === "fin-gap-at-foot");
    expect(foot?.label).toBe("Blade gap at the fillet foot");
    // The fillet widens the fin by FIN_FILLET_WIDTH_MM (2 mm) on each
    // side, so the gap at the foot is 4 mm less than the pitch solver's
    // own gap between the plain fin bodies.
    expect(foot?.value).toBe(`${formatMillimeters(layout.finLayout.web - 4)} mm`);
  });
});

describe("printed walls", () => {
  // The rim and the base are parameters, so the key-name rule already finds
  // them (finThickness and baseThickness both hold "thickness"). Nothing
  // else here is a thin printed wall: the fins are unioned onto the slab,
  // not cut into it, so the gap between two fins is open air for a tool
  // blade, a clearance, not material — the same gap the "Blade gap at the
  // fillet foot" derived value above already calls a gap. The fillet strip
  // at each fin's foot only adds material, and the task rules that a fin
  // fillet is not a wall. So the product reports nothing beyond the
  // key-name rule (D-1703): no `printedWalls` member is defined, and
  // `wallsFromSpecs` is what the printer profile falls back to.
  it("has no printedWalls member; the key-name rule already covers every printed wall", () => {
    expect(toolFinRack.printedWalls).toBeUndefined();
    expect(wallLikeKeys(TOOL_FIN_RACK_SPECS).sort()).toEqual([
      "baseThickness",
      "finThickness",
      "wallThickness",
    ]);
  });

  it("does not throw and reports only finite values for a cleared field", () => {
    const cleared = { ...TOOL_FIN_RACK_DEFAULTS, rackWidth: Number.NaN };
    expect(() => wallsFromSpecs(TOOL_FIN_RACK_SPECS, cleared)).not.toThrow();
  });
});

describe("tool fin rack geometry", () => {
  const fixtures: Array<[string, Partial<ToolFinRackParameters>]> = [
    ["minimum", MINIMUM_CASE],
    ["default", {}],
    ["maximum", MAXIMUM_CASE],
    ["fine mesh", { meshQuality: "fine" }],
  ];

  it.each(fixtures)("creates a finite, outward, closed %s rack", async (_name, changes) => {
    const parameters = withChanges(changes);
    expect(validate(parameters).valid).toBe(true);
    const model = await generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const analysis = analyzeBufferGeometry(geometry);
    const layout = deriveLayout(parameters);
    const size = analysis.bounds.getSize(new THREE.Vector3());

    expect(model.status).toBe("NoError");
    expect(model.volume).toBeGreaterThan(0);
    expect(analysis.finite).toBe(true);
    expect(analysis.triangleCount).toBeGreaterThan(0);
    expect(analysis.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(analysis.minimumNormalLength).toBeCloseTo(1, 5);
    expect(analysis.signedVolume).toBeGreaterThan(0);
    expect(connectedComponentCount(model.mesh.triVerts)).toBe(1);
    expect(size.x).toBeCloseTo(parameters.rackWidth, 4);
    expect(size.y).toBeCloseTo(parameters.rackDepth, 4);
    expect(size.z).toBeCloseTo(layout.outsideHeight, 4);
    expect(analysis.bounds.min.z).toBeCloseTo(0, 5);
    const contract = toolFinRack.boundsContract(parameters);
    expect(model.bounds[0]).toEqual(contract.min);
    expect(model.bounds[1]).toEqual(contract.max);

    for (const edge of closedEdgeCounts(geometry)) {
      expect(edge.count).toBe(2);
      expect(edge.balance).toBe(0);
    }
    geometry.dispose();
  });

  it("refuses the conflict case instead of building it", async () => {
    const parameters = withChanges({ finCount: 15 });
    await expect(generate(parameters)).rejects.toThrow(/fins of 3 mm/);
  });

  it.each([
    ["default", {}],
    ["single-digit fin count", MINIMUM_CASE],
  ] as Array<[string, Partial<ToolFinRackParameters>]>)(
    "shows one solid component per fin in a slice through the %s fins, and one outer contour through the base",
    async (_name, changes) => {
      const parameters = withChanges(changes);
      const model = await generate(parameters);
      const midFinZ = parameters.baseThickness + parameters.finHeight / 2;
      const finSlice = horizontalSliceTopology(model.mesh, midFinZ);
      expect(finSlice).toMatchObject({
        contours: parameters.finCount,
        solidComponents: parameters.finCount,
        holes: 0,
      });
      const baseSlice = horizontalSliceTopology(model.mesh, parameters.baseThickness / 2);
      expect(baseSlice).toMatchObject({ contours: 1, solidComponents: 1, holes: 0 });
    },
  );

  it("widens each fin's footprint toward the base without changing the outside bounds", async () => {
    const parameters = withChanges({});
    const layout = deriveLayout(parameters);
    const model = await generate(parameters);
    const firstFinX = layout.finLayout.ok ? layout.finLayout.firstCenter : 0;
    const footSlice = horizontalSliceTopology(
      model.mesh,
      parameters.baseThickness + 0.1,
    );
    expect(footSlice.contours).toBe(parameters.finCount);
    // The fillet strip, at the fin's foot, is wider than the plain fin body.
    expect(footSlice.containsSolid([firstFinX, 0])).toBe(true);
    const halfway = (parameters.finThickness / 2 + 0.5) * -1;
    expect(footSlice.containsSolid([firstFinX + halfway, 0])).toBe(true);
  });

  it("increases round-corner fidelity with mesh quality", async () => {
    const withRadius = withChanges({ cornerRadius: 20 });
    const counts: number[] = [];
    for (const meshQuality of ["draft", "standard", "fine"] as const) {
      const model = await generate({ ...withRadius, meshQuality });
      counts.push(model.mesh.triVerts.length / 3);
    }
    expect(counts[1]).toBeGreaterThanOrEqual(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it("builds 20 fine fins inside the kernel time budget", async () => {
    const parameters = withChanges(MAXIMUM_CASE);
    const fineParameters = { ...parameters, meshQuality: "fine" as const };
    await generate(parameters);
    const started = performance.now();
    const model = await generate(fineParameters);
    const elapsed = performance.now() - started;
    expect(model.status).toBe("NoError");
    // Budget of two seconds, the same margin recorded for the socket tray
    // in 20_KERNEL_MODULES_NOTES.md D-913.
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
    expect(parsed.getAttribute("position").count).toBe(geometry.getAttribute("position").count);
    parsed.dispose();
    geometry.dispose();
  });

  it("matches the geometry version 1 golden record for the defaults", async () => {
    const model = await generate(normalize(TOOL_FIN_RACK_DEFAULTS));
    expect(toolFinRack.geometryVersion).toBe(1);
    expect(model.mesh.triVerts.length / 3).toBe(GOLDEN_TRIANGLES);
    expect(Math.abs(model.volume - GOLDEN_VOLUME) / GOLDEN_VOLUME).toBeLessThan(0.001);
    expect(model.bounds).toEqual([
      [-75, -45, 0],
      [75, 45, 44],
    ]);
  });
});
