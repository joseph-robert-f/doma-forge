import type { GeneratedModel } from "../kernel/mesh";
import type { CompensableParameters } from "../printer-profile";

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

/**
 * A list of well widths in millimeters, one per column. The value of a
 * layout parameter is `number[]`. The product solves the last well from the
 * inner width, so the last entry is a starting point, not a result. See
 * 22_FAMILY_A_EXTENSIONS_NOTES.md, decision D-1401.
 */
export interface LayoutSpec {
  kind: "layout";
  label: string;
  shortLabel: string;
  /** One line under the editor. Say that the last well is solved. */
  description: string;
  /** The fewest wells the list may hold. */
  minCount: number;
  /** The most wells the list may hold. */
  maxCount: number;
  /** The range of one well width. */
  min: number;
  max: number;
  step: number;
  unit: "mm";
  /** The width a well takes when the user adds one. */
  newValue: number;
}

export type ParameterSpec = NumberSpec | BooleanSpec | EnumSpec | LayoutSpec;

export type ParameterValue<S extends ParameterSpec> = S extends LayoutSpec
  ? number[]
  : S extends NumberSpec
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

/**
 * The rotation that puts a printed part into its recommended print pose,
 * plus one line of text that explains why. The viewer shows a "Print pose"
 * toggle only for a product that sets this. A product with no orientation
 * needs, such as the drawer tray, omits it; the part's modeled pose is
 * already its print pose.
 */
export interface PrintOrientationHint {
  /** Rotation, in degrees, applied about each axis to reach the print pose. */
  rotationDegrees: { x: number; y: number; z: number };
  /** One sentence shown next to the toggle. */
  note: string;
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
  /**
   * The parameters that set an outside dimension along X and along Y. The
   * app adds the printer's dimensional correction to them before it builds
   * the mesh. A product without this member is never compensated.
   */
  compensable?: CompensableParameters;
  boundsContract(parameters: P): BoundsContract;
  filename(parameters: P): string;
  /** Short summary shown beside the viewer status, e.g. "299 × 199 × 50 mm". */
  summary(parameters: P): string;
  /** The print pose hint the viewer offers as a toggle. Omit when the modeled pose already prints upright. */
  printOrientation?: PrintOrientationHint;
}

/** A product with its specs erased, for registries and generic UI code. */
export type AnyProduct = ProductDefinition<Record<string, ParameterSpec>>;

/** Parameters of a product whose specs have been erased. */
export type AnyParameters = ParametersOf<Record<string, ParameterSpec>>;
