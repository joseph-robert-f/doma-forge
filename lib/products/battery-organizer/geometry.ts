import { ResourceScope } from "../../kernel/ownership";
import { boreCutter, cutterArray, unionSolids } from "../../kernel/arrays";
import { lightenUnderside } from "../../kernel/lightening";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { polygon } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP, roundedSlab } from "../../kernel/shell";
import { applySurfacePatterns } from "../../kernel/surface-pattern";
import { surfaceZones } from "./surface-zones";
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
  const scope = new ResourceScope();
  try {
    const { halfWidth, halfLength, depth, topZ } = options;
    const profile = scope.own(polygon(kernel, [
      [-halfWidth, -halfLength],
      [halfWidth, -halfLength],
      [halfWidth, halfLength],
      [-halfWidth, halfLength],
    ]));
    const atOrigin = scope.own(profile.extrude(depth + BOOLEAN_OVERLAP));
    scope.delete(profile);
    const positioned = scope.own(atOrigin.translate([0, 0, topZ - depth]));
    scope.delete(atOrigin);
    return scope.take(positioned);
  } finally {
    scope.dispose();
  }
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
  const scope = new ResourceScope();
  try {
    const footprint = cellFootprint(
      parameters.cellShape,
      parameters.cellDiameter,
      parameters.cellLength,
      parameters.clearancePerSide,
    );
    const topZ = parameters.organizerHeight;
    const main =
      parameters.cellShape === "round"
        ? scope.own(boreCutter(kernel, {
          diameter: footprint.semiX * 2,
          depth: boreDepth,
          chamfer: 0,
          segments,
          topZ,
        }))
        : scope.own(slotCutter(kernel, {
          halfWidth: footprint.semiX,
          halfLength: footprint.semiY,
          depth: boreDepth,
          topZ,
        }));
    if (!parameters.fingerRelief) return scope.take(main);

    const widen = FINGER_RELIEF_WIDEN_MM / 2;
    const relief =
      parameters.cellShape === "round"
        ? scope.own(boreCutter(kernel, {
          diameter: (footprint.semiX + widen) * 2,
          depth: FINGER_RELIEF_DEPTH_MM,
          chamfer: 0,
          segments,
          topZ,
        }))
        : scope.own(slotCutter(kernel, {
          halfWidth: footprint.semiX + widen,
          halfLength: footprint.semiY + widen,
          depth: FINGER_RELIEF_DEPTH_MM,
          topZ,
        }));
    return unionSolids(kernel, scope.takeAll([main, relief]));
  } finally {
    scope.dispose();
  }
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
  const scope = new ResourceScope();
  try {
    const validation = validateBatteryOrganizer(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }

    const kernel = await getKernel();
    const layout = deriveLayout(parameters);
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const spacing = layout.rowSpacing;
    if (!spacing.ok) throw new Error("The rows do not fit the organizer depth.");

    const slab = scope.own(roundedSlab(kernel, {
      width: parameters.organizerWidth,
      depth: parameters.organizerDepth,
      height: parameters.organizerHeight,
      cornerRadius: parameters.cornerRadius,
      segments,
    }));

    const rowCutters: Solid[] = layout.rowLayouts.map((rowLayout, index) => {
      if (!rowLayout.ok) throw new Error(`Row ${index + 1} does not fit the organizer width.`);
      const centerY = spacing.firstCenter + index * spacing.pitch;
      return scope.own(cutterArray(
        kernel,
        () => wellCutter(kernel, parameters, layout.boreDepth, segments),
        {
          pitchX: rowLayout.pitch,
          pitchY: 0,
          countX: parameters.cellsPerRow,
          countY: 1,
          origin: [rowLayout.firstCenter, centerY, 0],
        },
      ));
    });
    const wells = scope.own(unionSolids(kernel, scope.takeAll(rowCutters)));
    let solid = scope.own(slab.subtract(wells));
    scope.delete(wells);
    scope.delete(slab);

    const patterningBase = parameters.surfaceTreatments.enabled &&
      parameters.surfaceTreatments.zones.base.mode !== "solid";
    if (parameters.lightenUnderside && !patterningBase) {
      const options = lighteningOptions(parameters, segments);
      solid = scope.own(lightenUnderside(kernel, scope.take(solid), options).solid);
    }

    solid = applySurfacePatterns(kernel, scope, solid, parameters.surfaceTreatments,
      surfaceZones(parameters, layout));

    return finishSolid(scope.take(solid), parameters, "organizer");
  } finally {
    scope.dispose();
  }
}
