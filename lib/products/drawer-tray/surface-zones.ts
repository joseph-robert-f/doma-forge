import type { SurfaceZone } from "../../surface-pattern-plan";
import { deriveTrayLayout, type DrawerTrayParameters } from "./schema";

/** Solid rim left between the scoop and either side of its front compartment. */
export const FINGER_SCOOP_SIDE_CLEARANCE = 2;

export interface FingerScoopLayout {
  centerX: number;
  radius: number;
}

export function getFingerScoopLayout(parameters: DrawerTrayParameters): FingerScoopLayout {
  const derived = deriveTrayLayout(parameters);
  const columns = derived.columns.spans;
  // The front cell covering X=0 gets the scoop. When X=0 falls on a
  // divider or cell boundary, prefer the cell to its left.
  const firstRight = columns.findIndex((span) => span.start >= 0);
  const selected = columns[Math.max(0, firstRight < 0 ? columns.length - 1 : firstRight - 1)];
  const availableWallHeight =
    parameters.organizerHeight - parameters.baseThickness;
  const radius = Math.max(
    1.5,
    Math.min(
      12,
      derived.outsideWidth * 0.075,
      availableWallHeight - 2,
      selected.size / 2 - FINGER_SCOOP_SIDE_CLEARANCE,
    ),
  );
  const centerX = Math.max(
    selected.start + FINGER_SCOOP_SIDE_CLEARANCE + radius,
    Math.min(0, selected.end - FINGER_SCOOP_SIDE_CLEARANCE - radius),
  );
  return { centerX, radius };
}

export function getFingerScoopRadius(parameters: DrawerTrayParameters): number {
  return getFingerScoopLayout(parameters).radius;
}

export function drawerTraySurfaceZones(parameters: DrawerTrayParameters): SurfaceZone[] {
  const derived = deriveTrayLayout(parameters);
  const scoop = parameters.fingerScoop ? getFingerScoopLayout(parameters) : null;
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
  for (const column of derived.columns.spans) {
    for (const row of derived.rows.spans) {
      zones.push({
        kind: "plane", id: "floor", axis: "z", center: parameters.baseThickness / 2,
        u: [column.start, column.end],
        v: [row.start, row.end],
        thickness: parameters.baseThickness,
        boundary: floorBoundary,
      });
    }
  }
  const straightX = Math.max(0, derived.outsideWidth / 2 - parameters.cornerRadius - 2);
  const straightY = Math.max(0, derived.outsideDepth / 2 - parameters.cornerRadius - 2);
  const wallBottom = parameters.baseThickness + 2;
  const wallTop = parameters.organizerHeight - 2;
  const xJoints = derived.columns.dividerCenters.map((x) => {
    return { kind: "rect" as const, min: [x - parameters.dividerThickness / 2 - 2, wallBottom] as const, max: [x + parameters.dividerThickness / 2 + 2, wallTop] as const };
  });
  const yJoints = derived.rows.dividerCenters.map((y) => {
    return { kind: "rect" as const, min: [y - parameters.dividerThickness / 2 - 2, wallBottom] as const, max: [y + parameters.dividerThickness / 2 + 2, wallTop] as const };
  });
  for (const y of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "y",
      center: y * (derived.outsideDepth / 2 - parameters.wallThickness / 2),
      u: [-straightX, straightX], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness,
      keepouts: y < 0 && scoop
        ? [...xJoints, { kind: "circle", center: [scoop.centerX, parameters.organizerHeight], radius: scoop.radius + 2 }]
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
  for (const x of derived.columns.dividerCenters) {
    for (const row of derived.rows.spans) {
      zones.push({
        kind: "plane", id: "dividers", axis: "x", center: x,
        u: [row.start, row.end],
        v: [wallBottom, wallTop], thickness: parameters.dividerThickness,
      });
    }
  }
  for (const y of derived.rows.dividerCenters) {
    for (const column of derived.columns.spans) {
      zones.push({
        kind: "plane", id: "dividers", axis: "y", center: y,
        u: [column.start, column.end],
        v: [wallBottom, wallTop], thickness: parameters.dividerThickness,
      });
    }
  }
  return zones;
}
