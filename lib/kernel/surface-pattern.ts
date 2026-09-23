import type { ManifoldToplevel } from "manifold-3d";
import type { SurfaceZoneSetting as SurfacePatternSettings, SurfaceTreatments } from "../surface-patterns";
import {
  MAX_SURFACE_PATTERN_CELLS,
  planSurfacePatterns,
  type PlannedSurfaceZone,
  type SurfaceZone,
} from "../surface-pattern-plan";
import { unionSolids } from "./arrays";
import type { Solid } from "./manifold";
import { ResourceScope } from "./ownership";
import { BOOLEAN_OVERLAP } from "./overlap";
import { polygon } from "./profiles";

// A few products pattern separate solids before joining them. The scope is
// shared by those calls, so it also tracks their combined opening budget.
const plannedCellsByScope = new WeakMap<ResourceScope, number>();

function cutterTemplate(
  kernel: ManifoldToplevel,
  scope: ResourceScope,
  settings: SurfacePatternSettings,
  depth: number,
  segments: number,
): Solid {
  if (settings.mode === "holes") {
    return scope.own(kernel.Manifold.cylinder(
      depth,
      settings.opening / 2,
      settings.opening / 2,
      Math.max(12, Math.min(48, Math.round(segments))),
      true,
    ));
  }
  // Diamond apertures leave a continuous square lattice of solid diagonal
  // ribs. The cutter is a closed prism, not a render-only surface overlay.
  const radius = settings.opening / 2;
  const profile = scope.own(polygon(kernel, [
    [0, radius],
    [-radius, 0],
    [0, -radius],
    [radius, 0],
  ]));
  const extruded = scope.own(profile.extrude(depth));
  scope.delete(profile);
  const centered = scope.own(extruded.translate([0, 0, -depth / 2]));
  scope.delete(extruded);
  return centered;
}

function depthOf(plan: PlannedSurfaceZone): number {
  const taperExtra = plan.zone.kind === "radial"
    ? Math.abs(plan.zone.slope) * plan.settings.opening
    : 0;
  return plan.zone.thickness + taperExtra + BOOLEAN_OVERLAP * 2;
}

function planarCutters(
  kernel: ManifoldToplevel,
  scope: ResourceScope,
  plan: PlannedSurfaceZone,
): Solid[] {
  if (plan.zone.kind !== "plane" || plan.cells.length === 0) return [];
  const zone = plan.zone;
  const template = cutterTemplate(kernel, scope, plan.settings, depthOf(plan), zone.segments ?? 16);
  const oriented = zone.axis === "x"
    ? scope.own(template.rotate([0, 90, 0]))
    : zone.axis === "y"
      ? scope.own(template.rotate([90, 0, 0]))
      : template;
  const cutters = plan.cells.map((cell) =>
    scope.own(oriented.translate([...cell.center] as [number, number, number])));
  if (oriented !== template) scope.delete(oriented);
  scope.delete(template);
  return cutters;
}

function radialCutters(
  kernel: ManifoldToplevel,
  scope: ResourceScope,
  plan: PlannedSurfaceZone,
): Solid[] {
  if (plan.zone.kind !== "radial" || plan.cells.length === 0) return [];
  const template = cutterTemplate(
    kernel,
    scope,
    plan.settings,
    depthOf(plan),
    plan.zone.segments ?? 16,
  );
  const upright = scope.own(template.rotate([90, 0, 0]));
  scope.delete(template);
  const cutters: Solid[] = [];
  for (const cell of plan.cells) {
    const radial = scope.own(upright.rotate([0, 0, (cell.angle ?? 0) + 90]));
    cutters.push(scope.own(radial.translate([...cell.center] as [number, number, number])));
    scope.delete(radial);
  }
  scope.delete(upright);
  return cutters;
}

/**
 * Cuts true through openings into a product supplied set of safe surfaces.
 * The caller owns `solid` in `scope`; this function replaces and deletes it
 * only when a pattern is active. The returned solid remains owned by scope.
 */
export function applySurfacePatterns(
  kernel: ManifoldToplevel,
  scope: ResourceScope,
  solid: Solid,
  treatments: SurfaceTreatments,
  zones: readonly SurfaceZone[],
): Solid {
  // Some builders pattern the plate and optional shelf before their union,
  // so each call sees only the zones belonging to that intermediate solid.
  const plans = planSurfacePatterns(treatments, zones, false);
  if (plans.length === 0) return solid;
  const plannedCells = plans.reduce((count, plan) => count + plan.cells.length, 0);
  const totalCells = (plannedCellsByScope.get(scope) ?? 0) + plannedCells;
  if (totalCells > MAX_SURFACE_PATTERN_CELLS) {
    throw new Error(`The surface pattern has more than ${MAX_SURFACE_PATTERN_CELLS} openings. Increase opening size or spacing.`);
  }
  plannedCellsByScope.set(scope, totalCells);
  const cutters: Solid[] = [];
  for (const plan of plans) {
    cutters.push(...(plan.zone.kind === "plane"
      ? planarCutters(kernel, scope, plan)
      : radialCutters(kernel, scope, plan)));
  }
  if (cutters.length === 0) return solid;
  const cutout = scope.own(unionSolids(kernel, scope.takeAll(cutters)));
  const originalVolume = solid.volume();
  const patterned = scope.own(solid.subtract(cutout));
  scope.delete(cutout);
  if (originalVolume - patterned.volume() <= 1e-6) {
    throw new Error("The surface pattern did not cut through the selected surface.");
  }
  scope.delete(solid);
  return patterned;
}

export type { SurfaceZone } from "../surface-pattern-plan";
