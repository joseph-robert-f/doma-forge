#!/usr/bin/env node
/**
 * CI safety check, found in review: renders the built app the same way
 * `tests/rendered-html.test.mjs` does, and prints a loud, visible warning if
 * the page still carries the http://localhost:3000 default in its Open
 * Graph URL and image URLs.
 *
 * This never fails the build — it only warns. PUBLIC_ORIGIN's real, deployed
 * value comes from wrangler.jsonc's `vars` (or `env.<name>.vars`), set once
 * the first deploy reveals the Worker's real *.workers.dev URL — see
 * 26_CLOUDFLARE_MIGRATION_NOTES.md, Decision D-1105 and Follow-up 1. This
 * script does not set that value; it only renders the app with whatever
 * PUBLIC_ORIGIN is in the current process environment (set by CI from the
 * `PUBLIC_ORIGIN` repository variable, or empty), so a still-default origin
 * is noticed in the CI log before it ships silently.
 *
 * Usage (needs a build already in dist/, see the "build" script):
 *   node scripts/check-public-origin.mjs
 *   PUBLIC_ORIGIN=https://drawerforge.example.workers.dev node scripts/check-public-origin.mjs
 */

const DEFAULT_ORIGIN_MARKER = "localhost:3000";

async function renderRootPage() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  // Bust any module cache across repeated local invocations, exactly like
  // tests/rendered-html.test.mjs does.
  workerUrl.searchParams.set("check", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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

  return response.text();
}

async function main() {
  let html;
  try {
    html = await renderRootPage();
  } catch (error) {
    console.log(
      `::warning::DrawerForge PUBLIC_ORIGIN check: could not render dist/server/index.js to check it (${error instanceof Error ? error.message : String(error)}). Run "npm run build" first.`,
    );
    return;
  }

  if (!html.includes(DEFAULT_ORIGIN_MARKER)) {
    console.log(
      "DrawerForge PUBLIC_ORIGIN check: the rendered page does not use the localhost default.",
    );
    return;
  }

  const configured = process.env.PUBLIC_ORIGIN?.trim();
  const reason = configured
    ? `PUBLIC_ORIGIN is set to "${configured}", but the rendered page still shows ${DEFAULT_ORIGIN_MARKER}. Check that it is a valid absolute http(s) URL — an invalid one falls back to the default silently (see lib/origin.ts).`
    : "PUBLIC_ORIGIN is not set (the PUBLIC_ORIGIN repository variable is empty or missing). The deployed Worker's real value comes from wrangler.jsonc's vars, set once the first deploy reveals the Worker's URL — see 26_CLOUDFLARE_MIGRATION_NOTES.md, Follow-up 1.";

  console.log(
    `::warning::DrawerForge PUBLIC_ORIGIN check: the rendered page's Open Graph URL and image URLs still use the http://${DEFAULT_ORIGIN_MARKER} default. ${reason}`,
  );
}

await main();
