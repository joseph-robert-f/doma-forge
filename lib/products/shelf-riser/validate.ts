import { SPLIT_MINIMUM_SECTION_MM } from "../../kernel/brackets";
import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  LEG_MAXIMUM_SLENDERNESS,
  ONE_PIECE_HEIGHT_MM,
  SHELF_RISER_SPECS,
  deriveLayout,
  type ShelfRiserKey,
  type ShelfRiserParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateShelfRiser(
  parameters: ShelfRiserParameters,
): ValidationResult<ShelfRiserKey> {
  const collector = new IssueCollector<ShelfRiserKey>();
  validateAgainstSpecs(SHELF_RISER_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const layout = deriveLayout(parameters);
  if (!layout.numbersOk) return collector.result();

  // Load rule for product 12 in 10_MULTI_PRODUCT_EXPANSION_PLAN.md section
  // 2.6: a leg buckles when it is too slender. Gussets are always on, and
  // ribs come with any span over 150 mm; neither needs a rule here.
  if (!layout.legs.ok && layout.legs.reason === "slenderness") {
    add(
      "legSection",
      `A ${mm(parameters.clearHeight)} mm leg of ${mm(parameters.legSection)} mm section buckles. Keep the leg height at most ${LEG_MAXIMUM_SLENDERNESS} times the section. Use a section of at least ${mm(layout.legs.minimumSection)} mm, or a clear height of at most ${mm(layout.legs.maximumHeight)} mm.`,
    );
  }
  if (!layout.legs.ok && layout.legs.reason === "gap") {
    add(
      "legSection",
      `Legs of ${mm(parameters.legSection)} mm leave ${mm(layout.legs.gap)} mm between the two posts on the short side. Use a smaller leg section, or a larger deck.`,
    );
  }

  if (!layout.split.split && "reason" in layout.split) {
    if (layout.split.reason === "section") {
      add(
        "legSection",
        `A riser ${mm(layout.split.totalHeight)} mm tall is over the ${ONE_PIECE_HEIGHT_MM} mm one-piece height, so each leg gets a press-fit extension. That joint needs a leg section of at least ${SPLIT_MINIMUM_SECTION_MM} mm. Use a larger section, or a clear height of at most ${mm(ONE_PIECE_HEIGHT_MM - parameters.deckThickness)} mm.`,
      );
    } else {
      add(
        "clearHeight",
        `A riser ${mm(layout.split.totalHeight)} mm tall needs a leg extension longer than one piece can print. Use a lower clear height.`,
      );
    }
  }

  return collector.result();
}
