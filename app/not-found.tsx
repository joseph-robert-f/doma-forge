import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCTS } from "../lib/products/registry";

// This metadata does not currently reach the rendered response; the page
// keeps the root layout's default title instead. See
// 17_PRODUCT_ROUTES_NOTES.md, section 5.1.
export const metadata: Metadata = {
  title: { absolute: "Page not found · DrawerForge" },
  description: "The page you asked for does not exist.",
};

export default function NotFound() {
  return (
    <main className="not-found-page" data-testid="not-found-page">
      <div className="not-found-card">
        <span className="eyebrow">404</span>
        <h1>This page does not exist.</h1>
        <p>Choose a product to open its builder.</p>
        <ul className="not-found-list">
          {PRODUCTS.map((product) => (
            <li key={product.id}>
              <Link
                className="button button--primary"
                href={`/products/${product.id}`}
              >
                {product.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
