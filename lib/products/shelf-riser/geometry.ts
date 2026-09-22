import { ResourceScope } from "../../kernel/ownership";
import { dividerArrayAtPositions, unionSolids } from "../../kernel/arrays";
import { legPosts } from "../../kernel/legs";
import { lightenUnderside } from "../../kernel/lightening";
import { getKernel, type Solid } from "../../kernel/manifold";
import { finishSolid, type GeneratedModel } from "../../kernel/mesh";
import { roundedRectangle } from "../../kernel/profiles";
import { BOOLEAN_OVERLAP, roundedSlab } from "../../kernel/shell";
import {
  LEG_CORNER_RADIUS_MM,
  QUALITY_SEGMENTS,
  RIB_DEPTH_MM,
  RIB_THICKNESS_MM,
  deriveLayout,
  lighteningOptions,
  type ShelfRiserParameters,
} from "./schema";
import { validateShelfRiser } from "./validate";

/**
 * Builds the riser in its print pose: the deck top on the bed at Z = 0, the
 * lightened underside facing up, the ribs and the four gusseted posts
 * standing up from it. When the legs split, each post ends in a square
 * socket and four separate extensions with pegs stand beside the deck,
 * feet on the bed. Coordinates are millimeters, X and Y centered on the
 * deck. There is no print-pose turn: what the preview shows is what prints,
 * and the user turns the printed riser over. See D-1606.
 */
export async function generateShelfRiser(
  parameters: ShelfRiserParameters,
): Promise<GeneratedModel<ShelfRiserParameters>> {
  const scope = new ResourceScope();
  try {
    const validation = validateShelfRiser(parameters);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(" "));
    }
    const kernel = await getKernel();
    const layout = deriveLayout(parameters);
    if (!layout.legs.ok) throw new Error("The legs do not fit under the deck.");
    const segments = QUALITY_SEGMENTS[parameters.meshQuality];
    const { deckWidth, deckDepth, deckThickness, legSection } = parameters;

    // The deck, built with its pockets at the bottom, then turned over so the
    // pockets open upward and the deck top lies on the bed.
    const slab = scope.own(roundedSlab(kernel, {
      width: deckWidth,
      depth: deckDepth,
      height: deckThickness,
      cornerRadius: parameters.cornerRadius,
      segments,
    }));
    let lightened = slab;
    if (parameters.lightenDeck) {
      const options = lighteningOptions(parameters, layout.lighteningRim, layout.pocketDepth, segments);
      lightened = scope.own(lightenUnderside(kernel, scope.take(slab), options).solid);
    }
    const flipped = scope.own(lightened.rotate([180, 0, 0]));
    scope.delete(lightened);
    const deck = scope.own(flipped.translate([0, 0, deckThickness]));
    scope.delete(flipped);

    const parts: Solid[] = [deck];

    // Ribs stand up from the underside, clipped to the deck outline. A rib
    // starts inside the deck skin, below the pocket floors, so where it
    // crosses a pocket it fills the pocket instead of bridging it.
    const outlineProfile = scope.own(roundedRectangle(kernel, deckWidth, deckDepth, parameters.cornerRadius, segments));
    const ribClip = scope.own(outlineProfile.extrude(deckThickness + RIB_DEPTH_MM + BOOLEAN_OVERLAP));
    scope.delete(outlineProfile);
    const ribBottom = deckThickness - layout.pocketDepth - BOOLEAN_OVERLAP;
    const ribTop = deckThickness + RIB_DEPTH_MM;
    const ribCenterZ = (ribBottom + ribTop) / 2;
    const ribHeight = ribTop - ribBottom;
    const ribsAcrossX = scope.own(dividerArrayAtPositions(kernel, ribClip, {
      positions: layout.ribsAcrossX,
      thickness: RIB_THICKNESS_MM,
      length: deckDepth + BOOLEAN_OVERLAP * 2,
      height: ribHeight,
      centerZ: ribCenterZ,
      axis: "x",
    }));
    if (ribsAcrossX) parts.push(ribsAcrossX);
    const ribsAcrossY = scope.own(dividerArrayAtPositions(kernel, ribClip, {
      positions: layout.ribsAcrossY,
      thickness: RIB_THICKNESS_MM,
      length: deckWidth + BOOLEAN_OVERLAP * 2,
      height: ribHeight,
      centerZ: ribCenterZ,
      axis: "y",
    }));
    if (ribsAcrossY) parts.push(ribsAcrossY);
    scope.delete(ribClip);

    // The posts, built flare up, then turned over so the flare meets the deck
    // and the foot points up. The turn mirrors Y, which the symmetric corner
    // set does not notice.
    const postsFlareUp = scope.own(legPosts(kernel, {
      centers: layout.legs.centers,
      section: legSection,
      cornerRadius: Math.min(LEG_CORNER_RADIUS_MM, legSection / 4),
      height: layout.deckLegLength,
      gusset: layout.legGusset,
      segments,
    }));
    const postsTurned = scope.own(postsFlareUp.rotate([180, 0, 0]));
    scope.delete(postsFlareUp);
    const posts = scope.own(postsTurned.translate([0, 0, deckThickness + layout.deckLegLength]));
    scope.delete(postsTurned);
    parts.push(posts);

    let solid = scope.own(unionSolids(kernel, scope.takeAll(parts)));

    if (layout.split.split) {
      const { socketSide, pegSide, pegLength, extensionLength } = layout.split;
      const footZ = deckThickness + layout.deckLegLength;
      const socketAtOrigin = scope.own(kernel.Manifold.cube(
        [socketSide, socketSide, pegLength + BOOLEAN_OVERLAP],
        true,
      ));
      const socketCopies = layout.legs.centers.map(([x, y]) =>
        scope.own(socketAtOrigin.translate([x, y, footZ - pegLength / 2 + BOOLEAN_OVERLAP / 2])),
      );
      const sockets = scope.own(unionSolids(kernel, scope.takeAll(socketCopies)));
      scope.delete(socketAtOrigin);
      const socketed = scope.own(solid.subtract(sockets));
      scope.delete(sockets);
      scope.delete(solid);

      const postProfile = scope.own(roundedRectangle(
        kernel,
        legSection,
        legSection,
        Math.min(LEG_CORNER_RADIUS_MM, legSection / 4),
        segments,
      ));
      const extensionPost = scope.own(postProfile.extrude(extensionLength));
      scope.delete(postProfile);
      const pegAtOrigin = scope.own(kernel.Manifold.cube([pegSide, pegSide, pegLength + BOOLEAN_OVERLAP], true));
      const peg = scope.own(pegAtOrigin.translate([0, 0, extensionLength + (pegLength - BOOLEAN_OVERLAP) / 2]));
      scope.delete(pegAtOrigin);
      const extension = scope.own(unionSolids(kernel, scope.takeAll([extensionPost, peg])));
      const extensions = layout.extensionYs.map((y) =>
        scope.own(extension.translate([layout.extensionX, y, 0])),
      );
      scope.delete(extension);
      solid = scope.own(unionSolids(kernel, scope.takeAll([socketed, ...extensions])));
    }

    return finishSolid(scope.take(solid), parameters, "riser");
  } finally {
    scope.dispose();
  }
}
