import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser QA config (sprint S10). Runs against a production build
 * served by `npm run start` (vinext start), not against the dev server.
 *
 * Local Chromium: this environment sets `PLAYWRIGHT_BROWSERS_PATH` to
 * `/opt/pw-browsers`, which already holds the revision this pinned
 * `@playwright/test` version expects. Playwright finds it on its own; no
 * `executablePath` is needed. Do not run `npx playwright install` locally.
 *
 * If a future bump of `@playwright/test` expects a browser revision this
 * environment does not have, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a
 * matching Chromium binary. The documented local default is
 * `/opt/pw-browsers/chromium`.
 *
 * The port is whatever `npm run start` prints, normally 3000. Override
 * with `PORT` if that port is taken.
 */
const PORT = process.env.PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
  ],
});
