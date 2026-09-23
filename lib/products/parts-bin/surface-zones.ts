import type { SurfaceZone } from "../../surface-pattern-plan";
import { LABEL_LEDGE_HEIGHT_MM, deriveLayout, type PartsBinParameters } from "./schema";

export function partsBinSurfaceZones(parameters: PartsBinParameters): SurfaceZone[] {
  const layout = deriveLayout(parameters);
  const straightX = Math.max(0, layout.bodyWidth / 2 - parameters.cornerRadius - 2);
  const straightY = Math.max(0, layout.bodyDepth / 2 - parameters.cornerRadius - 2);
  const wallBottom = Math.max(
    parameters.baseThickness + 2,
    parameters.labelLedge ? LABEL_LEDGE_HEIGHT_MM + 2 : 0,
  );
  const wallTop = layout.bodyHeight - 2;
  const zones: SurfaceZone[] = [{
    kind: "plane", id: "floor", axis: "z", center: parameters.baseThickness / 2,
    u: [-layout.insideWidth / 2, layout.insideWidth / 2],
    v: [-layout.insideDepth / 2, layout.insideDepth / 2],
    thickness: parameters.baseThickness,
    boundary: {
      kind: "roundedRect",
      min: [-layout.insideWidth / 2, -layout.insideDepth / 2],
      max: [layout.insideWidth / 2, layout.insideDepth / 2],
      radius: Math.max(0, parameters.cornerRadius - parameters.wallThickness),
    },
  }];
  for (const side of [-1, 1]) {
    zones.push({
      kind: "plane", id: "walls", axis: "y",
      center: side * (layout.bodyDepth / 2 - parameters.wallThickness / 2),
      u: [-straightX, straightX], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness,
      keepouts: side < 0 && parameters.frontScoop
        ? [{ kind: "circle", center: [0, layout.bodyHeight], radius: layout.scoopRadius + 2 }]
        : [],
    });
    zones.push({
      kind: "plane", id: "walls", axis: "x",
      center: side * (layout.bodyWidth / 2 - parameters.wallThickness / 2),
      u: [-straightY, straightY], v: [wallBottom, wallTop],
      thickness: parameters.wallThickness,
    });
  }
  return zones;
}
