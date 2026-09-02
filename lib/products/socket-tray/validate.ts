import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  MINIMUM_WEB_MM,
  SOCKET_TRAY_SPECS,
  deriveLayout,
  type SocketTrayKey,
  type SocketTrayParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

export function validateSocketTray(
  parameters: SocketTrayParameters,
): ValidationResult<SocketTrayKey> {
  const collector = new IssueCollector<SocketTrayKey>();
  validateAgainstSpecs(SOCKET_TRAY_SPECS, parameters, collector);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "trayWidth",
      "trayDepth",
      "trayHeight",
      "rows",
      "holesPerRow",
      "boreDepth",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = deriveLayout(parameters);

  const deepestBore = parameters.trayHeight - parameters.baseThickness;
  if (parameters.boreDepth > deepestBore + 1e-9) {
    add(
      "boreDepth",
      `Bore depth must be at most ${mm(deepestBore)} mm, so that ${mm(parameters.baseThickness)} mm of base stays under the bores.`,
    );
  }

  const shorterSide = Math.min(parameters.trayWidth, parameters.trayDepth);
  if (parameters.cornerRadius > shorterSide / 2) {
    add(
      "cornerRadius",
      `Corner radius must be at most ${mm(shorterSide / 2)} mm, half the shorter outside dimension.`,
    );
  }

  layout.rowLayouts.forEach((result, index) => {
    if (result.ok) return;
    const diameter = layout.rowDiameters[index];
    if (!Number.isFinite(diameter)) return;
    const row = index + 1;
    const count = parameters.holesPerRow;
    if (result.web < 0) {
      add(
        "holesPerRow",
        `Row ${row}: ${count} bores of ${mm(diameter)} mm do not fit in the ${mm(layout.innerWidth)} mm inside the rim. Use fewer bores per row, a smaller row ${row} bore, or a wider tray.`,
      );
    } else {
      add(
        "holesPerRow",
        `Row ${row}: ${count} bores of ${mm(diameter)} mm leave a web of ${mm(result.web)} mm. Keep at least ${mm(MINIMUM_WEB_MM)} mm between bores. Use fewer bores per row, a smaller row ${row} bore, or a wider tray.`,
      );
    }
  });

  if (!layout.rowSpacing.ok) {
    const widest = Math.max(...layout.rowDiameters);
    if (Number.isFinite(widest)) {
      add(
        "rows",
        layout.rowSpacing.web < 0
          ? `${parameters.rows} rows of up to ${mm(widest)} mm do not fit in the ${mm(layout.innerDepth)} mm inside the rim. Use fewer rows, a smaller bore, or a deeper tray.`
          : `${parameters.rows} rows of up to ${mm(widest)} mm leave ${mm(layout.rowSpacing.web)} mm between rows. Keep at least ${mm(MINIMUM_WEB_MM)} mm. Use fewer rows, a smaller bore, or a deeper tray.`,
      );
    }
  }

  if (layout.cornerConflicts.length > 0) {
    const worst = layout.cornerConflicts.reduce((lowest, conflict) =>
      conflict.maximumCornerRadius < lowest.maximumCornerRadius ? conflict : lowest,
    );
    add(
      "cornerRadius",
      `Corner radius ${mm(parameters.cornerRadius)} mm cuts into the end bores of row ${worst.row}. Use at most ${mm(worst.maximumCornerRadius)} mm, or a smaller row ${worst.row} bore.`,
    );
  }

  return collector.result();
}
