import type { ProductCopy } from "../types";

/**
 * The remote caddy's id and page copy, kept in a file with no geometry or
 * kernel imports so a plain Node test can import the id. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const REMOTE_CADDY_ID = "remote-caddy";

export const REMOTE_CADDY_COPY: ProductCopy = {
  title: "DrawerForge — Remote and Controller Caddy",
  description:
    "Design, preview, and download a 3D-printable caddy with a well for every remote and controller, directly in your browser.",
  eyebrow: "Parametric well caddy",
  headline: "A well for every remote.",
  intro:
    "Measure each remote and each controller. Give every well its own width. The last well takes the width that is left, so the caddy is always full.",
  presetLegend: "Start with a shelf preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured wells",
  derivedTitle: "Your caddy",
  previewLabel: "Caddy preview",
};
