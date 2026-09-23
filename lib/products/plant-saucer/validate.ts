import type { PrintContext } from "../../printer-profile";
import {
  IssueCollector,
  formatMillimeters,
  validateAgainstSpecs,
} from "../shared";
import type { ValidationResult } from "../types";
import {
  MINIMUM_HOLDING_DEPTH_MM,
  PLANT_SAUCER_SPECS,
  RIB_HEADROOM_MM,
  SAUCER_BED_MARGIN_MM,
  maximumSaucerDiameter,
  deriveSaucerLayout,
  type PlantSaucerKey,
  type PlantSaucerParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validatePlantSaucer(
  parameters: PlantSaucerParameters,
  context?: PrintContext,
): ValidationResult<PlantSaucerKey> {
  const collector = new IssueCollector<PlantSaucerKey>();
  validateAgainstSpecs(PLANT_SAUCER_SPECS, parameters, collector, context);
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

  const bed = maximumSaucerDiameter(context);
  // The smallest saucer the fields allow: the smallest floor and two of the
  // thinnest walls, before any taper.
  const smallestSaucer =
    PLANT_SAUCER_SPECS.innerDiameter.min + 2 * PLANT_SAUCER_SPECS.wallThickness.min;
  if (bed.known && bed.limit < smallestSaucer) {
    add(
      "taperDegrees",
      `The ${mm(bed.bedWidth)} mm bed in your printer profile is too small for any saucer this app makes; the smallest is about ${mm(smallestSaucer)} mm across the rim. Check the bed size in the profile.`,
    );
  } else if (
    Number.isFinite(layout.outsideDiameter) &&
    layout.outsideDiameter > bed.limit + 1e-9
  ) {
    add(
      "taperDegrees",
      `The saucer is ${mm(layout.outsideDiameter)} mm across at the rim. Keep it at most ${mm(bed.limit)} mm, the ${mm(bed.bedWidth)} mm bed${bed.known ? " in your printer profile" : ""} less ${SAUCER_BED_MARGIN_MM} mm. Use less taper, a shorter rim, a thinner wall, or a smaller floor.`,
    );
  }

  if (
    parameters.liftRibs >= 1 &&
    parameters.ribHeight > layout.maximumRibHeight + 1e-9
  ) {
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
