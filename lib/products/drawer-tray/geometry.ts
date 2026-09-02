import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import {
  QUALITY_SEGMENTS,
  deriveDimensions,
  type DrawerTrayParameters,
} from "./schema";
import { validateDrawerTray } from "./validate";

/** Hidden overlap so Boolean faces never sit exactly coplanar. */
const BOOLEAN_OVERLAP = 0.2;

export function getFingerScoopRadius(parameters: DrawerTrayParameters): number {
  const derived = deriveDimensions(parameters);
  const availableWallHeight =
    parameters.organizerHeight - parameters.baseThickness;
  return Math.max(
    1.5,
    Math.min(12, derived.outsideWidth * 0.075, availableWallHeight - 2),
  );
}

/**
 * Builds the tray as one solid: a rounded outer extrusion, minus an exact
 * inward-offset cavity, plus dividers clipped to the outer profile, minus the
 * optional front finger scoop. Coordinates are millimeters, X/Y centered on
 * the origin, base at Z = 0.
 */
export async function generateDrawerTray(
  parameters: DrawerTrayParameters,
): Promise<GeneratedModel<DrawerTrayParameters>> {
  const validation = validateDrawerTray(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getKernel();
  const derived = deriveDimensions(parameters);
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];

  const outerProfile = roundedRectangle(
    kernel,
    derived.outsideWidth,
    derived.outsideDepth,
    parameters.cornerRadius,
    segments,
  );
  const outer = outerProfile.extrude(parameters.organizerHeight);
  outerProfile.delete();

  const innerWidth = derived.outsideWidth - parameters.wallThickness * 2;
  const innerDepth = derived.outsideDepth - parameters.wallThickness * 2;
  const innerRadius = Math.max(
    0,
    parameters.cornerRadius - parameters.wallThickness,
  );
  const cavityHeight =
    parameters.organizerHeight - parameters.baseThickness + BOOLEAN_OVERLAP;
  const innerProfile = roundedRectangle(
    kernel,
    innerWidth,
    innerDepth,
    innerRadius,
    segments,
  );
  const cavityAtOrigin = innerProfile.extrude(cavityHeight);
  innerProfile.delete();
  const cavity = cavityAtOrigin.translate([0, 0, parameters.baseThickness]);
  cavityAtOrigin.delete();

  const shell = outer.subtract(cavity);
  cavity.delete();
  const unionInputs: Solid[] = [shell];
  const dividerHeight =
    parameters.organizerHeight - parameters.baseThickness + BOOLEAN_OVERLAP * 2;
  const dividerCenterZ =
    parameters.baseThickness +
    (parameters.organizerHeight - parameters.baseThickness) / 2;

  const addClippedDivider = (
    size: [number, number, number],
    center: [number, number, number],
  ) => {
    const dividerAtOrigin = kernel.Manifold.cube(size, true);
    const positionedDivider = dividerAtOrigin.translate(center);
    dividerAtOrigin.delete();
    const clippedDivider = positionedDivider.intersect(outer);
    positionedDivider.delete();
    unionInputs.push(clippedDivider);
  };

  for (let column = 1; column < parameters.columns; column += 1) {
    const centerX =
      -derived.outsideWidth / 2 +
      parameters.wallThickness +
      column * (derived.compartmentWidth + parameters.dividerThickness) -
      parameters.dividerThickness / 2;
    addClippedDivider(
      [
        parameters.dividerThickness,
        derived.outsideDepth + BOOLEAN_OVERLAP * 2,
        dividerHeight,
      ],
      [centerX, 0, dividerCenterZ],
    );
  }

  for (let row = 1; row < parameters.rows; row += 1) {
    const centerY =
      -derived.outsideDepth / 2 +
      parameters.wallThickness +
      row * (derived.compartmentDepth + parameters.dividerThickness) -
      parameters.dividerThickness / 2;
    addClippedDivider(
      [
        derived.outsideWidth + BOOLEAN_OVERLAP * 2,
        parameters.dividerThickness,
        dividerHeight,
      ],
      [0, centerY, dividerCenterZ],
    );
  }

  let solid: Solid;
  if (unionInputs.length === 1) {
    solid = shell;
  } else {
    solid = kernel.Manifold.union(unionInputs);
    for (const input of unionInputs) input.delete();
  }
  outer.delete();

  if (parameters.fingerScoop) {
    const scoopRadius = getFingerScoopRadius(parameters);
    const cutterAtOrigin = kernel.Manifold.cylinder(
      parameters.wallThickness + BOOLEAN_OVERLAP * 4,
      scoopRadius,
      scoopRadius,
      segments,
      true,
    );
    const rotatedCutter = cutterAtOrigin.rotate([90, 0, 0]);
    cutterAtOrigin.delete();
    const positionedCutter = rotatedCutter.translate([
      0,
      -derived.outsideDepth / 2 + parameters.wallThickness / 2,
      parameters.organizerHeight,
    ]);
    rotatedCutter.delete();
    const scooped = solid.subtract(positionedCutter);
    solid.delete();
    positionedCutter.delete();
    solid = scooped;
  }

  return finishSolid(solid, parameters, "organizer");
}
