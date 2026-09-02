import { drawerTray } from "./drawer-tray";
import { partsBin } from "./parts-bin";
import { socketTray } from "./socket-tray";
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
export const PRODUCTS: readonly AnyProduct[] = [
  register(drawerTray),
  register(socketTray),
  register(partsBin),
];

export const DEFAULT_PRODUCT_ID = drawerTray.id;

/** Finds a registered product by id. Returns undefined for an unknown id. */
export function findProduct(id: string): AnyProduct | undefined {
  return PRODUCTS.find((candidate) => candidate.id === id);
}

export function getProduct(id: string): AnyProduct {
  const product = findProduct(id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
