import type { GeneratedModel } from "../kernel/mesh";

export type MeshQuality = "draft" | "standard" | "fine";

export interface NumberSpec {
  kind: "number";
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  step: number;
  unit: "mm" | "";
  /** Integer parameters are rounded during normalization. */
  integer?: boolean;
}

export interface BooleanSpec {
  kind: "boolean";
  label: string;
  description: string;
}

export interface EnumSpec<V extends string = string> {
  kind: "enum";
  label: string;
  options: Array<{ value: V; label: string }>;
  hint?: string;
}

export type ParameterSpec = NumberSpec | BooleanSpec | EnumSpec;

export type ParameterValue<S extends ParameterSpec> = S extends NumberSpec
  ? number
  : S extends BooleanSpec
    ? boolean
    : S extends EnumSpec<infer V>
      ? V
      : never;

/** Maps a spec record to the parameter object it describes. */
export type ParametersOf<Specs extends Record<string, ParameterSpec>> = {
  [K in keyof Specs]: ParameterValue<Specs[K]>;
};

export interface ParameterGroup<K extends string> {
  id: string;
  index: string;
  title: string;
  description: string;
  keys: K[];
}

export interface ValidationIssue<K extends string> {
  field: K | "model";
  message: string;
}

export interface ValidationResult<K extends string> {
  valid: boolean;
  issues: ValidationIssue<K>[];
  byField: Partial<Record<K | "model", string[]>>;
}

/** One row in the calculated-result card. */
export interface DerivedValue {
  id: string;
  label: string;
  value: string;
}

/**
 * The bounds the mesh must report for the given parameters. The app rejects a
 * generated mesh whose bounding box differs from this by more than tolerance.
 */
export interface BoundsContract {
  min: [number, number, number];
  max: [number, number, number];
  tolerance: number;
}

export interface ProductPreset<P> {
  id: string;
  label: string;
  description: string;
  parameters: P;
}

export type ProductFamily =
  | "shelled-tray"
  | "comb-array"
  | "bracket"
  | "revolved";

/** User-facing copy that the generic form renders around the parameters. */
export interface ProductCopy {
  /** Page title. Read by generateMetadata for this product's route. */
  title: string;
  /** Page description. Read by generateMetadata for this product's route. */
  description: string;
  eyebrow: string;
  headline: string;
  intro: string;
  presetLegend: string;
  customPresetLabel: string;
  customPresetDescription: string;
  derivedTitle: string;
  previewLabel: string;
}

export interface ProductDefinition<
  Specs extends Record<string, ParameterSpec>,
  P extends ParametersOf<Specs> = ParametersOf<Specs>,
> {
  id: string;
  /** Bump when equal parameters start producing a different mesh. */
  geometryVersion: number;
  label: string;
  family: ProductFamily;
  copy: ProductCopy;
  specs: Specs;
  groups: ParameterGroup<keyof Specs & string>[];
  defaults: P;
  presets: ProductPreset<P>[];
  normalize(input: unknown): P;
  validate(parameters: P): ValidationResult<keyof Specs & string>;
  signature(parameters: P): string;
  derive(parameters: P): DerivedValue[];
  generate(parameters: P): Promise<GeneratedModel<P>>;
  /**
   * Builds a small fit-test print instead of the full model. A product
   * without this member shows no fit-test download.
   */
  coupon?(parameters: P): Promise<GeneratedModel<P>>;
  boundsContract(parameters: P): BoundsContract;
  filename(parameters: P): string;
  /** Short summary shown beside the viewer status, e.g. "299 × 199 × 50 mm". */
  summary(parameters: P): string;
}

/** A product with its specs erased, for registries and generic UI code. */
export type AnyProduct = ProductDefinition<Record<string, ParameterSpec>>;

/** Parameters of a product whose specs have been erased. */
export type AnyParameters = ParametersOf<Record<string, ParameterSpec>>;
