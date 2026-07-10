import type { Metadata } from "next";
import { DrawerForgeApp } from "./components/DrawerForgeApp";

export const metadata: Metadata = {
  title: { absolute: "DrawerForge — Parametric Drawer Organizer" },
  description:
    "Design, preview, and download a custom 3D-printable drawer organizer directly in your browser.",
};

export default function Home() {
  return <DrawerForgeApp />;
}
