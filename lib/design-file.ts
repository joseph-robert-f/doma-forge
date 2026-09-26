import { getProduct } from "./products/registry";
import { parameterSlug, shortHash } from "./products/shared";
import { surfaceTreatmentFileIssue } from "./surface-patterns";
import type { AnyParameters, AnyProduct, AxisLayoutSpec } from "./products/types";

/**
 * The portable design file. Version 2 adds per-surface pattern settings;
 * version 3 adds measured drawer-tray axes. Version 1 imports with every
 * surface solid. Machine-specific data stays in the local workspace.
 */
export interface DesignFileV3 {
  format: typeof DESIGN_FILE_FORMAT;
  version: 3;
  name: string;
  units: "mm";
  productId: string;
  geometryVersion: number;
  createdAt: string;
  parameters: AnyParameters;
}

export const DESIGN_FILE_FORMAT = "drawerforge-design";
export const DESIGN_FILE_VERSION = 3;
export const DESIGN_FILE_EXTENSION = ".drawerforge.json";
export const DESIGN_NAME_MAX_LENGTH = 60;

export type DesignFileImport =
  | { ok: true; design: DesignFileV3; product: AnyProduct; warnings: string[] }
  | { ok: false; error: string };

/** Trims, collapses whitespace, and caps the design name. */
export function normalizeDesignName(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, DESIGN_NAME_MAX_LENGTH);
}

/** "Workshop drawer (left)" -> "workshop-drawer-left". Empty when nothing survives. */
export function designNameSlug(name: string): string {
  return normalizeDesignName(name)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

/** Largest design file the app will read. A real file is under 2 KB. */
export const DESIGN_FILE_MAX_BYTES = 1_000_000;

/** Reads a file as text. FileReader works everywhere, including jsdom. */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.readAsText(file);
  });
}

export function createDesignFile(
  product: AnyProduct,
  parameters: AnyParameters,
  name: string,
  now: () => Date = () => new Date(),
): DesignFileV3 {
  const normalized = product.normalize(parameters);
  const validation = product.validate(normalized);
  if (!validation.valid) {
    throw new Error("Only a valid design can be saved to a file.");
  }
  return {
    format: DESIGN_FILE_FORMAT,
    version: DESIGN_FILE_VERSION,
    name: normalizeDesignName(name),
    units: "mm",
    productId: product.id,
    geometryVersion: product.geometryVersion,
    createdAt: now().toISOString(),
    parameters: normalized,
  };
}

export function serializeDesignFile(design: DesignFileV3): string {
  return `${JSON.stringify(design, null, 2)}\n`;
}

/** `<name-slug>-<product>-<hash>.drawerforge.json`, name omitted when empty. */
export function designFilename(
  design: DesignFileV3,
  resolveProduct: (id: string) => AnyProduct = getProduct,
): string {
  const product = resolveProduct(design.productId);
  const slug = designNameSlug(design.name);
  const hash = shortHash(product.signature(design.parameters));
  return `${slug ? `${slug}-` : ""}${product.id}-${hash}${DESIGN_FILE_EXTENSION}`;
}

/**
 * Prefixes a mesh filename with the design name so two designs of the same
 * product and size can be told apart in a downloads folder.
 */
export function namedMeshFilename(name: string, meshFilename: string): string {
  const slug = designNameSlug(name);
  return slug ? `${slug}-${meshFilename}` : meshFilename;
}

function fieldList(fields: string[]): string {
  return fields.map((field) => parameterSlug(field).replace(/-/g, " ")).join(", ");
}

/** Renders any JSON value for an error message without invoking its methods. */
function shown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unreadable]";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Legacy tray files stored a row and column count instead of axis layouts. */
export function migrateLegacyTrayParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...parameters };
  if (Object.prototype.hasOwnProperty.call(parameters, "rows")) {
    migrated.rowLayout = { mode: "even", count: parameters.rows };
  }
  if (Object.prototype.hasOwnProperty.call(parameters, "columns")) {
    migrated.columnLayout = { mode: "even", count: parameters.columns };
  }
  delete migrated.rows;
  delete migrated.columns;
  return migrated;
}

/** Reject malformed new-layout data before normalization can replace it. */
export function axisLayoutFileIssue(product: AnyProduct, parameters: Record<string, unknown>): string | null {
  for (const [key, spec] of Object.entries(product.specs)) {
    if (spec.kind !== "axisLayout") continue;
    const axis = spec as AxisLayoutSpec;
    const value = parameters[key];
    if (!isRecord(value)) return `${axis.label} must be an axis layout object.`;
    if (value.mode === "even") {
      if (typeof value.count !== "number" || !Number.isInteger(value.count) ||
          value.count < axis.minCount || value.count > axis.maxCount) {
        return `${axis.label} must have a whole-number count between ${axis.minCount} and ${axis.maxCount}.`;
      }
      continue;
    }
    if (value.mode === "custom") {
      const fixed = value.fixedSizesMm;
      if (!Array.isArray(fixed) || fixed.length < axis.minCount - 1 || fixed.length > axis.maxCount - 1 ||
          fixed.some((size) => typeof size !== "number" || !Number.isFinite(size))) {
        return `${axis.label} must have ${axis.minCount - 1} to ${axis.maxCount - 1} finite fixed sizes in millimeters.`;
      }
      continue;
    }
    return `${axis.label} mode must be even or custom.`;
  }
  return null;
}

/**
 * Parses and checks a design file without touching any app state. The result
 * is either a fully normalized, validated design or one actionable error.
 */
export function parseDesignFile(
  text: string,
  resolveProduct: (id: string) => AnyProduct = getProduct,
): DesignFileImport {
  try {
    return parseDesignFileUnsafe(text, resolveProduct);
  } catch {
    // A crafted value can make even Number() or String() throw. The contract
    // is one error, never an exception.
    return { ok: false, error: "The file could not be read as a design." };
  }
}

function parseDesignFileUnsafe(
  text: string,
  resolveProduct: (id: string) => AnyProduct,
): DesignFileImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "The file does not contain a design object." };
  }
  const data = raw as Record<string, unknown>;

  if (data.format !== DESIGN_FILE_FORMAT) {
    return {
      ok: false,
      error: `The file format is not "${DESIGN_FILE_FORMAT}". Choose a file saved by DrawerForge.`,
    };
  }
  if (data.version !== 1 && data.version !== 2 && data.version !== DESIGN_FILE_VERSION) {
    return {
      ok: false,
      error: `Design file version ${shown(data.version)} is not supported. This app reads versions 1 through ${DESIGN_FILE_VERSION}.`,
    };
  }
  if (data.units !== "mm") {
    return { ok: false, error: `The file units are ${shown(data.units)}. Only millimeters are supported.` };
  }
  if (typeof data.productId !== "string" || !data.productId) {
    return { ok: false, error: "The file does not name a product." };
  }
  let product: AnyProduct;
  try {
    product = resolveProduct(data.productId);
  } catch {
    return { ok: false, error: `This app has no product named "${data.productId}".` };
  }
  if (!data.parameters || typeof data.parameters !== "object" || Array.isArray(data.parameters)) {
    return { ok: false, error: "The file has no parameters object." };
  }

  const parameters = data.parameters as Record<string, unknown>;
  const legacyTray = product.id === "drawer-tray" && (data.version === 1 || data.version === 2);
  const migratedTray = legacyTray ? migrateLegacyTrayParameters(parameters) : parameters;
  // Legacy files must still supply their original counts; translating before
  // this check must not let a missing row or column silently use a default.
  const missing = Object.keys(product.specs).flatMap((key) => {
    if (data.version === 1 && product.specs[key].kind === "surfaceTreatments") return [];
    const sourceKey = legacyTray
      ? key === "rowLayout" ? "rows" : key === "columnLayout" ? "columns" : key
      : key;
    return Object.prototype.hasOwnProperty.call(
      legacyTray ? parameters : migratedTray,
      sourceKey,
    ) ? [] : [sourceKey];
  });
  if (missing.length > 0) {
    return { ok: false, error: `The file is missing required parameters: ${fieldList(missing)}.` };
  }
  // Preserve the old number normalizer's acceptance of numeric strings in
  // v1/v2, while v3 requires typed axis values and exact array shape.
  if (legacyTray) {
    for (const [key, label] of [["rowLayout", "Rows"], ["columnLayout", "Columns"]] as const) {
      const layout = migratedTray[key] as { mode: "even"; count: unknown };
      const count = layout.count === "" ? Number.NaN : Number(layout.count);
      const normalizedCount = Number.isFinite(count) ? Math.round(count) : count;
      layout.count = normalizedCount;
      if (!Number.isInteger(normalizedCount)) {
        return { ok: false, error: `${label} must be a whole number.` };
      }
    }
  }
  const axisIssue = axisLayoutFileIssue(product, migratedTray);
  if (axisIssue) return { ok: false, error: axisIssue };
  if (data.version >= 2) {
    const spec = product.specs.surfaceTreatments;
    if (spec?.kind === "surfaceTreatments") {
      const issue = surfaceTreatmentFileIssue(spec, migratedTray.surfaceTreatments);
      if (issue) return { ok: false, error: issue };
    }
  }

  // Version 1 had no surface semantics. Treat even an unknown field with this
  // name as absent, so a v1 file always opens with solid surfaces.
  const migratedParameters = data.version === 1
    ? Object.fromEntries(Object.entries(migratedTray).filter(([key]) => key !== "surfaceTreatments"))
    : migratedTray;
  const normalized = product.normalize(migratedParameters);
  const validation = product.validate(normalized);
  if (!validation.valid) {
    return {
      ok: false,
      error: `The file has invalid values. ${validation.issues.map((issue) => issue.message).join(" ")}`,
    };
  }

  const warnings: string[] = [];
  const geometryVersion =
    typeof data.geometryVersion === "number" ? data.geometryVersion : product.geometryVersion;
  if (geometryVersion > product.geometryVersion) {
    warnings.push(
      "This file was saved by a newer version of the app. The mesh may differ from the original.",
    );
  } else if (geometryVersion < product.geometryVersion) {
    warnings.push(
      "The geometry has been updated since this file was saved. The mesh may differ from the original.",
    );
  }

  return {
    ok: true,
    product,
    warnings,
    design: {
      format: DESIGN_FILE_FORMAT,
      version: DESIGN_FILE_VERSION,
      name: normalizeDesignName(data.name),
      units: "mm",
      productId: product.id,
      geometryVersion,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
      parameters: normalized,
    },
  };
}
