import { ResourceScope } from "./ownership";
import type { ManifoldToplevel } from "manifold-3d";
import type { Solid } from "./manifold";
import { polygon } from "./profiles";
import type { ProfilePoint, VesselProfile } from "./vessel-profile";

/**
 * Revolved forms. A product builds a two-dimensional profile in the XZ
 * half-plane, where the first number is the radius and the second is the
 * height, and revolves it about the Z axis. `CrossSection.revolve` turns the
 * cross-section's own Y axis into the model's Z axis, so a profile point
 * `[radius, height]` needs no transform.
 *
 * All lengths are millimeters. Every function that returns a solid gives the
 * caller the only reference. The caller deletes it.
 */
/**
 * Revolves a profile about the Z axis. The profile's first number is the
 * radius and the second is the height. The cross-section is deleted here.
 */
export function revolveProfile(
  kernel: ManifoldToplevel,
  points: ReadonlyArray<ProfilePoint>,
  segments: number,
  revolveDegrees = 360,
): Solid {
  const scope = new ResourceScope();
  try {
    const section = scope.own(polygon(kernel, points));
    const solid = scope.own(section.revolve(segments, revolveDegrees));
    scope.delete(section);
    return scope.take(solid);
  } finally {
    scope.dispose();
  }
}

/** The three solids a revolved shell build produces. The caller deletes all three. */
export interface RevolvedShell {
  /** The full revolved outer body, kept so a product can clip a feature to it. */
  outer: Solid;
  /** The revolved cavity, kept so a product can clip a feature inside it. */
  cavity: Solid;
  /** The outer body minus the cavity. */
  shell: Solid;
}

/**
 * Revolves the outer profile, revolves the cavity profile, and subtracts the
 * second from the first. This is the revolved counterpart of
 * `shellFromProfiles` in `shell.ts`.
 */
export function revolveShell(
  kernel: ManifoldToplevel,
  profile: VesselProfile,
  segments: number,
): RevolvedShell {
  const scope = new ResourceScope();
  try {
    const outer = scope.own(revolveProfile(kernel, profile.outer, segments));
    const cavity = scope.own(revolveProfile(kernel, profile.inner, segments));
    const shell = scope.own(outer.subtract(cavity));
    return { outer: scope.take(outer), cavity: scope.take(cavity), shell: scope.take(shell) };
  } finally {
    scope.dispose();
  }
}
