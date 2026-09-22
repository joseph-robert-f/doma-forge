import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../lib/products/registry";
import type { AnyParameters, AnyProduct } from "../lib/products/types";
import { assertProductContract } from "./helpers/product-contract";

type Patch = Partial<AnyParameters>;
type End = "min" | "max";
type Corner = `${End}/${End}`;
interface Pair {
  keys: [string, string];
  context?: Patch;
  /** Physically incompatible corners; checked as rejected, never generated. */
  rejected?: Corner[];
}
interface Plan {
  minimum: number;
  /** Ordered validation contexts. Selection never consults generated geometry. */
  anchors: Patch[];
  pairs: Pair[];
  /** Schema endpoints made unreachable by another product rule. */
  rejectedEndpoints?: Record<string, string>;
  active?: Record<string, Patch>;
  extra?: Array<[string, Patch]>;
}

/**
 * Small, explicit contexts make the actual schema endpoints reachable without
 * an exhaustive Cartesian sweep. Defaults are tried first, then these contexts
 * in order. Every endpoint must be accepted somewhere or explicitly declared
 * unreachable; a lost endpoint fails coverage. Nothing retries a geometry
 * failure with different parameters. Most samples use draft quality; every
 * product also gets standard and fine.
 */
const PLANS: Record<string, Plan> = {
  "drawer-tray": {
    minimum: 31,
    anchors: [{ rows: 1, columns: 1, clearancePerSide: 0 }],
    pairs: [{ keys: ["drawerWidth", "columns"], rejected: ["min/max"] },
      { keys: ["organizerHeight", "baseThickness"] }],
  },
  "socket-tray": {
    minimum: 37,
    anchors: [
      { rows: 1, holesPerRow: 1, boreDepth: 3, cornerRadius: 0 },
      { trayWidth: 400, trayDepth: 300, trayHeight: 60, rows: 4, holesPerRow: 1 },
    ],
    pairs: [{ keys: ["trayHeight", "boreDepth"], rejected: ["min/max"] },
      { keys: ["holesPerRow", "boreDiameter1"], rejected: ["max/max"] }],
  },
  "marker-cup-block": {
    minimum: 33,
    anchors: [
      { rows: 1, cupsPerRow: 1, boreDepth: 8, tiltDegrees: 0, cornerRadius: 0 },
      { blockWidth: 400, blockDepth: 300, blockHeight: 130, rows: 1, cupsPerRow: 1 },
    ],
    pairs: [{ keys: ["boreDepth", "tiltDegrees"] },
      { keys: ["cupsPerRow", "boreDiameter"], rejected: ["max/max"] }],
  },
  "battery-organizer": {
    minimum: 34,
    anchors: [
      { rows: 1, cellsPerRow: 1, cellLength: 15, exposedHeight: 3, cornerRadius: 0 },
      { organizerWidth: 400, organizerDepth: 300, organizerHeight: 100, rows: 1, cellsPerRow: 1 },
      { cellShape: "slot", cellDiameter: 20, cellLength: 2, exposedHeight: 3, rows: 1 },
    ],
    pairs: [{ keys: ["cellsPerRow", "cellDiameter"], rejected: ["max/max"] },
      { keys: ["clearancePerSide", "fingerRelief"] }],
  },
  "tool-fin-rack": {
    minimum: 25,
    anchors: [{ finCount: 2, finHeight: 10 }, { rackWidth: 400, finThickness: 6 }],
    pairs: [{ keys: ["finHeight", "finThickness"], rejected: ["max/min"] },
      { keys: ["rackWidth", "finCount"], rejected: ["min/max"] }],
  },
  "parts-bin": {
    minimum: 27,
    anchors: [{ stacking: false }, { wallThickness: 4, stackClearance: 0.1, lipWallThickness: 0.8 }],
    pairs: [{ keys: ["wallThickness", "stacking"], rejected: ["min/max"] },
      { keys: ["cornerRadius", "frontScoop"] }],
    active: { lipHeight: { stacking: true }, lipWallThickness: { stacking: true }, stackClearance: { stacking: true } },
  },
  "remote-caddy": {
    minimum: 27,
    anchors: [
      { caddyHeight: 20, wellDepth: 18, frontWallHeight: 5, baseThickness: 1.2, wellWidths: [25, 25] },
      { caddyWidth: 400, caddyHeight: 120, wellDepth: 110, frontWallHeight: 120, wellWidths: [100, 100] },
      { caddyHeight: 20, wellDepth: 10, frontWallHeight: 20 },
    ],
    pairs: [{ keys: ["caddyHeight", "wellDepth"], rejected: ["min/max"] },
      { keys: ["cornerRadius", "dividerThickness"] }],
  },
  "drawer-riser": {
    minimum: 33,
    anchors: [{ clearHeight: 10, trayHeight: 10, rows: 1, columns: 1 },
      { drawerUsableHeight: 300, legSection: 40 }],
    pairs: [{ keys: ["clearHeight", "legSection"], rejected: ["max/min"] },
      { keys: ["drawerUsableHeight", "trayHeight"], rejected: ["min/max"] }],
  },
  "plant-saucer": {
    minimum: 24,
    anchors: [{ innerDiameter: 60, rimHeight: 40 },
      { rimHeight: 8, taperDegrees: 3, wallThickness: 1.6, baseThickness: 1.6, liftRibs: 0 }],
    pairs: [{ keys: ["rimHeight", "ribHeight"], rejected: ["min/max"] },
      { keys: ["taperDegrees", "overflowNotch"] }],
    active: { ribHeight: { liftRibs: 2 } },
    rejectedEndpoints: { "innerDiameter:max": "The 208 mm floor plus walls exceeds the 208 mm reference-bed limit." },
  },
  "plant-pot": {
    minimum: 26,
    anchors: [{ baseDiameter: 50, potHeight: 40, wallAngleDegrees: 0 }],
    pairs: [{ keys: ["potHeight", "wallAngleDegrees"], rejected: ["max/max"] },
      { keys: ["drainHoles", "drainHoleDiameter"] }],
  },
  "card-holder": {
    minimum: 34,
    anchors: [
      { slotCount: 1, cardWidth: 10, slotDepth: 3, slotTilt: 0, cornerRadius: 0 },
      { holderWidth: 400, holderDepth: 300, holderHeight: 80, slotCount: 1 },
    ],
    pairs: [{ keys: ["slotDepth", "slotTilt"] },
      { keys: ["slotCount", "cardGauge"], rejected: ["max/max"] }],
  },
  "wall-hook-rail": {
    minimum: 31,
    anchors: [
      { railLength: 400, railHeight: 120, hookRoot: 24, hookProjection: 60, screwCount: 1 },
      { hookCount: 1, hookRoot: 8, hookProjection: 12, hookLip: 0, screwCount: 1, screwSpacing: 20, screwDiameter: 3 },
    ],
    pairs: [{ keys: ["hookRoot", "hookProjection"], rejected: ["min/max"] },
      { keys: ["railLength", "screwSpacing"], context: { screwCount: 2 }, rejected: ["min/max", "max/max"] }],
    active: { screwSpacing: { screwCount: 2 }, shelfDepth: { keyShelf: true } },
    rejectedEndpoints: {
      "railHeight:min": "The smallest hook and countersink require 39 mm of plate, above the 30 mm schema minimum.",
      "screwSpacing:max": "Two 3 mm screws at 380 mm exceed the 378 mm maximum spacing on a 400 mm rail.",
    },
    extra: [["screw margins exactly 8 mm", { railLength: 400, screwSpacing: 378, screwDiameter: 3 }],
      ["minimum feasible rail height", { railHeight: 39, hookLip: 0, screwDiameter: 3 }]],
  },
  "headphone-mount": {
    minimum: 34,
    anchors: [
      { plateWidth: 200, plateHeight: 250, hookRoot: 24, hookProjection: 60, hookLip: 4, pocketDepth: 80 },
      { controllerPocket: false, hookWidth: 20, hookRoot: 8, hookProjection: 13, hookLip: 4, bandGauge: 4, screwDiameter: 3 },
    ],
    pairs: [{ keys: ["hookRoot", "hookProjection"], rejected: ["min/min", "max/min", "min/max"] },
      { keys: ["plateWidth", "hookWidth"], rejected: ["min/max"] }],
    active: { pocketWidth: { controllerPocket: true }, pocketDepth: { controllerPocket: true },
      pocketLip: { controllerPocket: true }, pocketFloor: { controllerPocket: true } },
    rejectedEndpoints: { "hookProjection:min": "Even the 4 mm band and lip need 13 mm of projection; the schema minimum is 12 mm." },
  },
  "shelf-riser": {
    minimum: 22,
    anchors: [{ clearHeight: 30 }, { clearHeight: 350, legSection: 40, onePieceHeight: 500 }],
    pairs: [{ keys: ["clearHeight", "legSection"], rejected: ["max/min"] },
      { keys: ["clearHeight", "onePieceHeight"], rejected: ["max/min"] }],
  },
  "entryway-valet": {
    minimum: 36,
    anchors: [
      { valetHeight: 20, wellWidths: [30, 30], wellDepth: 30, restHeight: 30, restAngle: 8 },
      { valetWidth: 400, valetDepth: 250, restHeight: 120, wellWidths: [100, 100] },
      { valetDepth: 250, valetHeight: 20, restHeight: 30 },
    ],
    pairs: [{ keys: ["wellDepth", "restAngle"] },
      { keys: ["valetHeight", "restHeight"], rejected: ["max/min"] }],
  },
};

interface Sample { name: string; parameters: AnyParameters }
function endpoints(product: AnyProduct, key: string): [AnyParameters[string], AnyParameters[string]] {
  const spec = product.specs[key];
  if (spec?.kind === "number") return [spec.min, spec.max];
  if (spec?.kind === "boolean") return [false, true];
  throw new Error(`${product.id}: ${key} is not a numeric/boolean pair parameter`);
}

function fixturesFor(product: AnyProduct, plan: Plan) {
  const samples = new Map<string, Sample>();
  const missing: string[] = [];
  const rejected: string[] = [];
  const bases = [{}, ...plan.anchors];
  const add = (name: string, parameters: AnyParameters) => {
    const identity = JSON.stringify(parameters);
    const previous = samples.get(identity);
    if (previous) previous.name += `; ${name}`;
    else samples.set(identity, { name, parameters });
  };
  const choose = (name: string, changes: Patch, mustReject = false, contexts = bases) => {
    const active = Object.assign({}, ...Object.keys(changes).map((key) => plan.active?.[key]));
    const candidates = contexts.map((base) => {
      const parameters = product.normalize({ ...product.defaults, meshQuality: "draft", ...base, ...active, ...changes });
      return { parameters, validation: product.validate(parameters) };
    });
    const accepted = candidates.find(({ validation }) => validation.valid);
    if (mustReject) {
      if (accepted) missing.push(`${name}: expected rejection, accepted ${JSON.stringify(accepted.parameters)}`);
      else rejected.push(name);
    } else if (accepted) {
      for (const [key, requested] of Object.entries(changes)) {
        const actual = accepted.parameters[key];
        // A layout's final width is solved, but its fixed wells and count
        // must survive. Every scalar endpoint must survive normalization too.
        const kept = Array.isArray(requested)
          ? Array.isArray(actual) && actual.length === requested.length &&
            requested.slice(0, -1).every((value, index) => value === actual[index])
          : actual === requested;
        if (!kept) missing.push(`${name}: normalization changed ${key} from ${JSON.stringify(requested)} to ${JSON.stringify(actual)}`);
      }
      add(name, accepted.parameters);
    } else {
      missing.push(`${name}: no valid context\n${JSON.stringify(candidates)}`);
    }
  };

  for (const [key, spec] of Object.entries(product.specs)) {
    if (spec.kind === "number" || spec.kind === "boolean") {
      const values = endpoints(product, key);
      for (const [i, end] of ["min", "max"].entries()) {
        // The socket tray keeps dormant row diameters in its parameters.
        // Activate the row when checking its endpoints so it reaches geometry.
        const contexts = key.startsWith("boreDiameter") && product.id === "socket-tray"
          ? bases.map((base) => ({ ...base, rows: 4, trayDepth: 300 })) : bases;
        const name = `${key}:${end}`;
        choose(name, { [key]: values[i] }, name in (plan.rejectedEndpoints ?? {}), contexts);
      }
    } else if (spec.kind === "enum") {
      for (const option of spec.options) choose(`${key}:${option.value}`, { [key]: option.value });
    } else {
      // The final well is solved by normalization. Exercise both count limits
      // and both widths in a FIXED well, never rely on the ignored last entry.
      choose(`${key}:minCount`, { [key]: Array(spec.minCount).fill(spec.min) });
      choose(`${key}:maxCount`, { [key]: Array(spec.maxCount).fill(spec.min) });
      choose(`${key}:minWidth`, { [key]: [spec.min, spec.min] });
      choose(`${key}:maxWidth`, { [key]: [spec.max, spec.min] });
    }
  }
  for (const pair of plan.pairs) {
    for (const [i, first] of (["min", "max"] as const).entries()) {
      for (const [j, second] of (["min", "max"] as const).entries()) {
        const corner: Corner = `${first}/${second}`;
        choose(`pair ${pair.keys.join(" × ")}:${corner}`, {
          [pair.keys[0]]: endpoints(product, pair.keys[0])[i],
          [pair.keys[1]]: endpoints(product, pair.keys[1])[j],
        }, pair.rejected?.includes(corner), bases.map((base) => ({ ...base, ...pair.context })));
      }
    }
  }
  for (const [name, changes] of plan.extra ?? []) choose(name, changes);
  return { samples: [...samples.values()], missing, rejected };
}

describe("deterministic cross-product boundaries", () => {
  it("has an explicit coverage plan for all 15 registered products", () => {
    expect(PRODUCTS).toHaveLength(15);
    expect(Object.keys(PLANS).sort()).toEqual(PRODUCTS.map((product) => product.id).sort());
  });

  for (const product of PRODUCTS) {
    const plan = PLANS[product.id];
    if (!plan) continue; // The registry assertion above fails for an unplanned product.
    const fixtures = fixturesFor(product, plan);
    describe(product.id, () => {
      it(`accepts at least ${plan.minimum} distinct samples and accounts for every endpoint/corner`, () => {
        expect(fixtures.missing, product.id).toEqual([]);
        expect(fixtures.samples.length, product.id).toBeGreaterThanOrEqual(plan.minimum);
        expect(fixtures.samples.length, `${product.id}: bounded CI fixture count`).toBeLessThanOrEqual(48);
        expect(fixturesFor(product, plan), `${product.id}: deterministic selection`).toEqual(fixtures);
        console.info(`${product.id}: ${fixtures.samples.length} accepted; ${fixtures.rejected.length} rejected endpoints/corners: ${fixtures.rejected.join(", ") || "none"}`);
      });

      it("satisfies the mesh, bounds, components and STL contracts for every accepted sample", async () => {
        const failures: string[] = [];
        // Always attempt the whole fixed list, even after another sample fails.
        // The test timeout caps runtime; elapsed time never removes fixtures.
        for (const sample of fixtures.samples) {
          const split = product.id === "shelf-riser" &&
            Number(sample.parameters.clearHeight) + Number(sample.parameters.deckThickness) >
            Number(sample.parameters.onePieceHeight);
          try {
            await assertProductContract(product, sample.parameters, sample.name, split ? 5 : 1);
          } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
          }
        }
        expect(failures, `${product.id}: ${failures.length}/${fixtures.samples.length} failed\n${failures.join("\n\n")}`)
          .toEqual([]);
      }, 60_000);
    });
  }
});
