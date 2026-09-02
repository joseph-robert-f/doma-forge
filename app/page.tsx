import type { Metadata } from "next";
import { DEFAULT_PRODUCT_ID } from "../lib/products/registry";
import { ProductApp } from "./components/ProductApp";

export const metadata: Metadata = {
  title: { absolute: "DrawerForge — Parametric Drawer Organizer" },
  description:
    "Design, preview, and download a custom 3D-printable drawer organizer directly in your browser.",
};

export default function Home() {
  return <ProductApp key={DEFAULT_PRODUCT_ID} productId={DEFAULT_PRODUCT_ID} />;
}
