import { ResourceScope } from "../../kernel/ownership";
import type { ManifoldToplevel } from "manifold-3d";
import { cutterArray } from "../../kernel/arrays";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { polygon } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP, roundedSlab } from "../../kernel/shell";
import { applySurfacePatterns } from "../../kernel/surface-pattern";
import { surfaceZones } from "./surface-zones";
import {
  QUALITY_SEGMENTS,
  deriveCardHolderLayout,
  type CardHolderParameters,
} from "./schema";
import { validateCardHolder } from "./validate";

export interface SlotCutterOptions {
  /** The gap the card sits in: card thickness plus the clearance. */
  slotWidth: number;
  /** The slot's length along Y: card width plus the clearance. */
  slotLength: number;
  /** How far the slot goes down from the top face, measured vertically. */
  slotDepth: number;
  /** Lean from vertical, in degrees. The slot leans toward −X as it goes down. */
  tiltDegrees: number;
  /** Z of the face the slot enters. The cutter overshoots it. */
  topZ: number;
}

/**
 * One tilted slot cutter: a rectangular prism, leaned about the Y axis, whose
 * lowest point sits exactly `slotDepth` below `topZ` and whose whole top face
 * clears `topZ` by the hidden overlap. Its X and Y origin is the point where
 * the slot's own axis meets the top face, so it drops straight into
 * `cutterArray`.
 */
export function slotCutter(
  kernel: ManifoldToplevel,
  options: SlotCutterOptions,
): Solid {
  const scope = new ResourceScope();
  try {
    const radians = (options.tiltDegrees * Math.PI) / 180;
    const sine = Math.sin(radians);
    const cosine = Math.cos(radians);
    const half = options.slotWidth / 2;
    // Length below the pivot along the slot's own axis, and the overshoot above
    // it. Both come from the requirement that the deepest corner lands on
    // topZ − slotDepth and the shallowest top corner lands on topZ + overlap.
    const below = (options.slotDepth - half * sine) / cosine;
    const above = (BOOLEAN_OVERLAP + half * sine) / cosine;
    const profile = scope.own(polygon(kernel, [
      [-half, -options.slotLength / 2],
      [half, -options.slotLength / 2],
      [half, options.slotLength / 2],
      [-half, options.slotLength / 2],
    ]));
    const upright = scope.own(profile.extrude(below + above));
    scope.delete(profile);
    const lowered = scope.own(upright.translate([0, 0, -below]));
    scope.delete(upright);
    const tilted = scope.own(lowered.rotate([0, options.tiltDegrees, 0]));
    scope.delete(lowered);
    const placed = scope.own(tilted.translate([0, 0, options.topZ]));
    scope.delete(tilted);
    return scope.take(placed);
  } finally {
    scope.dispose();
  }
}

/**
 * Builds the holder as one solid: a rounded slab, minus one batched union of
 * every slot cutter. Coordinates are millimeters, X/Y centered on the origin,
 * base at Z = 0. Slot 1 is at the left (negative X).
 */
export async function generateCardHolder(
  parameters: CardHolderParameters,
): Promise<GeneratedModel<CardHolderParameters>> {
  const scope = new ResourceScope();
  try {
    const validation = validateCardHolder(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }

    const kernel = await getKernel();
    const layout = deriveCardHolderLayout(parameters);
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    if (!layout.pitch.ok) throw new Error("The slots do not fit the holder width.");

    const slab = scope.own(roundedSlab(kernel, {
      width: parameters.holderWidth,
      depth: parameters.holderDepth,
      height: parameters.holderHeight,
      cornerRadius: parameters.cornerRadius,
      segments,
    }));

    // The pitch solver lays out the slot footprints. The cutter's own origin is
    // the point where the slot axis meets the top face, and a tilted slot is
    // not centered on that point, so the layout's pivot offset moves it.
    const firstPivotX = layout.pitch.firstCenter + layout.pivotOffset;
    const slots = scope.own(cutterArray(
      kernel,
      () =>
        slotCutter(kernel, {
          slotWidth: layout.slotWidth,
          slotLength: layout.slotLength,
          slotDepth: parameters.slotDepth,
          tiltDegrees: parameters.slotTilt,
          topZ: parameters.holderHeight,
        }),
      {
        pitchX: layout.pitch.pitch,
        pitchY: 0,
        countX: Math.round(parameters.slotCount),
        countY: 1,
        origin: [firstPivotX, 0, 0],
      },
    ));
    let solid = scope.own(slab.subtract(slots));
    scope.delete(slots);
    scope.delete(slab);

    solid = applySurfacePatterns(kernel, scope, solid, parameters.surfaceTreatments,
      surfaceZones(parameters, layout));

    return finishSolid(scope.take(solid), parameters, "holder");
  } finally {
    scope.dispose();
  }
}
