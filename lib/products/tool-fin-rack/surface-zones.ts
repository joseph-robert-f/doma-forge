import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  FIN_FILLET_WIDTH_MM,
  deriveLayout,
  type ToolFinRackLayout,
  type ToolFinRackParameters,
} from "./schema";

/** Base corridors between fins, excluding each full filleted root. */
export function surfaceZones(
  parameters: ToolFinRackParameters,
  layout: ToolFinRackLayout = deriveLayout(parameters),
): SurfaceZone[] {
  const finLayout = layout.finLayout;
  if (!finLayout.ok) return [];
  const edge = Math.max(parameters.cornerRadius + 0.5, parameters.wallThickness + 2.5);
  const rootHalfX = parameters.finThickness / 2 + FIN_FILLET_WIDTH_MM;
  const rootHalfY = layout.finLength / 2;
  const keepouts = Array.from({ length: parameters.finCount }, (_, index) => {
    const x = finLayout.firstCenter + index * finLayout.pitch;
    return {
      kind: "rect" as const,
      min: [x - rootHalfX, -rootHalfY] as [number, number],
      max: [x + rootHalfX, rootHalfY] as [number, number],
    };
  });
  return [{
    kind: "plane",
    id: "base",
    axis: "z",
    center: parameters.baseThickness / 2,
    thickness: parameters.baseThickness + BOOLEAN_OVERLAP * 2,
    u: [-parameters.rackWidth / 2 + edge, parameters.rackWidth / 2 - edge],
    v: [-parameters.rackDepth / 2 + edge, parameters.rackDepth / 2 - edge],
    keepouts,
  }];
}
