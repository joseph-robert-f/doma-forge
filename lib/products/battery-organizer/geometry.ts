import { boreCutter, cutterArray, unionSolids } from "../../kernel/arrays";
import { lightenUnderside } from "../../kernel/lightening";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { polygon } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP, roundedSlab } from "../../kernel/shell";
import {
  FINGER_RELIEF_DEPTH_MM,
  FINGER_RELIEF_WIDEN_MM,
  QUALITY_SEGMENTS,
  cellFootprint,
  deriveLayout,
  lighteningOptions,
  type BatteryOrganizerParameters,
} from "./schema";
import { validateBatteryOrganizer } from "./validate";

type Kernel = Awaited<ReturnType<typeof getKernel>>;

/** A rectangular prism cutter, centered on X and Y, entering the top face. */
function slotCutter(
  kernel: Kernel,
  options: { halfWidth: number; halfLength: number; depth: number; topZ: number },
): Solid {
  const { halfWidth, halfLength, depth, topZ } = options;
  const profile = polygon(kernel, [
    [-halfWidth, -halfLength],
    [halfWidth, -halfLength],
    [halfWidth, halfLength],
    [-halfWidth, halfLength],
  ]);
  const atOrigin = profile.extrude(depth + BOOLEAN_OVERLAP);
  profile.delete();
  const positioned = atOrigin.translate([0, 0, topZ - depth]);
  atOrigin.delete();
  return positioned;
}

/**
 * One well cutter: the main round bore or rectangular slot that holds the
 * cell, plus an optional wider, shallow finger relief counterbore at the
 * top so a fingertip can reach under the cell. The two pieces are unioned
 * at local X = Y = 0, so `cutterArray` can translate whole copies onto the
 * layout grid.
 */
function wellCutter(
  kernel: Kernel,
  parameters: BatteryOrganizerParameters,
  boreDepth: number,
  segments: number,
): Solid {
  const footprint = cellFootprint(
    parameters.cellShape,
    parameters.cellDiameter,
    parameters.cellLength,
    parameters.clearancePerSide,
  );
  const topZ = parameters.organizerHeight;
  const main =
    parameters.cellShape === "round"
      ? boreCutter(kernel, {
          diameter: footprint.semiX * 2,
          depth: boreDepth,
          chamfer: 0,
          segments,
          topZ,
        })
      : slotCutter(kernel, {
          halfWidth: footprint.semiX,
          halfLength: footprint.semiY,
          depth: boreDepth,
          topZ,
        });
  if (!parameters.fingerRelief) return main;

  const widen = FINGER_RELIEF_WIDEN_MM / 2;
  const relief =
    parameters.cellShape === "round"
      ? boreCutter(kernel, {
          diameter: (footprint.semiX + widen) * 2,
          depth: FINGER_RELIEF_DEPTH_MM,
          chamfer: 0,
          segments,
          topZ,
        })
      : slotCutter(kernel, {
          halfWidth: footprint.semiX + widen,
          halfLength: footprint.semiY + widen,
          depth: FINGER_RELIEF_DEPTH_MM,
          topZ,
        });
  return unionSolids(kernel, [main, relief]);
}

/**
 * Builds the organizer as one solid: a rounded slab, minus one batched
 * union of every well cutter, minus the underside pockets. Coordinates are
 * millimeters, X/Y centered on the origin, base at Z = 0. Row 1 is at the
 * front (negative Y).
 */
export async function generateBatteryOrganizer(
  parameters: BatteryOrganizerParameters,
): Promise<GeneratedModel<BatteryOrganizerParameters>> {
  const validation = validateBatteryOrganizer(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getKernel();
  const layout = deriveLayout(parameters);
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];
  const spacing = layout.rowSpacing;
  if (!spacing.ok) throw new Error("The rows do not fit the organizer depth.");

  const slab = roundedSlab(kernel, {
    width: parameters.organizerWidth,
    depth: parameters.organizerDepth,
    height: parameters.organizerHeight,
    cornerRadius: parameters.cornerRadius,
    segments,
  });

  const rowCutters: Solid[] = layout.rowLayouts.map((rowLayout, index) => {
    if (!rowLayout.ok) throw new Error(`Row ${index + 1} does not fit the organizer width.`);
    const centerY = spacing.firstCenter + index * spacing.pitch;
    return cutterArray(
      kernel,
      () => wellCutter(kernel, parameters, layout.boreDepth, segments),
      {
        pitchX: rowLayout.pitch,
        pitchY: 0,
        countX: parameters.cellsPerRow,
        countY: 1,
        origin: [rowLayout.firstCenter, centerY, 0],
      },
    );
  });
  const wells = unionSolids(kernel, rowCutters);
  let solid = slab.subtract(wells);
  wells.delete();
  slab.delete();

  if (parameters.lightenUnderside) {
    solid = lightenUnderside(
      kernel,
      solid,
      lighteningOptions(parameters, segments),
    ).solid;
  }

  return finishSolid(solid, parameters, "organizer");
}
