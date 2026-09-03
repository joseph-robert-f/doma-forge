import { formatMillimeters } from "./products/shared";
import type { ParameterSpec } from "./products/types";

/**
 * The local printer profile. It holds what one machine needs to print a part
 * at the size the user asked for: the build volume, the nozzle, and the two
 * dimensional corrections.
 *
 * A correction is the amount the machine prints small in that axis. A part
 * that measures 0.5 mm under its target gets a correction of +0.5 mm. The
 * app adds the correction to the modeled part. It never changes the target,
 * the design file, or the stored design.
 *
 * One profile per device. The profile is local to the browser. It is not part
 * of a design file, because the same design must print correctly on another
 * machine after that machine's own correction.
 */
export interface PrinterProfileV1 {
  version: typeof PRINTER_PROFILE_VERSION;
  /** A label for the machine. It is never used in a file name. */
  name: string;
  /** Bed size in millimeters, along X, Y, and Z. */
  bedWidth: number;
  bedDepth: number;
  bedHeight: number;
  nozzleDiameter: number;
  /** Millimeters added to every compensable X dimension. */
  correctionX: number;
  /** Millimeters added to every compensable Y dimension. */
  correctionY: number;
}

export const PRINTER_PROFILE_VERSION = 1;

export const PRINTER_NAME_MAX_LENGTH = 60;

export const PRINTER_PROFILE_DEFAULTS: PrinterProfileV1 = {
  version: PRINTER_PROFILE_VERSION,
  name: "My printer",
  bedWidth: 220,
  bedDepth: 220,
  bedHeight: 250,
  nozzleDiameter: 0.4,
  correctionX: 0,
  correctionY: 0,
};

export type PrinterNumberField =
  | "bedWidth"
  | "bedDepth"
  | "bedHeight"
  | "nozzleDiameter"
  | "correctionX"
  | "correctionY";

export interface PrinterFieldLimit {
  min: number;
  max: number;
  step: number;
  label: string;
}

/**
 * Hard limits. They exist to stop a value that cannot describe a printer,
 * such as a text entry, an infinity, or a correction of one meter. They are
 * deliberately wide. A value outside a limit is clamped and reported; it is
 * never used without a message.
 */
export const PRINTER_LIMITS: Record<PrinterNumberField, PrinterFieldLimit> = {
  bedWidth: { min: 1, max: 5000, step: 1, label: "Bed width" },
  bedDepth: { min: 1, max: 5000, step: 1, label: "Bed depth" },
  bedHeight: { min: 1, max: 5000, step: 1, label: "Bed height" },
  nozzleDiameter: { min: 0.05, max: 5, step: 0.05, label: "Nozzle diameter" },
  correctionX: { min: -25, max: 25, step: 0.05, label: "X correction" },
  correctionY: { min: -25, max: 25, step: 0.05, label: "Y correction" },
};

export const PRINTER_NUMBER_FIELDS = Object.keys(
  PRINTER_LIMITS,
) as PrinterNumberField[];

/** Rounds to 0.001 mm, the same grid the parameter normalizer uses. */
function roundMillimeters(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, limit: PrinterFieldLimit): number {
  return Math.min(limit.max, Math.max(limit.min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

export function normalizePrinterName(value: unknown): string {
  if (typeof value !== "string") return PRINTER_PROFILE_DEFAULTS.name;
  const trimmed = value.trim().slice(0, PRINTER_NAME_MAX_LENGTH);
  return trimmed === "" ? PRINTER_PROFILE_DEFAULTS.name : trimmed;
}

/**
 * Builds a complete, usable profile from unknown input. A missing or
 * unreadable value takes the default. A value outside its limit is clamped.
 * The result is always safe to hand to `compensate`.
 */
export function normalizePrinterProfile(input: unknown): PrinterProfileV1 {
  const source = isRecord(input) ? input : {};
  const profile: PrinterProfileV1 = {
    ...PRINTER_PROFILE_DEFAULTS,
    name: normalizePrinterName(source.name),
  };
  for (const field of PRINTER_NUMBER_FIELDS) {
    const numeric = toNumber(source[field]);
    profile[field] = Number.isFinite(numeric)
      ? roundMillimeters(clamp(numeric, PRINTER_LIMITS[field]))
      : PRINTER_PROFILE_DEFAULTS[field];
  }
  return profile;
}

export interface PrinterProfileIssue {
  field: PrinterNumberField | "name";
  message: string;
}

/**
 * Reports every value that `normalizePrinterProfile` had to change. The UI
 * shows these messages, so a clamped or rejected entry is never silent.
 */
export function validatePrinterProfile(input: unknown): PrinterProfileIssue[] {
  const source = isRecord(input) ? input : {};
  const issues: PrinterProfileIssue[] = [];
  for (const field of PRINTER_NUMBER_FIELDS) {
    if (source[field] === undefined) continue;
    const limit = PRINTER_LIMITS[field];
    const numeric = toNumber(source[field]);
    if (!Number.isFinite(numeric)) {
      issues.push({ field, message: `${limit.label} must be a number.` });
    } else if (numeric < limit.min || numeric > limit.max) {
      issues.push({
        field,
        message: `${limit.label} must be between ${limit.min} and ${limit.max} mm.`,
      });
    }
  }
  if (source.name !== undefined && typeof source.name !== "string") {
    issues.push({ field: "name", message: "Printer name must be text." });
  }
  return issues;
}

/** True when at least one axis carries a correction. */
export function hasCorrection(profile: PrinterProfileV1): boolean {
  return profile.correctionX !== 0 || profile.correctionY !== 0;
}

/**
 * The parameters a product exposes to dimensional correction. `x` names the
 * parameters that set an outside dimension along X, `y` the same along Y,
 * and `diameter` the parameters that set a round outside dimension, which
 * spans both. A parameter that is in no list is never changed by a
 * correction.
 */
export interface CompensableParameters {
  x?: readonly string[];
  y?: readonly string[];
  /**
   * A diameter takes the mean of the X and Y corrections, once. A machine
   * that prints small by different amounts on the two axes prints a circle
   * as a slight oval, and one number cannot correct that; the mean keeps
   * the average size right. See 28_CONTRACT_FOLLOW_UPS_NOTES.md, D-1704.
   */
  diameter?: readonly string[];
}

/** The correction a diameter takes: the mean of the two axis corrections. */
export function diameterCorrection(profile: PrinterProfileV1): number {
  return roundMillimeters((profile.correctionX + profile.correctionY) / 2);
}

/**
 * Adds the printer correction to the compensable parameters. Pure: it reads
 * nothing outside its arguments, changes no argument, and returns a new
 * object. With a zero correction, or with no compensable list, the result is
 * deep-equal to the input.
 *
 * Formula, per axis: `modeled = target + correction`.
 */
export function compensate<P extends Record<string, unknown>>(
  parameters: P,
  profile: PrinterProfileV1,
  compensable?: CompensableParameters,
): P {
  const result: Record<string, unknown> = { ...parameters };
  const axes: Array<[readonly string[] | undefined, number]> = [
    [compensable?.x, profile.correctionX],
    [compensable?.y, profile.correctionY],
    [compensable?.diameter, diameterCorrection(profile)],
  ];
  for (const [keys, correction] of axes) {
    if (!keys || !Number.isFinite(correction) || correction === 0) continue;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(parameters, key)) continue;
      const value = result[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      result[key] = roundMillimeters(value + correction);
    }
  }
  return result as P;
}

/** The size of a part along X, Y, and Z, taken from a bounds contract. */
export interface Extents {
  x: number;
  y: number;
  z: number;
}

export function extentsFromBounds(bounds: {
  min: [number, number, number];
  max: [number, number, number];
}): Extents {
  return {
    x: bounds.max[0] - bounds.min[0],
    y: bounds.max[1] - bounds.min[1],
    z: bounds.max[2] - bounds.min[2],
  };
}

/**
 * What a product's validation may read from the printer profile: the bed,
 * as three extents, or null while the profile still holds the placeholder
 * bed nobody entered, and the nozzle. A product that reads the bed uses a
 * reference size when it is null, so an unsaved profile changes nothing.
 * See 29_PRINT_CONTEXT_NOTES.md, decision D-1801.
 */
export interface PrintContext {
  bed: Extents | null;
  /**
   * The nozzle from the profile. Unlike the bed it has no "known" flag: the
   * profile's default nozzle is a real, common size, and the thin-wall rule
   * already reads it the same way.
   */
  nozzleDiameter: number;
}

/** The bed a product's widest rule reads: the person's, or the reference. */
export interface BedLimit {
  /** The widest the part may be: the bed less the product's margin. */
  limit: number;
  /** The smaller bed axis the limit came from. */
  bedWidth: number;
  /** True when the bed is the saved profile's, false for the reference. */
  known: boolean;
}

export function printContextOf(
  profile: PrinterProfileV1,
  bedIsKnown: boolean,
): PrintContext {
  return {
    bed: bedIsKnown
      ? { x: profile.bedWidth, y: profile.bedDepth, z: profile.bedHeight }
      : null,
    nozzleDiameter: profile.nozzleDiameter,
  };
}


export interface CompensationNote {
  axis: "x" | "y";
  axisLabel: "X" | "Y";
  target: number;
  modeled: number;
  correction: number;
  text: string;
}

const AXIS_EPSILON = 1e-6;

function formatMm(value: number): string {
  return formatMillimeters(value, 3);
}

/**
 * One line per compensated axis: what the app models, what the user asked
 * for, and the difference. The numbers come from the part itself, before and
 * after compensation, so the line states the real printed effect.
 */
export function compensationNotes(
  target: Extents,
  modeled: Extents,
): CompensationNote[] {
  const notes: CompensationNote[] = [];
  // The note reads the part itself, before and after compensation, so a
  // diameter that took the mean of the two corrections shows on both axes
  // even when one axis correction is zero (D-1714).
  const axes: Array<["x" | "y", "X" | "Y"]> = [
    ["x", "X"],
    ["y", "Y"],
  ];
  for (const [axis, axisLabel] of axes) {
    const targetValue = target[axis];
    const modeledValue = modeled[axis];
    if (!Number.isFinite(targetValue) || !Number.isFinite(modeledValue))
      continue;
    const difference = roundMillimeters(modeledValue - targetValue);
    if (Math.abs(difference) <= AXIS_EPSILON) continue;
    const sign = difference < 0 ? "−" : "+";
    notes.push({
      axis,
      axisLabel,
      target: targetValue,
      modeled: modeledValue,
      correction: difference,
      text: `Modeled ${formatMm(modeledValue)} mm = target ${formatMm(targetValue)} mm ${sign} ${formatMm(Math.abs(difference))} mm correction`,
    });
  }
  return notes;
}

export interface CalibrationProposal {
  axis: "x" | "y";
  axisLabel: "X" | "Y";
  existing: number;
  expected: number;
  measured: number;
  proposed: number;
  text: string;
}

/**
 * The correction to propose after a measurement of a printed part.
 *
 * `proposed = existing + expected − measured`
 *
 * `expected` is the size the app modeled, which already holds the existing
 * correction. `measured` is the size of the printed part. Apply replaces the
 * existing correction with the proposal. It never adds to it.
 */
export function calibrationProposal(
  axis: "x" | "y",
  existing: number,
  expected: number,
  measured: number,
): CalibrationProposal | null {
  if (
    !Number.isFinite(existing) ||
    !Number.isFinite(expected) ||
    !Number.isFinite(measured) ||
    measured <= 0
  ) {
    return null;
  }
  const axisLabel = axis === "x" ? "X" : "Y";
  const limit =
    axis === "x" ? PRINTER_LIMITS.correctionX : PRINTER_LIMITS.correctionY;
  const proposed = roundMillimeters(
    clamp(existing + expected - measured, limit),
  );
  return {
    axis,
    axisLabel,
    existing,
    expected,
    measured,
    proposed,
    text: `New ${axisLabel} correction ${formatMm(proposed)} mm = existing ${formatMm(existing)} mm + expected ${formatMm(expected)} mm − measured ${formatMm(measured)} mm`,
  };
}

export interface PrinterWarning {
  id: string;
  text: string;
}

/** A wall-like parameter, with the value the user set for it. */
export interface WallValue {
  key: string;
  label: string;
  value: number;
}

const WALL_LIKE_KEY = /wall|thickness/i;

/**
 * The parameters that describe a printed wall. The product contract does not
 * name them, so they are found by key and unit. A number parameter in
 * millimeters whose key holds "wall" or "thickness" is a wall.
 */
export function wallLikeKeys(specs: Record<string, ParameterSpec>): string[] {
  return Object.keys(specs).filter((key) => {
    const spec = specs[key];
    return (
      spec.kind === "number" && spec.unit === "mm" && WALL_LIKE_KEY.test(key)
    );
  });
}

/**
 * The wall-like parameters with their values, for a product that does not
 * report its own printed walls. A product with solved webs, legs, ribs, or
 * fixed lips reports those itself through `printedWalls` and may start from
 * this list. See 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1703.
 */
export function wallsFromSpecs(
  specs: Record<string, ParameterSpec>,
  parameters: Record<string, unknown>,
): WallValue[] {
  return wallLikeKeys(specs).map((key) => ({
    key,
    label: specs[key].label,
    value: parameters[key] as number,
  }));
}

const AXIS_NAMES: Array<["x" | "y" | "z", "X" | "Y" | "Z"]> = [
  ["x", "X"],
  ["y", "Y"],
  ["z", "Z"],
];

/**
 * Build-volume warnings. These are warnings, not errors: a part larger than
 * the bed still downloads, because a person can split it or use another
 * machine. The test is strict: a part equal to the bed passes, and a part
 * larger than the bed warns.
 *
 * `bedIsKnown` is false while the app holds only the placeholder bed size.
 * The rule then gives no warning at all, because a warning about a bed that
 * nobody entered is noise.
 */
export function bedWarnings(
  extents: Extents | null,
  profile: PrinterProfileV1,
  bedIsKnown: boolean,
): PrinterWarning[] {
  if (!extents || !bedIsKnown) return [];
  const warnings: PrinterWarning[] = [];
  const beds: Record<"x" | "y" | "z", number> = {
    x: profile.bedWidth,
    y: profile.bedDepth,
    z: profile.bedHeight,
  };
  for (const [axis, axisLabel] of AXIS_NAMES) {
    const size = extents[axis];
    const bed = beds[axis];
    if (!Number.isFinite(size) || !Number.isFinite(bed)) continue;
    if (size - bed > AXIS_EPSILON) {
      warnings.push({
        id: `bed-${axis}`,
        text: `The part is ${formatMm(size)} mm in ${axisLabel}. The bed is ${formatMm(bed)} mm in ${axisLabel}.`,
      });
    }
  }
  return warnings;
}

/**
 * Walls thinner than two nozzle widths. These are errors, not warnings.
 * 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 1, rule 9: "A wall or web below
 * two nozzle widths is a validation error. Do not print it." The app
 * therefore refuses the download and names the nozzle and the wall.
 */
export function thinWallIssues(
  walls: WallValue[],
  profile: PrinterProfileV1,
): PrinterWarning[] {
  const minimumWall = roundMillimeters(profile.nozzleDiameter * 2);
  const issues: PrinterWarning[] = [];
  for (const wall of walls) {
    if (!Number.isFinite(wall.value)) continue;
    if (minimumWall - wall.value > AXIS_EPSILON) {
      issues.push({
        id: `wall-${wall.key}`,
        text: `${wall.label} is ${formatMm(wall.value)} mm. A ${formatMm(profile.nozzleDiameter)} mm nozzle needs at least ${formatMm(minimumWall)} mm. A thin wall is weak.`,
      });
    }
  }
  return issues;
}

/**
 * The corrections that actually reach a product. A product with no
 * compensable list is never compensated, so it must be read with a profile
 * that carries no correction. Otherwise a calibration proposal or a file
 * name would claim a correction that no parameter received.
 */
export function activeCorrections(
  profile: PrinterProfileV1,
  compensable: CompensableParameters | undefined,
): PrinterProfileV1 {
  const compensates = Boolean(
    compensable?.x?.length ||
    compensable?.y?.length ||
    compensable?.diameter?.length,
  );
  return compensates ? profile : { ...profile, correctionX: 0, correctionY: 0 };
}

/**
 * Messages for a target value that is legal on its own but leaves its limit
 * once the correction is added. The field shows a legal number, so the
 * message must name the correction, not the field limit.
 */
export function correctionRangeMessages(
  failedFields: readonly string[],
  compensable: CompensableParameters | undefined,
  profile: PrinterProfileV1,
  label: (field: string) => string,
): string[] {
  const messages: string[] = [];
  const axes: Array<[string, readonly string[] | undefined, number]> = [
    ["X", compensable?.x, profile.correctionX],
    ["Y", compensable?.y, profile.correctionY],
    ["mean X and Y", compensable?.diameter, diameterCorrection(profile)],
  ];
  for (const [axisLabel, keys, correction] of axes) {
    if (!keys || correction === 0) continue;
    for (const key of keys) {
      if (!failedFields.includes(key)) continue;
      messages.push(
        `The ${axisLabel} correction takes the ${label(key).toLowerCase()} past its limit.`,
      );
    }
  }
  return messages;
}

/** 0.5 -> "0p5", -0.2 -> "m0p2". Locale independent, safe in a file name. */
function correctionTagNumber(value: number): string {
  const rounded = Number(value.toFixed(3));
  const text = Math.abs(rounded).toString().replace(".", "p");
  return rounded < 0 ? `m${text}` : text;
}

/**
 * The file-name marker for an active correction, or an empty string. Two
 * files built from one design under different corrections therefore get
 * different names, while the design hash itself stays the target's hash.
 * With a compensable list, only the corrections that reach the product are
 * marked: `x` and `y` for the axis lists, `d` with the mean for the diameter
 * list (D-1714). Without a list every nonzero axis is marked, as before.
 */
export function correctionFilenameTag(
  profile: PrinterProfileV1,
  compensable?: CompensableParameters,
): string {
  const parts: string[] = [];
  const marksX = compensable ? Boolean(compensable.x?.length) : true;
  const marksY = compensable ? Boolean(compensable.y?.length) : true;
  const marksDiameter = Boolean(compensable?.diameter?.length);
  if (marksX && profile.correctionX !== 0)
    parts.push(`x${correctionTagNumber(profile.correctionX)}`);
  if (marksY && profile.correctionY !== 0)
    parts.push(`y${correctionTagNumber(profile.correctionY)}`);
  const mean = diameterCorrection(profile);
  if (marksDiameter && mean !== 0) parts.push(`d${correctionTagNumber(mean)}`);
  return parts.length === 0 ? "" : `c${parts.join("")}`;
}

/** Inserts the correction marker before the file extension. */
export function withCorrectionTag(
  filename: string,
  profile: PrinterProfileV1,
  compensable?: CompensableParameters,
): string {
  const tag = correctionFilenameTag(profile, compensable);
  if (!tag) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename}-${tag}`;
  return `${filename.slice(0, dot)}-${tag}${filename.slice(dot)}`;
}
