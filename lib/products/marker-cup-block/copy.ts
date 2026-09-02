import type { ProductCopy } from "../types";

/**
 * The marker cup block's id and page copy, kept in a file with no geometry
 * or kernel imports so `tests/rendered-html.test.mjs` can import it under
 * plain Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const MARKER_CUP_BLOCK_ID = "marker-cup-block";

export const MARKER_CUP_BLOCK_COPY: ProductCopy = {
  title: "DrawerForge — Marker and Brush Cup Block",
  description:
    "Design, preview, and download a 3D-printable block with a cup for every marker and brush, directly in your browser.",
  eyebrow: "Parametric cup block",
  headline: "A cup for every marker.",
  intro:
    "Set the block size, the rows, and one bore diameter for every cup, then export a print-ready block. Measure the widest marker or brush with a caliper.",
  presetLegend: "Start with a cup-size preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured set",
  derivedTitle: "Your cup block",
  previewLabel: "Cup block preview",
};
