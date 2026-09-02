import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  MAXIMUM_HEIGHT_TO_THICKNESS,
  MINIMUM_WEB_MM,
  TOOL_FIN_RACK_SPECS,
  deriveLayout,
  type ToolFinRackKey,
  type ToolFinRackParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateToolFinRack(
  parameters: ToolFinRackParameters,
): ValidationResult<ToolFinRackKey> {
  const collector = new IssueCollector<ToolFinRackKey>();
  validateAgainstSpecs(TOOL_FIN_RACK_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "rackWidth",
      "rackDepth",
      "finCount",
      "finThickness",
      "finHeight",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const ratio = parameters.finHeight / parameters.finThickness;
  if (ratio > MAXIMUM_HEIGHT_TO_THICKNESS + 1e-9) {
    add(
      "finHeight",
      `Fin height must be at most ${mm(parameters.finThickness * MAXIMUM_HEIGHT_TO_THICKNESS)} mm for a ${mm(parameters.finThickness)} mm thick fin, so it does not snap. Use a shorter fin or a thicker one.`,
    );
  }

  const layout = deriveLayout(parameters);
  if (layout.finLength <= 0) {
    add(
      "rackDepth",
      `Rack depth must be more than ${mm(parameters.wallThickness * 2)} mm, twice the edge margin, so a fin has room to run front to back.`,
    );
  }

  const shorterSide = Math.min(parameters.rackWidth, parameters.rackDepth);
  if (parameters.cornerRadius > shorterSide / 2) {
    add(
      "cornerRadius",
      `Corner radius must be at most ${mm(shorterSide / 2)} mm, half the shorter outside dimension.`,
    );
  }

  if (!layout.finLayout.ok) {
    add(
      "finCount",
      layout.finLayout.web < 0
        ? `${parameters.finCount} fins of ${mm(parameters.finThickness)} mm do not fit in the ${mm(layout.innerWidth)} mm inside the edge margin. Use fewer fins, a thinner fin, or a wider rack.`
        : `${parameters.finCount} fins of ${mm(parameters.finThickness)} mm leave a gap of ${mm(layout.finLayout.web)} mm. Keep at least ${mm(MINIMUM_WEB_MM)} mm between fins, so a tool blade fits. Use fewer fins, a thinner fin, or a wider rack.`,
    );
  }

  if (layout.cornerConflict) {
    add(
      "cornerRadius",
      `Corner radius ${mm(parameters.cornerRadius)} mm leaves an end fin hanging past the rounded corner, unsupported. Use at most ${mm(layout.cornerConflict.maximumCornerRadius)} mm.`,
    );
  }

  return collector.result();
}
