"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_PRODUCT_ID, PRODUCTS } from "../../lib/products/registry";
import type { ProductFamily } from "../../lib/products/types";

const PRODUCT_FAMILIES = [
  { id: "shelled-tray", label: "Shelled trays and bins" },
  { id: "comb-array", label: "Comb and bore arrays" },
  { id: "bracket", label: "Brackets and wall mounts" },
  { id: "revolved", label: "Revolved forms" },
] as const satisfies readonly { id: ProductFamily; label: string }[];

/**
 * Keeps product navigation compact in the header while making every
 * registered model reachable from one grouped disclosure panel.
 */
export function ProductSwitcher() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelIdSuffix = useId();
  const titleIdSuffix = useId();
  const panelId = `product-switcher-panel${panelIdSuffix}`;
  const titleId = `product-switcher-title${titleIdSuffix}`;

  const activeProduct =
    PRODUCTS.find((product) => pathname === `/products/${product.id}`) ??
    (pathname === "/"
      ? PRODUCTS.find((product) => product.id === DEFAULT_PRODUCT_ID)
      : undefined) ??
    PRODUCTS[0];

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !switcherRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const closeOnOutsideFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && !switcherRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("focusin", closeOnOutsideFocus);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("focusin", closeOnOutsideFocus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const closeAndFocus = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  if (!activeProduct) return null;

  return (
    <nav
      ref={switcherRef}
      className="product-switcher"
      aria-label="Choose a product"
      data-testid="product-switcher"
    >
      <button
        ref={triggerRef}
        type="button"
        className="button button--quiet product-switcher-trigger"
        aria-label={`Products, ${activeProduct.label} selected`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        data-testid="product-switcher-trigger"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="product-switcher-trigger-prefix">Products</span>
        <span
          className="product-switcher-trigger-value"
          data-testid="product-switcher-current"
          title={activeProduct.label}
        >
          {activeProduct.label}
        </span>
        <span className="product-switcher-trigger-chevron" aria-hidden="true">
          {isOpen ? "⌃" : "⌄"}
        </span>
      </button>

      <div
        id={panelId}
        className="product-switcher-panel"
        aria-labelledby={titleId}
        hidden={!isOpen}
        data-testid="product-switcher-panel"
      >
        <div className="product-switcher-panel-header">
          <div>
            <h2 id={titleId} className="product-switcher-panel-title">
              Choose a product
            </h2>
            <p className="product-switcher-panel-summary">
              15 printable models, grouped by how they are made.
            </p>
          </div>
        </div>

        <div className="product-switcher-groups">
          {PRODUCT_FAMILIES.map((family) => {
            const familyTitleId = `${panelId}-${family.id}`;
            const products = PRODUCTS.filter(
              (product) => product.family === family.id,
            );

            return (
              <section
                key={family.id}
                className="product-switcher-group"
                aria-labelledby={familyTitleId}
                data-testid="product-switcher-group"
              >
                <h3 id={familyTitleId} className="product-switcher-group-title">
                  {family.label}
                </h3>
                <ul className="product-switcher-group-list">
                  {products.map((product) => {
                    const href = `/products/${product.id}`;
                    const isActive =
                      pathname === href ||
                      (pathname === "/" && product.id === DEFAULT_PRODUCT_ID);

                    return (
                      <li key={product.id}>
                        <Link
                          href={href}
                          className={`product-switcher-link${isActive ? " product-switcher-link--active" : ""}`}
                          aria-current={isActive ? "page" : undefined}
                          data-testid={`product-switcher-link-${product.id}`}
                          onClick={() => setIsOpen(false)}
                        >
                          <span>{product.label}</span>
                          {isActive ? (
                            <span
                              className="product-switcher-current-mark"
                              aria-hidden="true"
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
