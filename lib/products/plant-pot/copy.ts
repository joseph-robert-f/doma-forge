import type { ProductCopy } from "../types";

/**
 * The nursery plant pot's id and page copy, kept in a file with no geometry or
 * kernel imports so `tests/rendered-html.test.mjs` can import it under plain
 * Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const PLANT_POT_ID = "plant-pot";

export const PLANT_POT_COPY: ProductCopy = {
  title: "DrawerForge — Nursery Plant Pot",
  description:
    "Design, preview, and download a 3D-printable plant pot with drainage holes in a flat base, directly in your browser.",
  eyebrow: "Parametric revolved pot",
  headline: "A pot sized for the shelf and the plant.",
  intro:
    "Set the base diameter, the height, and the wall angle. Set the drainage holes. The pot prints upright and needs no supports. The calculated result names the saucer that matches this pot.",
  presetLegend: "Start with a pot size",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured space",
  derivedTitle: "Your pot",
  previewLabel: "Pot preview",
};
