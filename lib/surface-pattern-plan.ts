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
  /** Restricts a rectangular planning area to the usable floor outline. */
  boundary?:
    | { kind: "circle"; center: Pair; radius: number }
    | { kind: "roundedRect"; min: Pair; max: Pair; radius: number };
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

function boundaryDistance(u: number, v: number, boundary: NonNullable<PlaneSurfaceZone["boundary"]>): number {
  if (boundary.kind === "circle") {
    return Math.hypot(u - boundary.center[0], v - boundary.center[1]) - boundary.radius;
  }
  const halfU = (boundary.max[0] - boundary.min[0]) / 2;
  const halfV = (boundary.max[1] - boundary.min[1]) / 2;
  const centerU = (boundary.min[0] + boundary.max[0]) / 2;
  const centerV = (boundary.min[1] + boundary.max[1]) / 2;
  const qU = Math.abs(u - centerU) - halfU + boundary.radius;
  const qV = Math.abs(v - centerV) - halfV + boundary.radius;
  return Math.hypot(Math.max(qU, 0), Math.max(qV, 0)) +
    Math.min(Math.max(qU, qV), 0) - boundary.radius;
}

function planPlane(zone: PlaneSurfaceZone, settings: SurfacePatternSettings): PlannedSurfaceCell[] {
  const us = grid(zone.u[0], zone.u[1], settings.opening, settings.web, settings.margin);
  const vs = grid(zone.v[0], zone.v[1], settings.opening, settings.web, settings.margin);
  const clearance = settings.opening / 2 + settings.web;
  const boundaryClearance = settings.opening / 2 + settings.margin;
  const cells: PlannedSurfaceCell[] = [];
  for (const u of us) {
    for (const v of vs) {
      if (zone.boundary && boundaryDistance(u, v, zone.boundary) > -boundaryClearance) continue;
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
  const innerRadius = Math.min(
    zone.radiusAtZero + zone.slope * zone.z[0],
    zone.radiusAtZero + zone.slope * zone.z[1],
  ) - zone.thickness / 2;
  const halfOpening = settings.opening / 2;
  if (zs.length === 0 || !Number.isFinite(innerRadius) || innerRadius <= halfOpening ||
      settings.web >= 2 * innerRadius) return [];
  const [start, end] = zone.angle ?? [0, 360];
  const span = end - start;
  const fullRing = Math.abs(span - 360) < 1e-7;
  const spanRadians = (span * Math.PI) / 180;
  const apertureHalfAngle = Math.asin(halfOpening / innerRadius);
  // The radial cutter is wider in angle at the inner wall. Leave the requested
  // web between the aperture edges there, including across a full-ring seam.
  const pitchAngle = 2 * apertureHalfAngle + 2 * Math.asin(settings.web / (2 * innerRadius));
  const angles: number[] = [];
  if (fullRing) {
    const count = Math.floor(spanRadians / pitchAngle);
    if (count * zs.length > MAX_SURFACE_PATTERN_CELLS) {
      throw new Error(`The surface pattern has more than ${MAX_SURFACE_PATTERN_CELLS} openings. Increase opening size or spacing.`);
    }
    for (let i = 0; i < count; i += 1) angles.push(start + (span * (i + 0.5)) / count);
  } else {
    if (settings.margin >= 2 * innerRadius) return [];
    const edgeInset = apertureHalfAngle + 2 * Math.asin(settings.margin / (2 * innerRadius));
    const available = spanRadians - 2 * edgeInset;
    if (available >= 0) {
      const count = Math.floor(available / pitchAngle) + 1;
      if (count * zs.length > MAX_SURFACE_PATTERN_CELLS) {
        throw new Error(`The surface pattern has more than ${MAX_SURFACE_PATTERN_CELLS} openings. Increase opening size or spacing.`);
      }
      const first = start + ((spanRadians - (count - 1) * pitchAngle) * 90) / Math.PI;
      for (let i = 0; i < count; i += 1) {
        angles.push(first + ((i * pitchAngle) * 180) / Math.PI);
      }
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
