import type { PrintContext } from "../../printer-profile";
import { HOOK_MAXIMUM_PROJECTION_RATIO } from "../../kernel/bracket-rules";
import {
  IssueCollector,
  formatMillimeters,
  validateAgainstSpecs,
} from "../shared";
import type { ValidationResult } from "../types";
import {
  BAND_CLEARANCE_MM,
  HEADPHONE_MOUNT_SPECS,
  HOOK_FILLET_MM,
  LIP_THICKNESS_MM,
  SIDE_MARGIN_MM,
  deriveLayout,
  type HeadphoneMountKey,
  type HeadphoneMountParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateHeadphoneMount(
  parameters: HeadphoneMountParameters,
  context?: PrintContext,
): ValidationResult<HeadphoneMountKey> {
  const collector = new IssueCollector<HeadphoneMountKey>();
  validateAgainstSpecs(HEADPHONE_MOUNT_SPECS, parameters, collector, context);
  const add = collector.add.bind(collector);
  const layout = deriveLayout(parameters);
  if (!layout.numbersOk) return collector.result();

  // Load rule for product 11 in 10_MULTI_PRODUCT_EXPANSION_PLAN.md section
  // 2.6: the same root rule as the hook rail, and a hook at least 20 mm
  // wide, which the spec range enforces.
  if (!layout.hookRule.ok && layout.hookRule.reason === "projection") {
    add(
      "hookProjection",
      `A ${mm(parameters.hookProjection)} mm hook on a ${mm(parameters.hookRoot)} mm root snaps across the layers under a headset. Keep the projection at most ${HOOK_MAXIMUM_PROJECTION_RATIO} times the root and at most 60 mm. Use a projection of at most ${mm(layout.hookRule.maximumProjection)} mm, or a root of at least ${mm(layout.hookRule.minimumRoot)} mm.`,
    );
  }
  const fitProjection = HOOK_FILLET_MM + LIP_THICKNESS_MM + parameters.hookLip;
  if (parameters.hookProjection < fitProjection - 1e-9) {
    add(
      "hookProjection",
      `Hook projection must be at least ${mm(fitProjection)} mm, so the fillet, the lip ramp, and the lip fit. Use a shorter lip, or a longer projection.`,
    );
  } else if (parameters.hookProjection < layout.minimumProjection - 1e-9) {
    // The projection that clears the band may lie past the field's own
    // maximum. The message then offers only the fixes that can work.
    const fix =
      layout.minimumProjection <=
      HEADPHONE_MOUNT_SPECS.hookProjection.max + 1e-9
        ? `Use a projection of at least ${mm(layout.minimumProjection)} mm, a shorter lip, or a thinner band.`
        : `No projection clears it. Use a shorter lip, or a thinner band.`;
    add(
      "hookProjection",
      `The hook opening is ${mm(layout.hookOpening)} mm between the plate and the lip, and a ${mm(parameters.bandGauge)} mm band needs ${mm(parameters.bandGauge + BAND_CLEARANCE_MM)} mm. ${fix}`,
    );
  }

  if (parameters.hookWidth > layout.maximumFeatureWidth + 1e-9) {
    add(
      "hookWidth",
      `Hook width must be at most ${mm(layout.maximumFeatureWidth)} mm, so ${SIDE_MARGIN_MM} mm of plate stays on each side. Use a narrower hook, or a wider plate.`,
    );
  }
  if (
    parameters.controllerPocket &&
    parameters.pocketWidth > layout.maximumFeatureWidth + 1e-9
  ) {
    add(
      "pocketWidth",
      `Pocket width must be at most ${mm(layout.maximumFeatureWidth)} mm, so ${SIDE_MARGIN_MM} mm of plate stays on each side. Use a narrower pocket, or a wider plate.`,
    );
  }
  if (parameters.controllerPocket) {
    const pocketFit = HOOK_FILLET_MM + LIP_THICKNESS_MM + parameters.pocketLip;
    if (parameters.pocketDepth < pocketFit - 1e-9) {
      add(
        "pocketDepth",
        `Pocket depth must be at least ${mm(pocketFit)} mm, so the fillet, the lip ramp, and the lip fit. Use a shorter pocket lip, or a deeper pocket.`,
      );
    }
  }

  if (parameters.plateHeight < layout.minimumHeight - 1e-9) {
    const parts = parameters.controllerPocket
      ? "the lower screw, the hook, the band gap, the pocket, the upper screw, and 8 mm of plate around each countersink"
      : "the lower screw, the hook, the upper screw, and 8 mm of plate around each countersink";
    add(
      "plateHeight",
      `Plate height must be at least ${mm(layout.minimumHeight)} mm, to hold ${parts}. Use a taller plate, a shorter lip, or a thinner band.`,
    );
  }

  return collector.result();
}
