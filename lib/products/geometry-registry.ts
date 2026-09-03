import type { GeneratedModel } from "../kernel/mesh";
import type { AnyParameters } from "./types";

/**
 * The geometry of one product: the full model builder and, for a product
 * that has one, the fit-test coupon builder.
 */
export interface ProductGeometry<P = AnyParameters> {
  generate(parameters: P): Promise<GeneratedModel<P>>;
  coupon?(parameters: P): Promise<GeneratedModel<P>>;
}

/** Erases the parameter type of a checked geometry for the loader table. */
function erase<P>(geometry: ProductGeometry<P>): ProductGeometry {
  return geometry as unknown as ProductGeometry;
}

/**
 * One lazy loader per product, keyed by product id, in catalog order. The
 * generation worker imports this table and nothing else of the catalog, so
 * the worker's fixed chunk holds no schema, no copy, and no geometry, and a
 * product added later costs the worker only its own chunk, loaded when the
 * page first asks for it. Each product definition's `generate` and `coupon`
 * call the same loader, so the page, the worker, and the tests build one
 * geometry. See 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1701.
 */
export const GEOMETRY_LOADERS: Readonly<
  Record<string, () => Promise<ProductGeometry>>
> = {
  "drawer-tray": async () => {
    const [geometry, coupon] = await Promise.all([
      import("./drawer-tray/geometry"),
      import("./drawer-tray/coupon"),
    ]);
    return erase({
      generate: geometry.generateDrawerTray,
      coupon: coupon.generateFitTestCoupon,
    });
  },
  "socket-tray": async () => {
    const geometry = await import("./socket-tray/geometry");
    return erase({ generate: geometry.generateSocketTray });
  },
  "marker-cup-block": async () => {
    const geometry = await import("./marker-cup-block/geometry");
    return erase({ generate: geometry.generateMarkerCupBlock });
  },
  "battery-organizer": async () => {
    const geometry = await import("./battery-organizer/geometry");
    return erase({ generate: geometry.generateBatteryOrganizer });
  },
  "tool-fin-rack": async () => {
    const geometry = await import("./tool-fin-rack/geometry");
    return erase({ generate: geometry.generateToolFinRack });
  },
  "parts-bin": async () => {
    const geometry = await import("./parts-bin/geometry");
    return erase({ generate: geometry.generatePartsBin });
  },
  "remote-caddy": async () => {
    const geometry = await import("./remote-caddy/geometry");
    return erase({ generate: geometry.generateRemoteCaddy });
  },
  "drawer-riser": async () => {
    const geometry = await import("./drawer-riser/geometry");
    return erase({ generate: geometry.generateDrawerRiser });
  },
  "plant-saucer": async () => {
    const geometry = await import("./plant-saucer/geometry");
    return erase({ generate: geometry.generatePlantSaucer });
  },
  "plant-pot": async () => {
    const geometry = await import("./plant-pot/geometry");
    return erase({ generate: geometry.generatePlantPot });
  },
  "card-holder": async () => {
    const geometry = await import("./card-holder/geometry");
    return erase({ generate: geometry.generateCardHolder });
  },
  "wall-hook-rail": async () => {
    const geometry = await import("./wall-hook-rail/geometry");
    return erase({
      generate: geometry.generateWallHookRail,
      coupon: geometry.generateWallHookRailCoupon,
    });
  },
  "headphone-mount": async () => {
    const geometry = await import("./headphone-mount/geometry");
    return erase({ generate: geometry.generateHeadphoneMount });
  },
  "shelf-riser": async () => {
    const geometry = await import("./shelf-riser/geometry");
    return erase({ generate: geometry.generateShelfRiser });
  },
  "entryway-valet": async () => {
    const geometry = await import("./entryway-valet/geometry");
    return erase({ generate: geometry.generateEntrywayValet });
  },
};

const loaded = new Map<string, Promise<ProductGeometry>>();

/**
 * Loads a product's geometry once and caches the module. Throws for an
 * unknown id. The parameter type is the caller's claim; a product passes
 * its own.
 */
export function loadGeometry<P = AnyParameters>(
  id: string,
): Promise<ProductGeometry<P>> {
  const load = Object.prototype.hasOwnProperty.call(GEOMETRY_LOADERS, id)
    ? GEOMETRY_LOADERS[id]
    : undefined;
  if (!load) return Promise.reject(new Error(`Unknown product: ${id}`));
  let pending = loaded.get(id);
  if (!pending) {
    pending = load();
    loaded.set(id, pending);
    // A failed chunk load (a dropped connection, a deploy that changed the
    // chunk hash under an open page) must not poison the cache: the next
    // request tries the import again (D-1714).
    pending.catch(() => {
      if (loaded.get(id) === pending) loaded.delete(id);
    });
  }
  return pending as Promise<ProductGeometry<P>>;
}
