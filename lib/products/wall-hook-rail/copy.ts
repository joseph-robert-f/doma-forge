import type { ProductCopy } from "../types";

/**
 * The wall hook rail's id and page copy, kept in a file with no geometry or
 * kernel imports so a plain Node test can import the id. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const WALL_HOOK_RAIL_ID = "wall-hook-rail";

export const WALL_HOOK_RAIL_COPY: ProductCopy = {
  title: "DrawerForge — Wall Hook Rail",
  description:
    "Design, preview, and download a 3D-printable wall rail with hooks for keys and lanyards, an optional shelf, and screw bores that match your wall, directly in your browser.",
  eyebrow: "Parametric hook rail",
  headline: "Hooks where the wall lets you screw.",
  intro:
    "Set the rail length, the hook count, and the screw spacing that matches your wall. Every hook keeps the load rules that stop it snapping across the print layers, and the app names the rule when a value breaks one.",
  presetLegend: "Start with a rail preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own rail and wall",
  derivedTitle: "Your rail",
  previewLabel: "Hook rail preview",
};
