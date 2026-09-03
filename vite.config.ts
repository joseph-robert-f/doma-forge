import vinext from "vinext";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    // The generation worker is a module worker, and each product loads its
    // geometry on demand inside it. The ES format lets the worker build
    // split those loads into their own chunks; the default IIFE format
    // would inline every product's geometry back into the worker chunk.
    // See 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1701.
    worker: { format: "es" as const },
    plugins: [
      vinext(),
      // No `config` override: the plugin reads the root `wrangler.jsonc`
      // directly, so that file is the single source of truth for the
      // Worker's name, compatibility settings, assets, and variables.
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      }),
    ],
  };
});
