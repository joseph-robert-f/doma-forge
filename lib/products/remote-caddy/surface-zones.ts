import type { SurfaceZone } from "../../surface-pattern-plan";
import { deriveLayout, type RemoteCaddyParameters } from "./schema";

export function remoteCaddySurfaceZones(parameters: RemoteCaddyParameters): SurfaceZone[] {
  const layout = deriveLayout(parameters);
  const zones: SurfaceZone[] = [];
  const innerLeft = -parameters.caddyWidth / 2 + parameters.wallThickness;
  const innerFront = -parameters.caddyDepth / 2 + parameters.wallThickness;
  let nextX = innerLeft;
  for (const width of layout.wellWidths) {
    zones.push({
      kind: "plane", id: "floor", axis: "z", center: layout.floorZ / 2,
      u: [nextX, nextX + width],
      v: [innerFront, -innerFront], thickness: layout.floorZ,
    });
    nextX += width + parameters.dividerThickness;
  }
  const straightX = Math.max(0, parameters.caddyWidth / 2 - parameters.cornerRadius - 2);
  const straightY = Math.max(0, parameters.caddyDepth / 2 - parameters.cornerRadius - 2);
  const wallBottom = layout.floorZ + 2;
  const joints = layout.dividerPositions.map((x) => ({
    kind: "rect" as const,
    min: [x - parameters.dividerThickness / 2 - 2, wallBottom] as const,
    max: [x + parameters.dividerThickness / 2 + 2, parameters.caddyHeight - 2] as const,
  }));
  zones.push({
    kind: "plane", id: "walls", axis: "y",
    center: -parameters.caddyDepth / 2 + parameters.wallThickness / 2,
    u: [-straightX, straightX], v: [wallBottom, parameters.frontWallHeight - 2],
    thickness: parameters.wallThickness, keepouts: joints,
  });
  zones.push({
    kind: "plane", id: "walls", axis: "y",
    center: parameters.caddyDepth / 2 - parameters.wallThickness / 2,
    u: [-straightX, straightX], v: [wallBottom, parameters.caddyHeight - 2],
    thickness: parameters.wallThickness, keepouts: joints,
  });
  for (const side of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "x",
      center: side * (parameters.caddyWidth / 2 - parameters.wallThickness / 2),
      u: [-straightY, straightY], v: [wallBottom, parameters.caddyHeight - 2],
      thickness: parameters.wallThickness,
    });
  }
  for (const x of layout.dividerPositions) {
    zones.push({
      kind: "plane", id: "dividers", axis: "x", center: x,
      u: [innerFront, -innerFront], v: [wallBottom, parameters.caddyHeight - 2],
      thickness: parameters.dividerThickness,
    });
  }
  return zones;
}
