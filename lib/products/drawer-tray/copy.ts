import type { ProductCopy } from "../types";

/**
 * The drawer tray's id and page copy, kept in their own file with no
 * geometry or kernel imports. `index.ts` pulls in the manifold-3d kernel,
 * which plain Node cannot resolve (it uses a Vite-only `?url` asset
 * import), so `tests/rendered-html.test.mjs` (which runs under plain
 * `node --test`, not Vite) imports this file directly instead. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const DRAWER_TRAY_ID = "drawer-tray";

export const DRAWER_TRAY_COPY: ProductCopy = {
  title: "DrawerForge — Parametric Drawer Organizer",
  description:
    "Design, preview, and download a custom 3D-printable drawer organizer directly in your browser.",
  eyebrow: "Parametric tray builder",
  headline: "Fit every small thing into its place.",
  intro:
    "Enter your drawer measurements, choose a layout, and export a print-ready organizer—no CAD required.",
  presetLegend: "Start with a workshop preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured layout",
  derivedTitle: "Your organizer",
  previewLabel: "Organizer preview",
};
