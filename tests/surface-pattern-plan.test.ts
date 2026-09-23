import { describe, expect, it } from "vitest";
import {
  MAX_SURFACE_PATTERN_CELLS,
  planSurfacePatterns,
  type PlaneSurfaceZone,
  type RadialSurfaceZone,
} from "../lib/surface-pattern-plan";
import type { SurfaceTreatments } from "../lib/surface-patterns";

const plane: PlaneSurfaceZone = {
  kind: "plane",
  id: "wall",
  axis: "y",
  center: 0,
  u: [-40, 40],
  v: [0, 40],
  thickness: 3,
  keepouts: [{ kind: "circle", center: [0, 20], radius: 8 }],
};

function treatment(mode: "solid" | "holes" | "mesh", opening = 8): SurfaceTreatments {
  return {
    enabled: true,
    zones: { wall: { mode, opening, web: 2, margin: 4 } },
  };
}

describe("surface pattern planning", () => {
  it("leaves solid and disabled designs unchanged", () => {
    expect(planSurfacePatterns({ ...treatment("holes"), enabled: false }, [plane])).toEqual([]);
    expect(planSurfacePatterns(treatment("solid"), [plane])).toEqual([]);
  });

  it.each(["holes", "mesh"] as const)("places %s only inside the field and outside protected zones", (mode) => {
    const plan = planSurfacePatterns(treatment(mode), [plane]);
    expect(plan).toHaveLength(1);
    expect(plan[0].cells.length).toBeGreaterThan(0);
    for (const cell of plan[0].cells) {
      const [u, , v] = cell.center;
      expect(Math.abs(u) + 4).toBeLessThanOrEqual(40);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(36);
      expect(Math.hypot(u, v - 20)).toBeGreaterThanOrEqual(8 + 8 / 2 + 2);
    }
  });

  it("keeps circular floors inside their usable radius", () => {
    const floor: PlaneSurfaceZone = {
      kind: "plane", id: "wall", axis: "z", center: 1.5,
      u: [-30, 30], v: [-30, 30], thickness: 3,
      boundary: { kind: "circle", center: [0, 0], radius: 30 },
    };
    const cells = planSurfacePatterns(treatment("holes"), [floor])[0].cells;
    expect(cells.length).toBeGreaterThan(0);
    for (const { center } of cells) {
      expect(Math.hypot(center[0], center[1]) + 4 + 4).toBeLessThanOrEqual(30);
    }
  });

  it("uses the narrow radius to space openings around tapered walls", () => {
    const vessel: RadialSurfaceZone = {
      kind: "radial", id: "wall", center: [0, 0], z: [5, 35],
      radiusAtZero: 25, slope: 0.1, thickness: 2.5,
    };
    const plan = planSurfacePatterns(treatment("mesh"), [vessel]);
    expect(plan[0].cells.length).toBeGreaterThan(0);
    expect(new Set(plan[0].cells.map((cell) => cell.angle)).size).toBeGreaterThan(1);
    for (const { center } of plan[0].cells) {
      expect(Math.hypot(center[0], center[1])).toBeCloseTo(25 + 0.1 * center[2], 7);
    }
  });

  it("reports surfaces that cannot fit an opening", () => {
    expect(() => planSurfacePatterns(treatment("holes"), [{ ...plane, u: [-4, 4] }]))
      .toThrow(/No wall pattern fits/);
    expect(() => planSurfacePatterns(treatment("holes"), []))
      .toThrow(/No wall pattern fits/);
  });

  it("rejects unbounded patterns before allocating kernel solids", () => {
    const oversized: PlaneSurfaceZone = { ...plane, u: [-200, 200], v: [0, 400] };
    expect(() => planSurfacePatterns(treatment("holes", 1.5), [oversized]))
      .toThrow(new RegExp(`more than ${MAX_SURFACE_PATTERN_CELLS} openings`));
  });
});
