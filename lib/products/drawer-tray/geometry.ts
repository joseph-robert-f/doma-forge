import { drawerTraySurfaceZones, getFingerScoopRadius } from "./surface-zones";
import { ResourceScope } from "../../kernel/ownership";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { BOOLEAN_OVERLAP, roundedShell } from "../../kernel/shell";
import { applySurfacePatterns } from "../../kernel/surface-pattern";
import {
  QUALITY_SEGMENTS,
  deriveDimensions,
  type DrawerTrayParameters,
} from "./schema";
import { validateDrawerTray } from "./validate";


/**
 * Builds the tray as one solid: the rounded shell from the kernel's shell
 * module, plus dividers clipped to the outer profile, minus the optional
 * front finger scoop. Coordinates are millimeters, X/Y centered on
 * the origin, base at Z = 0.
 */
export async function generateDrawerTray(
  parameters: DrawerTrayParameters,
): Promise<GeneratedModel<DrawerTrayParameters>> {
  const scope = new ResourceScope();
  try {
    const validation = validateDrawerTray(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }

    const kernel = await getKernel();
    const derived = deriveDimensions(parameters);
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];

    // The shell module reproduces the original construction step for step:
    // rounded outer extrusion minus the inward-offset cavity. See
    // 20_KERNEL_MODULES_NOTES.md, decision D-901.
    const { outer, shell } = roundedShell(kernel, {
      width: derived.outsideWidth,
      depth: derived.outsideDepth,
      height: parameters.organizerHeight,
      cornerRadius: parameters.cornerRadius,
      wallThickness: parameters.wallThickness,
      baseThickness: parameters.baseThickness,
      segments,
    });
    scope.own(outer);
    scope.own(shell);
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
      const dividerAtOrigin = scope.own(kernel.Manifold.cube(size, true));
      const positionedDivider = scope.own(dividerAtOrigin.translate(center));
      scope.delete(dividerAtOrigin);
      const clippedDivider = scope.own(positionedDivider.intersect(outer));
      scope.delete(positionedDivider);
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
      solid = scope.own(kernel.Manifold.union(unionInputs));
      for (const input of unionInputs) scope.delete(input);
    }
    scope.delete(outer);

    if (parameters.fingerScoop) {
      const scoopRadius = getFingerScoopRadius(parameters);
      const cutterAtOrigin = scope.own(kernel.Manifold.cylinder(
        parameters.wallThickness + BOOLEAN_OVERLAP * 4,
        scoopRadius,
        scoopRadius,
        segments,
        true,
      ));
      const rotatedCutter = scope.own(cutterAtOrigin.rotate([90, 0, 0]));
      scope.delete(cutterAtOrigin);
      const positionedCutter = scope.own(rotatedCutter.translate([
        0,
        -derived.outsideDepth / 2 + parameters.wallThickness / 2,
        parameters.organizerHeight,
      ]));
      scope.delete(rotatedCutter);
      const scooped = scope.own(solid.subtract(positionedCutter));
      scope.delete(solid);
      scope.delete(positionedCutter);
      solid = scooped;
    }

    solid = applySurfacePatterns(kernel, scope, solid, parameters.surfaceTreatments, drawerTraySurfaceZones(parameters));
    return finishSolid(scope.take(solid), parameters, "organizer");
  } finally {
    scope.dispose();
  }
}

export { getFingerScoopRadius };
