import type { ProductCopy } from "../types";

/**
 * The card holder's id and page copy, kept in a file with no geometry or
 * kernel imports so `tests/rendered-html.test.mjs` can import it under plain
 * Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const CARD_HOLDER_ID = "card-holder";

export const CARD_HOLDER_COPY: ProductCopy = {
  title: "DrawerForge — Card and Cartridge Slot Holder",
  description:
    "Design, preview, and download a 3D-printable slab with a slot for every memory card, game cartridge, or cassette, directly in your browser.",
  eyebrow: "Parametric slot holder",
  headline: "A slot for every card.",
  intro:
    "Measure the thickness and the width of one card with a caliper. Set the slot count, the slot depth, and the tilt. A tilted slot leans the cards to one side, so you can lift one out with a finger.",
  presetLegend: "Start with a card size",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured card",
  derivedTitle: "Your holder",
  previewLabel: "Holder preview",
};
