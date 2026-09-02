import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  CARD_HOLDER_SPECS,
  MINIMUM_WEB_MM,
  deriveCardHolderLayout,
  type CardHolderKey,
  type CardHolderParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateCardHolder(
  parameters: CardHolderParameters,
): ValidationResult<CardHolderKey> {
  const collector = new IssueCollector<CardHolderKey>();
  validateAgainstSpecs(CARD_HOLDER_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "holderWidth",
      "holderDepth",
      "holderHeight",
      "cardGauge",
      "slotClearance",
      "cardWidth",
      "slotCount",
      "slotDepth",
      "slotTilt",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = deriveCardHolderLayout(parameters);

  if (parameters.slotDepth > layout.maximumSlotDepth + 1e-9) {
    add(
      "slotDepth",
      `Slot depth must be at most ${mm(layout.maximumSlotDepth)} mm, so that ${mm(parameters.baseThickness)} mm of base stays under the slots. Use a shallower slot, a taller holder, or a thinner base.`,
    );
  }

  if (layout.slotLength > layout.innerDepth + 1e-9) {
    add(
      "cardWidth",
      `A ${mm(parameters.cardWidth)} mm card needs a ${mm(layout.slotLength)} mm slot, and only ${mm(layout.innerDepth)} mm is inside the rim. Use a deeper holder, a thinner rim, or a narrower card.`,
    );
  }

  const shorterSide = Math.min(parameters.holderWidth, parameters.holderDepth);
  if (parameters.cornerRadius > shorterSide / 2) {
    add(
      "cornerRadius",
      `Corner radius must be at most ${mm(shorterSide / 2)} mm, half the shorter outside dimension.`,
    );
  }

  if (!layout.pitch.ok) {
    const message =
      layout.pitch.web < 0
        ? `${parameters.slotCount} slots of ${mm(layout.slotFootprint)} mm do not fit in the ${mm(layout.innerWidth)} mm inside the rim. Use fewer slots, less tilt, a shallower slot, or a wider holder.`
        : `${parameters.slotCount} slots of ${mm(layout.slotFootprint)} mm leave a web of ${mm(layout.pitch.web)} mm. Keep at least ${mm(MINIMUM_WEB_MM)} mm between slots. Use fewer slots, less tilt, a shallower slot, or a wider holder.`;
    add("slotCount", message);
  }

  if (layout.cornerConflict) {
    add(
      "cornerRadius",
      `Corner radius ${mm(parameters.cornerRadius)} mm cuts into the end slots. Use at most ${mm(layout.cornerConflict.maximumCornerRadius)} mm, a shorter card width, or fewer slots.`,
    );
  }

  return collector.result();
}
