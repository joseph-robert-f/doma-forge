import { ResourceScope } from "../../kernel/ownership";
import { getKernel } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import {
  FIT_TEST_COUPON_HEIGHT,
  QUALITY_SEGMENTS,
  deriveDimensions,
  getCouponWallThickness,
  type DrawerTrayParameters,
} from "./schema";
import { validateDrawerTray } from "./validate";

/** Hidden overlap so Boolean faces never sit exactly coplanar. */
const BOOLEAN_OVERLAP = 0.2;

export {
  FIT_TEST_COUPON_HEIGHT,
  FIT_TEST_COUPON_MINIMUM_WALL,
  getCouponWallThickness,
} from "./schema";

/**
 * Builds the fit-test coupon mesh with no validation step of its own. A
 * caller that has not already checked the parameters can construct a
 * collapsed or otherwise nonsensical ring; this function still guards the
 * one failure a valid drawer-tray parameter set can never trigger but a raw
 * fixture can: a ring wall thick enough to consume the whole opening. Use
 * `generateFitTestCoupon` for the checked entry point; this export exists so
 * a test can trigger the collapse guard directly.
 */
export async function buildFitTestCouponMesh(
  parameters: DrawerTrayParameters,
): Promise<GeneratedModel<DrawerTrayParameters>> {
  const scope = new ResourceScope();
  try {
    const kernel = await getKernel();
    const derived = deriveDimensions(parameters);
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const ringWall = getCouponWallThickness(parameters);

    const outerProfile = scope.own(roundedRectangle(
      kernel,
      derived.outsideWidth,
      derived.outsideDepth,
      parameters.cornerRadius,
      segments,
    ));
    const outer = scope.own(outerProfile.extrude(FIT_TEST_COUPON_HEIGHT));
    scope.delete(outerProfile);

    const innerWidth = derived.outsideWidth - ringWall * 2;
    const innerDepth = derived.outsideDepth - ringWall * 2;
    if (innerWidth <= 0 || innerDepth <= 0) {
      scope.delete(outer);
      throw new Error(
        "The fit-test ring wall leaves no inside opening at this size.",
      );
    }
    const innerRadius = Math.max(0, parameters.cornerRadius - ringWall);
    const innerProfile = scope.own(roundedRectangle(
      kernel,
      innerWidth,
      innerDepth,
      innerRadius,
      segments,
    ));
    // The cavity runs through the whole ring height, with overlap past both
    // faces so the through-hole never leaves a coplanar sliver.
    const cavityHeight = FIT_TEST_COUPON_HEIGHT + BOOLEAN_OVERLAP * 2;
    const cavityAtOrigin = scope.own(innerProfile.extrude(cavityHeight));
    scope.delete(innerProfile);
    const cavity = scope.own(cavityAtOrigin.translate([0, 0, -BOOLEAN_OVERLAP]));
    scope.delete(cavityAtOrigin);

    const ring = scope.own(outer.subtract(cavity));
    scope.delete(outer);
    scope.delete(cavity);

    return finishSolid(scope.take(ring), parameters, "fit-test coupon");
  } finally {
    scope.dispose();
  }
}

/**
 * The checked entry point: a short ring that shares the tray's outside
 * profile, with no base, no dividers, and no scoop. It tests the drawer fit
 * with a small, fast print before the full tray. Coordinates are
 * millimeters, X/Y centered on the origin, matching the tray, with the ring
 * floor at Z = 0 and its top at Z = FIT_TEST_COUPON_HEIGHT.
 */
export async function generateFitTestCoupon(
  parameters: DrawerTrayParameters,
): Promise<GeneratedModel<DrawerTrayParameters>> {
  const validation = validateDrawerTray(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  return buildFitTestCouponMesh(parameters);
}
