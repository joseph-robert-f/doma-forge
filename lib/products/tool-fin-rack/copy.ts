import type { ProductCopy } from "../types";

/**
 * The tool fin rack's id and page copy, kept in a file with no geometry or
 * kernel imports so `tests/rendered-html.test.mjs` can import it under
 * plain Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const TOOL_FIN_RACK_ID = "tool-fin-rack";

export const TOOL_FIN_RACK_COPY: ProductCopy = {
  title: "DrawerForge — Tool Fin Rack",
  description:
    "Design, preview, and download a 3D-printable rack with a slot for every plier, file, or wrench, directly in your browser.",
  eyebrow: "Parametric fin rack",
  headline: "A slot for every tool.",
  intro:
    "Set the rack size, the fin thickness, and the fin count, then export a print-ready rack. Measure the widest tool blade that must slide between two fins.",
  presetLegend: "Start with a tool-type preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured fin count and thickness",
  derivedTitle: "Your rack",
  previewLabel: "Rack preview",
};
