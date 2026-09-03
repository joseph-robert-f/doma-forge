"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type * as THREE from "three";
import {
  DESIGN_FILE_MAX_BYTES,
  DESIGN_NAME_MAX_LENGTH,
  createDesignFile,
  designFilename,
  namedMeshFilename,
  parseDesignFile,
  readFileText,
  serializeDesignFile,
} from "../../lib/design-file";
import {
  GenerationCancelledError,
  createGenerationClient,
  type GenerationClient,
} from "../../lib/generation/client";
import {
  PRINTER_LIMITS,
  PRINTER_NAME_MAX_LENGTH,
  PRINTER_PROFILE_DEFAULTS,
  activeCorrections,
  bedWarnings,
  calibrationProposal,
  compensate,
  compensationNotes,
  correctionRangeMessages,
  extentsFromBounds,
  thinWallIssues,
  normalizePrinterName,
  normalizePrinterProfile,
  validatePrinterProfile,
  wallsFromSpecs,
  withCorrectionTag,
  type CalibrationProposal,
  type Extents,
  type PrinterNumberField,
  type PrinterProfileV1,
} from "../../lib/printer-profile";
import { getProduct } from "../../lib/products/registry";
import {
  fitTestCouponFilename,
  formatMillimeters,
} from "../../lib/products/shared";
import type {
  AnyParameters,
  BoundsContract,
  DerivedValue,
} from "../../lib/products/types";
import { inspectBinaryStl, serializeBinaryStl } from "../../lib/stl";
import {
  readDesign,
  readPrinterEntry,
  writeDesign,
  writeDesignName,
  writePrinterProfile,
} from "../../lib/workspace";
import {
  analyzeBufferGeometry,
  modelToBufferGeometry,
} from "../../lib/three-geometry";
import { ModelViewer, type ViewerStatus } from "./ModelViewer";
import { ParameterControl } from "./ParameterControls";

const REGENERATION_DELAY_MS = 140;
const CUSTOM_PRESET_ID = "custom";

type Parameters = AnyParameters;

interface PreviewModel {
  geometry: THREE.BufferGeometry;
  /** The target parameters: what the user asked for. */
  parameters: Parameters;
  /** The parameters the mesh was built from, after the printer correction. */
  compensatedParameters: Parameters;
  /** The identity of the design. Files and the viewer use it. */
  signature: string;
  /** The identity of this mesh. It also holds the correction. */
  meshSignature: string;
  triangleCount: number;
}

interface FileMessage {
  tone: "info" | "warning" | "error";
  text: string;
}

const NAME_SAVE_DELAY_MS = 300;

/** One string for a stored design, so an unchanged save can stay silent. */
function designKey(name: string, parameters: Parameters): string {
  return JSON.stringify({ name: name.trim(), parameters });
}

const PRINTER_SAVE_DELAY_MS = 300;

/** The size of the part along each axis, or null when it cannot be found. */
function partExtents(bounds: () => BoundsContract): Extents | null {
  try {
    const extents = extentsFromBounds(bounds());
    return Number.isFinite(extents.x) &&
      Number.isFinite(extents.y) &&
      Number.isFinite(extents.z)
      ? extents
      : null;
  } catch {
    return null;
  }
}

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
        <span
          className={`design-state${valid ? "" : " design-state--warning"}`}
        >
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

function PrinterNumberInput({
  field,
  testId,
  label,
  value,
  message,
  onChange,
  onCommit,
}: {
  field: PrinterNumberField;
  testId: string;
  label: string;
  value: string;
  message: string;
  onChange: (field: PrinterNumberField, text: string) => void;
  onCommit: (field: string) => void;
}) {
  const limit = PRINTER_LIMITS[field];
  const messageId = `${testId}-message`;
  return (
    <label className="printer-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        data-testid={testId}
        value={value}
        min={limit.min}
        max={limit.max}
        step={limit.step}
        autoComplete="off"
        aria-describedby={message ? messageId : undefined}
        onChange={(event) => onChange(field, event.target.value)}
        onBlur={() => onCommit(field)}
      />
      <span
        className={`printer-field-message${message ? "" : " printer-field-message--empty"}`}
        id={messageId}
      >
        {message}
      </span>
    </label>
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
  const [fitTestBusy, setFitTestBusy] = useState(false);
  const [printer, setPrinter] = useState<PrinterProfileV1>(() => ({
    ...PRINTER_PROFILE_DEFAULTS,
  }));
  const [printerOpen, setPrinterOpen] = useState(false);
  /** True once this browser holds a profile the user confirmed. */
  const [printerSaved, setPrinterSaved] = useState(false);
  const [printerDrafts, setPrinterDrafts] = useState<Record<string, string>>(
    {},
  );
  const [printerFieldMessages, setPrinterFieldMessages] = useState<
    Record<string, string>
  >({});
  const [measured, setMeasured] = useState({ x: "", y: "" });
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generationId = useRef(0);
  const designNameRef = useRef("");
  /** The design already in storage. A write that changes nothing is silent. */
  const savedDesignRef = useRef("");
  /** True once the user has edited the profile. Guards the first write. */
  const printerTouched = useRef(false);
  const clientRef = useRef<GenerationClient | null>(null);
  const getClient = () => (clientRef.current ??= createGenerationClient());

  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  // The document title carries the design name while one is set, so a saved
  // browser tab or bookmark reads by name. Cleared, it reverts to this
  // product's own page title, read fresh from product.copy each time (not
  // captured once) so a soft navigation stays correct: the product switcher
  // renders a Link, which does not reload the page, so a captured title
  // would otherwise carry the previous route's title over when a design
  // name was already set.
  useEffect(() => {
    const trimmedName = designName.trim();
    document.title = trimmedName
      ? `${trimmedName} · DrawerForge`
      : product.copy.title;
  }, [designName, product]);

  const validation = useMemo(
    () => product.validate(parameters),
    [product, parameters],
  );
  const derivedValues = useMemo(
    () => product.derive(parameters),
    [product, parameters],
  );
  // Compensation runs in exactly one place: here. Every consumer downstream
  // takes either the target parameters or the compensated parameters from
  // these two values, and never applies a correction of its own.
  const targetParameters = useMemo(
    () => product.normalize(parameters),
    [product, parameters],
  );
  const compensatedParameters = useMemo(
    () => compensate(targetParameters, printer, product.compensable),
    [targetParameters, printer, product],
  );
  // The corrections that actually reach this product. A product with no
  // compensable list is never corrected, so it shows no compensation line,
  // its file names carry no marker, and its calibration proposes from zero.
  const activeProfile = useMemo<PrinterProfileV1>(
    () => activeCorrections(printer, product.compensable),
    [product, printer],
  );
  // The mesh identity holds the correction, so a changed correction rebuilds
  // the preview. The design identity, product.signature(target), does not: it
  // names what the user asked for, and it names the files.
  const meshSignature = useMemo(
    () => product.signature(compensatedParameters),
    [product, compensatedParameters],
  );
  const previewIsCurrent = preview?.meshSignature === meshSignature;

  // A target value can be legal while the corrected value is not. The field
  // then shows a legal number, so the message names the correction instead
  // of the field limit, and the download stays refused until it is fixed.
  const compensatedValidation = useMemo(
    () => product.validate(compensatedParameters),
    [product, compensatedParameters],
  );
  const correctionMessages = useMemo(() => {
    if (!validation.valid || compensatedValidation.valid) return [];
    const named = correctionRangeMessages(
      Object.keys(compensatedValidation.byField),
      product.compensable,
      activeProfile,
      (field) => {
        const spec = product.specs[field];
        return spec && spec.kind === "number" ? spec.shortLabel : field;
      },
    );
    if (named.length) return named;
    // A correction can break a rule that names no compensated field, such as
    // a solved well that gets too narrow. The product's own message then
    // names the field and the fix; a bare "past a limit" line does not.
    const own = compensatedValidation.issues.map((issue) => issue.message);
    return own.length
      ? own
      : ["The printer correction takes this design past a limit."];
  }, [validation, compensatedValidation, product, activeProfile]);
  const correctionBlocked = correctionMessages.length > 0;

  const targetExtents = useMemo(
    () => partExtents(() => product.boundsContract(targetParameters)),
    [product, targetParameters],
  );
  const modeledExtents = useMemo(
    () => partExtents(() => product.boundsContract(compensatedParameters)),
    [product, compensatedParameters],
  );
  const compensation = useMemo(
    () =>
      targetExtents && modeledExtents
        ? compensationNotes(targetExtents, modeledExtents)
        : [],
    [targetExtents, modeledExtents],
  );
  // The bed values are placeholders until the user saves a profile. A
  // warning about a bed nobody entered is noise, and noise trains a person
  // to ignore the warning that matters.
  const printerWarnings = useMemo(
    () => bedWarnings(modeledExtents, activeProfile, printerSaved),
    [modeledExtents, activeProfile, printerSaved],
  );
  // Rule 9 of the expansion plan: a wall below two nozzle widths is a
  // validation error, not a warning. It refuses the download.
  // The product reports its own printed walls when it has webs, legs, ribs,
  // or lips that no parameter names; otherwise the wall-like parameters are
  // read by key. The compensated parameters are what the printer builds, so
  // a solved web is measured after the correction (D-1703).
  const wallIssues = useMemo(
    () =>
      thinWallIssues(
        product.printedWalls
          ? product.printedWalls(compensatedParameters)
          : wallsFromSpecs(product.specs, compensatedParameters),
        activeProfile,
      ),
    [product, compensatedParameters, activeProfile],
  );
  const calibrationProposals = useMemo(() => {
    if (!modeledExtents) return [] as CalibrationProposal[];
    const entries: Array<["x" | "y", number, string]> = [
      ["x", activeProfile.correctionX, measured.x],
      ["y", activeProfile.correctionY, measured.y],
    ];
    const proposals: CalibrationProposal[] = [];
    for (const [axis, existing, text] of entries) {
      if (text.trim() === "") continue;
      const proposal = calibrationProposal(
        axis,
        existing,
        modeledExtents[axis],
        Number(text),
      );
      if (proposal) proposals.push(proposal);
    }
    return proposals;
  }, [modeledExtents, activeProfile, measured]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const entry = readPrinterEntry(window.localStorage);
        setPrinter(entry.profile);
        setPrinterSaved(entry.saved);
      } catch {
        // Storage is unavailable; the default profile applies no correction.
      }
      try {
        const stored = readDesign(window.localStorage, product);
        if (stored) {
          setParameters({ ...stored.parameters });
          setDesignName(stored.name);
          savedDesignRef.current = designKey(stored.name, stored.parameters);
          setSaveMessage("Restored your last valid design");
        }
      } catch {
        // Storage is unavailable; continue with defaults.
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
        writeDesignName(window.localStorage, product, designName);
      } catch {
        // Storage is unavailable; the design file still carries the name.
      }
    }, NAME_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [designName, hasLoadedStorage, product]);

  // The profile is written only after the user edits it. A visit that only
  // reads the profile never writes one, so an envelope stays as it is.
  useEffect(() => {
    if (!hasLoadedStorage || !printerTouched.current) return;
    const timer = window.setTimeout(() => {
      let saved = false;
      try {
        saved = writePrinterProfile(window.localStorage, printer);
      } catch {
        saved = false;
      }
      if (saved) setPrinterSaved(true);
      setSaveMessage(
        saved ? "Printer saved on this device" : "Local save unavailable",
      );
    }, PRINTER_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [printer, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    const requestId = ++generationId.current;

    if (!validation.valid || correctionBlocked) {
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
        const normalized = targetParameters;
        const forGeneration = compensatedParameters;
        const model = await getClient().generate(product.id, forGeneration);
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
          // The mesh comes from the compensated parameters, so its contract
          // does too. The user's own target is checked by product.validate().
          !boundsSatisfyContract(
            analysis.bounds,
            product.boundsContract(forGeneration),
          )
        ) {
          geometry.dispose();
          throw new Error("The generated mesh did not pass its safety check.");
        }

        const nextPreview: PreviewModel = {
          geometry,
          parameters: normalized,
          compensatedParameters: forGeneration,
          signature: product.signature(normalized),
          meshSignature: product.signature(forGeneration),
          triangleCount: analysis.triangleCount,
        };
        setPreview(nextPreview);
        setViewerStatus("ready");
        let saved = false;
        const nextKey = designKey(designNameRef.current, normalized);
        const designChanged = nextKey !== savedDesignRef.current;
        try {
          saved = writeDesign(window.localStorage, product, {
            name: designNameRef.current,
            parameters: normalized,
          });
        } catch {
          saved = false;
        }
        // A printer-only edit rebuilds the mesh but changes no design. The
        // save line then keeps whatever it said, instead of claiming a
        // design save that did not happen.
        if (!saved) setSaveMessage("Local save unavailable");
        else if (designChanged) {
          savedDesignRef.current = nextKey;
          setSaveMessage("Saved on this device");
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
    // The compensated signature is the intentional generation dependency. It
    // changes with a parameter edit and with a printer correction edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, meshSignature, hasLoadedStorage]);

  const updateParameter = (key: string, value: unknown) => {
    setSelectedPreset(CUSTOM_PRESET_ID);
    setParameters((current) => product.normalize({ ...current, [key]: value }));
  };

  // normalize() copies every array value, so state never holds the array of
  // a preset record or of the defaults record by reference.
  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = product.presets.find(
      (candidate) => candidate.id === presetId,
    );
    if (preset) setParameters(product.normalize(preset.parameters));
  };

  const resetDefaults = () => {
    setSelectedPreset(CUSTOM_PRESET_ID);
    setParameters(product.normalize(product.defaults));
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
        text:
          error instanceof Error
            ? error.message
            : "The design file could not be saved.",
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

  const setPrinterMessage = (field: string, message: string) => {
    setPrinterFieldMessages((current) => ({ ...current, [field]: message }));
  };

  /**
   * Removes the draft and its message, so the field shows the value the app
   * holds and no message describes text the user has left.
   */
  const commitPrinterField = (field: string) => {
    setPrinterDrafts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setPrinterMessage(field, "");
  };

  const updatePrinterField = (field: PrinterNumberField, text: string) => {
    setPrinterDrafts((current) => ({ ...current, [field]: text }));
    // An empty field is a field in the middle of an edit, not a bad value.
    if (text.trim() === "") {
      setPrinterMessage(field, "");
      return;
    }
    setPrinterMessage(
      field,
      validatePrinterProfile({ [field]: text })[0]?.message ?? "",
    );
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return;
    printerTouched.current = true;
    setPrinter((current) =>
      normalizePrinterProfile({ ...current, [field]: numeric }),
    );
  };

  const updatePrinterName = (text: string) => {
    setPrinterDrafts((current) => ({ ...current, name: text }));
    printerTouched.current = true;
    setPrinter((current) => ({ ...current, name: normalizePrinterName(text) }));
  };

  const updateMeasured = (axis: "x" | "y", text: string) => {
    setCalibrationMessage("");
    setMeasured((current) => ({ ...current, [axis]: text }));
  };

  /**
   * Replaces the correction with the proposal. It never adds to it. The
   * measurement is then cleared, because it describes a part printed with
   * the old correction. A second Apply therefore cannot double the change.
   */
  const applyCalibration = () => {
    if (!calibrationProposals.length) return;
    printerTouched.current = true;
    const applied = [...calibrationProposals];
    setPrinter((current) => {
      const next = { ...current };
      for (const proposal of applied) {
        if (proposal.axis === "x") next.correctionX = proposal.proposed;
        else next.correctionY = proposal.proposed;
      }
      return next;
    });
    for (const proposal of applied) {
      commitPrinterField(proposal.axis === "x" ? "correctionX" : "correctionY");
    }
    setMeasured({ x: "", y: "" });
    setCalibrationMessage(
      `${applied
        .map(
          (proposal) =>
            `The ${proposal.axisLabel} correction is now ${proposal.proposed} mm.`,
        )
        .join(" ")} Print the fit test again to check it.`,
    );
  };

  const designChecksPassed = validation.valid && !correctionBlocked;
  const downloadDisabled =
    !validation.valid ||
    correctionBlocked ||
    wallIssues.length > 0 ||
    !preview ||
    !previewIsCurrent ||
    viewerStatus === "loading" ||
    viewerStatus === "updating" ||
    viewerStatus === "error";
  const downloadDisabledReason = !validation.valid
    ? `Fix ${validation.issues.length} setting${validation.issues.length === 1 ? "" : "s"} before downloading.`
    : correctionBlocked
      ? correctionMessages.join(" ")
      : wallIssues.length > 0
        ? wallIssues.map((issue) => issue.text).join(" ")
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
        throw new Error(
          "The STL safety check did not match the visible preview.",
        );
      }
      triggerDownload(
        new Blob([data], { type: "model/stl" }),
        // The hash names the design, which is the target. The tag names the
        // correction, so two prints of one design never share a file name.
        withCorrectionTag(
          namedMeshFilename(designName, product.filename(preview.parameters)),
          activeProfile,
        ),
      );
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "STL export failed.",
      );
      setViewerStatus("error");
    }
  };

  const downloadFitTest = async () => {
    if (
      downloadDisabled ||
      !preview ||
      !product.coupon ||
      !product.couponBoundsContract ||
      fitTestBusy
    ) {
      return;
    }
    setFitTestBusy(true);
    try {
      // The coupon carries the same correction the full part carries, so the
      // ring a person measures is the ring the tray will print. Each product
      // states its own coupon bounds (D-1617 in 24_BRACKET_FAMILY_NOTES.md).
      // It builds in the generation worker, like the preview, so the page
      // never loads the kernel (D-1702).
      const model = await getClient().generate(
        product.id,
        preview.compensatedParameters,
        "coupon",
      );
      const geometry = modelToBufferGeometry(model);
      const analysis = analyzeBufferGeometry(geometry);
      const couponContract: BoundsContract = product.couponBoundsContract(
        preview.compensatedParameters,
      );
      if (
        !analysis.finite ||
        analysis.minimumTriangleArea <= 0 ||
        analysis.signedVolume <= 0 ||
        !boundsSatisfyContract(analysis.bounds, couponContract)
      ) {
        geometry.dispose();
        throw new Error("The fit-test coupon did not pass its safety check.");
      }
      const data = serializeBinaryStl(geometry);
      const inspection = inspectBinaryStl(data);
      geometry.computeBoundingBox();
      if (
        !inspection.finite ||
        inspection.minimumTriangleArea <= 0 ||
        inspection.minimumNormalAlignment < 0.99999 ||
        inspection.triangleCount !== analysis.triangleCount ||
        !geometry.boundingBox ||
        !boxesMatch(inspection.bounds, geometry.boundingBox)
      ) {
        geometry.dispose();
        throw new Error(
          "The fit-test STL safety check did not match the generated coupon.",
        );
      }
      triggerDownload(
        new Blob([data], { type: "model/stl" }),
        withCorrectionTag(
          namedMeshFilename(
            designName,
            fitTestCouponFilename(model, preview.signature),
          ),
          activeProfile,
          product.compensable,
        ),
      );
      geometry.dispose();
    } catch (error) {
      setFileMessage({
        tone: "error",
        text:
          error instanceof GenerationCancelledError
            ? "An edit cancelled the fit test. Wait for the preview, then try again."
            : error instanceof Error
              ? error.message
              : "Fit-test export failed.",
      });
    } finally {
      setFitTestBusy(false);
    }
  };

  const printerSummary = `Bed ${printer.bedWidth} × ${printer.bedDepth} × ${printer.bedHeight} mm · nozzle ${printer.nozzleDiameter} mm · correction X ${printer.correctionX} mm, Y ${printer.correctionY} mm`;
  const expectedText = modeledExtents
    ? `Expected width ${formatMillimeters(modeledExtents.x, 3)} mm and depth ${formatMillimeters(modeledExtents.y, 3)} mm.`
    : "";

  const statusDetail =
    viewerStatus === "paused"
      ? correctionBlocked
        ? `${correctionMessages.join(" ")} Showing the last valid model.`
        : `Fix ${validation.issues.length} setting${validation.issues.length === 1 ? "" : "s"}; showing the last valid model.`
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
      <div className="configurator-shell">
        <aside className="parameter-panel" data-testid="parameter-panel">
          <div className="panel-toolbar">
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

          <section className="printer-section" aria-labelledby="printer-title">
            <button
              type="button"
              className="printer-toggle"
              data-testid="printer-section-toggle"
              aria-expanded={printerOpen}
              aria-controls={printerOpen ? "printer-body" : undefined}
              onClick={() => setPrinterOpen((open) => !open)}
            >
              <span id="printer-title" className="design-heading">
                Printer
              </span>
              <span className="printer-summary">{printerSummary}</span>
            </button>

            {compensation.length ? (
              <ul className="compensation-list">
                {compensation.map((note) => (
                  <li key={note.axis} data-testid="compensation-note">
                    <span className="compensation-axis">{`${note.axisLabel} · `}</span>
                    {note.text}
                  </li>
                ))}
              </ul>
            ) : null}

            {printerOpen ? (
              <div id="printer-body" className="printer-body">
                <label className="design-name">
                  <span>Printer name</span>
                  <input
                    type="text"
                    data-testid="printer-name"
                    value={printerDrafts.name ?? printer.name}
                    maxLength={PRINTER_NAME_MAX_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => updatePrinterName(event.target.value)}
                    onBlur={() => commitPrinterField("name")}
                  />
                </label>

                <div className="printer-grid">
                  {(
                    [
                      ["bedWidth", "printer-bed-width", "Bed width, X"],
                      ["bedDepth", "printer-bed-depth", "Bed depth, Y"],
                      ["bedHeight", "printer-bed-height", "Bed height, Z"],
                      ["nozzleDiameter", "printer-nozzle", "Nozzle diameter"],
                      ["correctionX", "printer-correction-x", "X correction"],
                      ["correctionY", "printer-correction-y", "Y correction"],
                    ] as Array<[PrinterNumberField, string, string]>
                  ).map(([field, testId, label]) => (
                    <PrinterNumberInput
                      key={field}
                      field={field}
                      testId={testId}
                      label={label}
                      value={printerDrafts[field] ?? String(printer[field])}
                      message={printerFieldMessages[field] ?? ""}
                      onChange={updatePrinterField}
                      onCommit={commitPrinterField}
                    />
                  ))}
                </div>

                {printerSaved ? null : (
                  <p className="design-hint" data-testid="printer-bed-hint">
                    Enter your bed size to get build-volume warnings.
                  </p>
                )}

                <p className="design-hint">
                  A correction is the millimeters this printer prints small. The
                  app adds the correction to the modeled part. It does not
                  change your target, your design file, or your saved design.
                </p>

                <div className="printer-calibration">
                  <h3 className="design-heading">Calibration</h3>
                  <p className="design-hint">
                    Print the fit test. Measure the outside width and depth of
                    the print. Enter the two measurements. Select Apply to
                    replace the correction.
                  </p>
                  <div className="printer-grid">
                    <label className="printer-field">
                      <span>Measured width, X</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        data-testid="calibration-measured-x"
                        value={measured.x}
                        min={0}
                        step={0.01}
                        autoComplete="off"
                        onChange={(event) =>
                          updateMeasured("x", event.target.value)
                        }
                      />
                    </label>
                    <label className="printer-field">
                      <span>Measured depth, Y</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        data-testid="calibration-measured-y"
                        value={measured.y}
                        min={0}
                        step={0.01}
                        autoComplete="off"
                        onChange={(event) =>
                          updateMeasured("y", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div
                    className="calibration-proposal"
                    data-testid="calibration-proposal"
                    role="status"
                    aria-live="polite"
                  >
                    {modeledExtents ? (
                      <p>{expectedText}</p>
                    ) : (
                      <p>
                        Fix the settings above to get an expected size to
                        compare.
                      </p>
                    )}
                    {calibrationProposals.map((proposal) => (
                      <p key={proposal.axis}>{proposal.text}</p>
                    ))}
                  </div>
                  <button
                    className="button button--quiet"
                    type="button"
                    data-testid="calibration-apply"
                    disabled={calibrationProposals.length === 0}
                    onClick={applyCalibration}
                  >
                    Apply correction
                  </button>
                  <p
                    className={`design-message${calibrationMessage ? " design-message--info" : " design-message--empty"}`}
                    data-testid="calibration-message"
                    role="status"
                    aria-live="polite"
                  >
                    {calibrationMessage}
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <DerivedValuesCard
            title={product.copy.derivedTitle}
            values={derivedValues}
            valid={designChecksPassed}
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
            className={`validation-summary${designChecksPassed ? " validation-summary--valid" : ""}`}
            data-testid="validation-summary"
            role={designChecksPassed ? "status" : "alert"}
          >
            <span className="validation-icon" aria-hidden="true">
              {designChecksPassed ? "✓" : "!"}
            </span>
            <div>
              <strong>
                {correctionBlocked
                  ? "The printer correction leaves a limit"
                  : designChecksPassed
                    ? "Design checks passed"
                    : `${validation.issues.length} setting${validation.issues.length === 1 ? " needs" : "s need"} attention`}
              </strong>
              <span>
                {correctionBlocked
                  ? `${correctionMessages.join(" ")} Lower the correction, or change the value.`
                  : designChecksPassed
                    ? "The current dimensions are safe to generate and export."
                    : "The last valid preview stays visible while you make corrections."}
              </span>
            </div>
          </div>

          <div
            className={`printer-warnings${printerWarnings.length ? "" : " printer-warnings--empty"}`}
            data-testid="printer-warnings"
            role="status"
            aria-live="polite"
          >
            {printerWarnings.length ? (
              <>
                <strong>Printer check</strong>
                {printerWarnings.map((warning) => (
                  <p
                    key={warning.id}
                    className="printer-warning"
                    data-testid="printer-warning"
                    data-tone="warning"
                  >
                    {warning.text}
                  </p>
                ))}
                <span>These are warnings. The download stays available.</span>
              </>
            ) : null}
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
            {product.coupon ? (
              <button
                className="button button--quiet download-button"
                type="button"
                data-testid="download-fit-test-button"
                disabled={downloadDisabled || fitTestBusy}
                aria-busy={fitTestBusy}
                aria-describedby="download-help fit-test-help"
                onClick={downloadFitTest}
              >
                <span>
                  {fitTestBusy ? "Building fit test…" : "Download fit test"}
                </span>
                <span aria-hidden="true">{fitTestBusy ? "…" : "↓"}</span>
              </button>
            ) : null}
            <p id="download-help">
              {downloadDisabled ? `${downloadDisabledReason} ` : ""}
              STL is unitless; import it as millimeters in your slicer.
            </p>
            {product.coupon ? (
              <p id="fit-test-help">
                Print this ring first. It uses little material and shows whether
                the tray fits the drawer. The ring wall is never thinner than 2
                mm, even if the tray wall is set thinner.
              </p>
            ) : null}
          </div>
        </aside>

        <section
          className="preview-panel"
          aria-label={product.copy.previewLabel}
        >
          <ModelViewer
            geometry={preview?.geometry ?? null}
            modelKey={preview?.meshSignature ?? ""}
            status={viewerStatus}
            statusDetail={statusDetail}
            printOrientation={product.printOrientation}
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
