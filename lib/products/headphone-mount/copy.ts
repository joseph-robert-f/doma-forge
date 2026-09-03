import type { ProductCopy } from "../types";

/**
 * The headphone mount's id and page copy, kept in a file with no geometry or
 * kernel imports so a plain Node test can import the id. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const HEADPHONE_MOUNT_ID = "headphone-mount";

export const HEADPHONE_MOUNT_COPY: ProductCopy = {
  title: "DrawerForge — Headphone and Controller Wall Mount",
  description:
    "Design, preview, and download a 3D-printable wall mount with one wide hook for a headset and an optional pocket for a controller, directly in your browser.",
  eyebrow: "Parametric wall mount",
  headline: "One hook for the headset, one pocket for the controller.",
  intro:
    "Measure the headband where it rests on the hook, and the controller if you want the pocket. The hook keeps the load rules that stop it snapping across the print layers, and the pocket sits above the hook so the band slips on and off.",
  presetLegend: "Start with a mount preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own headset and controller",
  derivedTitle: "Your mount",
  previewLabel: "Wall mount preview",
};
