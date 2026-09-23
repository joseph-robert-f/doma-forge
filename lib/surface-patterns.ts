/** The deliberately small, portable description of a printable surface pattern. */
export type SurfaceMode = "solid" | "holes" | "mesh";

export interface SurfaceZoneSetting {
  mode: SurfaceMode;
  /** Clear width or diameter of an opening, in millimeters. */
  opening: number;
  /** Material left between neighboring openings, in millimeters. */
  web: number;
  /** Solid border around the usable region, in millimeters. */
  margin: number;
}

export interface SurfaceTreatments {
  enabled: boolean;
  zones: Record<string, SurfaceZoneSetting>;
}

export interface SurfaceZoneSpec {
  /** Stable file and geometry identifier. Do not rename after release. */
  id: string;
  label: string;
  description?: string;
}

export interface SurfaceTreatmentsSpec {
  kind: "surfaceTreatments";
  label: string;
  description: string;
  zones: readonly SurfaceZoneSpec[];
}

export const SURFACE_LIMITS = {
  opening: { min: 1.5, max: 24, step: 0.5 },
  web: { min: 0.8, max: 12, step: 0.1 },
  margin: { min: 0.8, max: 30, step: 0.5 },
} as const;

export const DEFAULT_ZONE_SETTING: Readonly<SurfaceZoneSetting> = {
  mode: "solid",
  opening: 12,
  web: 2.4,
  margin: 6,
};

export function surfaceTreatmentSpec(
  zones: readonly SurfaceZoneSpec[],
  description = "Choose real openings for the selected surfaces. Functional edges and joints stay solid.",
): SurfaceTreatmentsSpec {
  return { kind: "surfaceTreatments", label: "Permeable surfaces", description, zones };
}

export function defaultSurfaceTreatments(spec: SurfaceTreatmentsSpec): SurfaceTreatments {
  const zones: Record<string, SurfaceZoneSetting> = {};
  for (const zone of spec.zones) zones[zone.id] = { ...DEFAULT_ZONE_SETTING };
  return { enabled: false, zones };
}

export function isSurfacePatternActive(treatments: SurfaceTreatments, zoneId: string): boolean {
  const mode = treatments.zones[zoneId]?.mode;
  return treatments.enabled && (mode === "holes" || mode === "mesh");
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function number(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (value === "") return Number.NaN;
  const converted = typeof value === "number" ? value : Number(value);
  return Number.isFinite(converted) ? Math.round(converted * 1000) / 1000 : converted;
}

/** Copy only declared zone IDs, so imported records cannot add arbitrary geometry. */
export function normalizeSurfaceTreatments(
  spec: SurfaceTreatmentsSpec,
  value: unknown,
  fallback: SurfaceTreatments = defaultSurfaceTreatments(spec),
): SurfaceTreatments {
  const source = record(value);
  const sourceZones = record(source?.zones);
  const enabled = typeof source?.enabled === "boolean" ? source.enabled : fallback.enabled;
  const zones: Record<string, SurfaceZoneSetting> = {};
  for (const zone of spec.zones) {
    const defaults = fallback.zones[zone.id] ?? DEFAULT_ZONE_SETTING;
    const selected = record(sourceZones?.[zone.id]);
    const requestedMode = selected?.mode;
    const mode = requestedMode === "solid" || requestedMode === "holes" || requestedMode === "mesh"
      ? requestedMode : defaults.mode;
    const active = enabled && mode !== "solid";
    const dimension = (field: "opening" | "web" | "margin") => {
      const result = number(selected?.[field], defaults[field]);
      const limit = SURFACE_LIMITS[field];
      return !active && (!Number.isFinite(result) || result < limit.min || result > limit.max)
        ? defaults[field] : result;
    };
    zones[zone.id] = {
      mode,
      opening: dimension("opening"),
      web: dimension("web"),
      margin: dimension("margin"),
    };
  }
  return { enabled, zones };
}

/** Strict shape check for portable v2 files before normalization can repair it. */
export function surfaceTreatmentFileIssue(
  spec: SurfaceTreatmentsSpec,
  value: unknown,
): string | null {
  const treatment = record(value);
  if (!treatment || typeof treatment.enabled !== "boolean") {
    return "The file has invalid permeable surface settings.";
  }
  const zones = record(treatment.zones);
  if (!zones) return "The file has no surface zones.";
  const declared = new Set(spec.zones.map((zone) => zone.id));
  const extra = Object.keys(zones).find((id) => !declared.has(id));
  if (extra) return `The file has an unknown surface zone: ${extra}.`;
  for (const zone of spec.zones) {
    const setting = record(zones[zone.id]);
    if (!setting) return `The file is missing the ${zone.label} surface zone.`;
    if (setting.mode !== "solid" && setting.mode !== "holes" && setting.mode !== "mesh") {
      return `The file has an unknown ${zone.label} surface mode.`;
    }
    for (const field of ["opening", "web", "margin"] as const) {
      const value = setting[field];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `The file has an invalid ${zone.label} ${field}.`;
      }
    }
  }
  return null;
}

/** A deterministic signature fragment for all declared zones, including disabled settings. */
export function surfaceTreatmentsSignature(
  spec: SurfaceTreatmentsSpec,
  value: SurfaceTreatments,
): string {
  const parts = [value.enabled ? "on" : "off"];
  for (const zone of spec.zones) {
    const setting = value.zones[zone.id] ?? DEFAULT_ZONE_SETTING;
    parts.push(`${zone.id}:${setting.mode}:${setting.opening}:${setting.web}:${setting.margin}`);
  }
  return parts.join(",");
}

export function surfaceTreatmentIssues(
  spec: SurfaceTreatmentsSpec,
  value: unknown,
  nozzleDiameter = 0.4,
): string[] {
  const issues: string[] = [];
  const treatment = record(value);
  if (!treatment || typeof treatment.enabled !== "boolean") {
    return ["Permeable surfaces must be on or off."];
  }
  if (!treatment.enabled) return issues;
  const zones = record(treatment.zones);
  if (!zones) return ["Permeable surfaces need zone settings."];
  for (const zone of spec.zones) {
    const setting = record(zones[zone.id]);
    if (!setting) {
      issues.push(`${zone.label} needs a surface setting.`);
      continue;
    }
    if (setting.mode !== "solid" && setting.mode !== "holes" && setting.mode !== "mesh") {
      issues.push(`${zone.label} must be Solid, Holes, or Mesh.`);
      continue;
    }
    if (setting.mode === "solid") continue;
    for (const field of ["opening", "web", "margin"] as const) {
      const value = setting[field];
      const limit = SURFACE_LIMITS[field];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push(`${zone.label} ${field} must be a number.`);
      } else if (value < limit.min || value > limit.max) {
        issues.push(`${zone.label} ${field} must be between ${limit.min} and ${limit.max} mm.`);
      }
    }
    if (
      typeof setting.web === "number" && Number.isFinite(setting.web) &&
      Number.isFinite(nozzleDiameter) && setting.web < 2 * nozzleDiameter
    ) {
      issues.push(`${zone.label} needs at least ${Number((2 * nozzleDiameter).toFixed(3))} mm between openings for this nozzle.`);
    }
    if (
      typeof setting.margin === "number" && Number.isFinite(setting.margin) &&
      Number.isFinite(nozzleDiameter) && setting.margin < 2 * nozzleDiameter
    ) {
      issues.push(`${zone.label} needs at least ${Number((2 * nozzleDiameter).toFixed(3))} mm of solid border for this nozzle.`);
    }
  }
  return issues;
}
