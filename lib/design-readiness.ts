import type { PrinterWarning } from "./printer-profile";
import type { ValidationResult } from "./products/types";

/** Dimension validity controls generation; print checks also control export. */
export function designReadiness(
  validation: ValidationResult<string>,
  correctionMessages: readonly string[],
  wallIssues: readonly PrinterWarning[],
) {
  const canGenerate = validation.valid && correctionMessages.length === 0;
  if (!validation.valid) {
    const count = validation.issues.length;
    return {
      canGenerate,
      checksPassed: false,
      title: `${count} setting${count === 1 ? " needs" : "s need"} attention`,
      detail: "The last valid preview stays visible while you make corrections.",
      downloadBlockReason: `Fix ${count} setting${count === 1 ? "" : "s"} before downloading.`,
    };
  }
  if (correctionMessages.length) {
    const reason = correctionMessages.join(" ");
    return {
      canGenerate,
      checksPassed: false,
      title: "The printer correction leaves a limit",
      detail: `${reason} Lower the correction, or change the value.`,
      downloadBlockReason: reason,
    };
  }
  if (wallIssues.length) {
    const reason = wallIssues.map((issue) => issue.text).join(" ");
    return {
      canGenerate,
      checksPassed: false,
      title: "Printed walls need attention",
      detail: reason,
      downloadBlockReason: reason,
    };
  }
  return {
    canGenerate,
    checksPassed: true,
    title: "Design checks passed",
    detail: "The current dimensions are safe to generate and export.",
    downloadBlockReason: null,
  };
}
