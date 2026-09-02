import type { ProductCopy } from "../types";

/**
 * The socket tray's id and page copy, kept in a file with no geometry or
 * kernel imports so `tests/rendered-html.test.mjs` can import it under plain
 * Node. See 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
export const SOCKET_TRAY_ID = "socket-tray";

export const SOCKET_TRAY_COPY: ProductCopy = {
  title: "DrawerForge — Bit, Socket, and Driver Tray",
  description:
    "Design, preview, and download a 3D-printable tray with a bore for every socket, bit, and driver, directly in your browser.",
  eyebrow: "Parametric bore tray",
  headline: "A bore for every socket.",
  intro:
    "Set the tray size, the rows, and the bore diameter of each row, then export a print-ready tray. Measure the widest socket in each row with a caliper.",
  presetLegend: "Start with a drive-size preset",
  customPresetLabel: "Custom",
  customPresetDescription: "Your own measured set",
  derivedTitle: "Your tray",
  previewLabel: "Tray preview",
};
