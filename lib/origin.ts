/**
 * Pure origin resolution for absolute URLs in page metadata.
 *
 * The Worker no longer trusts forwarded/host request headers to build
 * `metadataBase`, the Open Graph URL, and image URLs. A forwarded host is
 * request-supplied and is not a trustworthy long-term canonical URL
 * authority (07_OPERATIONS_AND_MIGRATION.md, "Critical migration hazard"
 * and Phase 2). The origin now comes from a configured `PUBLIC_ORIGIN`
 * Worker variable, set in `wrangler.jsonc` under `vars` (or under
 * `env.<name>.vars` for a named environment such as `preview`).
 *
 * Cloudflare Workers populate `process.env` from `vars` when the
 * `nodejs_compat` compatibility flag is set. `wrangler.jsonc` sets that
 * flag for this Worker, so `process.env.PUBLIC_ORIGIN` reads the deployed
 * value with no extra plumbing, in both `vinext dev`/`vinext start` (which
 * run the same workerd runtime) and the real Cloudflare Workers runtime.
 * Under plain Node (`tests/rendered-html.test.mjs`), `process.env` is
 * Node's own environment, so the same function reads whatever the test
 * process sets, or falls back to the local default.
 *
 * `resolvePublicOrigin` never throws. An absent, blank, or malformed value
 * falls back to the local development default, so a missing or bad config
 * value cannot break server rendering.
 */

export const DEFAULT_PUBLIC_ORIGIN = "http://localhost:3000";

export interface OriginEnv {
  PUBLIC_ORIGIN?: string;
  [key: string]: string | undefined;
}

function currentProcessEnv(): OriginEnv {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

export function resolvePublicOrigin(env: OriginEnv = currentProcessEnv()): string {
  const raw = env.PUBLIC_ORIGIN?.trim();
  if (!raw) {
    return DEFAULT_PUBLIC_ORIGIN;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return DEFAULT_PUBLIC_ORIGIN;
  }

  return parsed.origin;
}
