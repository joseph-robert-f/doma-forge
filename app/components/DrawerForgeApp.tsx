"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type * as THREE from "three";
import {
  DEFAULT_PARAMETERS,
  PARAMETER_SPECS,
  formatMillimeters,
  normalizeParameters,
  parameterSignature,
  validateParameters,
  type DerivedDimensions,
  type MeshQuality,
  type NumericParameterKey,
  type OrganizerParameters,
} from "../../lib/parameters";
import { generateOrganizer } from "../../lib/organizer-geometry";
import { PRESETS, loadPreset, type PresetId } from "../../lib/presets";
import {
  deterministicStlFilename,
  inspectBinaryStl,
  serializeBinaryStl,
} from "../../lib/stl";
import {
  analyzeBufferGeometry,
  organizerToBufferGeometry,
} from "../../lib/three-geometry";
import { DrawerViewer, type ViewerStatus } from "./DrawerViewer";

const STORAGE_KEY = "drawerforge-design-v1";
const STORAGE_VERSION = 1;
const REGENERATION_DELAY_MS = 140;

const parameterSlugs: Record<NumericParameterKey, string> = {
  drawerWidth: "drawer-width",
  drawerDepth: "drawer-depth",
  clearancePerSide: "clearance-per-side",
  organizerHeight: "organizer-height",
  wallThickness: "wall-thickness",
  baseThickness: "base-thickness",
  dividerThickness: "divider-thickness",
  cornerRadius: "corner-radius",
  rows: "rows",
  columns: "columns",
};

const parameterGroups: Array<{
  index: string;
  title: string;
  description: string;
  keys: NumericParameterKey[];
}> = [
  {
    index: "01",
    title: "Fit",
    description: "Start with the clear inside measurements of your drawer.",
    keys: ["drawerWidth", "drawerDepth", "clearancePerSide"],
  },
  {
    index: "02",
    title: "Build",
    description: "Set the tray profile and printable shell.",
    keys: [
      "organizerHeight",
      "wallThickness",
      "baseThickness",
      "cornerRadius",
    ],
  },
  {
    index: "03",
    title: "Divide",
    description: "Create an even grid of practical compartments.",
    keys: ["rows", "columns", "dividerThickness"],
  },
];

interface PreviewModel {
  geometry: THREE.BufferGeometry;
  parameters: OrganizerParameters;
  derived: DerivedDimensions;
  signature: string;
  triangleCount: number;
}

interface PersistedDesign {
  version: number;
  parameters: OrganizerParameters;
}

function dimensionsMatch(a: THREE.Box3, b: THREE.Box3, tolerance = 1e-4) {
  return (
    a.min.distanceTo(b.min) <= tolerance && a.max.distanceTo(b.max) <= tolerance
  );
}

function generatedBoundsMatch(
  bounds: THREE.Box3,
  derived: DerivedDimensions,
  tolerance = 1e-3,
) {
  return (
    Math.abs(bounds.min.x + derived.outsideWidth / 2) <= tolerance &&
    Math.abs(bounds.max.x - derived.outsideWidth / 2) <= tolerance &&
    Math.abs(bounds.min.y + derived.outsideDepth / 2) <= tolerance &&
    Math.abs(bounds.max.y - derived.outsideDepth / 2) <= tolerance &&
    Math.abs(bounds.min.z) <= tolerance &&
    Math.abs(bounds.max.z - derived.outsideHeight) <= tolerance
  );
}

function NumericParameterControl({
  parameterKey,
  value,
  errors,
  onChange,
}: {
  parameterKey: NumericParameterKey;
  value: number;
  errors?: string[];
  onChange: (key: NumericParameterKey, value: number) => void;
}) {
  const spec = PARAMETER_SPECS[parameterKey];
  const slug = parameterSlugs[parameterKey];
  const errorId = `${slug}-error`;
  const isInvalid = Boolean(errors?.length);
  const displayValue = Number.isFinite(value) ? value : "";
  const hasFiniteValue = Number.isFinite(value);
  const rangeValue = hasFiniteValue ? value : spec.min;
  const rangeMin = hasFiniteValue ? Math.min(spec.min, value) : spec.min;
  const rangeMax = hasFiniteValue ? Math.max(spec.max, value) : spec.max;
  const snapToStep = (nextValue: number) => {
    const steps = Math.round((nextValue - spec.min) / spec.step);
    return Number((spec.min + steps * spec.step).toFixed(6));
  };
  const rangeUsesStandardStep =
    !hasFiniteValue ||
    (rangeValue >= spec.min &&
      rangeValue <= spec.max &&
      Math.abs(rangeValue - snapToStep(rangeValue)) < 1e-7);
  const sliderLabel = `${spec.label} slider`;
  const numberLabel = spec.unit
    ? `${spec.label} in millimeters`
    : `${spec.label} number`;

  const updateNumber = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(
      parameterKey,
      event.target.value === "" ? Number.NaN : Number(event.target.value),
    );
  };
  const updateRange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(parameterKey, snapToStep(Number(event.target.value)));
  };

  return (
    <div
      className={`parameter-control${isInvalid ? " parameter-control--invalid" : ""}`}
      role="group"
      aria-labelledby={`${slug}-label`}
    >
      <div className="parameter-label-row">
        <span id={`${slug}-label`} className="parameter-label">
          {spec.label}
        </span>
        <span className="parameter-range-hint">
          {spec.min}–{spec.max} {spec.unit}
        </span>
      </div>
      <div className="parameter-input-row">
        <label className="visually-hidden" htmlFor={`${slug}-range`}>
          {sliderLabel}
        </label>
        <input
          id={`${slug}-range`}
          data-testid={`param-${slug}-range`}
          className="parameter-range"
          type="range"
          min={rangeMin}
          max={rangeMax}
          step={rangeUsesStandardStep ? spec.step : "any"}
          value={rangeValue}
          aria-valuetext={
            `${rangeValue}${spec.unit ? ` ${spec.unit}` : ""}`
          }
          aria-invalid={isInvalid || undefined}
          aria-errormessage={isInvalid ? errorId : undefined}
          onChange={updateRange}
        />
        <div className="number-input-wrap">
          <label className="visually-hidden" htmlFor={`${slug}-number`}>
            {numberLabel}
          </label>
          <input
            id={`${slug}-number`}
            data-testid={`param-${slug}-number`}
            className="parameter-number"
            type="number"
            inputMode="decimal"
            min={spec.min}
            max={spec.max}
            step={rangeUsesStandardStep ? spec.step : "any"}
            value={displayValue}
            aria-invalid={isInvalid || undefined}
            aria-errormessage={isInvalid ? errorId : undefined}
            onChange={updateNumber}
          />
          {spec.unit ? <span className="number-unit">{spec.unit}</span> : null}
        </div>
      </div>
      {isInvalid ? (
        <p id={errorId} data-testid={`param-${slug}-error`} className="field-error">
          {errors?.[0]}
        </p>
      ) : null}
    </div>
  );
}

function DerivedDimensionsCard({
  derived,
  valid,
}: {
  derived: DerivedDimensions;
  valid: boolean;
}) {
  return (
    <section className="derived-card" aria-labelledby="derived-title">
      <div className="derived-card-heading">
        <div>
          <span className="eyebrow">Calculated result</span>
          <h2 id="derived-title">Your organizer</h2>
        </div>
        <span className={`design-state${valid ? "" : " design-state--warning"}`}>
          {valid ? "Ready to build" : "Check inputs"}
        </span>
      </div>
      <dl className="dimension-list">
        <div>
          <dt>Outside</dt>
          <dd data-testid="derived-outside-dimensions">
            {formatMillimeters(derived.outsideWidth)} ×{" "}
            {formatMillimeters(derived.outsideDepth)} ×{" "}
            {formatMillimeters(derived.outsideHeight)} mm
          </dd>
        </div>
        <div>
          <dt>Each compartment</dt>
          <dd data-testid="derived-compartment-dimensions">
            ≈ {formatMillimeters(derived.compartmentWidth)} ×{" "}
            {formatMillimeters(derived.compartmentDepth)} mm
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function DrawerForgeApp() {
  const [parameters, setParameters] = useState<OrganizerParameters>(() => ({
    ...DEFAULT_PARAMETERS,
  }));
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("custom");
  const [preview, setPreview] = useState<PreviewModel | null>(null);
  const [viewerStatus, setViewerStatus] = useState<ViewerStatus>("loading");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [saveMessage, setSaveMessage] = useState("Saved on this device");
  const generationId = useRef(0);

  const validation = useMemo(
    () => validateParameters(parameters),
    [parameters],
  );
  const currentSignature = useMemo(
    () => parameterSignature(parameters),
    [parameters],
  );
  const previewIsCurrent = preview?.signature === currentSignature;

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<PersistedDesign>;
          if (parsed.version === STORAGE_VERSION && parsed.parameters) {
            const restored = normalizeParameters(parsed.parameters);
            if (validateParameters(restored).valid) {
              setParameters(restored);
              setSaveMessage("Restored your last valid design");
            }
          }
        }
      } catch {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Storage can be unavailable in privacy-restricted browsers.
        }
      } finally {
        setHasLoadedStorage(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    const requestId = ++generationId.current;

    if (!validation.valid) {
      const pauseTimer = window.setTimeout(() => {
        if (requestId === generationId.current) {
          setViewerStatus("paused");
          setGenerationError(null);
        }
      }, 0);
      return () => window.clearTimeout(pauseTimer);
    }

    const statusTimer = window.setTimeout(() => {
      if (requestId === generationId.current) {
        setViewerStatus(preview ? "updating" : "loading");
        setGenerationError(null);
      }
    }, 0);
    const timer = window.setTimeout(async () => {
      try {
        const normalized = normalizeParameters(parameters);
        const model = await generateOrganizer(normalized);
        const geometry = organizerToBufferGeometry(model);
        const analysis = analyzeBufferGeometry(geometry);

        if (requestId !== generationId.current) {
          geometry.dispose();
          return;
        }
        if (
          !analysis.finite ||
          analysis.minimumTriangleArea <= 0 ||
          analysis.signedVolume <= 0 ||
          !generatedBoundsMatch(analysis.bounds, model.derived)
        ) {
          geometry.dispose();
          throw new Error("The generated mesh did not pass its safety check.");
        }

        const nextPreview: PreviewModel = {
          geometry,
          parameters: normalized,
          derived: model.derived,
          signature: parameterSignature(normalized),
          triangleCount: analysis.triangleCount,
        };
        setPreview(nextPreview);
        setViewerStatus("ready");
        const persisted: PersistedDesign = {
          version: STORAGE_VERSION,
          parameters: normalized,
        };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
          setSaveMessage("Saved on this device");
        } catch {
          setSaveMessage("Local save unavailable");
        }
      } catch (error) {
        if (requestId !== generationId.current) return;
        setGenerationError(
          error instanceof Error ? error.message : "Preview generation failed.",
        );
        setViewerStatus("error");
      }
    }, REGENERATION_DELAY_MS);

    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
      if (generationId.current === requestId) generationId.current += 1;
    };
    // The normalized signature is the intentional generation dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature, hasLoadedStorage]);

  const updateNumericParameter = (
    key: NumericParameterKey,
    value: number,
  ) => {
    setSelectedPreset("custom");
    setParameters((current) =>
      normalizeParameters({ ...current, [key]: value }),
    );
  };

  const applyPreset = (preset: PresetId) => {
    setSelectedPreset(preset);
    if (preset !== "custom") {
      setParameters(loadPreset(preset));
    }
  };

  const setQuality = (meshQuality: MeshQuality) => {
    setSelectedPreset("custom");
    setParameters((current) => ({ ...current, meshQuality }));
  };

  const setFingerScoop = (fingerScoop: boolean) => {
    setSelectedPreset("custom");
    setParameters((current) => ({ ...current, fingerScoop }));
  };

  const resetDefaults = () => {
    setSelectedPreset("custom");
    setParameters({ ...DEFAULT_PARAMETERS });
    setSaveMessage("Defaults restored");
  };

  const downloadDisabled =
    !validation.valid ||
    !preview ||
    !previewIsCurrent ||
    viewerStatus === "loading" ||
    viewerStatus === "updating" ||
    viewerStatus === "error";
  const downloadDisabledReason = !validation.valid
    ? `Fix ${validation.issues.length} setting${validation.issues.length === 1 ? "" : "s"} before downloading.`
    : !preview ||
        !previewIsCurrent ||
        viewerStatus === "loading" ||
        viewerStatus === "updating"
      ? "Wait for the current preview to finish generating."
      : generationError ?? "The current preview is ready.";

  const downloadStl = () => {
    if (downloadDisabled || !preview) return;
    try {
      const data = serializeBinaryStl(preview.geometry);
      const inspection = inspectBinaryStl(data);
      preview.geometry.computeBoundingBox();
      if (
        !inspection.finite ||
        inspection.minimumTriangleArea <= 0 ||
        inspection.minimumNormalAlignment < 0.99999 ||
        inspection.triangleCount !== preview.triangleCount ||
        !preview.geometry.boundingBox ||
        !dimensionsMatch(inspection.bounds, preview.geometry.boundingBox)
      ) {
        throw new Error("The STL safety check did not match the visible preview.");
      }
      const blob = new Blob([data], { type: "model/stl" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = deterministicStlFilename(
        preview.parameters,
        preview.derived.outsideWidth,
        preview.derived.outsideDepth,
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "STL export failed.",
      );
      setViewerStatus("error");
    }
  };

  const statusDetail =
    viewerStatus === "paused"
      ? `Fix ${validation.issues.length} setting${validation.issues.length === 1 ? "" : "s"}; showing the last valid model.`
      : viewerStatus === "loading"
        ? "Building your first preview…"
        : viewerStatus === "updating"
          ? `Regenerating the ${parameters.rows} × ${parameters.columns} layout…`
          : viewerStatus === "error"
            ? generationError ?? "Preview generation failed."
            : preview
              ? `${formatMillimeters(preview.derived.outsideWidth)} × ${formatMillimeters(preview.derived.outsideDepth)} × ${formatMillimeters(preview.derived.outsideHeight)} mm · ${preview.parameters.rows} × ${preview.parameters.columns}`
              : "Ready";

  return (
    <main className="drawerforge-app" data-testid="drawerforge-app">
      <header className="app-header">
        <div className="brand-lockup" aria-label="DrawerForge home">
          <span className="brand-mark" aria-hidden="true">
            DF
          </span>
          <div>
            <div className="brand-name">DrawerForge</div>
            <div className="brand-tagline">Measure. Divide. Print.</div>
          </div>
        </div>
        <div className="header-actions">
          <span className="save-state" aria-live="polite">
            <span
              className={`save-dot${saveMessage === "Local save unavailable" ? " save-dot--unavailable" : ""}`}
              aria-hidden="true"
            />
            {saveMessage}
          </span>
          <button
            className="button button--quiet"
            type="button"
            data-testid="reset-defaults-button"
            onClick={resetDefaults}
          >
            Reset defaults
          </button>
        </div>
      </header>

      <div className="configurator-shell">
        <aside className="parameter-panel" data-testid="parameter-panel">
          <div className="panel-intro">
            <span className="eyebrow">Parametric tray builder</span>
            <h1>Fit every small thing into its place.</h1>
            <p>
              Enter your drawer measurements, choose a layout, and export a
              print-ready organizer—no CAD required.
            </p>
          </div>

          <fieldset className="preset-fieldset">
            <legend>Start with a workshop preset</legend>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <label
                  key={preset.id}
                  className={`preset-card${selectedPreset === preset.id ? " preset-card--active" : ""}`}
                  data-testid={`preset-${preset.id}`}
                >
                  <input
                    type="radio"
                    name="preset"
                    value={preset.id}
                    checked={selectedPreset === preset.id}
                    onChange={() => applyPreset(preset.id)}
                  />
                  <span className="preset-card-copy">
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                </label>
              ))}
              <label
                className={`preset-card${selectedPreset === "custom" ? " preset-card--active" : ""}`}
                data-testid="preset-custom"
              >
                <input
                  type="radio"
                  name="preset"
                  value="custom"
                  checked={selectedPreset === "custom"}
                  onChange={() => applyPreset("custom")}
                />
                <span className="preset-card-copy">
                  <strong>Custom</strong>
                  <small>Your own measured layout</small>
                </span>
              </label>
            </div>
          </fieldset>

          <DerivedDimensionsCard
            derived={validation.derived}
            valid={validation.valid}
          />

          {parameterGroups.map((group) => (
            <section className="parameter-section" key={group.index}>
              <div className="section-heading">
                <span className="section-number">{group.index}</span>
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
              </div>
              <div className="parameter-stack">
                {group.keys.map((key) => (
                  <NumericParameterControl
                    key={key}
                    parameterKey={key}
                    value={parameters[key]}
                    errors={validation.byField[key]}
                    onChange={updateNumericParameter}
                  />
                ))}
              </div>
            </section>
          ))}

          <section className="parameter-section finish-section">
            <div className="section-heading">
              <span className="section-number">04</span>
              <div>
                <h2>Finish</h2>
                <p>Choose curve detail and an optional front access notch.</p>
              </div>
            </div>

            <fieldset className="quality-fieldset">
              <legend>Mesh quality</legend>
              <div className="quality-options">
                {(["draft", "standard", "fine"] as MeshQuality[]).map(
                  (quality) => (
                    <label
                      key={quality}
                      className={`quality-option${parameters.meshQuality === quality ? " quality-option--active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="mesh-quality"
                        value={quality}
                        data-testid={`quality-${quality}`}
                        checked={parameters.meshQuality === quality}
                        onChange={() => setQuality(quality)}
                      />
                      <span>{quality[0].toUpperCase() + quality.slice(1)}</span>
                    </label>
                  ),
                )}
              </div>
              <p className="quality-hint">
                Standard balances smooth corners with quick regeneration.
              </p>
            </fieldset>

            <label className="toggle-row">
              <span>
                <strong>Front finger scoop</strong>
                <small>A shallow notch that stays safely above the base.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                data-testid="finger-scoop-toggle"
                checked={parameters.fingerScoop}
                onChange={(event) => setFingerScoop(event.target.checked)}
              />
            </label>
          </section>

          <div
            className={`validation-summary${validation.valid ? " validation-summary--valid" : ""}`}
            data-testid="validation-summary"
            role={validation.valid ? "status" : "alert"}
          >
            <span className="validation-icon" aria-hidden="true">
              {validation.valid ? "✓" : "!"}
            </span>
            <div>
              <strong>
                {validation.valid
                  ? "Design checks passed"
                  : `${validation.issues.length} setting${validation.issues.length === 1 ? " needs" : "s need"} attention`}
              </strong>
              <span>
                {validation.valid
                  ? "The current dimensions are safe to generate and export."
                  : "The last valid preview stays visible while you make corrections."}
              </span>
            </div>
          </div>

          <div className="export-bar">
            <button
              className="button button--primary download-button"
              type="button"
              data-testid="download-stl-button"
              disabled={downloadDisabled}
              aria-describedby="download-help"
              onClick={downloadStl}
            >
              <span>Download STL</span>
              <span aria-hidden="true">↓</span>
            </button>
            <p id="download-help">
              {downloadDisabled ? `${downloadDisabledReason} ` : ""}
              STL is unitless; import it as millimeters in your slicer.
            </p>
          </div>
        </aside>

        <section className="preview-panel" aria-label="Organizer preview">
          <DrawerViewer
            geometry={preview?.geometry ?? null}
            modelKey={preview?.signature ?? ""}
            status={viewerStatus}
            statusDetail={statusDetail}
          />
          <div className="preview-caption" aria-hidden="true">
            <span>X · width</span>
            <span>Y · depth</span>
            <span>Z · height</span>
          </div>
        </section>
      </div>
    </main>
  );
}
