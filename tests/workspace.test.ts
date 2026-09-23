import { describe, expect, it } from "vitest";
import { PRINTER_PROFILE_DEFAULTS } from "../lib/printer-profile";
import type { SurfaceTreatments } from "../lib/surface-patterns";
import { DRAWER_TRAY_ID } from "../lib/products/drawer-tray";
import { REMOTE_CADDY_ID } from "../lib/products/remote-caddy";
import { getProduct } from "../lib/products/registry";
import {
  LEGACY_DESIGN_KEY,
  LEGACY_MIGRATED_MARKER,
  LEGACY_WORKSPACE_KEY,
  WORKSPACE_KEY,
  loadWorkspace,
  readDesign,
  readLegacyDesign,
  readPrinterEntry,
  readWorkspace,
  writeDesign,
  writeDesignName,
  writePrinterProfile,
  type StorageLike,
} from "../lib/workspace";

const drawerTray = getProduct(DRAWER_TRAY_ID);
const remoteCaddy = getProduct(REMOTE_CADDY_ID);
const fixedNow = () => new Date("2026-09-02T12:00:00.000Z");

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  quotaFull = false;
  /** Number of getItem calls that will throw before reads work again. */
  failReads = 0;
  getItem(key: string) {
    if (this.failReads > 0) {
      this.failReads -= 1;
      throw new Error("transient read failure");
    }
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.quotaFull) throw new Error("QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function legacyRecord(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    productId: "drawer-tray",
    name: "Old bench",
    parameters: { ...drawerTray.defaults, drawerDepth: 245 },
    ...overrides,
  });
}

describe("workspace envelope", () => {
  it("migrates the v2 envelope with its designs and printer into the v3 key", () => {
    const storage = new FakeStorage();
    const oldParameters = Object.fromEntries(
      Object.entries(drawerTray.defaults).filter(([key]) => key !== "surfaceTreatments"),
    );
    // A stray key in a legacy envelope has no v2 surface semantics.
    oldParameters.surfaceTreatments = {
      enabled: true,
      zones: { floor: { mode: "holes", opening: 12, web: 2.4, margin: 6 } },
    };
    const oldRemoteParameters = Object.fromEntries(
      Object.entries(remoteCaddy.defaults).filter(([key]) => key !== "surfaceTreatments"),
    );
    const old = JSON.stringify({
      format: "drawerforge-workspace",
      version: 2,
      updatedAt: "2026-09-01T00:00:00.000Z",
      designs: {
        "drawer-tray": {
          productId: "drawer-tray",
          geometryVersion: 1,
          name: "Older tray",
          parameters: oldParameters,
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        [REMOTE_CADDY_ID]: {
          productId: REMOTE_CADDY_ID,
          geometryVersion: 1,
          name: "Older caddy",
          parameters: oldRemoteParameters,
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      },
      printer: { ...PRINTER_PROFILE_DEFAULTS, correctionX: 0.5 },
    });
    storage.data.set(LEGACY_WORKSPACE_KEY, old);

    const design = readDesign(storage, drawerTray, getProduct, fixedNow);
    expect(design?.name).toBe("Older tray");
    const treatment = design?.parameters.surfaceTreatments as SurfaceTreatments;
    expect(treatment.enabled).toBe(false);
    expect(treatment.zones.floor.mode).toBe("solid");
    expect(readDesign(storage, remoteCaddy, getProduct, fixedNow)?.name).toBe("Older caddy");
    expect(readPrinterEntry(storage, getProduct, fixedNow).profile.correctionX).toBe(0.5);
    expect(JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}").version).toBe(3);
    expect(storage.data.get(LEGACY_WORKSPACE_KEY)).toBe(old);

    const changed = drawerTray.normalize({
      ...design?.parameters,
      surfaceTreatments: {
        enabled: true,
        zones: { floor: { mode: "holes", opening: 12, web: 2.4, margin: 6 } },
      },
    });
    expect(writeDesign(storage, drawerTray, { name: "Older tray", parameters: changed }, getProduct, fixedNow)).toBe(true);
    expect((readDesign(storage, drawerTray, getProduct, fixedNow)?.parameters.surfaceTreatments as SurfaceTreatments).zones.floor.mode).toBe("holes");
    expect(storage.data.get(LEGACY_WORKSPACE_KEY)).toBe(old);
  });

  it("starts empty when nothing is stored and writes nothing", () => {
    const storage = new FakeStorage();
    const { workspace, writable } = loadWorkspace(storage, getProduct, fixedNow);
    expect(workspace.version).toBe(3);
    expect(workspace.designs).toEqual({});
    expect(writable).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it("round-trips a design for one product", () => {
    const storage = new FakeStorage();
    expect(
      writeDesign(storage, drawerTray, { name: "  Left  bench ", parameters: { ...drawerTray.defaults, rows: 3 } }, getProduct, fixedNow),
    ).toBe(true);
    const stored = readDesign(storage, drawerTray, getProduct, fixedNow);
    expect(stored).toMatchObject({
      productId: "drawer-tray",
      geometryVersion: 2,
      name: "Left bench",
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(stored?.parameters.rows).toBe(3);
    const raw = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    expect(raw.format).toBe("drawerforge-workspace");
    expect(raw.version).toBe(3);
  });

  it("renames without touching parameters and is a no-op without a design", () => {
    const storage = new FakeStorage();
    expect(writeDesignName(storage, drawerTray, "Nothing yet", getProduct, fixedNow)).toBe(true);
    expect(storage.data.size).toBe(0);

    writeDesign(storage, drawerTray, { name: "A", parameters: { ...drawerTray.defaults, columns: 5 } }, getProduct, fixedNow);
    expect(writeDesignName(storage, drawerTray, "B", getProduct, fixedNow)).toBe(true);
    const stored = readDesign(storage, drawerTray, getProduct, fixedNow);
    expect(stored?.name).toBe("B");
    expect(stored?.parameters.columns).toBe(5);
  });

  it("keeps another product's design when one product writes", () => {
    const storage = new FakeStorage();
    const other = { ...drawerTray, id: "future-product" };
    const resolve = (id: string) => (id === "future-product" ? other : getProduct(id));
    writeDesign(storage, other, { name: "Other", parameters: drawerTray.defaults }, resolve, fixedNow);
    writeDesign(storage, drawerTray, { name: "Tray", parameters: drawerTray.defaults }, resolve, fixedNow);
    const { workspace } = loadWorkspace(storage, resolve, fixedNow);
    expect(Object.keys(workspace.designs).sort()).toEqual(["drawer-tray", "future-product"]);
    expect(readDesign(storage, drawerTray, resolve, fixedNow)?.name).toBe("Tray");
  });

  it("returns null for a stored design that no longer validates", () => {
    const storage = new FakeStorage();
    writeDesign(storage, drawerTray, { name: "", parameters: drawerTray.defaults }, getProduct, fixedNow);
    const raw = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    raw.designs["drawer-tray"].parameters.drawerWidth = 5;
    storage.data.set(WORKSPACE_KEY, JSON.stringify(raw));
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)).toBeNull();
  });

  it("removes a corrupt or foreign envelope and starts fresh", () => {
    const storage = new FakeStorage();
    storage.data.set(WORKSPACE_KEY, "{not json");
    expect(readWorkspace(storage)).toEqual({ state: "absent" });
    expect(storage.data.has(WORKSPACE_KEY)).toBe(false);

    storage.data.set(WORKSPACE_KEY, JSON.stringify({ format: "something-else", version: 3, designs: {} }));
    expect(readWorkspace(storage)).toEqual({ state: "absent" });
    expect(storage.data.has(WORKSPACE_KEY)).toBe(false);
  });

  it("leaves a newer envelope alone and refuses to write over it", () => {
    const storage = new FakeStorage();
    const future = JSON.stringify({ format: "drawerforge-workspace", version: 4, designs: { x: 1 } });
    storage.data.set(WORKSPACE_KEY, future);
    expect(readWorkspace(storage)).toEqual({ state: "newer" });
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)).toBeNull();
    expect(writeDesign(storage, drawerTray, { name: "", parameters: drawerTray.defaults }, getProduct, fixedNow)).toBe(false);
    expect(writeDesignName(storage, drawerTray, "x", getProduct, fixedNow)).toBe(false);
    expect(storage.data.get(WORKSPACE_KEY)).toBe(future);
  });

  it("does not write over storage it could not read", () => {
    const storage = new FakeStorage();
    const other = { ...drawerTray, id: "future-product" };
    const resolve = (id: string) => (id === "future-product" ? other : getProduct(id));
    writeDesign(storage, other, { name: "Keep me", parameters: drawerTray.defaults }, resolve, fixedNow);
    writeDesign(storage, drawerTray, { name: "Current", parameters: { ...drawerTray.defaults, drawerDepth: 199 } }, resolve, fixedNow);
    storage.data.set(LEGACY_DESIGN_KEY, legacyRecord({ name: "Ancient" }));

    storage.failReads = 1;
    expect(
      writeDesign(storage, drawerTray, { name: "Lost", parameters: drawerTray.defaults }, resolve, fixedNow),
    ).toBe(false);

    expect(readDesign(storage, other, resolve, fixedNow)?.name).toBe("Keep me");
    const tray = readDesign(storage, drawerTray, resolve, fixedNow);
    expect(tray?.name).toBe("Current");
    expect(tray?.parameters.drawerDepth).toBe(199);
  });

  it("skips the write when the design is unchanged", () => {
    const storage = new FakeStorage();
    let tick = 0;
    const clock = () => new Date(Date.UTC(2026, 8, 2, 12, 0, tick++));
    writeDesign(storage, drawerTray, { name: "Same", parameters: drawerTray.defaults }, getProduct, clock);
    const first = readDesign(storage, drawerTray, getProduct, clock)?.updatedAt;
    expect(writeDesign(storage, drawerTray, { name: " Same ", parameters: { ...drawerTray.defaults } }, getProduct, clock)).toBe(true);
    expect(readDesign(storage, drawerTray, getProduct, clock)?.updatedAt).toBe(first);
  });

  it("round-trips a layout parameter through the envelope", () => {
    const storage = new FakeStorage();
    const parameters = remoteCaddy.normalize({
      ...remoteCaddy.defaults,
      wellWidths: [50, 60, 40],
    });
    expect(parameters.wellWidths).toEqual([50, 60, 102]);
    expect(
      writeDesign(storage, remoteCaddy, { name: "Shelf", parameters }, getProduct, fixedNow),
    ).toBe(true);

    // The stored JSON holds the list as a JSON array, not as a string.
    const raw = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    expect(raw.designs[REMOTE_CADDY_ID].parameters.wellWidths).toEqual([50, 60, 102]);

    const stored = readDesign(storage, remoteCaddy, getProduct, fixedNow);
    expect(stored?.parameters.wellWidths).toEqual([50, 60, 102]);
    expect(remoteCaddy.signature(stored!.parameters)).toBe(remoteCaddy.signature(parameters));
    // The read gives its own array, and an unchanged design is not rewritten.
    expect(stored?.parameters.wellWidths).not.toBe(parameters.wellWidths);
    expect(
      writeDesign(storage, remoteCaddy, { name: "Shelf", parameters }, getProduct, fixedNow),
    ).toBe(true);
    expect(readDesign(storage, remoteCaddy, getProduct, fixedNow)?.updatedAt).toBe(
      stored?.updatedAt,
    );
  });

  it("refuses a stored layout that no longer validates", () => {
    const storage = new FakeStorage();
    storage.data.set(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 3,
        updatedAt: "2026-09-02T12:00:00.000Z",
        designs: {
          [REMOTE_CADDY_ID]: {
            productId: REMOTE_CADDY_ID,
            geometryVersion: 1,
            name: "Too narrow",
            parameters: { ...remoteCaddy.defaults, wellWidths: [100, 95, 40] },
            updatedAt: "2026-09-02T12:00:00.000Z",
          },
        },
      }),
    );
    expect(readDesign(storage, remoteCaddy, getProduct, fixedNow)).toBeNull();
  });

  it("stores an own entry even for a product id named __proto__", () => {
    const storage = new FakeStorage();
    const odd = { ...drawerTray, id: "__proto__" };
    const resolve = (id: string) => (id === "__proto__" ? odd : getProduct(id));
    expect(writeDesign(storage, odd, { name: "Odd", parameters: drawerTray.defaults }, resolve, fixedNow)).toBe(true);
    const raw = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    expect(Object.keys(raw.designs)).toEqual(["__proto__"]);
    expect(readDesign(storage, odd, resolve, fixedNow)?.name).toBe("Odd");
    expect(({} as Record<string, unknown>).productId).toBeUndefined();
  });

  it("ignores an entry filed under one product that names another", () => {
    const storage = new FakeStorage();
    storage.data.set(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 3,
        updatedAt: "",
        designs: {
          "drawer-tray": { productId: "future-product", name: "Wrong", parameters: drawerTray.defaults },
        },
      }),
    );
    const other = { ...drawerTray, id: "future-product" };
    const resolve = (id: string) => (id === "future-product" ? other : getProduct(id));
    expect(readDesign(storage, drawerTray, resolve, fixedNow)).toBeNull();
    expect(writeDesignName(storage, drawerTray, "x", resolve, fixedNow)).toBe(true);
    expect(JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}").designs["drawer-tray"].name).toBe("Wrong");
  });

  it("defaults a missing geometry version to the product's own", () => {
    const storage = new FakeStorage();
    storage.data.set(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 3,
        updatedAt: "",
        designs: { "drawer-tray": { productId: "drawer-tray", parameters: drawerTray.defaults } },
      }),
    );
    const design = readDesign(storage, drawerTray, getProduct, fixedNow);
    expect(design?.geometryVersion).toBe(drawerTray.geometryVersion);
    expect(design?.name).toBe("");
    expect(design?.updatedAt).toBe("");
  });

  it("reports a refused write and leaves the previous envelope intact", () => {
    const storage = new FakeStorage();
    writeDesign(storage, drawerTray, { name: "Kept", parameters: drawerTray.defaults }, getProduct, fixedNow);
    storage.quotaFull = true;
    expect(
      writeDesign(storage, drawerTray, { name: "Lost", parameters: { ...drawerTray.defaults, rows: 4 } }, getProduct, fixedNow),
    ).toBe(false);
    storage.quotaFull = false;
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)?.name).toBe("Kept");
  });

  it("survives a storage that throws on every call", () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
      removeItem() {
        throw new Error("SecurityError");
      },
    };
    expect(readDesign(broken, drawerTray, getProduct, fixedNow)).toBeNull();
    expect(writeDesign(broken, drawerTray, { name: "", parameters: drawerTray.defaults }, getProduct, fixedNow)).toBe(false);
  });
});

describe("version 1 migration", () => {
  it("migrates a valid legacy record on first load and marks it, keeping every field", () => {
    const storage = new FakeStorage();
    storage.data.set(LEGACY_DESIGN_KEY, legacyRecord());
    const design = readDesign(storage, drawerTray, getProduct, fixedNow);
    expect(design).toMatchObject({ productId: "drawer-tray", name: "Old bench" });
    expect(design?.parameters.drawerDepth).toBe(245);
    expect(storage.data.has(WORKSPACE_KEY)).toBe(true);
    const legacy = JSON.parse(storage.data.get(LEGACY_DESIGN_KEY) ?? "{}");
    expect(legacy).toMatchObject({ ...JSON.parse(legacyRecord()), [LEGACY_MIGRATED_MARKER]: WORKSPACE_KEY });
  });

  it("never migrates a marked legacy record again, even if the envelope is lost", () => {
    const storage = new FakeStorage();
    storage.data.set(LEGACY_DESIGN_KEY, legacyRecord({ name: "Ancient" }));
    readDesign(storage, drawerTray, getProduct, fixedNow);
    writeDesign(storage, drawerTray, { name: "Current", parameters: drawerTray.defaults }, getProduct, fixedNow);
    storage.data.delete(WORKSPACE_KEY);
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)).toBeNull();
    expect(storage.data.has(WORKSPACE_KEY)).toBe(false);
  });

  it("treats a legacy record without a product id as the drawer tray", () => {
    const storage = new FakeStorage();
    storage.data.set(LEGACY_DESIGN_KEY, legacyRecord({ productId: undefined, name: undefined }));
    const design = readLegacyDesign(storage);
    expect(design?.productId).toBe("drawer-tray");
    expect(design?.name).toBe("");
  });

  it("ignores an invalid, corrupt, or foreign legacy record", () => {
    for (const text of [
      "{oops",
      JSON.stringify({ version: 3, parameters: {} }),
      legacyRecord({ parameters: { drawerWidth: 1 } }),
      legacyRecord({ productId: "toaster" }),
    ]) {
      const storage = new FakeStorage();
      storage.data.set(LEGACY_DESIGN_KEY, text);
      expect(readLegacyDesign(storage)).toBeNull();
      expect(readDesign(storage, drawerTray, getProduct, fixedNow)).toBeNull();
      expect(storage.data.has(WORKSPACE_KEY)).toBe(false);
    }
  });

  it("does not migrate again once the envelope exists", () => {
    const storage = new FakeStorage();
    storage.data.set(LEGACY_DESIGN_KEY, legacyRecord());
    readDesign(storage, drawerTray, getProduct, fixedNow);
    writeDesign(storage, drawerTray, { name: "New", parameters: drawerTray.defaults }, getProduct, fixedNow);
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)?.name).toBe("New");
  });
});

describe("printer profile in the envelope", () => {
  function envelopeWithoutPrinter() {
    return JSON.stringify({
      format: "drawerforge-workspace",
      version: 3,
      updatedAt: "2026-09-01T00:00:00.000Z",
      designs: {
        "drawer-tray": {
          productId: "drawer-tray",
          geometryVersion: 1,
          name: "Left bench",
          parameters: { ...drawerTray.defaults, drawerDepth: 245 },
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      },
    });
  }

  it("reads an envelope written before printer profiles existed", () => {
    const storage = new FakeStorage();
    storage.data.set(WORKSPACE_KEY, envelopeWithoutPrinter());

    const entry = readPrinterEntry(storage, getProduct, fixedNow);
    expect(entry.profile).toEqual(PRINTER_PROFILE_DEFAULTS);
    expect(entry.saved).toBe(false);
    const design = readDesign(storage, drawerTray, getProduct, fixedNow);
    expect(design?.name).toBe("Left bench");
    expect(design?.parameters.drawerDepth).toBe(245);
    expect(storage.data.get(WORKSPACE_KEY)).toBe(envelopeWithoutPrinter());
  });

  it("adds no printer field to an envelope until a profile is written", () => {
    const storage = new FakeStorage();
    storage.data.set(WORKSPACE_KEY, envelopeWithoutPrinter());
    writeDesign(
      storage,
      drawerTray,
      { name: "Left bench", parameters: { ...drawerTray.defaults, drawerDepth: 250 } },
      getProduct,
      fixedNow,
    );
    const stored = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    expect(stored.printer).toBeUndefined();
    expect(stored.version).toBe(3);
  });

  it("keeps the version at 3 and keeps every design when a profile is written", () => {
    const storage = new FakeStorage();
    storage.data.set(WORKSPACE_KEY, envelopeWithoutPrinter());
    expect(
      writePrinterProfile(
        storage,
        { ...PRINTER_PROFILE_DEFAULTS, correctionX: 0.5 },
        getProduct,
        fixedNow,
      ),
    ).toBe(true);
    const stored = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    expect(stored.version).toBe(3);
    expect(stored.printer.correctionX).toBe(0.5);
    expect(stored.designs["drawer-tray"].name).toBe("Left bench");
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)?.name).toBe("Left bench");
  });

  it("keeps the profile when a design is written after it", () => {
    const storage = new FakeStorage();
    writePrinterProfile(
      storage,
      { ...PRINTER_PROFILE_DEFAULTS, correctionY: -0.25 },
      getProduct,
      fixedNow,
    );
    writeDesign(
      storage,
      drawerTray,
      { name: "Bench", parameters: drawerTray.defaults },
      getProduct,
      fixedNow,
    );
    const kept = readPrinterEntry(storage, getProduct, fixedNow);
    expect(kept.profile.correctionY).toBe(-0.25);
    expect(kept.saved).toBe(true);
    expect(readDesign(storage, drawerTray, getProduct, fixedNow)?.name).toBe("Bench");
  });

  it("normalizes a stored profile that holds a bad value", () => {
    const storage = new FakeStorage();
    storage.data.set(
      WORKSPACE_KEY,
      JSON.stringify({
        format: "drawerforge-workspace",
        version: 3,
        updatedAt: "2026-09-01T00:00:00.000Z",
        designs: {},
        printer: { correctionX: "wide", correctionY: 900, bedWidth: 250 },
      }),
    );
    const profile = readPrinterEntry(storage, getProduct, fixedNow).profile;
    expect(profile.correctionX).toBe(0);
    expect(profile.correctionY).toBe(25);
    expect(profile.bedWidth).toBe(250);
  });

  it("refuses to write a profile when the workspace is not writable", () => {
    const newer = new FakeStorage();
    newer.data.set(
      WORKSPACE_KEY,
      JSON.stringify({ format: "drawerforge-workspace", version: 9, designs: {} }),
    );
    expect(
      writePrinterProfile(newer, PRINTER_PROFILE_DEFAULTS, getProduct, fixedNow),
    ).toBe(false);

    const unreadable = new FakeStorage();
    unreadable.failReads = 1;
    expect(
      writePrinterProfile(unreadable, PRINTER_PROFILE_DEFAULTS, getProduct, fixedNow),
    ).toBe(false);

    const full = new FakeStorage();
    full.quotaFull = true;
    expect(
      writePrinterProfile(full, PRINTER_PROFILE_DEFAULTS, getProduct, fixedNow),
    ).toBe(false);
  });

  it("does not rewrite an unchanged profile", () => {
    const storage = new FakeStorage();
    writePrinterProfile(storage, PRINTER_PROFILE_DEFAULTS, getProduct, fixedNow);
    const first = storage.data.get(WORKSPACE_KEY);
    storage.quotaFull = true;
    expect(
      writePrinterProfile(storage, PRINTER_PROFILE_DEFAULTS, getProduct, fixedNow),
    ).toBe(true);
    expect(storage.data.get(WORKSPACE_KEY)).toBe(first);
  });
});
