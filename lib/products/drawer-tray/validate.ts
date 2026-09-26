import type { PrintContext } from "../../printer-profile";
import { IssueCollector, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  DRAWER_TRAY_SPECS,
  deriveTrayLayout,
  type AxisSpan,
  type DrawerTrayKey,
  type DrawerTrayParameters,
} from "./schema";

export const MINIMUM_COMPARTMENT_MM = 10;
export const MINIMUM_WALL_ABOVE_BASE_MM = 4;

/**
 * A rounded rectangle is symmetric and gets narrower as either coordinate
 * moves away from its center. Put the square as close to the center as its
 * cell allows; if that placement does not fit, no other placement can fit.
 */
function hasMinimumFloorSquare(
  column: AxisSpan,
  row: AxisSpan,
  insideWidth: number,
  insideDepth: number,
  innerRadius: number,
): boolean {
  const size = MINIMUM_COMPARTMENT_MM;
  if (column.size < size - 1e-9 || row.size < size - 1e-9) return false;

  const squareLeft = Math.max(column.start, Math.min(-size / 2, column.end - size));
  const squareFront = Math.max(row.start, Math.min(-size / 2, row.end - size));
  const extremeX = Math.max(Math.abs(squareLeft), Math.abs(squareLeft + size));
  const extremeY = Math.max(Math.abs(squareFront), Math.abs(squareFront + size));
  const straightHalfWidth = insideWidth / 2 - innerRadius;
  const straightHalfDepth = insideDepth / 2 - innerRadius;
  const curvedX = Math.max(0, extremeX - straightHalfWidth);
  const curvedY = Math.max(0, extremeY - straightHalfDepth);
  return curvedX * curvedX + curvedY * curvedY <= innerRadius * innerRadius + 1e-9;
}

export function validateDrawerTray(
  parameters: DrawerTrayParameters,
  context?: PrintContext,
): ValidationResult<DrawerTrayKey> {
  const collector = new IssueCollector<DrawerTrayKey>();
  validateAgainstSpecs(DRAWER_TRAY_SPECS, parameters, collector, context);
  const derived = deriveTrayLayout(parameters);
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

  for (const [axis, spans, sizeLabel, dimension] of [
    ["columnLayout", derived.columns.spans, "wide", "width"],
    ["rowLayout", derived.rows.spans, "deep", "depth"],
  ] as const) {
    spans.forEach((span, index) => {
      if (!Number.isFinite(span.size)) return;
      const item = axis === "columnLayout" ? "Column" : "Row";
      if (span.size <= 0) {
        add(axis, `${item} ${index + 1} has no usable ${dimension}; walls and dividers consume the available space.`);
      } else if (span.size < MINIMUM_COMPARTMENT_MM - 1e-9) {
        add(axis, `${item} ${index + 1} must be at least ${MINIMUM_COMPARTMENT_MM} mm ${sizeLabel}.`);
      }
    });
  }

  const innerRadius = Math.max(0, parameters.cornerRadius - parameters.wallThickness);
  if (
    Number.isFinite(innerRadius) &&
    Number.isFinite(derived.insideWidth) && derived.insideWidth > 0 &&
    Number.isFinite(derived.insideDepth) && derived.insideDepth > 0 &&
    innerRadius <= Math.min(derived.insideWidth, derived.insideDepth) / 2 &&
    derived.columns.spans.every((span) => Number.isFinite(span.start) && Number.isFinite(span.end)) &&
    derived.rows.spans.every((span) => Number.isFinite(span.start) && Number.isFinite(span.end))
  ) {
    const lastColumn = derived.columns.spans.length - 1;
    const lastRow = derived.rows.spans.length - 1;
    const corners = [
      [0, 0, "front-left"],
      [lastColumn, 0, "front-right"],
      [0, lastRow, "back-left"],
      [lastColumn, lastRow, "back-right"],
    ] as const;
    const checked = new Set<string>();
    for (const [columnIndex, rowIndex, corner] of corners) {
      const cell = `${rowIndex}:${columnIndex}`;
      if (checked.has(cell)) continue;
      checked.add(cell);
      const column = derived.columns.spans[columnIndex];
      const row = derived.rows.spans[rowIndex];
      if (column.size < MINIMUM_COMPARTMENT_MM - 1e-9 || row.size < MINIMUM_COMPARTMENT_MM - 1e-9) continue;
      if (!hasMinimumFloorSquare(column, row, derived.insideWidth, derived.insideDepth, innerRadius)) {
        const message = `${corner} corner (Row ${rowIndex + 1}, Column ${columnIndex + 1}) needs at least a ${MINIMUM_COMPARTMENT_MM} × ${MINIMUM_COMPARTMENT_MM} mm floor area inside the rounded cavity. Increase its row or column size, or reduce the corner radius.`;
        add("rowLayout", message);
        add("columnLayout", message);
      }
    }
  }

  return collector.result();
}
