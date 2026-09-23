import { ResourceScope } from "../../kernel/ownership";
import { cutterArray, unionSolids } from "../../kernel/arrays";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { BOOLEAN_OVERLAP, roundedSlab } from "../../kernel/shell";
import { applySurfacePatterns } from "../../kernel/surface-pattern";
import { surfaceZones } from "./surface-zones";
import {
  FIN_FILLET_HEIGHT_MM,
  FIN_FILLET_WIDTH_MM,
  QUALITY_SEGMENTS,
  deriveLayout,
  type ToolFinRackParameters,
} from "./schema";
import { validateToolFinRack } from "./validate";

type Kernel = Awaited<ReturnType<typeof getKernel>>;

/**
 * One fin with a fillet at its base: the convex hull of the plain fin body
 * and a wider, short strip sitting at its foot. The hull's side faces taper
 * smoothly from the wide strip up to the fin's own width, instead of
 * meeting the slab at a sharp right angle. Local origin is the fin's own
 * center in X and Y, with its visible foot at Z = 0.
 *
 * The strip's own material extends `BOOLEAN_OVERLAP` below Z = 0, sinking
 * the fin's foot into the slab it is unioned onto instead of meeting its
 * top face exactly, the house rule for every Boolean in
 * 20_KERNEL_MODULES_NOTES.md section 2.1. The strip is a plain rectangular
 * prism — its footprint does not taper with height — so extending it
 * further down only adds hidden material below Z = 0; the hull's visible
 * shape from Z = 0 up through the fin's own top is unchanged.
 */
function filletedFin(
  kernel: Kernel,
  options: { thickness: number; length: number; height: number },
): Solid {
  const scope = new ResourceScope();
  try {
    const { thickness, length, height } = options;
    const finAtOrigin = scope.own(kernel.Manifold.cube([thickness, length, height], true));
    const fin = scope.own(finAtOrigin.translate([0, 0, height / 2]));
    scope.delete(finAtOrigin);

    const stripHeight = FIN_FILLET_HEIGHT_MM + BOOLEAN_OVERLAP;
    const stripAtOrigin = scope.own(kernel.Manifold.cube(
      [thickness + FIN_FILLET_WIDTH_MM * 2, length, stripHeight],
      true,
    ));
    const strip = scope.own(stripAtOrigin.translate([0, 0, stripHeight / 2 - BOOLEAN_OVERLAP]));
    scope.delete(stripAtOrigin);

    const hulled = scope.own(kernel.Manifold.hull([fin, strip]));
    scope.delete(fin);
    scope.delete(strip);
    return scope.take(hulled);
  } finally {
    scope.dispose();
  }
}

/**
 * Builds the rack as one solid: a rounded base slab, plus one batched union
 * of every filleted fin, unioned onto the slab (fins add material, they are
 * never cut). Coordinates are millimeters, X/Y centered on the origin, the
 * slab base at Z = 0, every fin's foot at Z = baseThickness.
 */
export async function generateToolFinRack(
  parameters: ToolFinRackParameters,
): Promise<GeneratedModel<ToolFinRackParameters>> {
  const scope = new ResourceScope();
  try {
    const validation = validateToolFinRack(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }

    const kernel = await getKernel();
    const layout = deriveLayout(parameters);
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const finLayout = layout.finLayout;
    if (!finLayout.ok) throw new Error("The fins do not fit the rack width.");

    let slab = scope.own(roundedSlab(kernel, {
      width: parameters.rackWidth,
      depth: parameters.rackDepth,
      height: parameters.baseThickness,
      cornerRadius: parameters.cornerRadius,
      segments,
    }));

    slab = applySurfacePatterns(kernel, scope, slab, parameters.surfaceTreatments,
      surfaceZones(parameters, layout));

    const fins = scope.own(cutterArray(
      kernel,
      () =>
        filletedFin(kernel, {
          thickness: parameters.finThickness,
          length: layout.finLength,
          height: parameters.finHeight,
        }),
      {
        pitchX: finLayout.pitch,
        pitchY: 0,
        countX: parameters.finCount,
        countY: 1,
        origin: [finLayout.firstCenter, 0, parameters.baseThickness],
      },
    ));

    const solid = scope.own(unionSolids(kernel, scope.takeAll([slab, fins])));
    return finishSolid(scope.take(solid), parameters, "rack");
  } finally {
    scope.dispose();
  }
}
