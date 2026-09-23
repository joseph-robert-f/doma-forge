import type { SurfaceTreatments, SurfaceZoneSetting as SurfacePatternSettings } from "./surface-patterns";

export type Pair = readonly [number, number];

export type SurfaceKeepout =
  | { kind: "rect"; min: Pair; max: Pair }
  | { kind: "circle"; center: Pair; radius: number }
  /** An infinite strip along `angle`, for ribs crossing a circular floor. */
  | { kind: "band"; center: Pair; angle: number; halfWidth: number };

/** For X normal u=Y,v=Z; for Y normal u=X,v=Z; for Z normal u=X,v=Y. */
export interface PlaneSurfaceZone {
  kind: "plane";
  id: string;
  axis: "x" | "y" | "z";
  /** Centre of the material along the normal axis. */
  center: number;
  u: Pair;
  v: Pair;
  thickness: number;
  keepouts?: readonly SurfaceKeepout[];
  /** Restricts a rectangular planning area to a circular floor. */
  boundary?: { kind: "circle"; center: Pair; radius: number };
  segments?: number;
}

/** A complete ring, or an angular part of a tapered vessel wall. */
export interface RadialSurfaceZone {
  kind: "radial";
  id: string;
  center: Pair;
  z: Pair;
  /** Radius of the material's midline when Z=0. */
  radiusAtZero: number;
  /** Change in midline radius for one millimetre of Z. */
  slope: number;
  thickness: number;
  angle?: Pair;
  segments?: number;
}

export type SurfaceZone = PlaneSurfaceZone | RadialSurfaceZone;

export interface PlannedSurfaceCell {
  center: readonly [number, number, number];
  /** Angle in degrees for a radial cutter; absent for a planar cutter. */
  angle?: number;
}

export interface PlannedSurfaceZone {
  zone: SurfaceZone;
  settings: SurfacePatternSettings;
  cells: PlannedSurfaceCell[];
}

/** Bound WASM allocations and keep an edit well below the worker watchdog. */
export const MAX_SURFACE_PATTERN_CELLS = 800;

function grid(min: number, max: number, opening: number, web: number, margin: number): number[] {
  const available = max - min - 2 * margin;
  if (available < opening) return [];
  const count = Math.floor((available - opening) / (opening + web)) + 1;
  const pitch = opening + web;
  const midpoint = (min + max) / 2;
  const first = midpoint - ((count - 1) * pitch) / 2;
  return Array.from({ length: count }, (_, index) => first + index * pitch);
}

function insideKeepout(
  u: number,
  v: number,
  clearance: number,
  keepout: SurfaceKeepout,
): boolean {
  if (keepout.kind === "circle") {
    return Math.hypot(u - keepout.center[0], v - keepout.center[1]) < keepout.radius + clearance;
  }
  if (keepout.kind === "band") {
    const radians = (keepout.angle * Math.PI) / 180;
    const distance = Math.abs(
      -(u - keepout.center[0]) * Math.sin(radians) +
      (v - keepout.center[1]) * Math.cos(radians),
    );
    return distance < keepout.halfWidth + clearance;
  }
  return (
    u > keepout.min[0] - clearance &&
    u < keepout.max[0] + clearance &&
    v > keepout.min[1] - clearance &&
    v < keepout.max[1] + clearance
  );
}

function planeCenter(axis: PlaneSurfaceZone["axis"], normal: number, u: number, v: number): readonly [number, number, number] {
  if (axis === "x") return [normal, u, v];
  if (axis === "y") return [u, normal, v];
  return [u, v, normal];
}

function planPlane(zone: PlaneSurfaceZone, settings: SurfacePatternSettings): PlannedSurfaceCell[] {
  const us = grid(zone.u[0], zone.u[1], settings.opening, settings.web, settings.margin);
  const vs = grid(zone.v[0], zone.v[1], settings.opening, settings.web, settings.margin);
  const clearance = settings.opening / 2 + settings.web;
  const cells: PlannedSurfaceCell[] = [];
  for (const u of us) {
    for (const v of vs) {
      if (
        zone.boundary &&
        Math.hypot(u - zone.boundary.center[0], v - zone.boundary.center[1]) +
          settings.opening / 2 + settings.margin > zone.boundary.radius
      ) continue;
      if (zone.keepouts?.some((keepout) => insideKeepout(u, v, clearance, keepout))) continue;
      cells.push({ center: planeCenter(zone.axis, zone.center, u, v) });
      if (cells.length > MAX_SURFACE_PATTERN_CELLS) {
        throw new Error(`The surface pattern has more than ${MAX_SURFACE_PATTERN_CELLS} openings. Increase opening size or spacing.`);
      }
    }
  }
  return cells;
}

function planRadial(zone: RadialSurfaceZone, settings: SurfacePatternSettings): PlannedSurfaceCell[] {
  const zs = grid(zone.z[0], zone.z[1], settings.opening, settings.web, settings.margin);
  const minRadius = Math.min(
    zone.radiusAtZero + zone.slope * zone.z[0],
    zone.radiusAtZero + zone.slope * zone.z[1],
  );
  if (minRadius <= 0) return [];
  const [start, end] = zone.angle ?? [0, 360];
  const span = end - start;
  const fullRing = Math.abs(span - 360) < 1e-7;
  const arcLength = (span * Math.PI * minRadius) / 180;
  const pitch = settings.opening + settings.web;
  const angles: number[] = [];
  if (fullRing) {
    const count = Math.floor(arcLength / pitch);
    for (let i = 0; i < count; i += 1) angles.push(start + (span * (i + 0.5)) / count);
  } else {
    for (const arc of grid(0, arcLength, settings.opening, settings.web, settings.margin)) {
      angles.push(start + (arc / minRadius) * 180 / Math.PI);
    }
  }
  const cells: PlannedSurfaceCell[] = [];
  for (const z of zs) {
    const radius = zone.radiusAtZero + zone.slope * z;
    for (const angle of angles) {
      const radians = (angle * Math.PI) / 180;
      cells.push({
        center: [
          zone.center[0] + radius * Math.cos(radians),
          zone.center[1] + radius * Math.sin(radians),
          z,
        ],
        angle,
      });
      if (cells.length > MAX_SURFACE_PATTERN_CELLS) {
        throw new Error(`The surface pattern has more than ${MAX_SURFACE_PATTERN_CELLS} openings. Increase opening size or spacing.`);
      }
    }
  }
  return cells;
}

/** Returns actual through-opening positions, or an actionable error. */
export function planSurfacePatterns(
  treatments: SurfaceTreatments,
  zones: readonly SurfaceZone[],
  requireAllSelected = true,
): PlannedSurfaceZone[] {
  if (!treatments.enabled) return [];
  const selected = Object.entries(treatments.zones).filter(([, value]) => value.mode !== "solid");
  if (selected.length === 0) return [];
  const totals = new Map(
    selected.filter(([id]) => requireAllSelected || zones.some((zone) => zone.id === id))
      .map(([id]) => [id, 0]),
  );
  const plans: PlannedSurfaceZone[] = [];
  let cellCount = 0;
  for (const zone of zones) {
    const settings = treatments.zones[zone.id];
    if (!settings || settings.mode === "solid") continue;
    if (
      !Number.isFinite(settings.opening) || settings.opening <= 0 ||
      !Number.isFinite(settings.web) || settings.web <= 0 ||
      !Number.isFinite(settings.margin) || settings.margin < 0 ||
      !Number.isFinite(zone.thickness) || zone.thickness <= 0
    ) throw new Error(`The ${zone.id} pattern has invalid dimensions.`);
    const cells = zone.kind === "plane" ? planPlane(zone, settings) : planRadial(zone, settings);
    cellCount += cells.length;
    if (cellCount > MAX_SURFACE_PATTERN_CELLS) {
      throw new Error(`The surface pattern has more than ${MAX_SURFACE_PATTERN_CELLS} openings. Increase opening size or spacing.`);
    }
    totals.set(zone.id, (totals.get(zone.id) ?? 0) + cells.length);
    plans.push({ zone, settings, cells });
  }
  for (const [id, count] of totals) {
    if (count === 0) throw new Error(`No ${id} pattern fits these dimensions. Increase the surface size or reduce the opening and margin.`);
  }
  return plans;
}
