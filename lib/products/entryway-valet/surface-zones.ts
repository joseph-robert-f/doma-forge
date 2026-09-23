import type { SurfaceZone } from "../../surface-pattern-plan";
import { deriveLayout, type EntrywayValetParameters } from "./schema";

export function entrywayValetSurfaceZones(parameters: EntrywayValetParameters): SurfaceZone[] {
  const layout = deriveLayout(parameters);
  const { valetWidth, valetDepth, valetHeight, baseThickness, dividerThickness } = parameters;
  // Only the front wells are free surfaces. The slot lip and the angled
  // phone rest occupy the rear zone and remain unperforated.
  const zones: SurfaceZone[] = [];
  const frontWellEnd = layout.backDividerY - dividerThickness / 2;
  const floorBoundary = {
    kind: "roundedRect" as const,
    min: [-layout.innerWidth / 2, -layout.innerDepth / 2] as const,
    max: [layout.innerWidth / 2, layout.innerDepth / 2] as const,
    radius: Math.max(0, parameters.cornerRadius - parameters.wallThickness),
  };
  let nextX = -layout.innerWidth / 2;
  for (const width of layout.wellWidths) {
    zones.push({
      kind: "plane", id: "floor", axis: "z", center: baseThickness / 2,
      u: [nextX, nextX + width], v: [layout.frontInner, frontWellEnd],
      thickness: baseThickness,
      boundary: floorBoundary,
    });
    nextX += width + dividerThickness;
  }
  const wallBottom = baseThickness + 2;
  const wallTop = valetHeight - 2;
  const straightX = Math.max(0, valetWidth / 2 - parameters.cornerRadius - 2);
  zones.push({
    kind: "plane", id: "walls", axis: "y",
    center: -valetDepth / 2 + parameters.wallThickness / 2,
    u: [-straightX, straightX], v: [wallBottom, wallTop],
    thickness: parameters.wallThickness,
    keepouts: layout.dividerPositions.map((x) => ({
      kind: "rect", min: [x - dividerThickness / 2 - 2, wallBottom],
      max: [x + dividerThickness / 2 + 2, wallTop],
    })),
  });
  for (const side of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "x",
      center: side * (valetWidth / 2 - parameters.wallThickness / 2),
      u: [layout.frontInner + 2, frontWellEnd - 2], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness,
    });
  }
  for (const x of layout.dividerPositions) {
    zones.push({
      kind: "plane", id: "dividers", axis: "x", center: x,
      u: [layout.frontInner, frontWellEnd], v: [wallBottom, wallTop],
      thickness: dividerThickness,
    });
  }
  return zones;
}
