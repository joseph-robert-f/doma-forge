import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  CHAMFER_MM,
  deriveLayout,
  type SocketTrayLayout,
  type SocketTrayParameters,
} from "./schema";

/** Spare base material; every socket bore and its supporting column stay solid. */
export function surfaceZones(
  parameters: SocketTrayParameters,
  layout: SocketTrayLayout = deriveLayout(parameters),
): SurfaceZone[] {
  const spacing = layout.rowSpacing;
  if (!spacing.ok) return [];
  const edge = Math.max(parameters.cornerRadius + 0.5, parameters.wallThickness + 2.5);
  const keepouts = layout.rowLayouts.flatMap((rowLayout, row) => {
    if (!rowLayout.ok) return [];
    const y = spacing.firstCenter + row * spacing.pitch;
    const radius = layout.rowDiameters[row] / 2 +
      (parameters.chamfer ? CHAMFER_MM : 0);
    return Array.from({ length: parameters.holesPerRow }, (_, column) => ({
      kind: "circle" as const,
      center: [rowLayout.firstCenter + column * rowLayout.pitch, y] as [number, number],
      radius,
    }));
  });
  return [{
    kind: "plane",
    id: "base",
    axis: "z",
    center: parameters.trayHeight / 2,
    thickness: parameters.trayHeight + BOOLEAN_OVERLAP * 2,
    u: [-parameters.trayWidth / 2 + edge, parameters.trayWidth / 2 - edge],
    v: [-parameters.trayDepth / 2 + edge, parameters.trayDepth / 2 - edge],
    keepouts,
  }];
}
