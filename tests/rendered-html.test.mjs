import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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

test("server-renders the complete DrawerForge product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>DrawerForge — Parametric Drawer Organizer<\/title>/i);
  assert.match(html, /Fit every small thing into its place/);
  assert.match(html, /Drawer interior width/);
  assert.match(html, /Download STL/);
  assert.match(html, /STL is unitless/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
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
  await access(new URL(".openai/hosting.json", projectRoot));
});
