import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * This file runs under plain Node (`node --test`), not Vite or Vitest.
 * `lib/products/drawer-tray/index.ts` (and, through it, `registry.ts`)
 * pulls in the manifold-3d kernel, which uses a Vite-only `?url` asset
 * import that plain Node cannot resolve, with or without TypeScript
 * stripped. So this file cannot be imported directly here.
 *
 * `lib/products/drawer-tray/copy.ts` holds the drawer tray's id and page
 * copy with no geometry or kernel imports, so it has no such import to
 * fail on. Node 22 strips a `.ts` file's types unflagged, and a specifier
 * that already names its extension resolves under plain Node's default
 * ESM resolution, so this test imports it directly below, rather than
 * reading and pattern-matching the source text.
 *
 * The not-found test below still needs the id of every registered
 * product, not just the drawer tray, and `registry.ts` has no ID-only,
 * kernel-free counterpart yet, so `readProductIds` still reads
 * `registry.ts` and each product's `index.ts` as text. See
 * 17_PRODUCT_ROUTES_NOTES.md, decision D-603.
 */
async function readProductIds() {
  const registrySource = await readFile(
    new URL("../lib/products/registry.ts", import.meta.url),
    "utf8",
  );
  // PRODUCTS lists one register(<identifier>) call per product. Each
  // identifier is imported from its own folder under lib/products/.
  const productsMatch = registrySource.match(
    /export const PRODUCTS[^=]*=\s*\[([^\]]*)\]/s,
  );
  assert.ok(productsMatch, "Could not find PRODUCTS in registry.ts");
  const identifiers = [
    ...productsMatch[1].matchAll(/register\((\w+)\)/g),
  ].map((m) => m[1]);
  assert.ok(identifiers.length > 0, "Could not find any registered products");

  const folders = identifiers.map((identifier) => {
    const importPattern = new RegExp(
      `import\\s*\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s*from\\s*"\\.\\/([\\w-]+)"`,
    );
    const importMatch = registrySource.match(importPattern);
    assert.ok(importMatch, `Could not find the import for ${identifier}`);
    return importMatch[1];
  });

  return Promise.all(
    folders.map(async (folder) => {
      // A kernel-free copy.ts (see the file header above) can be imported
      // directly. Fall back to reading index.ts as text for a product that
      // has not split one out yet.
      const copyUrl = new URL(
        `../lib/products/${folder}/copy.ts`,
        import.meta.url,
      );
      if (existsSync(copyUrl)) {
        const idModule = await import(copyUrl.href);
        const idExport = Object.entries(idModule).find(([name]) =>
          /_ID$/.test(name),
        );
        assert.ok(idExport, `Could not find an *_ID export in ${folder}/copy.ts`);
        return idExport[1];
      }

      const productSource = await readFile(
        new URL(`../lib/products/${folder}/index.ts`, import.meta.url),
        "utf8",
      );
      // The id is a literal string, through a named constant
      // ("export const DRAWER_TRAY_ID = \"drawer-tray\";", then
      // "id: DRAWER_TRAY_ID"), or, failing that, inline
      // ("id: \"drawer-tray\"" directly on the product object).
      const idMatch =
        productSource.match(/export const \w+_ID\s*=\s*"([\w-]+)"/) ??
        productSource.match(/\bid:\s*"([\w-]+)",\s*\n\s*geometryVersion:/);
      assert.ok(idMatch, `Could not find an id field in ${folder}/index.ts`);
      return idMatch[1];
    }),
  );
}

async function readDrawerTrayCopy() {
  const { DRAWER_TRAY_COPY } = await import(
    new URL("../lib/products/drawer-tray/copy.ts", import.meta.url).href
  );
  return DRAWER_TRAY_COPY;
}

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete DrawerForge product shell at /", async () => {
  const copy = await readDrawerTrayCopy();
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const titlePattern = new RegExp(
    `<title>${escapeRegExp(copy.title)}</title>`,
    "i",
  );
  assert.match(html, titlePattern);
  assert.match(
    html,
    new RegExp(`<meta name="description" content="${escapeRegExp(copy.description)}"`),
  );
  assert.match(html, /Fit every small thing into its place/);
  assert.match(html, /Drawer interior width/);
  assert.match(html, /Download STL/);
  assert.match(html, /STL is unitless/);
  assert.match(html, /data-testid="product-switcher"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("server-renders the same product shell at /products/drawer-tray, with the product's title and description", async () => {
  const copy = await readDrawerTrayCopy();
  const response = await render("/products/drawer-tray");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const titlePattern = new RegExp(
    `<title>${escapeRegExp(copy.title)}</title>`,
    "i",
  );
  assert.match(html, titlePattern);
  assert.match(
    html,
    new RegExp(`<meta name="description" content="${escapeRegExp(copy.description)}"`),
  );
  assert.match(html, /Fit every small thing into its place/);
  assert.match(html, /data-testid="drawerforge-app"/);
});

test("returns a 404 status for an unknown product route, with links to every product", async () => {
  const productIds = await readProductIds();
  const response = await render("/products/unknown-product");
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /data-testid="not-found-page"/);
  for (const id of productIds) {
    assert.match(html, new RegExp(`href="/products/${id}"`));
  }
});

test("serves /favicon.ico without failing", async () => {
  const response = await render("/favicon.ico");
  assert.notEqual(response.status, 404);
  assert.notEqual(response.status, 500);
});

test("removes disposable starter assets and backend scaffolding", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ProductApp/);
  assert.match(layout, /DrawerForge/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle-orm|drizzle-kit/);
  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
  await assert.rejects(access(new URL("../db/index.ts", import.meta.url)));
  await assert.rejects(
    access(new URL("../examples/d1/app/api/notes/route.ts", import.meta.url)),
  );
  await assert.rejects(
    access(new URL("../drizzle/meta/_journal.json", import.meta.url)),
  );
});
