import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  MINIMUM_STACKING_WALL_MM,
  MINIMUM_WALL_ABOVE_BASE_MM,
  PARTS_BIN_SPECS,
  RECESS_WALL_RESERVE_MM,
  deriveLayout,
  type PartsBinKey,
  type PartsBinParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 2);

export function validatePartsBin(
  parameters: PartsBinParameters,
): ValidationResult<PartsBinKey> {
  const collector = new IssueCollector<PartsBinKey>();
  validateAgainstSpecs(PARTS_BIN_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "binWidth",
      "binDepth",
      "binHeight",
      "lipHeight",
      "lipWallThickness",
      "stackClearance",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = deriveLayout(parameters);

  const thickestBase = parameters.binHeight - MINIMUM_WALL_ABOVE_BASE_MM;
  if (parameters.baseThickness > thickestBase + 1e-9) {
    add(
      "baseThickness",
      `Base thickness must be at most ${mm(thickestBase)} mm, so that ${mm(MINIMUM_WALL_ABOVE_BASE_MM)} mm of wall stays above the base.`,
    );
  }

  const shorterSide = Math.min(parameters.binWidth, parameters.binDepth);
  if (parameters.cornerRadius > shorterSide / 2 + 1e-9) {
    add(
      "cornerRadius",
      `Corner radius must be at most ${mm(shorterSide / 2)} mm, half the shorter outside dimension.`,
    );
  }

  if (parameters.stacking) {
    if (parameters.wallThickness + 1e-9 < MINIMUM_STACKING_WALL_MM) {
      add(
        "wallThickness",
        `Outer walls must be at least ${mm(MINIMUM_STACKING_WALL_MM)} mm when the bin stacks. A stacked bin carries the bins above it. Use a thicker wall, or turn the stacking lip off.`,
      );
    }
    if (layout.wallRemainder + 1e-9 < RECESS_WALL_RESERVE_MM) {
      const needed = parameters.lipWallThickness + parameters.stackClearance * 2;
      const start =
        `A lip wall of ${mm(parameters.lipWallThickness)} mm with two ${mm(parameters.stackClearance)} mm clearances takes ${mm(needed)} mm of the ${mm(parameters.wallThickness)} mm outer wall. ` +
        `The recess must leave ${mm(RECESS_WALL_RESERVE_MM)} mm of wall.`;
      // Each fix must be a value the field can hold. A fix outside a field's
      // own range is not a fix, so it stays out of the message.
      const fixes: string[] = [];
      if (layout.maximumLipWall + 1e-9 >= PARTS_BIN_SPECS.lipWallThickness.min) {
        fixes.push(`a lip wall of at most ${mm(layout.maximumLipWall)} mm`);
      }
      if (layout.minimumWall <= PARTS_BIN_SPECS.wallThickness.max + 1e-9) {
        fixes.push(`an outer wall of at least ${mm(layout.minimumWall)} mm`);
      }
      if (layout.maximumClearance + 1e-9 >= PARTS_BIN_SPECS.stackClearance.min) {
        fixes.push(`a stacking clearance of at most ${mm(layout.maximumClearance)} mm`);
      }
      const fix =
        fixes.length > 0
          ? ` Use ${fixes.join(", or ")}.`
          : " No single value fixes this. Use a thinner lip wall and a thicker outer wall.";
      add("lipWallThickness", start + fix);
    }
  }

  return collector.result();
}
