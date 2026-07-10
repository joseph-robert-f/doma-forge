export type MeshQuality = "draft" | "standard" | "fine";

export interface OrganizerParameters {
  drawerWidth: number;
  drawerDepth: number;
  clearancePerSide: number;
  organizerHeight: number;
  wallThickness: number;
  baseThickness: number;
  dividerThickness: number;
  cornerRadius: number;
  rows: number;
  columns: number;
  meshQuality: MeshQuality;
  fingerScoop: boolean;
}

export type NumericParameterKey = Exclude<
  keyof OrganizerParameters,
  "meshQuality" | "fingerScoop"
>;

export interface ParameterSpec {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  step: number;
  unit: "mm" | "";
}

export const PARAMETER_SPECS: Record<NumericParameterKey, ParameterSpec> = {
  drawerWidth: {
    label: "Drawer interior width",
    shortLabel: "Drawer width",
    min: 80,
    max: 600,
    step: 1,
    unit: "mm",
  },
  drawerDepth: {
    label: "Drawer interior depth",
    shortLabel: "Drawer depth",
    min: 80,
    max: 600,
    step: 1,
    unit: "mm",
  },
  clearancePerSide: {
    label: "Fit clearance per side",
    shortLabel: "Clearance",
    min: 0,
    max: 5,
    step: 0.1,
    unit: "mm",
  },
  organizerHeight: {
    label: "Organizer height",
    shortLabel: "Height",
    min: 15,
    max: 120,
    step: 1,
    unit: "mm",
  },
  wallThickness: {
    label: "Outer wall thickness",
    shortLabel: "Outer walls",
    min: 1.2,
    max: 6,
    step: 0.1,
    unit: "mm",
  },
  baseThickness: {
    label: "Base thickness",
    shortLabel: "Base",
    min: 1.2,
    max: 8,
    step: 0.1,
    unit: "mm",
  },
  dividerThickness: {
    label: "Divider thickness",
    shortLabel: "Dividers",
    min: 1.2,
    max: 6,
    step: 0.1,
    unit: "mm",
  },
  cornerRadius: {
    label: "Outer corner radius",
    shortLabel: "Corner radius",
    min: 1,
    max: 40,
    step: 0.5,
    unit: "mm",
  },
  rows: {
    label: "Compartment rows",
    shortLabel: "Rows",
    min: 1,
    max: 6,
    step: 1,
    unit: "",
  },
  columns: {
    label: "Compartment columns",
    shortLabel: "Columns",
    min: 1,
    max: 8,
    step: 1,
    unit: "",
  },
};

export const DEFAULT_PARAMETERS: OrganizerParameters = {
  drawerWidth: 300,
  drawerDepth: 200,
  clearancePerSide: 0.5,
  organizerHeight: 50,
  wallThickness: 2,
  baseThickness: 2,
  dividerThickness: 2,
  cornerRadius: 8,
  rows: 2,
  columns: 3,
  meshQuality: "standard",
  fingerScoop: true,
};

export interface DerivedDimensions {
  outsideWidth: number;
  outsideDepth: number;
  outsideHeight: number;
  compartmentWidth: number;
  compartmentDepth: number;
}

export interface ValidationIssue {
  field: NumericParameterKey | "model";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  derived: DerivedDimensions;
  issues: ValidationIssue[];
  byField: Partial<Record<NumericParameterKey | "model", string[]>>;
}

const numericKeys = Object.keys(PARAMETER_SPECS) as NumericParameterKey[];

function normalizeNumber(value: unknown): number {
  if (value === "") return Number.NaN;
  const converted = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(converted)) return Number.NaN;
  if (!Number.isFinite(converted)) return converted;
  return Math.round(converted * 1000) / 1000;
}

export function normalizeParameters(
  input: Partial<OrganizerParameters> | Record<string, unknown>,
): OrganizerParameters {
  const result = { ...DEFAULT_PARAMETERS };

  for (const key of numericKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      result[key] = normalizeNumber(input[key]);
    }
  }

  result.rows = Number.isFinite(result.rows) ? Math.round(result.rows) : result.rows;
  result.columns = Number.isFinite(result.columns)
    ? Math.round(result.columns)
    : result.columns;

  if (
    input.meshQuality === "draft" ||
    input.meshQuality === "standard" ||
    input.meshQuality === "fine"
  ) {
    result.meshQuality = input.meshQuality;
  }
  if (typeof input.fingerScoop === "boolean") {
    result.fingerScoop = input.fingerScoop;
  }

  return result;
}

export function deriveDimensions(
  parameters: OrganizerParameters,
): DerivedDimensions {
  const outsideWidth =
    parameters.drawerWidth - parameters.clearancePerSide * 2;
  const outsideDepth =
    parameters.drawerDepth - parameters.clearancePerSide * 2;
  const compartmentWidth =
    (outsideWidth -
      parameters.wallThickness * 2 -
      (parameters.columns - 1) * parameters.dividerThickness) /
    parameters.columns;
  const compartmentDepth =
    (outsideDepth -
      parameters.wallThickness * 2 -
      (parameters.rows - 1) * parameters.dividerThickness) /
    parameters.rows;

  return {
    outsideWidth,
    outsideDepth,
    outsideHeight: parameters.organizerHeight,
    compartmentWidth,
    compartmentDepth,
  };
}

export function validateParameters(
  parameters: OrganizerParameters,
): ValidationResult {
  const derived = deriveDimensions(parameters);
  const issues: ValidationIssue[] = [];

  const add = (field: ValidationIssue["field"], message: string) => {
    if (!issues.some((issue) => issue.field === field && issue.message === message)) {
      issues.push({ field, message });
    }
  };

  for (const key of numericKeys) {
    const value = parameters[key];
    const spec = PARAMETER_SPECS[key];
    if (!Number.isFinite(value)) {
      add(key, `${spec.shortLabel} must be a number.`);
      continue;
    }
    if (value < spec.min || value > spec.max) {
      add(
        key,
        `${spec.shortLabel} must be between ${spec.min} and ${spec.max}${spec.unit ? ` ${spec.unit}` : ""}.`,
      );
    }
  }

  if (!Number.isInteger(parameters.rows)) {
    add("rows", "Rows must be a whole number.");
  }
  if (!Number.isInteger(parameters.columns)) {
    add("columns", "Columns must be a whole number.");
  }

  if (!Number.isFinite(derived.outsideWidth) || derived.outsideWidth <= 0) {
    add("clearancePerSide", "Clearance leaves no usable organizer width.");
  }
  if (!Number.isFinite(derived.outsideDepth) || derived.outsideDepth <= 0) {
    add("clearancePerSide", "Clearance leaves no usable organizer depth.");
  }
  if (
    Number.isFinite(parameters.baseThickness) &&
    Number.isFinite(parameters.organizerHeight) &&
    parameters.baseThickness > parameters.organizerHeight - 4
  ) {
    add("baseThickness", "Leave at least 4 mm of wall above the base.");
  }

  const smallestOutside = Math.min(derived.outsideWidth, derived.outsideDepth);
  if (
    Number.isFinite(parameters.cornerRadius) &&
    Number.isFinite(smallestOutside) &&
    parameters.cornerRadius > smallestOutside / 2
  ) {
    add("cornerRadius", "Corner radius cannot exceed half the shorter outside dimension.");
  }

  if (Number.isFinite(derived.compartmentWidth)) {
    if (derived.compartmentWidth <= 0) {
      add("columns", "Walls and dividers consume the available width.");
    } else if (derived.compartmentWidth < 10) {
      add("columns", "Each compartment must be at least 10 mm wide.");
    }
  }
  if (Number.isFinite(derived.compartmentDepth)) {
    if (derived.compartmentDepth <= 0) {
      add("rows", "Walls and dividers consume the available depth.");
    } else if (derived.compartmentDepth < 10) {
      add("rows", "Each compartment must be at least 10 mm deep.");
    }
  }

  const byField: ValidationResult["byField"] = {};
  for (const issue of issues) {
    (byField[issue.field] ??= []).push(issue.message);
  }

  return { valid: issues.length === 0, derived, issues, byField };
}

export function parameterSignature(parameters: OrganizerParameters): string {
  return [
    parameters.drawerWidth,
    parameters.drawerDepth,
    parameters.clearancePerSide,
    parameters.organizerHeight,
    parameters.wallThickness,
    parameters.baseThickness,
    parameters.dividerThickness,
    parameters.cornerRadius,
    parameters.rows,
    parameters.columns,
    parameters.meshQuality,
    parameters.fingerScoop ? 1 : 0,
  ].join("|");
}

export function formatMillimeters(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(value);
}
