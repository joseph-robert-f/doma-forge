import type { PrintContext } from "../../printer-profile";
import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  MARKER_CUP_BLOCK_SPECS,
  MINIMUM_WEB_MM,
  chamferExtraFor,
  deriveLayout,
  type MarkerCupBlockKey,
  type MarkerCupBlockParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);
const degrees = (value: number) => formatMillimeters(value, 0);
const DEGREES_TO_RADIANS = Math.PI / 180;

export function validateMarkerCupBlock(
  parameters: MarkerCupBlockParameters,
  context?: PrintContext,
): ValidationResult<MarkerCupBlockKey> {
  const collector = new IssueCollector<MarkerCupBlockKey>();
  validateAgainstSpecs(MARKER_CUP_BLOCK_SPECS, parameters, collector, context);
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "blockWidth",
      "blockDepth",
      "blockHeight",
      "rows",
      "cupsPerRow",
      "boreDiameter",
      "boreDepth",
      "tiltDegrees",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  if (!numbersOk) return collector.result();

  const layout = deriveLayout(parameters);
  const tiltRadians = parameters.tiltDegrees * DEGREES_TO_RADIANS;

  // The deepest allowed bore depth, not the floor center's vertical drop
  // alone: a tilted floor disc dips further at its low edge (radius times
  // sin(tilt)), and a chamfered mouth is wider still. See
  // `boreVerticalReach` in schema.ts, which this is the inverse of.
  const radius = parameters.boreDiameter / 2;
  const chamferExtra = chamferExtraFor(parameters);
  const deepestBore =
    (parameters.blockHeight - parameters.baseThickness - (radius + chamferExtra) * Math.sin(tiltRadians)) /
    Math.cos(tiltRadians);
  if (parameters.boreDepth > deepestBore + 1e-9) {
    add(
      "boreDepth",
      `Bore depth must be at most ${mm(deepestBore)} mm at this tilt, so that ${mm(parameters.baseThickness)} mm of base stays under the bores.`,
    );
  }

  const shorterSide = Math.min(parameters.blockWidth, parameters.blockDepth);
  if (parameters.cornerRadius > shorterSide / 2) {
    add(
      "cornerRadius",
      `Corner radius must be at most ${mm(shorterSide / 2)} mm, half the shorter outside dimension.`,
    );
  }

  layout.rowLayouts.forEach((result, index) => {
    if (result.ok) return;
    const row = index + 1;
    const count = parameters.cupsPerRow;
    if (result.web < 0) {
      add(
        "cupsPerRow",
        `Row ${row}: ${count} cups of ${mm(parameters.boreDiameter)} mm do not fit in the ${mm(layout.innerWidth)} mm inside the rim. Use fewer cups per row, a smaller bore, or a wider block.`,
      );
    } else {
      add(
        "cupsPerRow",
        `Row ${row}: ${count} cups of ${mm(parameters.boreDiameter)} mm leave a web of ${mm(result.web)} mm. Keep at least ${mm(MINIMUM_WEB_MM)} mm between cups. Use fewer cups per row, a smaller bore, or a wider block.`,
      );
    }
  });

  if (!layout.rowSpacing.ok) {
    add(
      "rows",
      layout.rowSpacing.web < 0
        ? `${parameters.rows} rows of ${mm(parameters.boreDiameter)} mm bores do not fit in the ${mm(layout.innerDepth)} mm inside the rim at this tilt. Use fewer rows, a smaller bore, less tilt, or a deeper block.`
        : `${parameters.rows} rows of ${mm(parameters.boreDiameter)} mm bores leave ${mm(layout.rowSpacing.web)} mm between rows at this tilt. Keep at least ${mm(MINIMUM_WEB_MM)} mm. Use fewer rows, a smaller bore, less tilt, or a deeper block.`,
    );
  }

  if (layout.cornerConflicts.length > 0) {
    const worst = layout.cornerConflicts.reduce((lowest, conflict) =>
      conflict.maximumCornerRadius < lowest.maximumCornerRadius ? conflict : lowest,
    );
    if (worst.maximumCornerRadius > 0) {
      const tiltFix = parameters.tiltDegrees > 0 ? ", or less tilt" : "";
      add(
        "cornerRadius",
        `Corner radius ${mm(parameters.cornerRadius)} mm cuts into the end cups of row ${worst.row}, at the mouth or where the tilted floor exits. Use at most ${mm(worst.maximumCornerRadius)} mm, a smaller bore${tiltFix}.`,
      );
    } else if (worst.maximumTiltDegrees != null) {
      // A corner radius, even a square one, is not the fix here: the
      // straight wall itself is too close at this tilt.
      add(
        "tiltDegrees",
        `Tilt of ${degrees(parameters.tiltDegrees)} degrees pushes the tilted floor of row ${worst.row} past the wall. Use at most ${degrees(worst.maximumTiltDegrees)} degrees, a smaller bore, or a wider or deeper block.`,
      );
    } else if (worst.maximumBoreDepth != null) {
      add(
        "boreDepth",
        `Bore depth ${mm(parameters.boreDepth)} mm pushes the tilted floor of row ${worst.row} past the wall. Use at most ${mm(worst.maximumBoreDepth)} mm, less tilt, a smaller bore, or a wider or deeper block.`,
      );
    } else {
      add(
        "cornerRadius",
        `The end cups of row ${worst.row} do not clear the wall, at any corner radius, tilt, or bore depth tried. Use a smaller bore, or a wider or deeper block.`,
      );
    }
  }

  return collector.result();
}
