import type { SurfaceZone } from "../../surface-pattern-plan";
import { DRAIN_WEB_MM, QUALITY_SEGMENTS, derivePotLayout, drainHoleCenters, type PlantPotParameters } from "./schema";

export function plantPotSurfaceZones(parameters: PlantPotParameters): SurfaceZone[] {
  const layout = derivePotLayout(parameters, QUALITY_SEGMENTS[parameters.meshQuality]);
  const holes = Math.round(parameters.drainHoles);
  const drainKeepouts = drainHoleCenters(layout, holes).map((center) => ({
    kind: "circle" as const,
    center,
    radius: parameters.drainHoleDiameter / 2 + DRAIN_WEB_MM,
  }));
  const floorRadius = layout.innerFloorRadius;
  const radians = (parameters.wallAngleDegrees * Math.PI) / 180;
  const radialWall = parameters.wallThickness / Math.cos(radians);
  const zones: SurfaceZone[] = [
    {
      kind: "plane", id: "base", axis: "z", center: parameters.baseThickness / 2,
      u: [-floorRadius, floorRadius], v: [-floorRadius, floorRadius],
      thickness: parameters.baseThickness,
      boundary: { kind: "circle", center: [0, 0], radius: floorRadius },
      keepouts: drainKeepouts,
    },
    {
      kind: "radial", id: "wall", center: [0, 0],
      z: [parameters.baseThickness + 3, parameters.potHeight - layout.rimRadius - 3],
      radiusAtZero: parameters.baseDiameter / 2 - radialWall / 2,
      slope: Math.tan(radians), thickness: radialWall,
    },
  ];
  return zones;
}
