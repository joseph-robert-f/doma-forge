import type { ProductCopy } from "../types";

/**
 * The entryway valet's id and page copy, kept in a file with no geometry or
 * kernel imports so a plain Node test can import the id. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const ENTRYWAY_VALET_ID = "entryway-valet";

export const ENTRYWAY_VALET_COPY: ProductCopy = {
  title: "DrawerForge — Entryway Valet",
  description:
    "Design, preview, and download a 3D-printable entryway valet with a well for keys, a well for a watch, and an angled phone rest with a slot, directly in your browser.",
  eyebrow: "Parametric valet tray",
  headline: "Keys in front, phone leaning at the back.",
  intro:
    "Give every well its own width. The last well takes the width that is left. Set the slot to your phone and the rest angle to your taste, and the app keeps the rest thick enough at the top.",
  presetLegend: "Start with a valet preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own wells and phone",
  derivedTitle: "Your valet",
  previewLabel: "Valet preview",
};
