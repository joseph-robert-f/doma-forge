import { plantPotSurfaceZones } from "./surface-zones";
import { ResourceScope } from "../../kernel/ownership";
import { unionSolids } from "../../kernel/arrays";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { revolveShell } from "../../kernel/revolve";
import { BOOLEAN_OVERLAP } from "../../kernel/shell";
import { applySurfacePatterns } from "../../kernel/surface-pattern";
import {
  QUALITY_SEGMENTS,
  derivePotLayout,
  drainHoleCenters,
  type PlantPotParameters,
} from "./schema";
import { validatePlantPot } from "./validate";

/**
 * Builds the pot as one solid: a revolved shell, minus one batched union of
 * the drainage holes. Every hole is a plain cylinder through the flat base,
 * so every hole bridges nothing and the pot prints upright without supports.
 * Coordinates are millimeters, the axis is Z, and the base sits at Z = 0.
 */
export async function generatePlantPot(
  parameters: PlantPotParameters,
): Promise<GeneratedModel<PlantPotParameters>> {
  const scope = new ResourceScope();
  try {
    const validation = validatePlantPot(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }

    const kernel = await getKernel();
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const layout = derivePotLayout(parameters, segments);
    const profile = layout.profile;
    if (!profile) throw new Error("These settings do not make a pot.");

    const built = revolveShell(kernel, profile, segments);
    scope.own(built.outer);
    scope.own(built.cavity);
    scope.own(built.shell);
    scope.delete(built.outer);
    scope.delete(built.cavity);

    const holes = Math.round(parameters.drainHoles);
    const cutterHeight = parameters.baseThickness + BOOLEAN_OVERLAP * 2;
    // A drainage hole is a small feature, not the silhouette of the part, so it
    // takes a quarter of the revolution count. Mesh quality still changes it.
    const holeSegments = Math.max(12, Math.round(segments / 4));
    const cutters: Solid[] = drainHoleCenters(layout, holes).map(([x, y]) => {
      const cylinder = scope.own(kernel.Manifold.cylinder(
        cutterHeight,
        parameters.drainHoleDiameter / 2,
        parameters.drainHoleDiameter / 2,
        holeSegments,
      ));
      const placed = scope.own(cylinder.translate([x, y, -BOOLEAN_OVERLAP]));
      scope.delete(cylinder);
      return placed;
    });
    const drains = scope.own(unionSolids(kernel, scope.takeAll(cutters)));
    let solid = scope.own(built.shell.subtract(drains));
    scope.delete(drains);
    scope.delete(built.shell);

    solid = applySurfacePatterns(kernel, scope, solid, parameters.surfaceTreatments, plantPotSurfaceZones(parameters));

    return finishSolid(scope.take(solid), parameters, "pot");
  } finally {
    scope.dispose();
  }
}
