import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  MINIMUM_FRONT_WALL_ABOVE_FLOOR_MM,
  MINIMUM_WELL_MM,
  REMOTE_CADDY_SPECS,
  deriveLayout,
  type RemoteCaddyKey,
  type RemoteCaddyLayout,
  type RemoteCaddyParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

/** "a, b, or c". One fix reads as one sentence. */
function fixList(fixes: string[]): string {
  if (fixes.length <= 1) return fixes[0] ?? "";
  return `${fixes.slice(0, -1).join(", ")}, or ${fixes[fixes.length - 1]}`;
}

/**
 * The message for a solved well that is too narrow. It offers only the fixes
 * that lead to a legal layout: it never asks the user to shrink a well below
 * the minimum, to remove a well the count needs, or to make the caddy wider
 * than the caddy can be. Returns null when the layout fits.
 */
function solvedWellMessage(
  parameters: RemoteCaddyParameters,
  layout: RemoteCaddyLayout,
): string | null {
  const wellsAreNumbers = layout.fixedWidths.every((width) => Number.isFinite(width));
  if (!wellsAreNumbers || !Number.isFinite(layout.solvedWidth)) return null;
  if (layout.solvedWidth >= MINIMUM_WELL_MM - 1e-9) return null;

  const shortfall = MINIMUM_WELL_MM - layout.solvedWidth;
  const widest = layout.fixedWidths[layout.widestFixedWell - 1];
  const fixes: string[] = [];
  if (Number.isFinite(widest) && widest - shortfall >= MINIMUM_WELL_MM - 1e-9) {
    fixes.push(`shrink well ${layout.widestFixedWell} by ${mm(shortfall)} mm`);
  }
  if (layout.wellCount > REMOTE_CADDY_SPECS.wellWidths.minCount) {
    fixes.push("remove a well");
  }
  if (parameters.caddyWidth + shortfall <= REMOTE_CADDY_SPECS.caddyWidth.max + 1e-9) {
    fixes.push(`make the caddy ${mm(shortfall)} mm wider`);
  }
  const fix = fixes.length ? fixList(fixes) : "use narrower wells, or fewer of them";
  return `Well ${layout.wellCount} is solved to ${mm(layout.solvedWidth)} mm, and every well must be at least ${MINIMUM_WELL_MM} mm wide. ${fix.charAt(0).toUpperCase()}${fix.slice(1)}.`;
}

export function validateRemoteCaddy(
  parameters: RemoteCaddyParameters,
): ValidationResult<RemoteCaddyKey> {
  const collector = new IssueCollector<RemoteCaddyKey>();
  const add = collector.add.bind(collector);
  const numbersOk = (
    [
      "caddyWidth",
      "caddyDepth",
      "caddyHeight",
      "wellDepth",
      "frontWallHeight",
      "wallThickness",
      "baseThickness",
      "dividerThickness",
      "cornerRadius",
    ] as const
  ).every((key) => Number.isFinite(parameters[key]));
  const layout = deriveLayout(parameters);

  // The solved well is reported before the spec ranges. Normalization writes
  // the solved width into the last well (D-1415), so a solved well that is
  // too narrow also fails the spec range. Both messages stay in the result,
  // and the form shows this one, because it names the fix.
  if (numbersOk) {
    const message = solvedWellMessage(parameters, layout);
    if (message) add("wellWidths", message);
  }

  validateAgainstSpecs(REMOTE_CADDY_SPECS, parameters, collector);
  if (!numbersOk) return collector.result();

  const deepestWell = parameters.caddyHeight - parameters.baseThickness;
  if (parameters.wellDepth > deepestWell + 1e-9) {
    add(
      "wellDepth",
      `Well depth must be at most ${mm(deepestWell)} mm, so that ${mm(parameters.baseThickness)} mm of base stays under the wells.`,
    );
  }

  // The corner radius needs no rule of its own: its maximum is 20 mm and the
  // smallest side of the caddy is 60 mm, so the radius always stays under
  // half the shorter side. The dividers are clipped to the outer profile, so
  // a large radius cannot open a well into the outside.

  if (parameters.frontWallHeight > parameters.caddyHeight + 1e-9) {
    add(
      "frontWallHeight",
      `Front wall height must be at most the caddy height, ${mm(parameters.caddyHeight)} mm.`,
    );
  } else if (
    parameters.wellDepth <= deepestWell + 1e-9 &&
    parameters.frontWallHeight <
      layout.floorZ + MINIMUM_FRONT_WALL_ABOVE_FLOOR_MM - 1e-9
  ) {
    add(
      "frontWallHeight",
      `Front wall height must be at least ${mm(layout.floorZ + MINIMUM_FRONT_WALL_ABOVE_FLOOR_MM)} mm, so the wall stands ${MINIMUM_FRONT_WALL_ABOVE_FLOOR_MM} mm above the well floor at ${mm(layout.floorZ)} mm.`,
    );
  }

  return collector.result();
}
