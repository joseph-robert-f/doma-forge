import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  HOOK_FILLET_MM,
  deriveLayout,
  type WallHookRailLayout,
  type WallHookRailParameters,
} from "./schema";

/** Plate and optional shelf areas clear of hooks, screws, and gussets. */
export function surfaceZones(
  parameters: WallHookRailParameters,
  layout: WallHookRailLayout = deriveLayout(parameters),
): SurfaceZone[] {
  if (!layout.screws.ok || !layout.hooks?.ok) return [];
  const T = parameters.plateThickness;
  const L = parameters.railLength;
  const H = parameters.railHeight;
  const plateEdge = Math.max(parameters.cornerRadius + 0.5, 3);
  const rootTop = Math.max(layout.rootTop, layout.lipTop);
  const plateKeepouts = [
    ...layout.screws.positions.map((x) => ({
      kind: "circle" as const,
      center: [x, layout.screwZ] as [number, number],
      radius: layout.headDiameter / 2 + 2.5,
    })),
    ...layout.hookCenters.map((x) => ({
      kind: "rect" as const,
      min: [x - parameters.hookWidth / 2 - 2.5, layout.armZ - HOOK_FILLET_MM - 2.5] as [number, number],
      max: [x + parameters.hookWidth / 2 + 2.5, rootTop + 2.5] as [number, number],
    })),
  ];
  const zones: SurfaceZone[] = [{
    kind: "plane",
    id: "plate",
    axis: "y",
    center: T / 2,
    thickness: T + BOOLEAN_OVERLAP * 2,
    u: [-L / 2 + plateEdge, L / 2 - plateEdge],
    v: [plateEdge, parameters.keyShelf
      ? layout.shelfUnderside - layout.gussetRise - 2.5
      : H - plateEdge],
    keepouts: plateKeepouts,
  }];
  if (parameters.keyShelf) {
    // The shelf is later clipped to the rounded X-Z plate outline; protect
    // that curved end boundary even at the shelf's top face.
    const shelfEdge = Math.max(parameters.cornerRadius + 0.5, 2.5, T / 2);
    const gussetKeepouts = layout.gussetCenters.map((x) => ({
      kind: "rect" as const,
      min: [x - T / 2 - 2.5, T - BOOLEAN_OVERLAP] as [number, number],
      max: [x + T / 2 + 2.5, T + layout.gussetRun + 2.5] as [number, number],
    }));
    zones.push({
      kind: "plane",
      id: "shelf",
      axis: "z",
      center: layout.shelfUnderside + layout.shelfThickness / 2,
      thickness: layout.shelfThickness + BOOLEAN_OVERLAP * 2,
      u: [-L / 2 + shelfEdge, L / 2 - shelfEdge],
      v: [T + shelfEdge, T + parameters.shelfDepth - shelfEdge],
      keepouts: gussetKeepouts,
    });
  }
  return zones;
}
