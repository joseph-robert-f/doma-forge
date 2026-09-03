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
  const slab = roundedSlab(kernel, {
    width: deckWidth,
    depth: deckDepth,
    height: deckThickness,
    cornerRadius: parameters.cornerRadius,
    segments,
  });
  const lightened = parameters.lightenDeck
    ? lightenUnderside(
        kernel,
        slab,
        lighteningOptions(parameters, layout.lighteningRim, layout.pocketDepth, segments),
      ).solid
    : slab;
  const flipped = lightened.rotate([180, 0, 0]);
  lightened.delete();
  const deck = flipped.translate([0, 0, deckThickness]);
  flipped.delete();

  const parts: Solid[] = [deck];

  // Ribs stand up from the underside, clipped to the deck outline. A rib
  // starts inside the deck skin, below the pocket floors, so where it
  // crosses a pocket it fills the pocket instead of bridging it.
  const outlineProfile = roundedRectangle(kernel, deckWidth, deckDepth, parameters.cornerRadius, segments);
  const ribClip = outlineProfile.extrude(deckThickness + RIB_DEPTH_MM + BOOLEAN_OVERLAP);
  outlineProfile.delete();
  const ribBottom = deckThickness - layout.pocketDepth - BOOLEAN_OVERLAP;
  const ribTop = deckThickness + RIB_DEPTH_MM;
  const ribCenterZ = (ribBottom + ribTop) / 2;
  const ribHeight = ribTop - ribBottom;
  const ribsAcrossX = dividerArrayAtPositions(kernel, ribClip, {
    positions: layout.ribsAcrossX,
    thickness: RIB_THICKNESS_MM,
    length: deckDepth + BOOLEAN_OVERLAP * 2,
    height: ribHeight,
    centerZ: ribCenterZ,
    axis: "x",
  });
  if (ribsAcrossX) parts.push(ribsAcrossX);
  const ribsAcrossY = dividerArrayAtPositions(kernel, ribClip, {
    positions: layout.ribsAcrossY,
    thickness: RIB_THICKNESS_MM,
    length: deckWidth + BOOLEAN_OVERLAP * 2,
    height: ribHeight,
    centerZ: ribCenterZ,
    axis: "y",
  });
  if (ribsAcrossY) parts.push(ribsAcrossY);
  ribClip.delete();

  // The posts, built flare up, then turned over so the flare meets the deck
  // and the foot points up. The turn mirrors Y, which the symmetric corner
  // set does not notice.
  const postsFlareUp = legPosts(kernel, {
    centers: layout.legs.centers,
    section: legSection,
    cornerRadius: Math.min(LEG_CORNER_RADIUS_MM, legSection / 4),
    height: layout.deckLegLength,
    gusset: layout.legGusset,
    segments,
  });
  const postsTurned = postsFlareUp.rotate([180, 0, 0]);
  postsFlareUp.delete();
  const posts = postsTurned.translate([0, 0, deckThickness + layout.deckLegLength]);
  postsTurned.delete();
  parts.push(posts);

  let solid = unionSolids(kernel, parts);

  if (layout.split.split) {
    const { socketSide, pegSide, pegLength, extensionLength } = layout.split;
    const footZ = deckThickness + layout.deckLegLength;
    const socketAtOrigin = kernel.Manifold.cube(
      [socketSide, socketSide, pegLength + BOOLEAN_OVERLAP],
      true,
    );
    const sockets = unionSolids(
      kernel,
      layout.legs.centers.map(([x, y]) =>
        socketAtOrigin.translate([x, y, footZ - pegLength / 2 + BOOLEAN_OVERLAP / 2]),
      ),
    );
    socketAtOrigin.delete();
    const socketed = solid.subtract(sockets);
    sockets.delete();
    solid.delete();

    const postProfile = roundedRectangle(
      kernel,
      legSection,
      legSection,
      Math.min(LEG_CORNER_RADIUS_MM, legSection / 4),
      segments,
    );
    const extensionPost = postProfile.extrude(extensionLength);
    postProfile.delete();
    const pegAtOrigin = kernel.Manifold.cube([pegSide, pegSide, pegLength + BOOLEAN_OVERLAP], true);
    const peg = pegAtOrigin.translate([0, 0, extensionLength + (pegLength - BOOLEAN_OVERLAP) / 2]);
    pegAtOrigin.delete();
    const extension = unionSolids(kernel, [extensionPost, peg]);
    const extensions = layout.extensionYs.map((y) =>
      extension.translate([layout.extensionX, y, 0]),
    );
    extension.delete();
    solid = unionSolids(kernel, [socketed, ...extensions]);
  }

  return finishSolid(solid, parameters, "riser");
}
