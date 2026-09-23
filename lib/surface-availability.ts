import {
  MAX_SURFACE_PATTERN_CELLS,
  planSurfacePatterns,
  type SurfaceZone,
} from "./surface-pattern-plan";
import {
  isSurfacePatternActive,
  type SurfaceTreatments,
  type SurfaceTreatmentsSpec,
  type SurfaceZoneSetting,
} from "./surface-patterns";

export interface SurfaceAvailability {
  /** Each unavailable selected zone has an actionable reason. */
  unavailable: Record<string, string>;
  openingCount: number;
}

/**
 * Runs the worker's pure placement planner per selected zone. This catches
 * zones that have no safe opening before starting a geometry worker. The
 * aggregate count also covers products whose geometry applies regions in
 * separate CSG stages, such as a plate and shelf.
 */
export function surfaceAvailability(
  treatments: SurfaceTreatments,
  zones: readonly SurfaceZone[],
): SurfaceAvailability {
  const unavailable: Record<string, string> = {};
  if (!treatments.enabled) return { unavailable, openingCount: 0 };
  let openingCount = 0;
  const activeIds = Object.keys(treatments.zones).filter((id) =>
    isSurfacePatternActive(treatments, id),
  );
  for (const id of activeIds) {
    const matchingZones = zones.filter((zone) => zone.id === id);
    if (matchingZones.length === 0) {
      unavailable[id] = `The ${id} surface is not present with these options. Enable it or choose Solid.`;
      continue;
    }
    try {
      const plans = planSurfacePatterns(
        { enabled: true, zones: { [id]: treatments.zones[id] } },
        matchingZones,
      );
      openingCount += plans.reduce((sum, plan) => sum + plan.cells.length, 0);
    } catch (error) {
      unavailable[id] = error instanceof Error
        ? error.message
        : `The ${id} pattern cannot fit these dimensions.`;
    }
  }
  if (openingCount > MAX_SURFACE_PATTERN_CELLS) {
    const reason = `Together these surfaces need ${openingCount} openings, above the ${MAX_SURFACE_PATTERN_CELLS} opening limit. Increase opening size or spacing, or choose fewer surfaces.`;
    for (const id of activeIds) unavailable[id] ??= reason;
  }
  return { unavailable, openingCount };
}

export interface SuggestedSurfacePattern {
  zoneId: string;
  setting: SurfaceZoneSetting;
}

/** Finds a visible first print when the checkbox is enabled from Solid defaults. */
export function suggestSurfacePattern(
  spec: SurfaceTreatmentsSpec,
  zones: readonly SurfaceZone[],
  nozzleDiameter = 0.4,
): SuggestedSurfacePattern | null {
  const candidates = [
    { opening: 12, web: 2.4, margin: 6 },
    { opening: 8, web: 1.6, margin: 4 },
    { opening: 4, web: 1.2, margin: 2.4 },
    { opening: 2, web: 0.8, margin: 1 },
  ];
  for (const zone of spec.zones) {
    for (const candidate of candidates) {
      const setting: SurfaceZoneSetting = {
        mode: "holes",
        opening: candidate.opening,
        web: Math.max(candidate.web, 2 * nozzleDiameter),
        margin: Math.max(candidate.margin, 2 * nozzleDiameter),
      };
      const trial: SurfaceTreatments = {
        enabled: true,
        zones: { [zone.id]: setting },
      };
      if (Object.keys(surfaceAvailability(trial, zones).unavailable).length === 0) {
        return { zoneId: zone.id, setting };
      }
    }
  }
  return null;
}
