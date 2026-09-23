"use client";

import type { ChangeEvent } from "react";
import type { SuggestedSurfacePattern } from "../../lib/surface-availability";
import {
  DEFAULT_ZONE_SETTING,
  SURFACE_LIMITS,
  type SurfaceMode,
  type SurfaceTreatments,
  type SurfaceTreatmentsSpec,
  type SurfaceZoneSetting,
} from "../../lib/surface-patterns";
import { parameterSlug } from "../../lib/products/shared";
import type {
  BooleanSpec,
  EnumSpec,
  LayoutSpec,
  NumberSpec,
  ParameterSpec,
} from "../../lib/products/types";

interface ControlProps<S extends ParameterSpec, V> {
  parameterKey: string;
  spec: S;
  value: V;
  errors?: string[];
  onChange: (key: string, value: V) => void;
}

export function NumberControl({
  parameterKey,
  spec,
  value,
  errors,
  onChange,
}: ControlProps<NumberSpec, number>) {
  const slug = parameterSlug(parameterKey);
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
          aria-valuetext={`${rangeValue}${spec.unit ? ` ${spec.unit}` : ""}`}
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

function FieldError({ slug, errors }: { slug: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p
      id={`${slug}-error`}
      data-testid={`param-${slug}-error`}
      className="field-error"
    >
      {errors[0]}
    </p>
  );
}

export function BooleanControl({
  parameterKey,
  spec,
  value,
  errors,
  onChange,
}: ControlProps<BooleanSpec, boolean>) {
  const slug = parameterSlug(parameterKey);
  const isInvalid = Boolean(errors?.length);
  return (
    <div>
      <label className="toggle-row">
        <span>
          <strong>{spec.label}</strong>
          <small>{spec.description}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          data-testid={`param-${slug}-toggle`}
          checked={value}
          aria-invalid={isInvalid || undefined}
          aria-errormessage={isInvalid ? `${slug}-error` : undefined}
          onChange={(event) => onChange(parameterKey, event.target.checked)}
        />
      </label>
      <FieldError slug={slug} errors={errors} />
    </div>
  );
}

/**
 * The editor for a layout parameter: one number input per well, plus a
 * button to add a well and a button to remove one. The product solves the
 * last well from the inner width and writes that width back into the list
 * (D-1415), so the last input shows the solved width and is read-only. Add
 * and remove work on the well before that one, so the solved well stays the
 * last one and takes up the change. Every edit sends the whole list to the
 * caller.
 */
export function LayoutControl({
  parameterKey,
  spec,
  value,
  errors,
  onChange,
}: ControlProps<LayoutSpec, number[]>) {
  const slug = parameterSlug(parameterKey);
  const errorId = `${slug}-error`;
  const isInvalid = Boolean(errors?.length);
  const widths = Array.isArray(value) ? value : [];

  const updateWell = (index: number, text: string) => {
    const next = [...widths];
    next[index] = text === "" ? Number.NaN : Number(text);
    onChange(parameterKey, next);
  };
  // The last well is solved, so a new well goes in front of it and a removed
  // well comes from in front of it. The solved well then grows or shrinks by
  // the change, and the caddy stays full.
  const addWell = () =>
    onChange(parameterKey, [...widths.slice(0, -1), spec.newValue, ...widths.slice(-1)]);
  const removeWell = () =>
    onChange(parameterKey, [...widths.slice(0, -2), ...widths.slice(-1)]);

  return (
    <div
      className={`parameter-control layout-control${isInvalid ? " parameter-control--invalid" : ""}`}
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
      <div className="layout-wells">
        {widths.map((width, index) => {
          const solved = index === widths.length - 1;
          return (
            <div className="layout-well" key={index}>
              <label htmlFor={`${slug}-well-${index + 1}`}>
                Well {index + 1}
                {solved ? <span className="layout-solved"> solved</span> : null}
              </label>
              <div className="number-input-wrap">
                <input
                  id={`${slug}-well-${index + 1}`}
                  data-testid={`param-${slug}-well-${index + 1}`}
                  className="parameter-number"
                  type="number"
                  inputMode="decimal"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={Number.isFinite(width) ? width : ""}
                  readOnly={solved}
                  aria-readonly={solved || undefined}
                  // The validation result carries messages, not well
                  // numbers, so the editor cannot mark one well. Every input
                  // carries the state of the list. See open issue 7.
                  aria-invalid={isInvalid || undefined}
                  aria-errormessage={isInvalid ? errorId : undefined}
                  onChange={(event) => updateWell(index, event.target.value)}
                />
                <span className="number-unit">{spec.unit}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="layout-actions">
        <button
          type="button"
          className="button button--quiet"
          data-testid={`param-${slug}-add-well`}
          disabled={widths.length >= spec.maxCount}
          onClick={addWell}
        >
          Add well
        </button>
        <button
          type="button"
          className="button button--quiet"
          data-testid={`param-${slug}-remove-well`}
          disabled={widths.length <= spec.minCount}
          onClick={removeWell}
        >
          Remove well
        </button>
      </div>
      <p className="layout-hint">{spec.description}</p>
      <FieldError slug={slug} errors={errors} />
    </div>
  );
}

export function EnumControl({
  parameterKey,
  spec,
  value,
  errors,
  onChange,
}: ControlProps<EnumSpec, string>) {
  const slug = parameterSlug(parameterKey);
  return (
    <fieldset
      className="quality-fieldset"
      aria-invalid={errors?.length ? true : undefined}
    >
      <legend>{spec.label}</legend>
      <div className="quality-options">
        {spec.options.map((option) => (
          <label
            key={option.value}
            className={`quality-option${value === option.value ? " quality-option--active" : ""}`}
          >
            <input
              type="radio"
              name={slug}
              value={option.value}
              data-testid={`param-${slug}-${option.value}`}
              checked={value === option.value}
              onChange={() => onChange(parameterKey, option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {spec.hint ? <p className="quality-hint">{spec.hint}</p> : null}
      <FieldError slug={slug} errors={errors} />
    </fieldset>
  );
}

export function SurfaceTreatmentsControl({
  parameterKey,
  spec,
  value,
  errors,
  availability,
  suggestedPattern,
  onChange,
}: ControlProps<SurfaceTreatmentsSpec, SurfaceTreatments> & {
  availability?: Record<string, string>;
  suggestedPattern?: SuggestedSurfacePattern | null;
}) {
  const slug = parameterSlug(parameterKey);
  const selected: SurfaceTreatments = value && typeof value === "object"
    ? value : { enabled: false, zones: {} };
  const unavailableMessages = Object.values(availability ?? {});
  const globalErrors = errors?.filter((message) =>
    !unavailableMessages.includes(message) &&
    !spec.zones.some((zone) => message.startsWith(zone.label))
  );
  const updateZone = (id: string, change: Partial<SurfaceZoneSetting>) => {
    onChange(parameterKey, {
      enabled: selected.enabled,
      zones: {
        ...selected.zones,
        [id]: { ...(selected.zones[id] ?? DEFAULT_ZONE_SETTING), ...change },
      },
    });
  };
  const toggle = (enabled: boolean) => {
    if (!enabled || spec.zones.some((zone) => (selected.zones[zone.id] ?? DEFAULT_ZONE_SETTING).mode !== "solid")) {
      onChange(parameterKey, { ...selected, enabled });
      return;
    }
    const first = spec.zones.find((zone) => zone.id === suggestedPattern?.zoneId) ?? spec.zones[0];
    onChange(parameterKey, {
      enabled,
      zones: {
        ...selected.zones,
        [first.id]: suggestedPattern?.setting ?? { ...(selected.zones[first.id] ?? DEFAULT_ZONE_SETTING), mode: "holes" },
      },
    });
  };
  return (
    <div className="surface-control" role="group" aria-label={spec.label}>
      <label className="toggle-row surface-toggle">
        <span>
          <strong>{spec.label}</strong>
          <small>{spec.description}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          data-testid={`param-${slug}-toggle`}
          checked={selected.enabled}
          aria-invalid={Boolean(errors?.length) || undefined}
          aria-errormessage={errors?.length ? `${slug}-error` : undefined}
          onChange={(event) => toggle(event.target.checked)}
        />
      </label>
      {selected.enabled ? (
        <div className="surface-zones">
          {spec.zones.map((zone) => {
            const setting = selected.zones[zone.id] ?? DEFAULT_ZONE_SETTING;
            const zoneSlug = parameterSlug(zone.id);
            const zoneError = errors?.find((message) => message.startsWith(zone.label) && !unavailableMessages.includes(message));
            const unavailable = availability?.[zone.id];
            const unavailableId = `${slug}-${zoneSlug}-unavailable`;
            const zoneErrorId = `${slug}-${zoneSlug}-error`;
            const describedBy = [zoneError ? zoneErrorId : null, unavailable ? unavailableId : null]
              .filter(Boolean).join(" ") || undefined;
            return (
              <fieldset
                className="surface-zone"
                key={zone.id}
                aria-invalid={zoneError || unavailable ? true : undefined}
                aria-describedby={describedBy}
              >
                <legend>{zone.label}</legend>
                {zone.description ? <p className="quality-hint">{zone.description}</p> : null}
                <div className="quality-options">
                  {(["solid", "holes", "mesh"] as SurfaceMode[]).map((mode) => (
                    <label className={`quality-option${setting.mode === mode ? " quality-option--active" : ""}`} key={mode}>
                      <input
                        type="radio"
                        name={`${slug}-${zoneSlug}`}
                        value={mode}
                        data-testid={`param-${slug}-${zoneSlug}-${mode}`}
                        checked={setting.mode === mode}
                        onChange={() => updateZone(zone.id, { mode })}
                      />
                      <span>{mode === "solid" ? "Solid" : mode === "holes" ? "Holes" : "Mesh"}</span>
                    </label>
                  ))}
                </div>
                {setting.mode !== "solid" ? (
                  <div className="surface-measures">
                    {(["opening", "web", "margin"] as const).map((field) => (
                      <label className="surface-measure" key={field}>
                        <span>{field === "opening" ? "Opening" : field === "web" ? "Material between" : "Solid border"}</span>
                        <div className="number-input-wrap">
                          <input
                            className="parameter-number"
                            type="number"
                            inputMode="decimal"
                            data-testid={`param-${slug}-${zoneSlug}-${field}`}
                            min={SURFACE_LIMITS[field].min}
                            max={SURFACE_LIMITS[field].max}
                            step={SURFACE_LIMITS[field].step}
                            value={Number.isFinite(setting[field]) ? setting[field] : ""}
                            aria-invalid={Boolean(zoneError || unavailable) || undefined}
                            aria-describedby={describedBy}
                            onChange={(event) => updateZone(zone.id, {
                              [field]: event.target.value === "" ? Number.NaN : Number(event.target.value),
                            })}
                          />
                          <span className="number-unit">mm</span>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : null}
                {zoneError ? (
                  <p className="field-error" id={zoneErrorId} data-testid={`param-${slug}-${zoneSlug}-error`}>
                    {zoneError}
                  </p>
                ) : null}
                {unavailable ? (
                  <p className="field-error" id={unavailableId} data-testid={`param-${slug}-${zoneSlug}-unavailable`}>
                    {unavailable}
                  </p>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      ) : null}
      <FieldError slug={slug} errors={globalErrors} />
    </div>
  );
}

/** Picks the control for a spec kind. Values are typed by the caller. */
export function ParameterControl({
  parameterKey,
  spec,
  value,
  errors,
  surfaceAvailability,
  suggestedSurfacePattern,
  onChange,
}: {
  parameterKey: string;
  spec: ParameterSpec;
  value: unknown;
  errors?: string[];
  surfaceAvailability?: Record<string, string>;
  suggestedSurfacePattern?: SuggestedSurfacePattern | null;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (spec.kind) {
    case "number":
      return (
        <NumberControl
          parameterKey={parameterKey}
          spec={spec}
          value={value as number}
          errors={errors}
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <BooleanControl
          parameterKey={parameterKey}
          spec={spec}
          value={value as boolean}
          errors={errors}
          onChange={onChange}
        />
      );
    case "layout":
      return (
        <LayoutControl
          parameterKey={parameterKey}
          spec={spec}
          value={value as number[]}
          errors={errors}
          onChange={onChange}
        />
      );
    case "enum":
      return (
        <EnumControl
          parameterKey={parameterKey}
          spec={spec}
          value={value as string}
          errors={errors}
          onChange={onChange}
        />
      );
    case "surfaceTreatments":
      return (
        <SurfaceTreatmentsControl
          parameterKey={parameterKey}
          spec={spec}
          value={value as SurfaceTreatments}
          errors={errors}
          availability={surfaceAvailability}
          suggestedPattern={suggestedSurfacePattern}
          onChange={onChange}
        />
      );
  }
}
