import {
  HOOK_MAXIMUM_PROJECTION_RATIO,
  SCREW_MINIMUM_EDGE_MM,
} from "../../kernel/bracket-rules";
import {
  IssueCollector,
  formatMillimeters,
  validateAgainstSpecs,
} from "../shared";
import type { ValidationResult } from "../types";
import {
  HOOK_GAP_MM,
  WALL_HOOK_RAIL_SPECS,
  deriveLayout,
  minimumProjection,
  type WallHookRailKey,
  type WallHookRailParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateWallHookRail(
  parameters: WallHookRailParameters,
): ValidationResult<WallHookRailKey> {
  const collector = new IssueCollector<WallHookRailKey>();
  validateAgainstSpecs(WALL_HOOK_RAIL_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const layout = deriveLayout(parameters);
  if (!layout.numbersOk) return collector.result();

  // Load rule for product 10 in 10_MULTI_PRODUCT_EXPANSION_PLAN.md section
  // 2.6: a hook snaps across the layer lines when its projection is long
  // for its root.
  if (!layout.hookRule.ok && layout.hookRule.reason === "projection") {
    add(
      "hookProjection",
      `A ${mm(parameters.hookProjection)} mm hook on a ${mm(parameters.hookRoot)} mm root snaps across the layers. Keep the projection at most ${HOOK_MAXIMUM_PROJECTION_RATIO} times the root and at most 60 mm. Use a projection of at most ${mm(layout.hookRule.maximumProjection)} mm, or a root of at least ${mm(layout.hookRule.minimumRoot)} mm.`,
    );
  }
  const neededProjection = minimumProjection(parameters);
  if (parameters.hookProjection < neededProjection - 1e-9) {
    add(
      "hookProjection",
      `Hook projection must be at least ${mm(neededProjection)} mm, so the fillet, the lip ramp, and the lip fit. Use a shorter lip, or a longer projection.`,
    );
  }

  if (layout.hooks && !layout.hooks.ok) {
    add(
      "hookCount",
      `${parameters.hookCount} hooks of ${mm(parameters.hookWidth)} mm leave ${mm(layout.hooks.web)} mm between them, and each gap must be at least ${HOOK_GAP_MM} mm. Use fewer hooks, narrower hooks, or a longer rail.`,
    );
  }

  if (!layout.screws.ok && layout.screws.reason === "margin") {
    add(
      "screwSpacing",
      `${parameters.screwCount} screws at ${mm(parameters.screwSpacing)} mm leave ${mm(layout.screws.margin)} mm from an end countersink to the rail end, and it must be at least ${SCREW_MINIMUM_EDGE_MM} mm. Use a spacing of at most ${mm(layout.screws.maximumSpacing)} mm, or a longer rail.`,
    );
  }

  if (parameters.railHeight < layout.minimumHeight - 1e-9) {
    const parts = parameters.keyShelf
      ? "the hook root, the screw row, the shelf gussets, and 8 mm of plate around each countersink"
      : "the hook root, the screw row, and 8 mm of plate around each countersink";
    add(
      "railHeight",
      `Rail height must be at least ${mm(layout.minimumHeight)} mm, to hold ${parts}. Use a taller rail, a smaller root, or a smaller screw.`,
    );
  }

  return collector.result();
}
