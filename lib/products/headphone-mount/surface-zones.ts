import { BOOLEAN_OVERLAP } from "../../kernel/overlap";
import type { SurfaceZone } from "../../surface-pattern-plan";
import {
  HOOK_FILLET_MM,
  LIP_THICKNESS_MM,
  POCKET_WALL_MM,
  deriveLayout,
  type HeadphoneMountLayout,
  type HeadphoneMountParameters,
} from "./schema";

/** Plate and optional pocket floor clear of screws, roots, walls, and lips. */
export function surfaceZones(
  parameters: HeadphoneMountParameters,
  layout: HeadphoneMountLayout = deriveLayout(parameters),
): SurfaceZone[] {
  if (!layout.numbersOk) return [];
  const T = parameters.plateThickness;
  const W = parameters.plateWidth;
  const H = parameters.plateHeight;
  const plateEdge = Math.max(parameters.cornerRadius + 0.5, 3);
  const hookTop = Math.max(layout.hookRootTop, layout.hookLipTop);
  const plateKeepouts = [
    ...[layout.lowerScrewZ, layout.upperScrewZ].map((z) => ({
      kind: "circle" as const,
      center: [0, z] as [number, number],
      radius: layout.headDiameter / 2 + 2.5,
    })),
    {
      kind: "rect" as const,
      min: [-parameters.hookWidth / 2 - 2.5, layout.hookArmZ - HOOK_FILLET_MM - 2.5] as [number, number],
      max: [parameters.hookWidth / 2 + 2.5, hookTop + 2.5] as [number, number],
    },
    ...(parameters.controllerPocket ? [{
      kind: "rect" as const,
      min: [-parameters.pocketWidth / 2 - 2.5, layout.pocketZ - HOOK_FILLET_MM - 2.5] as [number, number],
      max: [parameters.pocketWidth / 2 + 2.5, layout.pocketTop + 2.5] as [number, number],
    }] : []),
  ];
  const zones: SurfaceZone[] = [{
    kind: "plane",
    id: "plate",
    axis: "y",
    center: T / 2,
    thickness: T + BOOLEAN_OVERLAP * 2,
    u: [-W / 2 + plateEdge, W / 2 - plateEdge],
    v: [plateEdge, H - plateEdge],
    keepouts: plateKeepouts,
  }];
  if (parameters.controllerPocket) {
    const pocketEdge = POCKET_WALL_MM + 2.5;
    zones.push({
      kind: "plane",
      id: "pocket",
      axis: "z",
      center: layout.pocketZ + parameters.pocketFloor / 2,
      thickness: parameters.pocketFloor + BOOLEAN_OVERLAP * 2,
      u: [-parameters.pocketWidth / 2 + pocketEdge, parameters.pocketWidth / 2 - pocketEdge],
      v: [T + HOOK_FILLET_MM + 2.5,
        T + parameters.pocketDepth - LIP_THICKNESS_MM - parameters.pocketLip - 2.5],
    });
  }
  return zones;
}
