import { ResourceScope } from "./ownership";
import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import { boreCutter, unionSolids } from "./arrays";
import type { Solid } from "./manifold";
import { polygon } from "./profiles";
import { BOOLEAN_OVERLAP } from "./shell";
import { jHookProfilePoints, type JHookProfileOptions } from "./bracket-rules";

/**
 * The bracket family: a back plate against a wall, screw bores with
 * countersinks, hull gussets, and a J-profile hook with a filleted root.
 * The load rules come from 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 2.6.
 * They are validation rules, not warnings: a product refuses to build a hook
 * that breaks one.
 *
 * Coordinates for every builder here: the wall is the plane Y = 0, the plate
 * fills Y from 0 to its thickness, and a hook or a shelf projects along +Y.
 * X runs along the wall and Z is up. A product assembles its part in these
 * coordinates and then turns the whole part 180 degrees about Z, so the
 * finished part hangs on the wall with its hooks toward -Y, the side the
 * viewer's camera faces. It prints with the plate flat on the bed and the
 * hooks up, which is then a turn of -90 degrees about X.
 */

export function jHookProfile(
  kernel: ManifoldToplevel,
  options: JHookProfileOptions,
): CrossSection {
  return polygon(kernel, jHookProfilePoints(options));
}

export interface JHookOptions extends JHookProfileOptions {
  /** The hook width along the wall, centered on X = 0. */
  width: number;
}

/**
 * A profile drawn in the (Y, Z) plane, extruded along X and centered on
 * X = 0. The cross-section's own X and Y become Y and Z; the extrusion
 * becomes X. The caller owns the solid.
 */
export function extrudeAlongX(
  kernel: ManifoldToplevel,
  profile: CrossSection,
  width: number,
): Solid {
  const scope = new ResourceScope();
  try {
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error("extrudeAlongX needs a finite, positive width.");
    }
    const alongZ = scope.own(profile.extrude(width));
    // Local X to Y, local Y to Z, local Z to X: turn 90 about X, then 90 about Z.
    const turned = scope.own(alongZ.rotate([90, 0, 90]));
    scope.delete(alongZ);
    const centered = scope.own(turned.translate([-width / 2, 0, 0]));
    scope.delete(turned);
    return scope.take(centered);
  } finally {
    scope.dispose();
  }
}

/**
 * One J-hook, centered on X = 0, its arm bottom at Z = 0 and its root at the
 * plate face Y = 0. The caller places it and owns it.
 */
export function jHook(kernel: ManifoldToplevel, options: JHookOptions): Solid {
  const scope = new ResourceScope();
  try {
    const profile = scope.own(jHookProfile(kernel, options));
    const solid = scope.own(extrudeAlongX(kernel, profile, options.width));
    scope.delete(profile);
    return scope.take(solid);
  } finally {
    scope.dispose();
  }
}

export interface ScrewCutterOptions {
  /** The through bore. */
  diameter: number;
  /** The countersink diameter at the plate face. */
  headDiameter: number;
  /** The plate thickness along Y. */
  plateThickness: number;
  segments: number;
}

/**
 * A screw cutter through the plate along Y, with a 90 degree countersink
 * that opens on the front face at Y = plateThickness. Its X and Z origin is
 * the screw axis. The caller places it and owns it.
 */
export function screwCutter(
  kernel: ManifoldToplevel,
  options: ScrewCutterOptions,
): Solid {
  const scope = new ResourceScope();
  try {
    const { diameter, headDiameter, plateThickness, segments } = options;
    if (
      ![diameter, headDiameter, plateThickness].every((value) =>
        Number.isFinite(value),
      ) ||
      diameter <= 0 ||
      headDiameter < diameter ||
      plateThickness <= 0
    ) {
      throw new Error(
        "screwCutter needs a finite bore, a head at least as wide, and a plate.",
      );
    }
    const alongZ = scope.own(boreCutter(kernel, {
      diameter,
      depth: plateThickness + BOOLEAN_OVERLAP,
      chamfer: (headDiameter - diameter) / 2,
      segments,
      topZ: plateThickness,
    }));
    // Turn -90 about X: local +Z becomes +Y, so the countersink faces +Y.
    const alongY = scope.own(alongZ.rotate([-90, 0, 0]));
    scope.delete(alongZ);
    return scope.take(alongY);
  } finally {
    scope.dispose();
  }
}

/**
 * The cutters for every screw, unioned into one solid. Each position is
 * (X, Z) on the plate. The caller subtracts it from the plate and owns it.
 */
export function screwCutters(
  kernel: ManifoldToplevel,
  positions: ReadonlyArray<readonly [number, number]>,
  options: ScrewCutterOptions,
): Solid {
  const scope = new ResourceScope();
  try {
    if (positions.length === 0)
      throw new Error("screwCutters needs at least one screw.");
    const template = scope.own(screwCutter(kernel, options));
    const placed = positions.map(([x, z]) => scope.own(template.translate([x, 0, z])));
    scope.delete(template);
    return unionSolids(kernel, scope.takeAll(placed));
  } finally {
    scope.dispose();
  }
}

export interface HullGussetOptions {
  /** The gusset thickness along X. */
  thickness: number;
  /** How far the gusset runs down the plate face from the shelf underside. */
  rise: number;
  /** How far the gusset runs out under the shelf from the plate face. */
  run: number;
  /** How far the gusset reaches into the plate and the shelf. */
  overlap: number;
}

/**
 * A triangular web between a plate face at Y = 0 and a shelf underside at
 * Z = 0: the hull of a thin strip on the plate and a thin strip under the
 * shelf. Centered on X = 0. The face between the two strips is the
 * hypotenuse, which faces out and down on the wall and out and up on the
 * bed. The caller places it and owns it.
 */
export function hullGusset(
  kernel: ManifoldToplevel,
  options: HullGussetOptions,
): Solid {
  const scope = new ResourceScope();
  try {
    const { thickness, rise, run, overlap } = options;
    if (
      ![thickness, rise, run, overlap].every((value) => Number.isFinite(value)) ||
      thickness <= 0 ||
      rise <= 0 ||
      run <= 0 ||
      overlap < 0
    ) {
      throw new Error(
        "hullGusset needs a finite, positive thickness, rise, and run.",
      );
    }
    // The two strips lie inside the wedge's own outline, Y from -overlap to
    // run and Z from -rise to overlap, so the hull adds nothing outside it.
    const skin = 0.01;
    const underShelfAtOrigin = scope.own(kernel.Manifold.cube(
      [thickness, run + overlap, skin],
      true,
    ));
    const underShelf = scope.own(underShelfAtOrigin.translate([
      0,
      (run - overlap) / 2,
      overlap - skin / 2,
    ]));
    scope.delete(underShelfAtOrigin);
    const onPlateAtOrigin = scope.own(kernel.Manifold.cube(
      [thickness, skin, rise + overlap],
      true,
    ));
    const onPlate = scope.own(onPlateAtOrigin.translate([
      0,
      -overlap + skin / 2,
      (overlap - rise) / 2,
    ]));
    scope.delete(onPlateAtOrigin);
    const wedge = scope.own(kernel.Manifold.hull([underShelf, onPlate]));
    scope.delete(underShelf);
    scope.delete(onPlate);
    return scope.take(wedge);
  } finally {
    scope.dispose();
  }
}
