import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_ORIGIN, resolvePublicOrigin } from "../lib/origin";

describe("resolvePublicOrigin", () => {
  it("falls back to the local default when PUBLIC_ORIGIN is unset", () => {
    expect(resolvePublicOrigin({})).toBe(DEFAULT_PUBLIC_ORIGIN);
  });

  it("falls back to the local default when PUBLIC_ORIGIN is blank", () => {
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "" })).toBe(DEFAULT_PUBLIC_ORIGIN);
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "   " })).toBe(DEFAULT_PUBLIC_ORIGIN);
  });

  it("returns the configured https origin", () => {
    expect(
      resolvePublicOrigin({ PUBLIC_ORIGIN: "https://drawerforge.example.workers.dev" }),
    ).toBe("https://drawerforge.example.workers.dev");
  });

  it("returns the configured http origin, for local or preview use", () => {
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("strips a path, query, or hash and keeps only the origin", () => {
    expect(
      resolvePublicOrigin({
        PUBLIC_ORIGIN: "https://drawerforge.example.workers.dev/products/drawer-tray?x=1#y",
      }),
    ).toBe("https://drawerforge.example.workers.dev");
  });

  it("trims surrounding whitespace", () => {
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "  https://example.com  " })).toBe(
      "https://example.com",
    );
  });

  it("keeps a non-default port", () => {
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "http://localhost:4173" })).toBe(
      "http://localhost:4173",
    );
  });

  it("falls back to the local default for an unparsable value", () => {
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "not a url" })).toBe(DEFAULT_PUBLIC_ORIGIN);
  });

  it("falls back to the local default for a non-http(s) protocol", () => {
    expect(resolvePublicOrigin({ PUBLIC_ORIGIN: "ftp://example.com" })).toBe(
      DEFAULT_PUBLIC_ORIGIN,
    );
    expect(
      resolvePublicOrigin({ PUBLIC_ORIGIN: "javascript:alert(1)" }),
    ).toBe(DEFAULT_PUBLIC_ORIGIN);
  });

  it("reads process.env.PUBLIC_ORIGIN when no env is passed", () => {
    const previous = process.env.PUBLIC_ORIGIN;
    try {
      process.env.PUBLIC_ORIGIN = "https://from-process-env.example";
      expect(resolvePublicOrigin()).toBe("https://from-process-env.example");
    } finally {
      if (previous === undefined) {
        delete process.env.PUBLIC_ORIGIN;
      } else {
        process.env.PUBLIC_ORIGIN = previous;
      }
    }
  });
});
