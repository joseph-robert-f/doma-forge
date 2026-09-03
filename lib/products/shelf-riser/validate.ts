import type { PrintContext } from "../../printer-profile";
import { SPLIT_MINIMUM_SECTION_MM } from "../../kernel/bracket-rules";
import {
  IssueCollector,
  formatMillimeters,
  validateAgainstSpecs,
} from "../shared";
import type { ValidationResult } from "../types";
import {
  LEG_MAXIMUM_SLENDERNESS,
  SHELF_RISER_SPECS,
  deriveLayout,
  type ShelfRiserKey,
  type ShelfRiserParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateShelfRiser(
  parameters: ShelfRiserParameters,
  context?: PrintContext,
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
        `A riser ${mm(layout.split.totalHeight)} mm tall is over the ${mm(parameters.onePieceHeight)} mm one-piece height, so each leg gets a press-fit extension. That joint needs a leg section of at least ${SPLIT_MINIMUM_SECTION_MM} mm. Use a larger section, or a clear height of at most ${mm(parameters.onePieceHeight - parameters.deckThickness)} mm, or a larger one-piece height if your printer allows it.`,
      );
    } else {
      add(
        "clearHeight",
        `A riser ${mm(layout.split.totalHeight)} mm tall needs a leg extension longer than one piece can print. Use a lower clear height.`,
      );
    }
  }

  // The one-piece height is the person's claim about their printer. A saved
  // bed height checks it, but only when the claim matters: when the riser
  // as laid out is taller than the bed. A riser that fits the bed prints
  // whatever the setting says, and a bed is never a refusal on its own
  // (19_PRINTER_PROFILE_NOTES.md, D-811; here D-1803).
  const bedHeight = context?.bed?.z;
  if (
    bedHeight !== undefined &&
    Number.isFinite(bedHeight) &&
    layout.numbersOk &&
    parameters.onePieceHeight > bedHeight + 1e-9 &&
    layout.layoutMax[2] > bedHeight + 1e-9
  ) {
    add(
      "onePieceHeight",
      `Your bed is ${mm(bedHeight)} mm high and the riser's deck body is ${mm(layout.layoutMax[2])} mm tall. Set the one-piece height to at most ${mm(bedHeight)} mm so the legs split there, or raise the bed height in the printer profile if it is wrong.`,
    );
  }

  return collector.result();
}
