import { drawerTray } from "./drawer-tray";
import type { AnyProduct, ParameterSpec, ProductDefinition } from "./types";

/** Erases the spec types of a checked ProductDefinition for the registry. */
function register<Specs extends Record<string, ParameterSpec>>(
  product: ProductDefinition<Specs>,
): AnyProduct {
  return product as unknown as AnyProduct;
}

/**
 * Every product the app can build, in catalog order. Each entry must satisfy
 * the checks in tests/products.test.ts before it is added here.
 */
export const PRODUCTS: readonly AnyProduct[] = [register(drawerTray)];

export const DEFAULT_PRODUCT_ID = drawerTray.id;

export function getProduct(id: string): AnyProduct {
  const product = PRODUCTS.find((candidate) => candidate.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
