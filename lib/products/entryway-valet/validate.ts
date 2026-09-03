import { IssueCollector, formatMillimeters, validateAgainstSpecs } from "../shared";
import type { ValidationResult } from "../types";
import {
  ENTRYWAY_VALET_SPECS,
  MINIMUM_WELL_MM,
  REST_MINIMUM_TOP_MM,
  SLOT_LIP_HEIGHT_MM,
  deriveLayout,
  type EntrywayValetKey,
  type EntrywayValetLayout,
  type EntrywayValetParameters,
} from "./schema";

const mm = (value: number) => formatMillimeters(value, 1);

function fixList(fixes: string[]): string {
  if (fixes.length <= 1) return fixes[0] ?? "";
  return `${fixes.slice(0, -1).join(", ")}, or ${fixes[fixes.length - 1]}`;
}

/**
 * The message for a solved well that is too narrow. It offers only fixes
 * that lead to a legal layout, exactly as the remote caddy does.
 */
function solvedWellMessage(
  parameters: EntrywayValetParameters,
  layout: EntrywayValetLayout,
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
  if (layout.wellCount > ENTRYWAY_VALET_SPECS.wellWidths.minCount) {
    fixes.push("remove a well");
  }
  if (parameters.valetWidth + shortfall <= ENTRYWAY_VALET_SPECS.valetWidth.max + 1e-9) {
    fixes.push(`make the valet ${mm(shortfall)} mm wider`);
  }
  const fix = fixes.length ? fixList(fixes) : "use narrower wells, or fewer of them";
  return `Well ${layout.wellCount} is solved to ${mm(layout.solvedWidth)} mm, and every well must be at least ${MINIMUM_WELL_MM} mm wide. ${fix.charAt(0).toUpperCase()}${fix.slice(1)}.`;
}

export function validateEntrywayValet(
  parameters: EntrywayValetParameters,
): ValidationResult<EntrywayValetKey> {
  const collector = new IssueCollector<EntrywayValetKey>();
  const add = collector.add.bind(collector);
  const layout = deriveLayout(parameters);

  if (layout.numbersOk) {
    const message = solvedWellMessage(parameters, layout);
    if (message) add("wellWidths", message);
  }
  validateAgainstSpecs(ENTRYWAY_VALET_SPECS, parameters, collector);
  if (!layout.numbersOk) return collector.result();

  if (parameters.baseThickness > parameters.valetHeight - SLOT_LIP_HEIGHT_MM + 1e-9) {
    add(
      "valetHeight",
      `Wall height must be at least ${mm(parameters.baseThickness + SLOT_LIP_HEIGHT_MM)} mm, so the slot lip stands ${SLOT_LIP_HEIGHT_MM} mm above the base.`,
    );
  }
  if (parameters.restHeight < parameters.valetHeight - 1e-9) {
    add(
      "restHeight",
      `Rest height must be at least the wall height, ${mm(parameters.valetHeight)} mm, so the rest stands above the back wall.`,
    );
  }

  // The rest is a wedge. Its face leans back by the rest angle, so the
  // wedge thins toward its top. It must keep 4 mm of material there.
  if (layout.wedgeTopDepth < REST_MINIMUM_TOP_MM - 1e-9) {
    const thin = `The rest is ${mm(layout.wedgeTopDepth)} mm thick at its top, and it must keep ${REST_MINIMUM_TOP_MM} mm.`;
    if (layout.maximumWellDepth >= ENTRYWAY_VALET_SPECS.wellDepth.min - 1e-9) {
      add(
        "wellDepth",
        `${thin} Use a well depth of at most ${mm(layout.maximumWellDepth)} mm, a lower rest, a smaller rest angle, or a deeper valet.`,
      );
    } else {
      // No legal well depth leaves the rest its top thickness: the rest
      // itself, or the valet depth, has to change.
      add(
        "restHeight",
        `${thin} No well depth allows this rest. Use a lower rest, a smaller rest angle, or a deeper valet.`,
      );
    }
  }

  return collector.result();
}
