#!/usr/bin/env node
/**
 * Screenshot script for S03, viewer scale and print orientation.
 *
 * It saves two PNGs of the model viewer for a person to compare:
 *   1. default-tray.png   The DrawerForge default tray, from a running
 *                          production build.
 *   2. cube-40mm.png       A 40 mm cube. No product this small exists yet,
 *                          so this fixture mounts the real ModelViewer
 *                          component directly with a hand-built cube, the
 *                          way a future small product would.
 *
 * This script is not part of `npm test` and does not run in CI. Software
 * WebGL in headless Chromium is slow; see the sprint spec's Risks section.
 *
 * Usage, from the repo root:
 *
 *   npm run build && npm run start &
 *   node tests/browser/capture-screenshots.mjs [tray-url] [out-dir]
 *
 * tray-url defaults to http://localhost:3000/ (the port `npm run start`
 * prints). out-dir defaults to a fresh temp directory; the script prints
 * its path.
 *
 * Needs Playwright (playwright-core plus a Chromium install). Since sprint
 * S10, `playwright-core` is a pinned dev dependency of this repository, so
 * `npm ci` alone is normally enough; this script resolves it from the
 * repository's own `node_modules` first. If that resolution fails (a
 * package.json without S10's change, or a `node_modules` missing it for
 * some other reason), it falls back to the Playwright harness described in
 * the sprint's common brief, which lives outside this repository in a
 * per-session scratch directory whose path is not stable across sessions or
 * machines, so this script does not guess it. Set the PW_HARNESS_DIR
 * environment variable to that directory to use the fallback, for example:
 *
 *   PW_HARNESS_DIR=/tmp/claude-0/.../scratchpad/pw \
 *     node tests/browser/capture-screenshots.mjs
 *
 * The script exits with a clear error if neither source resolves.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build as viteBuild, preview as vitePreview } from "vite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, "fixtures");

function pwHarnessDirIfUsable() {
  const dir = process.env.PW_HARNESS_DIR;
  if (!dir) return null;
  if (!existsSync(dir)) {
    throw new Error(`PW_HARNESS_DIR is set to ${dir}, but that directory does not exist.`);
  }
  return dir;
}

/**
 * Resolves `playwright-core` from this repository's own `node_modules`
 * first (sprint S10 added it as a pinned dev dependency, so `npm ci` alone
 * is normally enough), then falls back to the `PW_HARNESS_DIR` scratch
 * harness described in the sprint's common brief. Throws a single error
 * naming both attempts if neither resolves.
 */
function loadPlaywright() {
  const require = createRequire(import.meta.url);

  try {
    const entry = require.resolve("playwright-core");
    return require(entry);
  } catch {
    // Fall through to the PW_HARNESS_DIR harness below.
  }

  const pwHarnessDir = pwHarnessDirIfUsable();
  if (pwHarnessDir) {
    try {
      const entry = require.resolve("playwright-core", { paths: [pwHarnessDir] });
      return require(entry);
    } catch (error) {
      throw new Error(
        `Could not load playwright-core from PW_HARNESS_DIR (${pwHarnessDir}). Check that it ` +
          `points at the Playwright harness from the sprint's common brief. (${error.message})`,
      );
    }
  }

  throw new Error(
    "Could not resolve playwright-core from this repository's node_modules, and " +
      "PW_HARNESS_DIR is not set. Run \"npm ci\" so this repository's own pinned " +
      "playwright-core is available, or point PW_HARNESS_DIR at the Playwright " +
      "harness from the sprint's common brief, for example: " +
      "PW_HARNESS_DIR=/tmp/.../scratchpad/pw node tests/browser/capture-screenshots.mjs",
  );
}

async function launchBrowser() {
  const { chromium } = loadPlaywright();
  const chromiumPath = "/opt/pw-browsers/chromium";
  const launchArgs = { args: ["--no-sandbox"] };
  if (existsSync(chromiumPath)) {
    try {
      return await chromium.launch({ ...launchArgs, executablePath: chromiumPath });
    } catch {
      // Fall through to the bundled browser below.
    }
  }
  return chromium.launch(launchArgs);
}

/** Bundles the 40 mm cube fixture with the project's own Vite, using the real ModelViewer component. */
async function buildCubeFixture(outDir) {
  await viteBuild({
    root: FIXTURES_DIR,
    configFile: false,
    logLevel: "warn",
    plugins: [react()],
    build: { outDir, emptyOutDir: true },
  });
}

async function waitForReady(page) {
  await page.waitForFunction(
    () =>
      /^Ready/.test(
        document.querySelector('[data-testid="preview-status"]')?.textContent || "",
      ),
    null,
    { timeout: 60_000 },
  );
  // A few extra frames so orbit-damping and shadow rendering settle before
  // the screenshot; software WebGL renders slowly (see the sprint's Risks).
  await page.waitForTimeout(500);
}

async function captureViewer(browser, url, outFile) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForReady(page);
  await page.getByTestId("model-viewer").screenshot({ path: outFile });
  await page.close();
  return errors;
}

async function main() {
  // Fail fast, before spending time on a Vite build, if no Playwright
  // source (this repository's own node_modules, or PW_HARNESS_DIR) resolves.
  loadPlaywright();

  const trayUrl = process.argv[2] || "http://localhost:3000/";
  const outDir =
    process.argv[3] || mkdtempSync(path.join(tmpdir(), "viewer-scale-screenshots-"));
  mkdirSync(outDir, { recursive: true });

  const fixtureDist = mkdtempSync(path.join(tmpdir(), "viewer-scale-fixture-dist-"));
  console.log(`Building the 40 mm cube fixture into ${fixtureDist}...`);
  await buildCubeFixture(fixtureDist);

  const previewServer = await vitePreview({
    root: FIXTURES_DIR,
    configFile: false,
    logLevel: "warn",
    build: { outDir: fixtureDist },
    preview: { port: 0, host: "127.0.0.1" },
  });
  const fixtureUrl = previewServer.resolvedUrls.local[0];

  const browser = await launchBrowser();
  const results = {};
  try {
    console.log(`Opening the default tray at ${trayUrl}...`);
    const trayOut = path.join(outDir, "default-tray.png");
    results["default-tray"] = {
      file: trayOut,
      errors: await captureViewer(browser, trayUrl, trayOut),
    };
    console.log(`Saved ${trayOut}`);

    console.log(`Opening the 40 mm cube fixture at ${fixtureUrl}...`);
    const cubeOut = path.join(outDir, "cube-40mm.png");
    results["cube-40mm"] = {
      file: cubeOut,
      errors: await captureViewer(browser, fixtureUrl, cubeOut),
    };
    console.log(`Saved ${cubeOut}`);
  } finally {
    await browser.close();
    await previewServer.close();
  }

  console.log(JSON.stringify({ outDir, results }, null, 2));
}

main().catch((error) => {
  console.error("SCREENSHOT CAPTURE FAILED", error);
  process.exitCode = 1;
});
