import type { SurfaceZone } from "../../surface-pattern-plan";
import { deriveDimensions, type DrawerTrayParameters } from "./schema";

export function getFingerScoopRadius(parameters: DrawerTrayParameters): number {
  const derived = deriveDimensions(parameters);
  const availableWallHeight =
    parameters.organizerHeight - parameters.baseThickness;
  return Math.max(
    1.5,
    Math.min(12, derived.outsideWidth * 0.075, availableWallHeight - 2),
  );
}

export function drawerTraySurfaceZones(parameters: DrawerTrayParameters): SurfaceZone[] {
  const derived = deriveDimensions(parameters);
  // One floor patch per compartment keeps the wall and divider roots intact.
  // Each straight wall is a separate patch so the rounded corners stay solid.
  const zones: SurfaceZone[] = [];
  const innerLeft = -derived.outsideWidth / 2 + parameters.wallThickness;
  const innerFront = -derived.outsideDepth / 2 + parameters.wallThickness;
  const floorBoundary = {
    kind: "roundedRect" as const,
    min: [innerLeft, innerFront] as const,
    max: [-innerLeft, -innerFront] as const,
    radius: Math.max(0, parameters.cornerRadius - parameters.wallThickness),
  };
  const columnCenters = Array.from({ length: parameters.columns }, (_, column) =>
    innerLeft + column * (derived.compartmentWidth + parameters.dividerThickness) +
    derived.compartmentWidth / 2,
  );
  const rowCenters = Array.from({ length: parameters.rows }, (_, row) =>
    innerFront + row * (derived.compartmentDepth + parameters.dividerThickness) +
    derived.compartmentDepth / 2,
  );
  for (const x of columnCenters) {
    for (const y of rowCenters) {
      zones.push({
        kind: "plane", id: "floor", axis: "z", center: parameters.baseThickness / 2,
        u: [x - derived.compartmentWidth / 2, x + derived.compartmentWidth / 2],
        v: [y - derived.compartmentDepth / 2, y + derived.compartmentDepth / 2],
        thickness: parameters.baseThickness,
        boundary: floorBoundary,
      });
    }
  }
  const straightX = Math.max(0, derived.outsideWidth / 2 - parameters.cornerRadius - 2);
  const straightY = Math.max(0, derived.outsideDepth / 2 - parameters.cornerRadius - 2);
  const wallBottom = parameters.baseThickness + 2;
  const wallTop = parameters.organizerHeight - 2;
  const xJoints = columnCenters.slice(0, -1).map((_, index) => {
    const x = columnCenters[index] + derived.compartmentWidth / 2 + parameters.dividerThickness / 2;
    return { kind: "rect" as const, min: [x - parameters.dividerThickness / 2 - 2, wallBottom] as const, max: [x + parameters.dividerThickness / 2 + 2, wallTop] as const };
  });
  const yJoints = rowCenters.slice(0, -1).map((_, index) => {
    const y = rowCenters[index] + derived.compartmentDepth / 2 + parameters.dividerThickness / 2;
    return { kind: "rect" as const, min: [y - parameters.dividerThickness / 2 - 2, wallBottom] as const, max: [y + parameters.dividerThickness / 2 + 2, wallTop] as const };
  });
  for (const y of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "y",
      center: y * (derived.outsideDepth / 2 - parameters.wallThickness / 2),
      u: [-straightX, straightX], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness,
      keepouts: y < 0 && parameters.fingerScoop
        ? [...xJoints, { kind: "circle", center: [0, parameters.organizerHeight], radius: getFingerScoopRadius(parameters) + 2 }]
        : xJoints,
    });
  }
  for (const x of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "x",
      center: x * (derived.outsideWidth / 2 - parameters.wallThickness / 2),
      u: [-straightY, straightY], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness, keepouts: yJoints,
    });
  }
  for (let index = 0; index < parameters.columns - 1; index += 1) {
    const x = columnCenters[index] + derived.compartmentWidth / 2 + parameters.dividerThickness / 2;
    for (const y of rowCenters) {
      zones.push({
        kind: "plane", id: "dividers", axis: "x", center: x,
        u: [y - derived.compartmentDepth / 2, y + derived.compartmentDepth / 2],
        v: [wallBottom, wallTop], thickness: parameters.dividerThickness,
      });
    }
  }
  for (let index = 0; index < parameters.rows - 1; index += 1) {
    const y = rowCenters[index] + derived.compartmentDepth / 2 + parameters.dividerThickness / 2;
    for (const x of columnCenters) {
      zones.push({
        kind: "plane", id: "dividers", axis: "y", center: y,
        u: [x - derived.compartmentWidth / 2, x + derived.compartmentWidth / 2],
        v: [wallBottom, wallTop], thickness: parameters.dividerThickness,
      });
    }
  }
  return zones;
}
