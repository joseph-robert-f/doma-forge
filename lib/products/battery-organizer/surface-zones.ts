import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  FINGER_RELIEF_WIDEN_MM,
  cellFootprint,
  deriveLayout,
  type BatteryOrganizerLayout,
  type BatteryOrganizerParameters,
} from "./schema";

/** Spare base material outside all well and finger-relief footprints. */
export function surfaceZones(
  parameters: BatteryOrganizerParameters,
  layout: BatteryOrganizerLayout = deriveLayout(parameters),
): SurfaceZone[] {
  const spacing = layout.rowSpacing;
  if (!spacing.ok) return [];
  const edge = Math.max(parameters.cornerRadius + 0.5, parameters.wallThickness + 2.5);
  const footprint = cellFootprint(
    parameters.cellShape,
    parameters.cellDiameter,
    parameters.cellLength,
    parameters.clearancePerSide,
  );
  const relief = parameters.fingerRelief ? FINGER_RELIEF_WIDEN_MM / 2 : 0;
  const keepouts = layout.rowLayouts.flatMap((rowLayout, row) => {
    if (!rowLayout.ok) return [];
    const y = spacing.firstCenter + row * spacing.pitch;
    return Array.from({ length: parameters.cellsPerRow }, (_, column) => {
      const x = rowLayout.firstCenter + column * rowLayout.pitch;
      const halfX = footprint.semiX + relief;
      const halfY = footprint.semiY + relief;
      return {
        kind: "rect" as const,
        min: [x - halfX, y - halfY] as [number, number],
        max: [x + halfX, y + halfY] as [number, number],
      };
    });
  });
  return [{
    kind: "plane",
    id: "base",
    axis: "z",
    center: parameters.organizerHeight / 2,
    thickness: parameters.organizerHeight + BOOLEAN_OVERLAP * 2,
    u: [-parameters.organizerWidth / 2 + edge, parameters.organizerWidth / 2 - edge],
    v: [-parameters.organizerDepth / 2 + edge, parameters.organizerDepth / 2 - edge],
    keepouts,
  }];
}
