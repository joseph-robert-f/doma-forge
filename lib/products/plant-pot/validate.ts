import type { PrintContext } from "../../printer-profile";
import {
  IssueCollector,
  formatMillimeters,
  validateAgainstSpecs,
} from "../shared";
import type { ValidationResult } from "../types";
import {
  DRAIN_WEB_MM,
  PLANT_POT_SPECS,
  POT_BED_MARGIN_MM,
  maximumPotDiameter,
  derivePotLayout,
  type PlantPotKey,
  type PlantPotParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validatePlantPot(
  parameters: PlantPotParameters,
  context?: PrintContext,
): ValidationResult<PlantPotKey> {
  const collector = new IssueCollector<PlantPotKey>();
  validateAgainstSpecs(PLANT_POT_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "baseDiameter",
      "potHeight",
      "wallAngleDegrees",
      "rimRadius",
      "drainHoles",
      "drainHoleDiameter",
      "wallThickness",
      "baseThickness",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = derivePotLayout(parameters);

  if (!layout.profile) {
    add(
      "model",
      "These settings do not make a pot. Use a larger base diameter, a thinner wall, or a thinner base.",
    );
    return collector.result();
  }

  const bed = maximumPotDiameter(context);
  const smallestPot = PLANT_POT_SPECS.baseDiameter.min;
  if (bed.known && bed.limit < smallestPot) {
    add(
      "wallAngleDegrees",
      `The ${mm(bed.bedWidth)} mm bed in your printer profile is too small for any pot this app makes; the smallest is ${mm(smallestPot)} mm across the rim. Check the bed size in the profile.`,
    );
  } else if (layout.widestDiameter > bed.limit + 1e-9) {
    add(
      "wallAngleDegrees",
      `The pot is ${mm(layout.widestDiameter)} mm across at the rim. Keep it at most ${mm(bed.limit)} mm, the ${mm(bed.bedWidth)} mm bed${bed.known ? " in your printer profile" : ""} less ${POT_BED_MARGIN_MM} mm. Use a smaller wall angle, a shorter pot, or a smaller base.`,
    );
  }

  if (layout.wallWeb < DRAIN_WEB_MM - 1e-9) {
    add(
      "drainHoleDiameter",
      `A ${mm(parameters.drainHoleDiameter)} mm hole leaves ${mm(layout.wallWeb)} mm between the hole and the wall. Keep at least ${mm(DRAIN_WEB_MM)} mm, so the holes stay in the flat base. Use a smaller hole, fewer holes, or a wider base.`,
    );
  }

  if (
    Number.isFinite(layout.neighbourWeb) &&
    layout.neighbourWeb < DRAIN_WEB_MM - 1e-9
  ) {
    add(
      "drainHoles",
      `${parameters.drainHoles} holes of ${mm(parameters.drainHoleDiameter)} mm leave ${mm(layout.neighbourWeb)} mm between neighbours. Keep at least ${mm(DRAIN_WEB_MM)} mm. Use fewer holes, a smaller hole, or a wider base.`,
    );
  }

  return collector.result();
}
