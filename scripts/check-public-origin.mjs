#!/usr/bin/env node
/**
 * Verify the Worker build that CI is about to deploy. Cloudflare populates
 * process.env.PUBLIC_ORIGIN from the built Worker's vars, but this smoke test
 * renders the Worker under plain Node, where that binding is not automatic.
 * Read the resolved Wrangler config and supply the same value before loading
 * the Worker so the check exercises the actual deployment configuration.
 */

import { readFile } from "node:fs/promises";

async function configuredOrigin() {
  const raw = await readFile(
    new URL("../dist/server/wrangler.json", import.meta.url),
    "utf8",
  );
  const config = JSON.parse(raw);
  const origin = config.vars?.PUBLIC_ORIGIN;

  if (typeof origin !== "string") {
    throw new Error("the built Worker has no vars.PUBLIC_ORIGIN");
  }

  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`the built Worker has an invalid PUBLIC_ORIGIN: ${origin}`);
  }

  if (url.protocol !== "https:" || url.origin !== origin) {
    throw new Error(`PUBLIC_ORIGIN must be an absolute HTTPS origin: ${origin}`);
  }

  return origin;
}

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

  if (!response.ok) {
    throw new Error(`the built Worker returned HTTP ${response.status}`);
  }

  return response.text();
}

function metaContent(html, attribute, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const identity = tag.match(new RegExp(`\\b${attribute}="([^"]*)"`))?.[1];
    if (identity === value) {
      return tag.match(/\bcontent="([^"]*)"/)?.[1];
    }
  }
  return undefined;
}

async function main() {
  try {
    const origin = await configuredOrigin();
    process.env.PUBLIC_ORIGIN = origin;
    const html = await renderRootPage();

    const expectedMetadata = [
      ["property", "og:url", origin],
      ["property", "og:image", `${origin}/og.png`],
      ["name", "twitter:image", `${origin}/og.png`],
    ];

    for (const [attribute, name, expected] of expectedMetadata) {
      const actual = metaContent(html, attribute, name);
      if (actual !== expected) {
        throw new Error(`${name} is ${JSON.stringify(actual)}; expected ${expected}`);
      }
    }

    console.log(`DrawerForge PUBLIC_ORIGIN check passed for ${origin}.`);
  } catch (error) {
    console.error(
      `::error::DrawerForge PUBLIC_ORIGIN check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

await main();
