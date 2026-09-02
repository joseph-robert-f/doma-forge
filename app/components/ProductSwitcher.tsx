"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_PRODUCT_ID, PRODUCTS } from "../../lib/products/registry";

/**
 * Lists every registered product as a link to its route. With one product it
 * renders one item; the list still shows so the page always names the
 * product it builds.
 */
export function ProductSwitcher() {
  const pathname = usePathname();

  return (
    <nav
      className="product-switcher"
      aria-label="Choose a product"
      data-testid="product-switcher"
    >
      <ul className="product-switcher-list">
        {PRODUCTS.map((product) => {
          const href = `/products/${product.id}`;
          const isActive =
            pathname === href ||
            (pathname === "/" && product.id === DEFAULT_PRODUCT_ID);
          return (
            <li key={product.id}>
              <Link
                href={href}
                className={`button button--quiet product-switcher-item${
                  isActive ? " product-switcher-item--active" : ""
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {product.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
