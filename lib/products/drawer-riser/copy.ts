import type { ProductCopy } from "../types";

/**
 * The drawer riser's id and page copy, kept in a file with no geometry or
 * kernel imports so a plain Node test can import the id. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const DRAWER_RISER_ID = "drawer-riser";

export const DRAWER_RISER_COPY: ProductCopy = {
  title: "DrawerForge — Two-Tier Drawer Riser",
  description:
    "Design, preview, and download a 3D-printable drawer tray on legs that leaves a clear second level below it, directly in your browser.",
  eyebrow: "Parametric riser tray",
  headline: "A second level in the same drawer.",
  intro:
    "Measure the drawer, then set the clear height you need under the tray. The riser stands on four legs and gives you a second level above what is already in the drawer.",
  presetLegend: "Start with a drawer preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured drawer",
  derivedTitle: "Your riser",
  previewLabel: "Riser preview",
};
