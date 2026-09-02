"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type * as THREE from "three";
import {
  DESIGN_FILE_MAX_BYTES,
  DESIGN_NAME_MAX_LENGTH,
  createDesignFile,
  designFilename,
  namedMeshFilename,
  normalizeDesignName,
  parseDesignFile,
  readFileText,
  serializeDesignFile,
} from "../../lib/design-file";
import {
  GenerationCancelledError,
  createGenerationClient,
  type GenerationClient,
} from "../../lib/generation/client";
import { getProduct } from "../../lib/products/registry";
import type {
  AnyParameters,
  BoundsContract,
  DerivedValue,
} from "../../lib/products/types";
import { inspectBinaryStl, serializeBinaryStl } from "../../lib/stl";
import {
  analyzeBufferGeometry,
  modelToBufferGeometry,
} from "../../lib/three-geometry";
import { ModelViewer, type ViewerStatus } from "./ModelViewer";
import { ParameterControl } from "./ParameterControls";

/**
 * One record per browser origin. `productId` was added after version 1
 * shipped; a record without it belongs to the drawer tray. Roadmap Phase A
 * replaces this with a versioned workspace envelope.
 */
export const STORAGE_KEY = "drawerforge-design-v1";
const STORAGE_VERSION = 1;
const REGENERATION_DELAY_MS = 140;
const CUSTOM_PRESET_ID = "custom";

type Parameters = AnyParameters;

interface PreviewModel {
  geometry: THREE.BufferGeometry;
  parameters: Parameters;
  signature: string;
  triangleCount: number;
}

interface PersistedDesign {
  version: number;
  productId?: string;
  name?: string;
  parameters: Parameters;
}

interface FileMessage {
  tone: "info" | "warning" | "error";
  text: string;
}

const NAME_SAVE_DELAY_MS = 300;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function boxesMatch(a: THREE.Box3, b: THREE.Box3, tolerance = 1e-4) {
  return (
    a.min.distanceTo(b.min) <= tolerance && a.max.distanceTo(b.max) <= tolerance
  );
}

function boundsSatisfyContract(bounds: THREE.Box3, contract: BoundsContract) {
  const actualMin = bounds.min.toArray();
  const actualMax = bounds.max.toArray();
  return contract.min.every(
    (expected, axis) =>
      Math.abs(actualMin[axis] - expected) <= contract.tolerance &&
      Math.abs(actualMax[axis] - contract.max[axis]) <= contract.tolerance,
  );
}

function DerivedValuesCard({
  title,
  values,
  valid,
}: {
  title: string;
  values: DerivedValue[];
  valid: boolean;
}) {
  return (
    <section className="derived-card" aria-labelledby="derived-title">
      <div className="derived-card-heading">
        <div>
          <span className="eyebrow">Calculated result</span>
          <h2 id="derived-title">{title}</h2>
        </div>
        <span className={`design-state${valid ? "" : " design-state--warning"}`}>
          {valid ? "Ready to build" : "Check inputs"}
        </span>
      </div>
      <dl className="dimension-list">
        {values.map((entry) => (
          <div key={entry.id}>
            <dt>{entry.label}</dt>
            <dd data-testid={`derived-${entry.id}`}>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ProductApp({ productId }: { productId: string }) {
  const product = useMemo(() => getProduct(productId), [productId]);
  const [parameters, setParameters] = useState<Parameters>(() => ({
    ...product.defaults,
  }));
  const [selectedPreset, setSelectedPreset] = useState(CUSTOM_PRESET_ID);
  const [preview, setPreview] = useState<PreviewModel | null>(null);
  const [viewerStatus, setViewerStatus] = useState<ViewerStatus>("loading");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [saveMessage, setSaveMessage] = useState("Saved on this device");
  const [designName, setDesignName] = useState("");
  const [fileMessage, setFileMessage] = useState<FileMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generationId = useRef(0);
  const designNameRef = useRef("");
  const clientRef = useRef<GenerationClient | null>(null);
  const getClient = () => (clientRef.current ??= createGenerationClient());

  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const validation = useMemo(
    () => product.validate(parameters),
    [product, parameters],
  );
  const derivedValues = useMemo(
    () => product.derive(parameters),
    [product, parameters],
  );
  const currentSignature = useMemo(
    () => product.signature(parameters),
    [product, parameters],
  );
  const previewIsCurrent = preview?.signature === currentSignature;

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<PersistedDesign>;
          const belongsToProduct =
            parsed.productId === undefined || parsed.productId === product.id;
          if (
            parsed.version === STORAGE_VERSION &&
            parsed.parameters &&
            belongsToProduct
          ) {
            const restored = product.normalize(parsed.parameters);
            if (product.validate(restored).valid) {
              setParameters(restored);
              setDesignName(normalizeDesignName(parsed.name));
              setSaveMessage("Restored your last valid design");
            }
          }
        }
      } catch {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Storage is unavailable; continue with defaults.
        }
      } finally {
        setHasLoadedStorage(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [product]);

  useEffect(() => {
    // The generation effect reads the name through this ref when it saves.
    // A rename without a geometry edit is saved here so it survives a reload.
    // Only this product's own record is touched, and only after restore.
    designNameRef.current = designName;
    if (!hasLoadedStorage) return;
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as PersistedDesign;
        const ownRecord =
          parsed.version === STORAGE_VERSION &&
          (parsed.productId === undefined || parsed.productId === product.id);
        if (!ownRecord) return;
        const name = normalizeDesignName(designName);
        if (parsed.name === name) return;
        parsed.name = name;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // Storage is unavailable; the design file still carries the name.
      }
    }, NAME_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [designName, hasLoadedStorage, product]);

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
        const normalized = product.normalize(parameters);
        const model = await getClient().generate(product.id, normalized);
        const geometry = modelToBufferGeometry(model);
        const analysis = analyzeBufferGeometry(geometry);

        if (requestId !== generationId.current) {
          geometry.dispose();
          return;
        }
        if (
          !analysis.finite ||
          analysis.minimumTriangleArea <= 0 ||
          analysis.signedVolume <= 0 ||
          !boundsSatisfyContract(
            analysis.bounds,
            product.boundsContract(normalized),
          )
        ) {
          geometry.dispose();
          throw new Error("The generated mesh did not pass its safety check.");
        }

        const nextPreview: PreviewModel = {
          geometry,
          parameters: normalized,
          signature: product.signature(normalized),
          triangleCount: analysis.triangleCount,
        };
        setPreview(nextPreview);
        setViewerStatus("ready");
        const persisted: PersistedDesign = {
          version: STORAGE_VERSION,
          productId: product.id,
          name: normalizeDesignName(designNameRef.current),
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
        if (error instanceof GenerationCancelledError) return;
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
      // A newer edit supersedes any request still running in the worker.
      clientRef.current?.cancel();
    };
    // The normalized signature is the intentional generation dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, currentSignature, hasLoadedStorage]);

  const updateParameter = (key: string, value: unknown) => {
    setSelectedPreset(CUSTOM_PRESET_ID);
    setParameters((current) => product.normalize({ ...current, [key]: value }));
  };

  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = product.presets.find((candidate) => candidate.id === presetId);
    if (preset) setParameters({ ...preset.parameters });
  };

  const resetDefaults = () => {
    setSelectedPreset(CUSTOM_PRESET_ID);
    setParameters({ ...product.defaults });
    setDesignName("");
    setFileMessage(null);
    setSaveMessage("Defaults restored");
  };

  const updateDesignName = (event: ChangeEvent<HTMLInputElement>) => {
    setDesignName(event.target.value.slice(0, DESIGN_NAME_MAX_LENGTH));
  };

  const saveDesignFile = () => {
    if (!validation.valid) return;
    try {
      const design = createDesignFile(product, parameters, designName);
      const blob = new Blob([serializeDesignFile(design)], {
        type: "application/json",
      });
      triggerDownload(blob, designFilename(design));
      setFileMessage({
        tone: "info",
        text: design.name
          ? `Saved "${design.name}" as a design file.`
          : "Saved the design file.",
      });
    } catch (error) {
      setFileMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The design file could not be saved.",
      });
    }
  };

  const openDesignFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > DESIGN_FILE_MAX_BYTES) {
      setFileMessage({
        tone: "error",
        text: `${file.name} is too large to be a design file.`,
      });
      return;
    }
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      setFileMessage({ tone: "error", text: "The file could not be read." });
      return;
    }
    const result = parseDesignFile(text);
    if (!result.ok) {
      setFileMessage({ tone: "error", text: `${file.name}: ${result.error}` });
      return;
    }
    if (result.product.id !== product.id) {
      setFileMessage({
        tone: "error",
        text: `${file.name} is a ${result.product.label} design. This page builds a ${product.label.toLowerCase()}.`,
      });
      return;
    }
    setSelectedPreset(CUSTOM_PRESET_ID);
    setParameters({ ...result.design.parameters });
    setDesignName(result.design.name);
    const loaded = result.design.name
      ? `Loaded "${result.design.name}" from ${file.name}.`
      : `Loaded ${file.name}.`;
    setFileMessage({
      tone: result.warnings.length ? "warning" : "info",
      text: [loaded, ...result.warnings].join(" "),
    });
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
      : (generationError ?? "The current preview is ready.");

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
        !boxesMatch(inspection.bounds, preview.geometry.boundingBox)
      ) {
        throw new Error("The STL safety check did not match the visible preview.");
      }
      triggerDownload(
        new Blob([data], { type: "model/stl" }),
        namedMeshFilename(designName, product.filename(preview.parameters)),
      );
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
          ? `Regenerating ${product.summary(parameters)}…`
          : viewerStatus === "error"
            ? (generationError ?? "Preview generation failed.")
            : preview
              ? product.summary(preview.parameters)
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
            <span className="eyebrow">{product.copy.eyebrow}</span>
            <h1>{product.copy.headline}</h1>
            <p>{product.copy.intro}</p>
          </div>

          <fieldset className="preset-fieldset">
            <legend>{product.copy.presetLegend}</legend>
            <div className="preset-grid">
              {[
                ...product.presets,
                {
                  id: CUSTOM_PRESET_ID,
                  label: product.copy.customPresetLabel,
                  description: product.copy.customPresetDescription,
                },
              ].map((preset) => (
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
            </div>
          </fieldset>

          <section className="design-section" aria-labelledby="design-title">
            <h2 id="design-title" className="design-heading">
              Design file
            </h2>
            <div className="design-row">
              <label className="design-name">
                <span>Design name</span>
                <input
                  type="text"
                  data-testid="design-name-input"
                  value={designName}
                  maxLength={DESIGN_NAME_MAX_LENGTH}
                  placeholder="Optional, used in file names"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={updateDesignName}
                />
              </label>
              <div className="design-actions">
                <button
                  className="button button--quiet"
                  type="button"
                  data-testid="save-design-button"
                  disabled={!validation.valid}
                  aria-describedby="design-hint"
                  onClick={saveDesignFile}
                >
                  Save design file
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  data-testid="open-design-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Open design file
                </button>
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept=".json,application/json"
                  data-testid="open-design-input"
                  aria-label="Open a DrawerForge design file"
                  tabIndex={-1}
                  onChange={openDesignFile}
                />
              </div>
            </div>
            <p id="design-hint" className="design-hint">
              {validation.valid
                ? "A design file holds this product's settings in millimeters. It opens on any device."
                : "Fix the settings above before saving a design file."}
            </p>
            <p
              className={`design-message${fileMessage ? ` design-message--${fileMessage.tone}` : " design-message--empty"}`}
              data-testid="design-file-message"
              data-tone={fileMessage?.tone ?? ""}
              role="status"
              aria-live="polite"
            >
              {fileMessage?.text ?? ""}
            </p>
          </section>

          <DerivedValuesCard
            title={product.copy.derivedTitle}
            values={derivedValues}
            valid={validation.valid}
          />

          {product.groups.map((group) => (
            <section className="parameter-section" key={group.id}>
              <div className="section-heading">
                <span className="section-number">{group.index}</span>
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
              </div>
              <div className="parameter-stack">
                {group.keys.map((key) => (
                  <ParameterControl
                    key={key}
                    parameterKey={key}
                    spec={product.specs[key]}
                    value={parameters[key]}
                    errors={validation.byField[key]}
                    onChange={updateParameter}
                  />
                ))}
              </div>
            </section>
          ))}

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

        <section className="preview-panel" aria-label={product.copy.previewLabel}>
          <ModelViewer
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
