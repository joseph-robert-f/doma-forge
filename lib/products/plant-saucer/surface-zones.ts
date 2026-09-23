import type { SurfaceZone } from "../../surface-pattern-plan";
import type { VesselProfile } from "../../kernel/vessel-profile";
import {
  QUALITY_SEGMENTS,
  RIB_WIDTH_MM,
  deriveSaucerLayout,
  type PlantSaucerLayout,
  type PlantSaucerParameters,
} from "./schema";

/** The lift ribs join the sloped wall below their top. Keep that entire root band solid. */
export function saucerPatternZones(
  parameters: PlantSaucerParameters,
  layout: PlantSaucerLayout,
  profile: VesselProfile,
): SurfaceZone[] {
  const ribCount = Math.round(parameters.liftRibs);
  const floorRadius = profile.innerRadiusAtFloor;
  const ribKeepouts = Array.from({ length: ribCount }, (_, index) => ({
    kind: "band" as const,
    center: [0, 0] as const,
    angle: (index * 180) / ribCount,
    halfWidth: RIB_WIDTH_MM / 2 + 1,
  }));
  const wallRootTop = ribCount > 0 ? layout.ribTopZ : parameters.baseThickness;
  return [
    {
      kind: "plane", id: "floor", axis: "z", center: parameters.baseThickness / 2,
      u: [-floorRadius, floorRadius], v: [-floorRadius, floorRadius],
      thickness: parameters.baseThickness,
      boundary: { kind: "circle", center: [0, 0], radius: floorRadius },
      keepouts: ribKeepouts,
    },
    {
      kind: "radial", id: "wall", center: [0, 0],
      z: [wallRootTop + 2, profile.wallTopZ - 2],
      radiusAtZero: layout.outerRadiusAtBase - profile.horizontalWall / 2,
      slope: profile.taperTangent, thickness: profile.horizontalWall,
      angle: layout.notchDepth > 0 ? [15, 345] : undefined,
    },
  ];
}

/** The same regions used by the worker, without loading the geometry kernel. */
export function plantSaucerSurfaceZones(parameters: PlantSaucerParameters): SurfaceZone[] {
  const layout = deriveSaucerLayout(parameters, QUALITY_SEGMENTS[parameters.meshQuality]);
  return layout.profile ? saucerPatternZones(parameters, layout, layout.profile) : [];
}
