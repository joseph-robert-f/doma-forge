import type { GeneratedModel } from "../kernel/mesh";
import type {
  ParameterSpec,
  ParametersOf,
  ValidationIssue,
  ValidationResult,
} from "./types";

/** "clearancePerSide" -> "clearance-per-side". Used for ids and test ids. */
export function parameterSlug(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function normalizeNumber(value: unknown): number {
  if (value === "") return Number.NaN;
  const converted = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(converted)) return Number.NaN;
  if (!Number.isFinite(converted)) return converted;
  return Math.round(converted * 1000) / 1000;
}

/**
 * Coerces unknown input into a full parameter object. Unknown keys are
 * dropped, missing keys take the default, numbers are rounded to 0.001 and
 * integer parameters to whole numbers. Invalid enum or boolean values fall
 * back to the default so a corrupt record can never select an unknown option.
 */
export function normalizeFromSpecs<Specs extends Record<string, ParameterSpec>>(
  specs: Specs,
  defaults: ParametersOf<Specs>,
  input: unknown,
): ParametersOf<Specs> {
  const result = { ...defaults } as Record<string, unknown>;
  const source =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  for (const key of Object.keys(specs)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const spec = specs[key];
    const value = source[key];
    switch (spec.kind) {
      case "number": {
        let numeric = normalizeNumber(value);
        if (spec.integer && Number.isFinite(numeric)) numeric = Math.round(numeric);
        result[key] = numeric;
        break;
      }
      case "boolean":
        if (typeof value === "boolean") result[key] = value;
        break;
      case "enum":
        if (
          typeof value === "string" &&
          spec.options.some((option) => option.value === value)
        ) {
          result[key] = value;
        }
        break;
    }
  }
  return result as ParametersOf<Specs>;
}

/** Collects issues without duplicates and builds the by-field index. */
export class IssueCollector<K extends string> {
  readonly issues: ValidationIssue<K>[] = [];

  add(field: K | "model", message: string) {
    if (
      !this.issues.some(
        (issue) => issue.field === field && issue.message === message,
      )
    ) {
      this.issues.push({ field, message });
    }
  }

  result(): ValidationResult<K> {
    const byField: ValidationResult<K>["byField"] = {};
    for (const issue of this.issues) {
      (byField[issue.field] ??= []).push(issue.message);
    }
    return { valid: this.issues.length === 0, issues: this.issues, byField };
  }
}

/** Range, finiteness, and integer checks derived from the specs alone. */
export function validateAgainstSpecs<Specs extends Record<string, ParameterSpec>>(
  specs: Specs,
  parameters: ParametersOf<Specs>,
  collector: IssueCollector<keyof Specs & string>,
) {
  for (const key of Object.keys(specs) as Array<keyof Specs & string>) {
    const spec = specs[key];
    const value = parameters[key];
    switch (spec.kind) {
      case "number": {
        const numeric = value as number;
        if (!Number.isFinite(numeric)) {
          collector.add(key, `${spec.shortLabel} must be a number.`);
        } else if (numeric < spec.min || numeric > spec.max) {
          collector.add(
            key,
            `${spec.shortLabel} must be between ${spec.min} and ${spec.max}${spec.unit ? ` ${spec.unit}` : ""}.`,
          );
        }
        if (spec.integer && !Number.isInteger(numeric)) {
          collector.add(key, `${spec.shortLabel} must be a whole number.`);
        }
        break;
      }
      case "boolean":
        if (typeof value !== "boolean") {
          collector.add(key, `${spec.label} must be on or off.`);
        }
        break;
      case "enum":
        if (!spec.options.some((option) => option.value === value)) {
          collector.add(
            key,
            `${spec.label} must be one of ${spec.options.map((option) => option.label).join(", ")}.`,
          );
        }
        break;
    }
  }
}

/**
 * A stable identity for a parameter set. Keys are taken in spec order so the
 * signature does not depend on object key order. The geometry version is
 * included so a changed algorithm never reuses a cached or saved mesh.
 */
export function signatureFromSpecs<Specs extends Record<string, ParameterSpec>>(
  productId: string,
  geometryVersion: number,
  specs: Specs,
  parameters: ParametersOf<Specs>,
): string {
  const values = Object.keys(specs).map((key) => {
    const value = parameters[key];
    return typeof value === "boolean" ? (value ? 1 : 0) : String(value);
  });
  return [productId, `g${geometryVersion}`, ...values].join("|");
}

/** 32-bit FNV-1a hash rendered as six hex characters, for filenames. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 6);
}

/** 299.5 -> "299p5", 200 -> "200". Locale independent. */
export function filenameNumber(value: number): string {
  return Number(value.toFixed(2)).toString().replace(".", "p");
}

/**
 * `drawerforge-fit-test-<width>x<depth>-<hash>.stl`, built from the coupon's
 * own bounds so the name works for any product's fit-test coupon.
 */
export function fitTestCouponFilename(
  model: GeneratedModel<unknown>,
  signature: string,
): string {
  const width = model.bounds[1][0] - model.bounds[0][0];
  const depth = model.bounds[1][1] - model.bounds[0][1];
  const size = [width, depth].map(filenameNumber).join("x");
  return `drawerforge-fit-test-${size}-${shortHash(signature)}.stl`;
}

export function formatMillimeters(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(value);
}
