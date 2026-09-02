import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  MINIMUM_HOLDING_DEPTH_MM,
  PLANT_SAUCER_SPECS,
  RIB_HEADROOM_MM,
  SAUCER_BED_MARGIN_MM,
  SAUCER_BED_WIDTH_MM,
  SAUCER_MAXIMUM_OUTSIDE_DIAMETER_MM,
  deriveSaucerLayout,
  type PlantSaucerKey,
  type PlantSaucerParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validatePlantSaucer(
  parameters: PlantSaucerParameters,
): ValidationResult<PlantSaucerKey> {
  const collector = new IssueCollector<PlantSaucerKey>();
  validateAgainstSpecs(PLANT_SAUCER_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "innerDiameter",
      "rimHeight",
      "taperDegrees",
      "rimRadius",
      "liftRibs",
      "ribHeight",
      "wallThickness",
      "baseThickness",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = deriveSaucerLayout(parameters);

  // The water stops at the lowest point of the rim, which is the notch floor
  // when the overflow notch is on. The depth is therefore measured from the
  // layout, not from the rim height alone.
  if (layout.holdingDepth < MINIMUM_HOLDING_DEPTH_MM - 1e-9) {
    const fixes = parameters.overflowNotch
      ? "Use a taller rim, a thinner floor, or no overflow notch."
      : "Use a taller rim or a thinner floor.";
    const notch =
      parameters.overflowNotch && layout.notchDepth > 0
        ? ` The overflow notch takes ${mm(layout.notchDepth)} mm off the depth.`
        : "";
    add(
      "rimHeight",
      `Rim height must be at least ${mm(layout.minimumRimHeight)} mm, so the saucer holds ${mm(MINIMUM_HOLDING_DEPTH_MM)} mm of water above the ${mm(parameters.baseThickness)} mm floor.${notch} ${fixes}`,
    );
  }

  if (
    Number.isFinite(layout.outsideDiameter) &&
    layout.outsideDiameter > SAUCER_MAXIMUM_OUTSIDE_DIAMETER_MM + 1e-9
  ) {
    add(
      "taperDegrees",
      `The saucer is ${mm(layout.outsideDiameter)} mm across at the rim. Keep it at most ${mm(SAUCER_MAXIMUM_OUTSIDE_DIAMETER_MM)} mm, the ${SAUCER_BED_WIDTH_MM} mm bed less ${SAUCER_BED_MARGIN_MM} mm. Use less taper, a shorter rim, a thinner wall, or a smaller floor.`,
    );
  }

  if (parameters.liftRibs >= 1 && parameters.ribHeight > layout.maximumRibHeight + 1e-9) {
    add(
      "ribHeight",
      `A lift rib must be at most ${mm(layout.maximumRibHeight)} mm high, so ${mm(RIB_HEADROOM_MM)} mm stays between the rib and the rim. Use a lower rib, a taller rim, or a thinner floor.`,
    );
  }

  if (!layout.profile) {
    add(
      "model",
      "These settings do not make a saucer. Use a larger inner diameter, a thinner wall, or a thinner floor.",
    );
  }

  return collector.result();
}
