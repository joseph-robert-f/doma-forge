import type { ProductCopy } from "../types";

/**
 * The battery organizer's id and page copy, kept in a file with no geometry
 * or kernel imports so `tests/rendered-html.test.mjs` can import it under
 * plain Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const BATTERY_ORGANIZER_ID = "battery-organizer";

export const BATTERY_ORGANIZER_COPY: ProductCopy = {
  title: "DrawerForge — Battery Organizer",
  description:
    "Design, preview, and download a 3D-printable organizer with a well for every cell, directly in your browser.",
  eyebrow: "Parametric cell organizer",
  headline: "A well for every cell.",
  intro:
    "Pick a cell preset, or measure your own cell diameter and length, then export a print-ready organizer. A round bore holds an upright cell; a slot stands a coin cell on edge.",
  presetLegend: "Start with a cell preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured cell",
  derivedTitle: "Your organizer",
  previewLabel: "Organizer preview",
};
