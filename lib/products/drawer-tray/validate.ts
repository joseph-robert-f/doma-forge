import { IssueCollector, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  DRAWER_TRAY_SPECS,
  deriveDimensions,
  type DrawerTrayKey,
  type DrawerTrayParameters,
} from "./schema";

export const MINIMUM_COMPARTMENT_MM = 10;
export const MINIMUM_WALL_ABOVE_BASE_MM = 4;

export function validateDrawerTray(
  parameters: DrawerTrayParameters,
): ValidationResult<DrawerTrayKey> {
  const collector = new IssueCollector<DrawerTrayKey>();
  validateAgainstSpecs(DRAWER_TRAY_SPECS, parameters, collector);
  const derived = deriveDimensions(parameters);
  const add = collector.add.bind(collector);

  if (!Number.isFinite(derived.outsideWidth) || derived.outsideWidth <= 0) {
    add("clearancePerSide", "Clearance leaves no usable organizer width.");
  }
  if (!Number.isFinite(derived.outsideDepth) || derived.outsideDepth <= 0) {
    add("clearancePerSide", "Clearance leaves no usable organizer depth.");
  }
  if (
    Number.isFinite(parameters.baseThickness) &&
    Number.isFinite(parameters.organizerHeight) &&
    parameters.baseThickness >
      parameters.organizerHeight - MINIMUM_WALL_ABOVE_BASE_MM
  ) {
    add(
      "baseThickness",
      `Leave at least ${MINIMUM_WALL_ABOVE_BASE_MM} mm of wall above the base.`,
    );
  }

  const smallestOutside = Math.min(derived.outsideWidth, derived.outsideDepth);
  if (
    Number.isFinite(parameters.cornerRadius) &&
    Number.isFinite(smallestOutside) &&
    parameters.cornerRadius > smallestOutside / 2
  ) {
    add(
      "cornerRadius",
      "Corner radius cannot exceed half the shorter outside dimension.",
    );
  }

  if (Number.isFinite(derived.compartmentWidth)) {
    if (derived.compartmentWidth <= 0) {
      add("columns", "Walls and dividers consume the available width.");
    } else if (derived.compartmentWidth < MINIMUM_COMPARTMENT_MM) {
      add(
        "columns",
        `Each compartment must be at least ${MINIMUM_COMPARTMENT_MM} mm wide.`,
      );
    }
  }
  if (Number.isFinite(derived.compartmentDepth)) {
    if (derived.compartmentDepth <= 0) {
      add("rows", "Walls and dividers consume the available depth.");
    } else if (derived.compartmentDepth < MINIMUM_COMPARTMENT_MM) {
      add(
        "rows",
        `Each compartment must be at least ${MINIMUM_COMPARTMENT_MM} mm deep.`,
      );
    }
  }

  return collector.result();
}
