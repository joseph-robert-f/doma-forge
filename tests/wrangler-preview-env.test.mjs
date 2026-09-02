import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Regression guard, found in review: for this Cloudflare Vite build, the
 * target environment is selected at BUILD time, through the CLOUDFLARE_ENV
 * environment variable, not at deploy time through `wrangler deploy --env`.
 * `@cloudflare/vite-plugin` writes a redirected, already-resolved config to
 * `dist/server/wrangler.json`; on that redirected config, Wrangler ignores
 * `wrangler.jsonc`'s `env.<name>` blocks entirely and only uses `--env` as a
 * mismatch guard against whatever `targetEnvironment` the build already
 * baked in. A build that never sets CLOUDFLARE_ENV=preview has no
 * `targetEnvironment` at all, so `wrangler deploy --env preview` against it
 * silently deploys the production Worker under the "preview" label instead
 * of failing.
 *
 * `npm run test:deploy-config` runs a real `CLOUDFLARE_ENV=preview npm run
 * build` before this file, exactly like `npm run deploy:preview` does. This
 * test then asserts the build actually produced the separate preview
 * Worker's config, so a regression back to the production name (for example,
 * someone "simplifying" `deploy:preview` back to a bare `vinext deploy
 * --preview`) fails here, loudly, with no Cloudflare account needed — rather
 * than only failing silently against a real account by overwriting
 * production.
 *
 * See 26_CLOUDFLARE_MIGRATION_NOTES.md, the blocking review finding and
 * Decision D-1106.
 */
test("a CLOUDFLARE_ENV=preview build produces the separate preview Worker's wrangler config", async () => {
  const raw = await readFile(
    new URL("../dist/server/wrangler.json", import.meta.url),
    "utf8",
  );
  const config = JSON.parse(raw);

  assert.equal(
    config.name,
    "drawerforge-preview",
    "the preview build's Worker name must not be the production name",
  );
  assert.equal(
    config.targetEnvironment,
    "preview",
    "the preview build must record its target environment, so a mismatched " +
      "`wrangler deploy --env` at deploy time is caught rather than ignored",
  );
});
