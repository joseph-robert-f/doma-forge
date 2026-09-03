import { batteryOrganizer } from "./battery-organizer";
import { cardHolder } from "./card-holder";
import { drawerRiser } from "./drawer-riser";
import { drawerTray } from "./drawer-tray";
import { entrywayValet } from "./entryway-valet";
import { headphoneMount } from "./headphone-mount";
import { markerCupBlock } from "./marker-cup-block";
import { partsBin } from "./parts-bin";
import { plantPot } from "./plant-pot";
import { plantSaucer } from "./plant-saucer";
import { remoteCaddy } from "./remote-caddy";
import { shelfRiser } from "./shelf-riser";
import { socketTray } from "./socket-tray";
import { toolFinRack } from "./tool-fin-rack";
import { wallHookRail } from "./wall-hook-rail";
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
  register(markerCupBlock),
  register(batteryOrganizer),
  register(toolFinRack),
  register(partsBin),
  register(remoteCaddy),
  register(drawerRiser),
  register(plantSaucer),
  register(plantPot),
  register(cardHolder),
  register(wallHookRail),
  register(headphoneMount),
  register(shelfRiser),
  register(entrywayValet),
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
