import type { SurfaceZone } from "../../surface-pattern-plan";
import { deriveLayout, type DrawerRiserParameters } from "./schema";

export function drawerRiserSurfaceZones(parameters: DrawerRiserParameters): SurfaceZone[] {
  const layout = deriveLayout(parameters);
  const legs = layout.legs;
  if (!legs.ok) return [];
  const zones: SurfaceZone[] = [];
  const innerLeft = -layout.outsideWidth / 2 + parameters.wallThickness;
  const innerFront = -layout.outsideDepth / 2 + parameters.wallThickness;
  const floorBoundary = {
    kind: "roundedRect" as const,
    min: [innerLeft, innerFront] as const,
    max: [-innerLeft, -innerFront] as const,
    radius: Math.max(0, parameters.cornerRadius - parameters.wallThickness),
  };
  const columnCenters = Array.from({ length: parameters.columns }, (_, column) =>
    innerLeft + column * (layout.compartmentWidth + parameters.dividerThickness) +
    layout.compartmentWidth / 2,
  );
  const rowCenters = Array.from({ length: parameters.rows }, (_, row) =>
    innerFront + row * (layout.compartmentDepth + parameters.dividerThickness) +
    layout.compartmentDepth / 2,
  );
  const legReserve = Math.SQRT2 * (parameters.legSection / 2 + layout.legGusset) + 2;
  const legKeepouts = legs.centers.map((center) => ({
    kind: "circle" as const, center, radius: legReserve,
  }));
  for (const x of columnCenters) {
    for (const y of rowCenters) {
      zones.push({
        kind: "plane", id: "floor", axis: "z",
        center: layout.deckZ + parameters.baseThickness / 2,
        u: [x - layout.compartmentWidth / 2, x + layout.compartmentWidth / 2],
        v: [y - layout.compartmentDepth / 2, y + layout.compartmentDepth / 2],
        thickness: parameters.baseThickness, keepouts: legKeepouts,
        boundary: floorBoundary,
      });
    }
  }
  const wallBottom = layout.deckZ + parameters.baseThickness + 2;
  const wallTop = layout.outsideHeight - 2;
  const straightX = Math.max(0, layout.outsideWidth / 2 - parameters.cornerRadius - 2);
  const straightY = Math.max(0, layout.outsideDepth / 2 - parameters.cornerRadius - 2);
  const xJoints = layout.columnPositions.map((x) => ({
    kind: "rect" as const,
    min: [x - parameters.dividerThickness / 2 - 2, wallBottom] as const,
    max: [x + parameters.dividerThickness / 2 + 2, wallTop] as const,
  }));
  const yJoints = layout.rowPositions.map((y) => ({
    kind: "rect" as const,
    min: [y - parameters.dividerThickness / 2 - 2, wallBottom] as const,
    max: [y + parameters.dividerThickness / 2 + 2, wallTop] as const,
  }));
  for (const side of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "y",
      center: side * (layout.outsideDepth / 2 - parameters.wallThickness / 2),
      u: [-straightX, straightX], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness, keepouts: xJoints,
    });
    zones.push({
      kind: "plane", id: "walls", axis: "x",
      center: side * (layout.outsideWidth / 2 - parameters.wallThickness / 2),
      u: [-straightY, straightY], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness, keepouts: yJoints,
    });
  }
  for (const x of layout.columnPositions) {
    for (const y of rowCenters) {
      zones.push({
        kind: "plane", id: "dividers", axis: "x", center: x,
        u: [y - layout.compartmentDepth / 2, y + layout.compartmentDepth / 2],
        v: [wallBottom, wallTop], thickness: parameters.dividerThickness,
      });
    }
  }
  for (const y of layout.rowPositions) {
    for (const x of columnCenters) {
      zones.push({
        kind: "plane", id: "dividers", axis: "y", center: y,
        u: [x - layout.compartmentWidth / 2, x + layout.compartmentWidth / 2],
        v: [wallBottom, wallTop], thickness: parameters.dividerThickness,
      });
    }
  }
  return zones;
}
