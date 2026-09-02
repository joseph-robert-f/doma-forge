import type { ProductCopy } from "../types";

/**
 * The plant pot saucer's id and page copy, kept in a file with no geometry or
 * kernel imports so `tests/rendered-html.test.mjs` can import it under plain
 * Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const PLANT_SAUCER_ID = "plant-saucer";

export const PLANT_SAUCER_COPY: ProductCopy = {
  title: "DrawerForge — Plant Pot Saucer",
  description:
    "Design, preview, and download a 3D-printable saucer that matches the base of your plant pot, directly in your browser.",
  eyebrow: "Parametric revolved saucer",
  headline: "A saucer that matches the pot.",
  intro:
    "Measure the base of the plant pot with a caliper. Set the inner diameter to that measurement plus 2 mm. Set the rim height and the taper, then export a print-ready saucer.",
  presetLegend: "Start with a pot-size preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured pot",
  derivedTitle: "Your saucer",
  previewLabel: "Saucer preview",
};
