import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import type { Solid } from "./manifold";
import { roundedRectangle } from "./profiles";

/**
 * Hidden overlap so Boolean faces never sit exactly coplanar. Every kernel
 * module and every product uses this one value.
 */
export const BOOLEAN_OVERLAP = 0.2;

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
  const profile = roundedRectangle(
    kernel,
    options.width,
    options.depth,
    options.cornerRadius,
    options.segments,
  );
  const slab = profile.extrude(options.height);
  profile.delete();
  return slab;
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
  const outer = outerProfile.extrude(height);
  const cavityHeight = height - baseThickness + BOOLEAN_OVERLAP;
  const cavityAtOrigin = innerProfile.extrude(cavityHeight);
  const cavity = cavityAtOrigin.translate([0, 0, baseThickness]);
  cavityAtOrigin.delete();
  const shell = outer.subtract(cavity);
  cavity.delete();
  return { outer, shell };
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
  const outerProfile = roundedRectangle(
    kernel,
    options.width,
    options.depth,
    options.cornerRadius,
    options.segments,
  );
  const innerProfile = roundedRectangle(
    kernel,
    options.width - options.wallThickness * 2,
    options.depth - options.wallThickness * 2,
    Math.max(0, options.cornerRadius - options.wallThickness),
    options.segments,
  );
  const solids = shellFromProfiles(
    outerProfile,
    innerProfile,
    options.height,
    options.baseThickness,
  );
  outerProfile.delete();
  innerProfile.delete();
  return solids;
}
