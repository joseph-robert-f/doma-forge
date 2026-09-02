import type { ProductCopy } from "../types";

/**
 * The parts bin's id and page copy, kept in a file with no geometry or
 * kernel imports so `tests/rendered-html.test.mjs` can import it under plain
 * Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const PARTS_BIN_ID = "parts-bin";

export const PARTS_BIN_COPY: ProductCopy = {
  title: "DrawerForge — Stackable Parts Bin",
  description:
    "Design, preview, and download a 3D-printable open bin that stacks on an identical bin, directly in your browser.",
  eyebrow: "Parametric stacking bin",
  headline: "A bin that fills the shelf and stacks.",
  intro:
    "Set the outside size of the bin, then set the stacking lip. The lip on the top rim enters the recess in the bin above it. Measure the shelf with a tape. Measure the parts with a caliper.",
  presetLegend: "Start with a work-area preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured bin",
  derivedTitle: "Your bin",
  previewLabel: "Bin preview",
};
