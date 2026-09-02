"use client";

import type { ChangeEvent } from "react";
import { parameterSlug } from "../../lib/products/shared";
import type {
  BooleanSpec,
  EnumSpec,
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

/** Picks the control for a spec kind. Values are typed by the caller. */
export function ParameterControl({
  parameterKey,
  spec,
  value,
  errors,
  onChange,
}: {
  parameterKey: string;
  spec: ParameterSpec;
  value: unknown;
  errors?: string[];
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
  }
}
