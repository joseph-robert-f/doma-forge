import type { ProductCopy } from "../types";

/**
 * The shelf riser's id and page copy, kept in a file with no geometry or
 * kernel imports so a plain Node test can import the id. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const SHELF_RISER_ID = "shelf-riser";

export const SHELF_RISER_COPY: ProductCopy = {
  title: "DrawerForge — Shelf Riser",
  description:
    "Design, preview, and download a 3D-printable shelf riser: a deck on four legs that makes a second level over shoes, boxes, or anything else on a shelf, directly in your browser.",
  eyebrow: "Parametric shelf riser",
  headline: "A second level on the shelf.",
  intro:
    "Measure the height of what stays under the riser and set the clear height above it. The preview shows the riser as it prints, deck down and legs up. A riser taller than 240 mm gets press-fit leg extensions, printed from the same file.",
  presetLegend: "Start with a shelf preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own shelf and items",
  derivedTitle: "Your riser",
  previewLabel: "Shelf riser preview",
};
