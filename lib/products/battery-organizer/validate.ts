import type { PrintContext } from "../../printer-profile";
import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  BATTERY_ORGANIZER_SPECS,
  FINGER_RELIEF_WIDEN_MM,
  MINIMUM_WEB_MM,
  deriveLayout,
  standingLength,
  type BatteryOrganizerKey,
  type BatteryOrganizerParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);
/**
 * The row and row-spacing pitch solve only reserves `MINIMUM_WEB_MM`
 * between wells, using the plain well footprint (`cellFootprint`). The
 * finger relief counterbore is not itself a cutter the layout is solved
 * around — it only widens each well's mouth by `FINGER_RELIEF_WIDEN_MM`
 * (see `geometry.ts`'s `wellCutter`) — so a layout that clears the plain
 * minimum web can still merge two reliefs into one trough. When the
 * relief is on, the achieved web must clear this larger minimum too.
 */
const RELIEF_MINIMUM_WEB_MM = MINIMUM_WEB_MM + FINGER_RELIEF_WIDEN_MM;

export function validateBatteryOrganizer(
  parameters: BatteryOrganizerParameters,
  context?: PrintContext,
): ValidationResult<BatteryOrganizerKey> {
  const collector = new IssueCollector<BatteryOrganizerKey>();
  validateAgainstSpecs(BATTERY_ORGANIZER_SPECS, parameters, collector, context);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "organizerWidth",
      "organizerDepth",
      "organizerHeight",
      "rows",
      "cellsPerRow",
      "cellDiameter",
      "cellLength",
      "exposedHeight",
      "clearancePerSide",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const standing = standingLength(parameters.cellShape, parameters.cellDiameter, parameters.cellLength);
  if (parameters.exposedHeight >= standing) {
    add(
      "exposedHeight",
      `Exposed height must be less than the ${mm(standing)} mm standing length of the cell, so the well has depth to hold it.`,
    );
    return collector.result();
  }

  const layout = deriveLayout(parameters);

  const deepestWell = parameters.organizerHeight - parameters.baseThickness;
  if (layout.boreDepth > deepestWell + 1e-9) {
    add(
      "exposedHeight",
      `Exposed height must be at least ${mm(standing - deepestWell)} mm, so that ${mm(parameters.baseThickness)} mm of base stays under the wells. Or use a taller organizer.`,
    );
  }

  const shorterSide = Math.min(parameters.organizerWidth, parameters.organizerDepth);
  if (parameters.cornerRadius > shorterSide / 2) {
    add(
      "cornerRadius",
      `Corner radius must be at most ${mm(shorterSide / 2)} mm, half the shorter outside dimension.`,
    );
  }

  layout.rowLayouts.forEach((result, index) => {
    const row = index + 1;
    const count = parameters.cellsPerRow;
    if (!result.ok) {
      if (result.web < 0) {
        add(
          "cellsPerRow",
          `Row ${row}: ${count} cells do not fit in the ${mm(layout.innerWidth)} mm inside the rim. Use fewer cells per row, a smaller clearance, or a wider organizer.`,
        );
      } else {
        add(
          "cellsPerRow",
          `Row ${row}: ${count} cells leave a web of ${mm(result.web)} mm. Keep at least ${mm(MINIMUM_WEB_MM)} mm between wells. Use fewer cells per row, a smaller clearance, or a wider organizer.`,
        );
      }
      return;
    }
    if (parameters.fingerRelief && result.web < RELIEF_MINIMUM_WEB_MM - 1e-9) {
      add(
        "cellsPerRow",
        `Row ${row}: ${count} cells leave a web of ${mm(result.web)} mm, but the finger relief widens each well by ${mm(FINGER_RELIEF_WIDEN_MM)} mm. Keep at least ${mm(RELIEF_MINIMUM_WEB_MM)} mm between wells with the relief on, or turn off finger relief.`,
      );
    }
  });

  if (!layout.rowSpacing.ok) {
    add(
      "rows",
      layout.rowSpacing.web < 0
        ? `${parameters.rows} rows do not fit in the ${mm(layout.innerDepth)} mm inside the rim. Use fewer rows, a smaller clearance, or a deeper organizer.`
        : `${parameters.rows} rows leave ${mm(layout.rowSpacing.web)} mm between rows. Keep at least ${mm(MINIMUM_WEB_MM)} mm. Use fewer rows, a smaller clearance, or a deeper organizer.`,
    );
  } else if (parameters.fingerRelief && layout.rowSpacing.web < RELIEF_MINIMUM_WEB_MM - 1e-9) {
    add(
      "rows",
      `${parameters.rows} rows leave ${mm(layout.rowSpacing.web)} mm between rows, but the finger relief widens each well by ${mm(FINGER_RELIEF_WIDEN_MM)} mm. Keep at least ${mm(RELIEF_MINIMUM_WEB_MM)} mm between rows with the relief on, or turn off finger relief.`,
    );
  }

  if (layout.cornerConflicts.length > 0) {
    const worst = layout.cornerConflicts.reduce((lowest, conflict) =>
      conflict.maximumCornerRadius < lowest.maximumCornerRadius ? conflict : lowest,
    );
    add(
      "cornerRadius",
      `Corner radius ${mm(parameters.cornerRadius)} mm cuts into the end wells of row ${worst.row}. Use at most ${mm(worst.maximumCornerRadius)} mm, or turn off finger relief.`,
    );
  }

  return collector.result();
}
