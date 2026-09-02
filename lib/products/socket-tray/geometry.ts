import { boreCutter, cutterArray, unionSolids } from "../../kernel/arrays";
import { lightenUnderside } from "../../kernel/lightening";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedSlab } from "../../kernel/shell";
import {
  CHAMFER_MM,
  QUALITY_SEGMENTS,
  deriveLayout,
  lighteningOptions,
  type SocketTrayParameters,
} from "./schema";
import { validateSocketTray } from "./validate";

/**
 * Builds the tray as one solid: a rounded slab, minus one batched union of
 * every bore cutter, minus the underside pockets. Coordinates are
 * millimeters, X/Y centered on the origin, base at Z = 0. Row 1 is at the
 * front (negative Y).
 */
export async function generateSocketTray(
  parameters: SocketTrayParameters,
): Promise<GeneratedModel<SocketTrayParameters>> {
  const validation = validateSocketTray(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];
  const spacing = layout.rowSpacing;
  if (!spacing.ok) throw new Error("The rows do not fit the tray depth.");

  const slab = roundedSlab(kernel, {
    width: parameters.trayWidth,
    depth: parameters.trayDepth,
    height: parameters.trayHeight,
    cornerRadius: parameters.cornerRadius,
    segments,
  });

  const rowCutters: Solid[] = layout.rowLayouts.map((rowLayout, index) => {
    if (!rowLayout.ok) throw new Error(`Row ${index + 1} does not fit the tray width.`);
    const diameter = layout.rowDiameters[index];
    const centerY = spacing.firstCenter + index * spacing.pitch;
    return cutterArray(
      kernel,
      () =>
        boreCutter(kernel, {
          diameter,
          depth: parameters.boreDepth,
          chamfer: parameters.chamfer ? CHAMFER_MM : 0,
          segments,
          topZ: parameters.trayHeight,
        }),
      {
        pitchX: rowLayout.pitch,
        pitchY: 0,
        countX: parameters.holesPerRow,
        countY: 1,
        origin: [rowLayout.firstCenter, centerY, 0],
      },
    );
  });
  const bores = unionSolids(kernel, rowCutters);
  let solid = slab.subtract(bores);
  bores.delete();
  slab.delete();

  if (parameters.lightenUnderside) {
    solid = lightenUnderside(
      kernel,
      solid,
      lighteningOptions(parameters, segments),
    ).solid;
  }

  return finishSolid(solid, parameters, "tray");
}
