import type { PrintContext } from "../../printer-profile";
import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  DRAWER_RISER_SPECS,
  HEADROOM_MM,
  LEG_MAXIMUM_SLENDERNESS,
  MINIMUM_COMPARTMENT_MM,
  deriveLayout,
  type DrawerRiserKey,
  type DrawerRiserParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateDrawerRiser(
  parameters: DrawerRiserParameters,
  context?: PrintContext,
): ValidationResult<DrawerRiserKey> {
  const collector = new IssueCollector<DrawerRiserKey>();
  validateAgainstSpecs(DRAWER_RISER_SPECS, parameters, collector, context);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "drawerWidth",
      "drawerDepth",
      "drawerUsableHeight",
      "clearancePerSide",
      "clearHeight",
      "trayHeight",
      "legSection",
      "rows",
      "columns",
      "wallThickness",
      "baseThickness",
      "dividerThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = deriveLayout(parameters);

  // Print risk rule for product 3 in 10_MULTI_PRODUCT_EXPANSION_PLAN.md
  // section 2.6: a leg buckles when it is too slender.
  if (!layout.legs.ok && layout.legs.reason === "slenderness") {
    add(
      "legSection",
      `A ${mm(parameters.clearHeight)} mm leg of ${mm(parameters.legSection)} mm section buckles. Keep the leg height at most ${LEG_MAXIMUM_SLENDERNESS} times the section. Use a section of at least ${mm(layout.legs.minimumSection)} mm, or a clear height of at most ${mm(layout.legs.maximumHeight)} mm.`,
    );
  }
  if (!layout.legs.ok && layout.legs.reason === "gap") {
    add(
      "legSection",
      `Legs of ${mm(parameters.legSection)} mm leave ${mm(layout.legs.gap)} mm between the two posts on the short side. Use a smaller leg section, or a larger drawer.`,
    );
  }

  // The riser must leave the headroom the drawer needs above it.
  if (layout.outsideHeight > layout.heightBudget + 1e-9) {
    add(
      "clearHeight",
      `The riser is ${mm(layout.outsideHeight)} mm tall. It must be at most ${mm(layout.heightBudget)} mm: the drawer usable height ${mm(parameters.drawerUsableHeight)} mm minus ${HEADROOM_MM} mm. Lower the clear height by ${mm(layout.outsideHeight - layout.heightBudget)} mm, lower the tray, or measure the drawer again.`,
    );
  }

  if (layout.outsideWidth <= 0 || layout.outsideDepth <= 0) {
    add("clearancePerSide", "Clearance leaves no usable riser size.");
    return collector.result();
  }

  if (layout.compartmentWidth < MINIMUM_COMPARTMENT_MM) {
    add(
      "columns",
      `Each compartment must be at least ${MINIMUM_COMPARTMENT_MM} mm wide. ${parameters.columns} columns leave ${mm(layout.compartmentWidth)} mm. Use fewer columns, thinner dividers, or a wider drawer.`,
    );
  }
  if (layout.compartmentDepth < MINIMUM_COMPARTMENT_MM) {
    add(
      "rows",
      `Each compartment must be at least ${MINIMUM_COMPARTMENT_MM} mm deep. ${parameters.rows} rows leave ${mm(layout.compartmentDepth)} mm. Use fewer rows, thinner dividers, or a deeper drawer.`,
    );
  }

  return collector.result();
}
