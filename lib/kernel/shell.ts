import { ResourceScope } from "./ownership";
import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import type { Solid } from "./manifold";
import { roundedRectangle } from "./profiles";
import { BOOLEAN_OVERLAP } from "./overlap";

export { BOOLEAN_OVERLAP };

export interface RoundedSlabOptions {
  width: number;
  depth: number;
  height: number;
  cornerRadius: number;
  segments: number;
}

export interface RoundedShellOptions extends RoundedSlabOptions {
  wallThickness: number;
  baseThickness: number;
}

/**
 * The two solids a shell build produces. `outer` is the full extrusion, kept
 * so a product can clip internal features to the outer profile. `shell` is
 * the outer minus the cavity. The caller owns both and deletes both.
 */
export interface ShellSolids {
  outer: Solid;
  shell: Solid;
}

/**
 * A centered rounded rectangle extruded from Z = 0 to `height`. The slab is
 * the starting body of every comb-array product.
 */
export function roundedSlab(
  kernel: ManifoldToplevel,
  options: RoundedSlabOptions,
): Solid {
  const scope = new ResourceScope();
  try {
    const profile = scope.own(roundedRectangle(
      kernel,
      options.width,
      options.depth,
      options.cornerRadius,
      options.segments,
    ));
    const slab = scope.own(profile.extrude(options.height));
    scope.delete(profile);
    return scope.take(slab);
  } finally {
    scope.dispose();
  }
}

/**
 * Extrudes `outerProfile` to `height`, then subtracts `innerProfile` extruded
 * from `baseThickness` up through the top. The cavity overshoots the top by
 * BOOLEAN_OVERLAP so the top faces are never coplanar. Neither profile is
 * deleted here; the caller owns them.
 */
export function shellFromProfiles(
  outerProfile: CrossSection,
  innerProfile: CrossSection,
  height: number,
  baseThickness: number,
): ShellSolids {
  const scope = new ResourceScope();
  try {
    const outer = scope.own(outerProfile.extrude(height));
    const cavityHeight = height - baseThickness + BOOLEAN_OVERLAP;
    const cavityAtOrigin = scope.own(innerProfile.extrude(cavityHeight));
    const cavity = scope.own(cavityAtOrigin.translate([0, 0, baseThickness]));
    scope.delete(cavityAtOrigin);
    const shell = scope.own(outer.subtract(cavity));
    scope.delete(cavity);
    return { outer: scope.take(outer), shell: scope.take(shell) };
  } finally {
    scope.dispose();
  }
}

/**
 * The shelled-tray pattern: a rounded outer extrusion minus an inward-offset
 * cavity. The inner profile is a rounded rectangle smaller by the wall on
 * every side, with the corner radius reduced by the wall and clamped at zero.
 * This is exactly the drawer tray's construction, so a product that moves
 * onto it keeps its mesh.
 */
export function roundedShell(
  kernel: ManifoldToplevel,
  options: RoundedShellOptions,
): ShellSolids {
  const scope = new ResourceScope();
  try {
    const outerProfile = scope.own(roundedRectangle(
      kernel,
      options.width,
      options.depth,
      options.cornerRadius,
      options.segments,
    ));
    const innerProfile = scope.own(roundedRectangle(
      kernel,
      options.width - options.wallThickness * 2,
      options.depth - options.wallThickness * 2,
      Math.max(0, options.cornerRadius - options.wallThickness),
      options.segments,
    ));
    const solids = shellFromProfiles(
      outerProfile,
      innerProfile,
      options.height,
      options.baseThickness,
    );
    scope.own(solids.outer);
    scope.own(solids.shell);
    scope.delete(outerProfile);
    scope.delete(innerProfile);
    scope.take(solids.outer);
    scope.take(solids.shell);
    return solids;
  } finally {
    scope.dispose();
  }
}
