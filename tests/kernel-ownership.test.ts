import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import { describe, expect, it, vi } from "vitest";
import { boreCutter, cutterArray, dividerArrayAtPositions, unionSolids } from "../lib/kernel/arrays";
import { extrudeAlongX, hullGusset, jHook, screwCutters } from "../lib/kernel/brackets";
import { legPosts } from "../lib/kernel/legs";
import { lightenUnderside } from "../lib/kernel/lightening";
import { getKernel, type Solid } from "../lib/kernel/manifold";
import { finishSolid } from "../lib/kernel/mesh";
import { ResourceScope } from "../lib/kernel/ownership";
import { roundedRectangle } from "../lib/kernel/profiles";
import { revolveShell } from "../lib/kernel/revolve";
import { roundedShell, roundedSlab, shellFromProfiles } from "../lib/kernel/shell";
import { buildVesselProfile } from "../lib/kernel/vessel-profile";

// Only replace the module's kernel provider in this isolated test file.
// No prototypes, constructors, or global WASM runtime state are patched.
vi.mock("../lib/kernel/manifold", () => ({ getKernel: vi.fn() }));

type RawHandle = Solid | CrossSection;

/**
 * A small explicit kernel facade. With a real kernel it owns actual WASM
 * handles; otherwise it exercises the identical resource protocol cheaply
 * enough to fail at EVERY operation of every shipped product/preset.
 */
class OwnershipKernel {
  readonly handles: Handle[] = [];
  readonly operations: string[] = [];
  readonly failure = new Error("injected kernel failure");
  failAt = Number.POSITIVE_INFINITY;
  readonly kernel: ManifoldToplevel;

  constructor(readonly real?: ManifoldToplevel) {
    const step = (operation: string) => this.step(operation);
    const handle = (raw?: RawHandle) => this.handle(raw);
    class Section {
      constructor(...args: ConstructorParameters<ManifoldToplevel["CrossSection"]>) {
        step("CrossSection");
        return handle(real ? new real.CrossSection(...args) : undefined);
      }
      static square(...args: Parameters<ManifoldToplevel["CrossSection"]["square"]>) {
        step("square");
        return handle(real?.CrossSection.square(...args));
      }
    }
    this.kernel = {
      CrossSection: Section,
      Manifold: {
        cube: (...args: Parameters<ManifoldToplevel["Manifold"]["cube"]>) => {
          this.step("cube");
          return this.handle(real?.Manifold.cube(...args));
        },
        cylinder: (...args: Parameters<ManifoldToplevel["Manifold"]["cylinder"]>) => {
          this.step("cylinder");
          return this.handle(real?.Manifold.cylinder(...args));
        },
        union: (handles: Handle[]) => {
          handles.forEach(handle => handle.check());
          this.step("union");
          return this.handle(real?.Manifold.union(handles.map(handle => handle.raw as Solid)));
        },
        hull: (handles: Handle[]) => {
          handles.forEach(handle => handle.check());
          this.step("hull");
          return this.handle(real?.Manifold.hull(handles.map(handle => handle.raw as Solid)));
        },
      },
    } as unknown as ManifoldToplevel;
  }

  step(operation: string) {
    this.operations.push(operation);
    if (this.operations.length === this.failAt) throw this.failure;
  }

  handle(raw?: RawHandle) {
    const handle = new Handle(this, raw);
    this.handles.push(handle);
    return handle;
  }

  assertLive(expected: RawHandle[] = []) {
    const message = `failure at ${this.failAt}: ${this.operations.join(" -> ")}`;
    expect(this.handles.filter(handle => handle.deletes === 0), message).toEqual(expected);
    for (const handle of this.handles) {
      expect(handle.deletes, message).toBe(expected.includes(handle as unknown as RawHandle) ? 0 : 1);
    }
  }
}

class Handle {
  deletes = 0;
  constructor(readonly owner: OwnershipKernel, readonly raw?: RawHandle) { }

  check() {
    if (this.deletes) throw new Error("use after delete");
  }

  private step(operation: string) {
    this.check();
    this.owner.step(operation);
  }

  delete() {
    this.deletes += 1;
    if (this.deletes > 1) throw new Error("double delete");
    this.raw?.delete();
  }

  offset(...args: Parameters<CrossSection["offset"]>) {
    this.step("offset");
    return this.owner.handle((this.raw as CrossSection | undefined)?.offset(...args));
  }

  extrude(...args: Parameters<CrossSection["extrude"]>) {
    this.step("extrude");
    return this.owner.handle((this.raw as CrossSection | undefined)?.extrude(...args));
  }

  revolve(...args: Parameters<CrossSection["revolve"]>) {
    this.step("revolve");
    return this.owner.handle((this.raw as CrossSection | undefined)?.revolve(...args));
  }

  translate(...args: Parameters<Solid["translate"]>) {
    this.step("translate");
    return this.owner.handle((this.raw as Solid | undefined)?.translate(...args));
  }

  rotate(...args: Parameters<Solid["rotate"]>) {
    this.step("rotate");
    return this.owner.handle((this.raw as Solid | undefined)?.rotate(...args));
  }

  subtract(other: Handle) {
    other.check();
    this.step("subtract");
    // Both resource kinds support subtraction; preserve the real receiver.
    const raw = this.raw as Solid | undefined;
    return this.owner.handle(raw?.subtract(other.raw as Solid));
  }

  intersect(other: Handle) {
    other.check();
    this.step("intersect");
    return this.owner.handle((this.raw as Solid | undefined)?.intersect(other.raw as Solid));
  }

  status() { this.step("status"); return (this.raw as Solid | undefined)?.status() ?? "NoError"; }
  isEmpty() { this.step("isEmpty"); return (this.raw as Solid | undefined)?.isEmpty() ?? false; }
  boundingBox() {
    this.step("boundingBox");
    return (this.raw as Solid | undefined)?.boundingBox() ?? { min: [0, 0, 0], max: [1, 1, 1] };
  }
  volume() { this.step("volume"); return (this.raw as Solid | undefined)?.volume() ?? 1; }
  getMesh() {
    this.step("getMesh");
    return (this.raw as Solid | undefined)?.getMesh() ?? {
      numProp: 3,
      vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triVerts: new Uint32Array([0, 1, 2]),
    };
  }
}

const slabOptions = { width: 40, depth: 30, height: 12, cornerRadius: 3, segments: 12 };
const shellOptions = { ...slabOptions, wallThickness: 2, baseThickness: 2 };
const lighteningOptions = {
  width: 40, depth: 30, cornerRadius: 3, rim: 3, pocketDepth: 3,
  maximumSpan: 14, web: 2, pocketRadius: 2, segments: 12,
};
const legOptions = {
  centers: [[-12, -8], [12, -8], [-12, 8], [12, 8]] as [number, number][],
  section: 6, cornerRadius: 1, height: 15, gusset: 3, segments: 12,
};

async function everyFailure(
  run: (owner: OwnershipKernel) => unknown,
  real?: ManifoldToplevel,
) {
  const success = new OwnershipKernel(real);
  await run(success);
  success.assertLive();
  expect(success.operations.length).toBeGreaterThan(0);
  for (let step = 1; step <= success.operations.length; step += 1) {
    const owner = new OwnershipKernel(real);
    owner.failAt = step;
    let thrown: unknown;
    try { await run(owner); } catch (error) { thrown = error; }
    expect(thrown, `operation ${step}: ${success.operations[step - 1]}`).toBe(owner.failure);
    owner.assertLive();
  }
}

describe("resource scope", () => {
  it("deduplicates aliases, transfers ownership, and releases early exactly once", () => {
    const owner = new OwnershipKernel();
    const scope = new ResourceScope();
    const first = scope.own(owner.handle());
    scope.own(first);
    const second = scope.own(owner.handle());
    scope.delete(first);
    scope.delete(first);
    expect(scope.take(second)).toBe(second);
    scope.dispose();
    scope.dispose();
    expect(first.deletes).toBe(1);
    expect(second.deletes).toBe(0);
    second.delete();
    owner.assertLive();
  });

  it("attempts all releases even if one destructor throws, without retrying it", () => {
    const scope = new ResourceScope();
    const good = { delete: vi.fn() };
    const failure = new Error("destructor");
    const bad = { delete: vi.fn(() => { throw failure; }) };
    scope.own(good);
    scope.own(bad);
    expect(() => scope.dispose()).toThrow(failure);
    scope.dispose();
    expect(good.delete).toHaveBeenCalledTimes(1);
    expect(bad.delete).toHaveBeenCalledTimes(1);
  });
});

describe("shared builders with real WASM handles", () => {
  const builders: [string, (kernel: ManifoldToplevel) => RawHandle[]][] = [
    ["plain profile", kernel => [roundedRectangle(kernel, 40, 30, 0, 12)]],
    ["rounded slab", kernel => [roundedSlab(kernel, slabOptions)]],
    ["rounded shell", kernel => Object.values(roundedShell(kernel, shellOptions))],
    ["chamfered bore", kernel => [boreCutter(kernel, { diameter: 6, depth: 8, chamfer: 1, topZ: 10, segments: 12 })]],
    ["cutter grid", kernel => [cutterArray(kernel, () => kernel.Manifold.cube([2, 2, 2]), {
      countX: 3, countY: 2, pitchX: 4, pitchY: 4, origin: [0, 0, 0],
    })]],
    ["single cutter", kernel => [cutterArray(kernel, () => kernel.Manifold.cube([2, 2, 2]), {
      countX: 1, countY: 1, pitchX: 0, pitchY: 0, origin: [1, 2, 3],
    })]],
    ["gusset", kernel => [hullGusset(kernel, { thickness: 3, rise: 10, run: 8, overlap: 0.2 })]],
    ["hook", kernel => [jHook(kernel, { width: 8, root: 8, projection: 18, lipHeight: 5, lipThickness: 2, fillet: 2, overlap: 0.2, segments: 4 })]],
    ["screw array", kernel => [screwCutters(kernel, [[-10, 5], [0, 5], [10, 5]], { diameter: 3, headDiameter: 6, plateThickness: 4, segments: 12 })]],
    ["leg array", kernel => [legPosts(kernel, legOptions)]],
    ["plain leg", kernel => [legPosts(kernel, { ...legOptions, gusset: 0, centers: [[0, 0]] })]],
    ["revolved shell", kernel => Object.values(revolveShell(kernel, buildVesselProfile({
      outerRadiusAtBase: 20, height: 25, wallThickness: 2, baseThickness: 2,
      taperDegrees: 5, rimRadius: 1,
    })!, 12))],
  ];

  it.each(builders)("releases every allocation if %s fails at any operation", async (_name, build) => {
    const actual = await vi.importActual<typeof import("../lib/kernel/manifold")>("../lib/kernel/manifold");
    const real = await actual.getKernel();
    await everyFailure(owner => {
      for (const result of build(owner.kernel)) result.delete();
    }, real);
  });

  it("retains a borrowed clipping solid after every divider failure", async () => {
    const actual = await vi.importActual<typeof import("../lib/kernel/manifold")>("../lib/kernel/manifold");
    const real = await actual.getKernel();
    for (let failAt = 1; failAt <= 10; failAt += 1) {
      const owner = new OwnershipKernel(real);
      const outer = owner.kernel.Manifold.cube([40, 30, 12]);
      owner.failAt = owner.operations.length + failAt;
      expect(() => dividerArrayAtPositions(owner.kernel, outer, {
        positions: [-5, 0, 5], thickness: 2, length: 30, height: 8, centerZ: 6,
      })).toThrow(owner.failure);
      owner.assertLive([outer]);
      outer.delete();
      owner.assertLive();
    }
  });

  it("retains both borrowed profiles after every shell failure", () => {
    for (let failAt = 1; failAt <= 4; failAt += 1) {
      const owner = new OwnershipKernel();
      const outer = owner.kernel.CrossSection.square([40, 30]);
      const inner = owner.kernel.CrossSection.square([36, 26]);
      owner.failAt = owner.operations.length + failAt;
      expect(() => shellFromProfiles(outer, inner, 12, 2)).toThrow(owner.failure);
      owner.assertLive([outer, inner]);
      outer.delete();
      inner.delete();
      owner.assertLive();
    }
  });

  it("retains the borrowed profile after either extrusion transform fails", () => {
    for (let failAt = 1; failAt <= 3; failAt += 1) {
      const owner = new OwnershipKernel();
      const profile = owner.kernel.CrossSection.square([4, 6]);
      owner.failAt = owner.operations.length + failAt;
      expect(() => extrudeAlongX(owner.kernel, profile, 5)).toThrow(owner.failure);
      owner.assertLive([profile]);
      profile.delete();
    }
  });

  it("consumes a slab on lightening failure and transfers the no-op alias", async () => {
    await everyFailure(owner => {
      const slab = owner.kernel.Manifold.cube([40, 30, 12]);
      lightenUnderside(owner.kernel, slab, lighteningOptions).solid.delete();
    });
    const owner = new OwnershipKernel();
    const slab = owner.kernel.Manifold.cube([40, 30, 12]);
    const result = lightenUnderside(owner.kernel, slab, { ...lighteningOptions, pocketDepth: 0 });
    expect(result.solid).toBe(slab);
    expect(result.plan).toBeNull();
    owner.assertLive([slab]);
    result.solid.delete();
    owner.assertLive();
  });

  it("returns a union-of-one alias and consumes duplicate references only once", () => {
    const owner = new OwnershipKernel();
    const solid = owner.kernel.Manifold.cube([2, 2, 2]);
    expect(unionSolids(owner.kernel, [solid])).toBe(solid);
    owner.assertLive([solid]);
    const union = unionSolids(owner.kernel, [solid, solid]);
    owner.assertLive([union]);
    union.delete();
    owner.assertLive();
    const other = owner.kernel.Manifold.cube([2, 2, 2]);
    owner.failAt = owner.operations.length + 1;
    expect(() => unionSolids(owner.kernel, [other, other])).toThrow(owner.failure);
    owner.assertLive();
  });
});

describe("finishSolid ownership", () => {
  it("deletes the input if any kernel measurement or extraction throws", async () => {
    await everyFailure(owner => finishSolid(owner.kernel.Manifold.cube([2, 2, 2]), {}, "test"));
  });

  it.each(["status error", "empty", "vertices", "indices", "parameters", "bounds"])(
    "releases once when %s prevents completion", failurePoint => {
      const owner = new OwnershipKernel();
      const solid = owner.handle();
      const failure = new Error(failurePoint);
      const throwing = () => { throw failure; };
      let parameters = {};
      if (failurePoint === "status error") solid.status = () => "InvalidConstruction";
      if (failurePoint === "empty") solid.isEmpty = () => true;
      if (failurePoint === "vertices" || failurePoint === "indices") {
        const mesh = solid.getMesh();
        const broken = { [Symbol.iterator]: throwing };
        Object.defineProperty(mesh, failurePoint === "vertices" ? "vertProperties" : "triVerts", { value: broken });
        solid.getMesh = () => mesh;
      }
      if (failurePoint === "parameters") parameters = { get value() { return throwing(); } };
      if (failurePoint === "bounds") solid.boundingBox = () => ({ get min() { return throwing(); }, max: [1, 1, 1] });
      if (failurePoint === "status error" || failurePoint === "empty") {
        expect(() => finishSolid(solid as unknown as Solid, parameters, "test")).toThrow(/could not create this test/);
      } else {
        expect(() => finishSolid(solid as unknown as Solid, parameters, "test")).toThrow(failure);
      }
      owner.assertLive();
    },
  );
});

const productIds = [
  "battery-organizer", "card-holder", "drawer-riser", "drawer-tray", "entryway-valet",
  "headphone-mount", "marker-cup-block", "parts-bin", "plant-pot", "plant-saucer",
  "remote-caddy", "shelf-riser", "socket-tray", "tool-fin-rack", "wall-hook-rail",
];

describe("product allocation chains", () => {
  it.each(productIds)("cleans up every failing operation for %s defaults and presets", async id => {
    const geometry = await import(`../lib/products/${id}/geometry.ts`) as Record<string, (parameters: unknown) => Promise<unknown>>;
    const schema = await import(`../lib/products/${id}/schema.ts`) as Record<string, unknown>;
    const presets = await import(`../lib/products/${id}/presets.ts`) as Record<string, { parameters: unknown }[]>;
    const prefix = id.replaceAll("-", "_").toUpperCase();
    const name = "generate" + id.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join("");
    const parameters = [schema[`${prefix}_DEFAULTS`], ...presets[`${prefix}_PRESETS`].map(preset => preset.parameters)];
    for (const input of parameters) {
      await everyFailure(async owner => {
        vi.mocked(getKernel).mockResolvedValue(owner.kernel);
        await geometry[name](input);
      });
    }
  });

  it("preserves product aliases when optional features are absent", async () => {
    const { generateDrawerTray } = await import("../lib/products/drawer-tray/geometry");
    const { DRAWER_TRAY_DEFAULTS } = await import("../lib/products/drawer-tray/schema");
    const { generateRemoteCaddy } = await import("../lib/products/remote-caddy/geometry");
    const { REMOTE_CADDY_DEFAULTS } = await import("../lib/products/remote-caddy/schema");
    const { generateShelfRiser } = await import("../lib/products/shelf-riser/geometry");
    const { SHELF_RISER_DEFAULTS } = await import("../lib/products/shelf-riser/schema");
    const { generateBatteryOrganizer } = await import("../lib/products/battery-organizer/geometry");
    const { BATTERY_ORGANIZER_DEFAULTS } = await import("../lib/products/battery-organizer/schema");
    const builds = [
      () => generateDrawerTray({ ...DRAWER_TRAY_DEFAULTS, rows: 1, columns: 1, fingerScoop: false }),
      () => generateRemoteCaddy({ ...REMOTE_CADDY_DEFAULTS, frontWallHeight: REMOTE_CADDY_DEFAULTS.caddyHeight }),
      () => generateShelfRiser({ ...SHELF_RISER_DEFAULTS, lightenDeck: false }),
      () => generateBatteryOrganizer({ ...BATTERY_ORGANIZER_DEFAULTS, fingerRelief: false, lightenUnderside: false }),
    ];
    for (const build of builds) {
      await everyFailure(async owner => {
        vi.mocked(getKernel).mockResolvedValue(owner.kernel);
        await build();
      });
    }
  });

  it("releases the coupon outer solid when its opening collapses", async () => {
    const { buildFitTestCouponMesh } = await import("../lib/products/drawer-tray/coupon");
    const { DRAWER_TRAY_DEFAULTS } = await import("../lib/products/drawer-tray/schema");
    const owner = new OwnershipKernel();
    vi.mocked(getKernel).mockResolvedValue(owner.kernel);
    await expect(buildFitTestCouponMesh({
      ...DRAWER_TRAY_DEFAULTS, drawerWidth: 10, drawerDepth: 10,
      clearancePerSide: 0, wallThickness: 6,
    })).rejects.toThrow(/no inside opening/);
    owner.assertLive();
  });

  it("cleans up both coupon builders at every failing operation", async () => {
    const { generateFitTestCoupon } = await import("../lib/products/drawer-tray/coupon");
    const { DRAWER_TRAY_DEFAULTS } = await import("../lib/products/drawer-tray/schema");
    const { generateWallHookRailCoupon } = await import("../lib/products/wall-hook-rail/geometry");
    const { WALL_HOOK_RAIL_DEFAULTS } = await import("../lib/products/wall-hook-rail/schema");
    await everyFailure(async owner => {
      vi.mocked(getKernel).mockResolvedValue(owner.kernel);
      await generateFitTestCoupon(DRAWER_TRAY_DEFAULTS);
    });
    await everyFailure(async owner => {
      vi.mocked(getKernel).mockResolvedValue(owner.kernel);
      await generateWallHookRailCoupon(WALL_HOOK_RAIL_DEFAULTS);
    });
  });
});
