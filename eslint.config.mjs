import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Wrangler's local tool state (gitignored; see .gitignore). A `wrangler
    // deploy --dry-run` or `vinext dev`/`start` leaves a temporary bundled
    // Worker copy here, which is generated code, not a source file.
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
