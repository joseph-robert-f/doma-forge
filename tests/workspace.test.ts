import { describe, expect, it } from "vitest";
import { DRAWER_TRAY_ID } from "../lib/products/drawer-tray";
import { getProduct } from "../lib/products/registry";
import {
  LEGACY_DESIGN_KEY,
  LEGACY_MIGRATED_MARKER,
  WORKSPACE_KEY,
  loadWorkspace,
  readDesign,
  readLegacyDesign,
  readWorkspace,
  writeDesign,
  writeDesignName,
  type StorageLike,
} from "../lib/workspace";

const drawerTray = getProduct(DRAWER_TRAY_ID);
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
  it("starts empty when nothing is stored and writes nothing", () => {
    const storage = new FakeStorage();
    const { workspace, writable } = loadWorkspace(storage, getProduct, fixedNow);
    expect(workspace.version).toBe(2);
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
      geometryVersion: 1,
      name: "Left bench",
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(stored?.parameters.rows).toBe(3);
    const raw = JSON.parse(storage.data.get(WORKSPACE_KEY) ?? "{}");
    expect(raw.format).toBe("drawerforge-workspace");
    expect(raw.version).toBe(2);
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

    storage.data.set(WORKSPACE_KEY, JSON.stringify({ format: "something-else", version: 2, designs: {} }));
    expect(readWorkspace(storage)).toEqual({ state: "absent" });
    expect(storage.data.has(WORKSPACE_KEY)).toBe(false);
  });

  it("leaves a newer envelope alone and refuses to write over it", () => {
    const storage = new FakeStorage();
    const future = JSON.stringify({ format: "drawerforge-workspace", version: 3, designs: { x: 1 } });
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
        version: 2,
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
        version: 2,
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
      JSON.stringify({ version: 2, parameters: {} }),
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
