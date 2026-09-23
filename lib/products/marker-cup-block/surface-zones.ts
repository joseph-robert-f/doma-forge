import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  CHAMFER_MM,
  deriveLayout,
  type MarkerCupBlockLayout,
  type MarkerCupBlockParameters,
} from "./schema";

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Bounds the swept mouth-to-floor footprint of every tilted cup. */
export function surfaceZones(
  parameters: MarkerCupBlockParameters,
  layout: MarkerCupBlockLayout = deriveLayout(parameters),
): SurfaceZone[] {
  const spacing = layout.rowSpacing;
  if (!spacing.ok) return [];
  const edge = Math.max(parameters.cornerRadius + 0.5, parameters.wallThickness + 2.5);
  const boreRadius = parameters.boreDiameter / 2 +
    (parameters.chamfer ? CHAMFER_MM : 0);
  const tilt = parameters.tiltDegrees * DEGREES_TO_RADIANS;
  const mouthHalfY = boreRadius / Math.cos(tilt);
  const floorOffsetY = parameters.boreDepth * Math.sin(tilt);
  const floorHalfY = parameters.boreDiameter / 2 * Math.cos(tilt);
  const keepouts = layout.rowLayouts.flatMap((rowLayout, row) => {
    if (!rowLayout.ok) return [];
    const y = spacing.firstCenter + row * spacing.pitch;
    return Array.from({ length: parameters.cupsPerRow }, (_, column) => {
      const x = rowLayout.firstCenter + column * rowLayout.pitch;
      const minY = Math.min(y - mouthHalfY, y - floorOffsetY - floorHalfY) - 0.5;
      const maxY = Math.max(y + mouthHalfY, y - floorOffsetY + floorHalfY) + 0.5;
      return {
        kind: "rect" as const,
        min: [x - boreRadius - 0.5, minY] as [number, number],
        max: [x + boreRadius + 0.5, maxY] as [number, number],
      };
    });
  });
  return [{
    kind: "plane",
    id: "base",
    axis: "z",
    center: parameters.blockHeight / 2,
    thickness: parameters.blockHeight + BOOLEAN_OVERLAP * 2,
    u: [-parameters.blockWidth / 2 + edge, parameters.blockWidth / 2 - edge],
    v: [-parameters.blockDepth / 2 + edge, parameters.blockDepth / 2 - edge],
    keepouts,
  }];
}
