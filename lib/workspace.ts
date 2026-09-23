import { normalizeDesignName } from "./design-file";
import {
  PRINTER_PROFILE_DEFAULTS,
  normalizePrinterProfile,
  type PrinterProfileV1,
} from "./printer-profile";
import { DRAWER_TRAY_ID } from "./products/drawer-tray";
import { getProduct } from "./products/registry";
import type { AnyParameters, AnyProduct } from "./products/types";

/**
 * The local workspace: everything this browser origin remembers. Version 3
 * has its own key so an old open tab cannot overwrite pattern settings. The
 * version 2 envelope and version 1 single-design record migrate on first
 * load and remain in place for an older build of the app.
 */
export interface StoredDesign {
  productId: string;
  geometryVersion: number;
  name: string;
  parameters: AnyParameters;
  updatedAt: string;
}

export interface WorkspaceV3 {
  format: typeof WORKSPACE_FORMAT;
  version: 3;
  updatedAt: string;
  designs: Record<string, StoredDesign>;
  /**
   * The printer profile for this device. Older envelopes may have none.
   */
  printer?: PrinterProfileV1;
}

export const WORKSPACE_FORMAT = "drawerforge-workspace";
export const WORKSPACE_VERSION = 3;
export const WORKSPACE_KEY = "drawerforge-workspace-v3";
export const LEGACY_WORKSPACE_KEY = "drawerforge-workspace-v2";
export const LEGACY_DESIGN_KEY = "drawerforge-design-v1";
/** Written into the version 1 record once it has been migrated. */
export const LEGACY_MIGRATED_MARKER = "migratedTo";

/** The subset of the Storage API the workspace uses, so tests can fake it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ResolveProduct = (id: string) => AnyProduct;

/**
 * What a read found. Only `ok` and `absent` allow a later write. `unreadable`
 * means storage threw, and `newer` means a later app version owns the key;
 * writing in either case could destroy data.
 */
export type WorkspaceRead =
  | { state: "ok"; workspace: WorkspaceV3 }
  | { state: "absent" }
  | { state: "unreadable" }
  | { state: "newer" };

interface LoadedWorkspace {
  workspace: WorkspaceV3;
  writable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyWorkspace(now: () => Date): WorkspaceV3 {
  return {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    updatedAt: now().toISOString(),
    designs: {},
  };
}

/** Assigns as an own property even for ids like "__proto__". */
function setDesign(designs: Record<string, StoredDesign>, id: string, design: StoredDesign) {
  Object.defineProperty(designs, id, {
    value: design,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function ownDesign(designs: Record<string, StoredDesign>, id: string): unknown {
  return Object.prototype.hasOwnProperty.call(designs, id) ? designs[id] : undefined;
}

/** Earlier workspace versions had no patterned surfaces. */
function legacyParameters(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "surfaceTreatments"));
}

/**
 * Reads the envelope. Corrupt JSON or a foreign format under our key is
 * removed, because it cannot be repaired and would block every later save.
 * A newer version is left untouched and reported, never removed.
 */
export function readWorkspace(storage: StorageLike): WorkspaceRead {
  let text: string | null;
  try {
    text = storage.getItem(WORKSPACE_KEY);
  } catch {
    return { state: "unreadable" };
  }
  if (!text) return { state: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (isRecord(parsed) && parsed.format === WORKSPACE_FORMAT) {
    if (parsed.version === WORKSPACE_VERSION && isRecord(parsed.designs)) {
      const workspace: WorkspaceV3 = {
        format: WORKSPACE_FORMAT,
        version: WORKSPACE_VERSION,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        designs: parsed.designs as Record<string, StoredDesign>,
      };
      // A stored profile is normalized here, so one bad number cannot reach
      // the geometry. An absent profile stays absent; it is not written back.
      if (isRecord(parsed.printer)) {
        workspace.printer = normalizePrinterProfile(parsed.printer);
      }
      return { state: "ok", workspace };
    }
    if (typeof parsed.version === "number" && parsed.version > WORKSPACE_VERSION) {
      return { state: "newer" };
    }
  }
  try {
    storage.removeItem(WORKSPACE_KEY);
  } catch {
    // Storage is unavailable; nothing to remove.
  }
  return { state: "absent" };
}

/** Reads the previous envelope without changing it. */
function readLegacyWorkspace(storage: StorageLike, resolveProduct: ResolveProduct): WorkspaceRead {
  let text: string | null;
  try {
    text = storage.getItem(LEGACY_WORKSPACE_KEY);
  } catch {
    return { state: "unreadable" };
  }
  if (!text) return { state: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { state: "absent" };
  }
  if (!isRecord(parsed) || parsed.format !== WORKSPACE_FORMAT) return { state: "absent" };
  if (typeof parsed.version === "number" && parsed.version > 2) return { state: "newer" };
  if (parsed.version !== 2 || !isRecord(parsed.designs)) return { state: "absent" };
  const workspace: WorkspaceV3 = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    designs: {},
  };
  if (isRecord(parsed.printer)) workspace.printer = normalizePrinterProfile(parsed.printer);
  // Validate each entry independently. A damaged design cannot hide the
  // other products, and normalization gives all migrated designs solid zones.
  for (const [id, entry] of Object.entries(parsed.designs)) {
    const checked = validateStoredDesign(
      isRecord(entry) ? { ...entry, parameters: legacyParameters(entry.parameters) } : entry,
      resolveProduct,
    );
    if (checked && checked.product.id === id) setDesign(workspace.designs, id, checked.design);
  }
  return { state: "ok", workspace };
}

/** Writes the envelope. Returns false when storage refuses, e.g. on quota. */
export function writeWorkspace(storage: StorageLike, workspace: WorkspaceV3): boolean {
  try {
    storage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks one stored design against its product. Returns the normalized,
 * valid design or null. Never throws, so one bad entry cannot hide the rest.
 */
export function validateStoredDesign(
  entry: unknown,
  resolveProduct: ResolveProduct = getProduct,
): { product: AnyProduct; design: StoredDesign } | null {
  if (!isRecord(entry) || typeof entry.productId !== "string") return null;
  try {
    const product = resolveProduct(entry.productId);
    if (!isRecord(entry.parameters)) return null;
    const parameters = product.normalize(entry.parameters);
    if (!product.validate(parameters).valid) return null;
    return {
      product,
      design: {
        productId: product.id,
        geometryVersion:
          typeof entry.geometryVersion === "number"
            ? entry.geometryVersion
            : product.geometryVersion,
        name: normalizeDesignName(entry.name),
        parameters,
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
      },
    };
  } catch {
    return null;
  }
}

/**
 * Reads the version 1 record as a stored design for the product it belongs
 * to. A record without a product id belongs to the drawer tray, the only
 * product that existed when version 1 shipped. A record that carries the
 * migrated marker is ignored, so it can never resurrect an old design.
 */
export function readLegacyDesign(
  storage: StorageLike,
  resolveProduct: ResolveProduct = getProduct,
): StoredDesign | null {
  let text: string | null;
  try {
    text = storage.getItem(LEGACY_DESIGN_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    if (parsed[LEGACY_MIGRATED_MARKER] !== undefined) return null;
    const checked = validateStoredDesign(
      {
        productId: parsed.productId ?? DRAWER_TRAY_ID,
        name: parsed.name,
        parameters: legacyParameters(parsed.parameters),
      },
      resolveProduct,
    );
    return checked?.design ?? null;
  } catch {
    return null;
  }
}

/** Marks the version 1 record as migrated. Keeps every field it had. */
function markLegacyMigrated(storage: StorageLike) {
  try {
    const text = storage.getItem(LEGACY_DESIGN_KEY);
    if (!text) return;
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return;
    parsed[LEGACY_MIGRATED_MARKER] = WORKSPACE_KEY;
    storage.setItem(LEGACY_DESIGN_KEY, JSON.stringify(parsed));
  } catch {
    // The marker is a safety extra; the migration itself already succeeded.
  }
}

/**
 * Loads the envelope, creating it from the version 1 record on first use.
 * `writable` is false when storage could not be read or a newer app version
 * owns the key; callers must not write in that case.
 */
export function loadWorkspace(
  storage: StorageLike,
  resolveProduct: ResolveProduct = getProduct,
  now: () => Date = () => new Date(),
): LoadedWorkspace {
  const read = readWorkspace(storage);
  if (read.state === "ok") return { workspace: read.workspace, writable: true };
  if (read.state !== "absent") return { workspace: emptyWorkspace(now), writable: false };
  const previous = readLegacyWorkspace(storage, resolveProduct);
  if (previous.state === "ok") {
    const writable = writeWorkspace(storage, previous.workspace);
    return { workspace: previous.workspace, writable };
  }
  if (previous.state !== "absent") return { workspace: emptyWorkspace(now), writable: false };
  const workspace = emptyWorkspace(now);
  const legacy = readLegacyDesign(storage, resolveProduct);
  if (legacy) {
    setDesign(workspace.designs, legacy.productId, {
      ...legacy,
      updatedAt: now().toISOString(),
    });
    if (writeWorkspace(storage, workspace)) markLegacyMigrated(storage);
  }
  return { workspace, writable: true };
}

/** The current valid design for one product, or null. */
export function readDesign(
  storage: StorageLike,
  product: AnyProduct,
  resolveProduct: ResolveProduct = getProduct,
  now: () => Date = () => new Date(),
): StoredDesign | null {
  const { workspace } = loadWorkspace(storage, resolveProduct, now);
  const checked = validateStoredDesign(ownDesign(workspace.designs, product.id), resolveProduct);
  if (!checked || checked.product.id !== product.id) return null;
  return checked.design;
}

/** A stored profile, and whether the envelope actually holds one. */
export interface PrinterEntry {
  profile: PrinterProfileV1;
  /**
   * True when the envelope holds a `printer` field. False means the app is
   * using placeholder defaults that the user has never confirmed, so a
   * build-volume warning would describe a bed nobody entered.
   */
  saved: boolean;
}

/**
 * The printer profile for this device. An envelope without one, an absent
 * envelope, and an unreadable envelope all give the defaults with
 * `saved: false`, so the app always has a usable profile.
 */
export function readPrinterEntry(
  storage: StorageLike,
  resolveProduct: ResolveProduct = getProduct,
  now: () => Date = () => new Date(),
): PrinterEntry {
  const { workspace } = loadWorkspace(storage, resolveProduct, now);
  return workspace.printer
    ? { profile: workspace.printer, saved: true }
    : { profile: { ...PRINTER_PROFILE_DEFAULTS }, saved: false };
}

/**
 * Replaces the printer profile. Every design in the envelope is kept as it
 * is. Returns false when storage refuses the write or could not be read,
 * with the same rules the design writes follow.
 */
export function writePrinterProfile(
  storage: StorageLike,
  profile: PrinterProfileV1,
  resolveProduct: ResolveProduct = getProduct,
  now: () => Date = () => new Date(),
): boolean {
  const { workspace, writable } = loadWorkspace(storage, resolveProduct, now);
  if (!writable) return false;
  const normalized = normalizePrinterProfile(profile);
  if (
    workspace.printer &&
    JSON.stringify(workspace.printer) === JSON.stringify(normalized)
  ) {
    return true;
  }
  const stamp = now().toISOString();
  workspace.printer = normalized;
  workspace.updatedAt = stamp;
  return writeWorkspace(storage, workspace);
}

function sameDesign(
  current: StoredDesign | null,
  name: string,
  parameters: AnyParameters,
): boolean {
  return (
    current !== null &&
    current.name === name &&
    JSON.stringify(current.parameters) === JSON.stringify(parameters)
  );
}

/**
 * Replaces one product's current design. Other products' designs are kept
 * as they are. An unchanged design is not rewritten, so `updatedAt` means
 * last edited. Returns false when storage refuses or could not be read.
 */
export function writeDesign(
  storage: StorageLike,
  product: AnyProduct,
  design: { name: string; parameters: AnyParameters },
  resolveProduct: ResolveProduct = getProduct,
  now: () => Date = () => new Date(),
): boolean {
  const { workspace, writable } = loadWorkspace(storage, resolveProduct, now);
  if (!writable) return false;
  const name = normalizeDesignName(design.name);
  const parameters = product.normalize(design.parameters);
  const current = validateStoredDesign(ownDesign(workspace.designs, product.id), resolveProduct);
  if (current?.product.id === product.id && sameDesign(current.design, name, parameters)) {
    return true;
  }
  const stamp = now().toISOString();
  setDesign(workspace.designs, product.id, {
    productId: product.id,
    geometryVersion: product.geometryVersion,
    name,
    parameters,
    updatedAt: stamp,
  });
  workspace.updatedAt = stamp;
  return writeWorkspace(storage, workspace);
}

/**
 * Renames one product's current design without touching its parameters.
 * Does nothing when that product has no valid stored design yet. Returns
 * true when nothing needed to change or the write succeeded.
 */
export function writeDesignName(
  storage: StorageLike,
  product: AnyProduct,
  name: string,
  resolveProduct: ResolveProduct = getProduct,
  now: () => Date = () => new Date(),
): boolean {
  const { workspace, writable } = loadWorkspace(storage, resolveProduct, now);
  if (!writable) return false;
  const current = validateStoredDesign(ownDesign(workspace.designs, product.id), resolveProduct);
  if (!current || current.product.id !== product.id) return true;
  const normalized = normalizeDesignName(name);
  if (current.design.name === normalized) return true;
  const stamp = now().toISOString();
  setDesign(workspace.designs, product.id, { ...current.design, name: normalized, updatedAt: stamp });
  workspace.updatedAt = stamp;
  return writeWorkspace(storage, workspace);
}
