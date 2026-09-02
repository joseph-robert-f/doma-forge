# S11. Cloudflare Direct Migration

## Goal

Deploy the worker from source control to Cloudflare directly, with a trusted origin, and remove the Sites coupling. This is the operations half of roadmap Phase A and document 07.

## Model and effort

Sonnet 5, high. Configuration and scripts with a rollback plan. The trusted-origin change touches request handling, so run the review with care. Review by Opus 5, high.

## Depends on

S10, so the browser suite can run against the preview deployment.

## Scope

1. Add a root `wrangler.jsonc` with the worker entry, compatibility date and flags, assets, and observability.
2. Remove the `.openai/hosting.json` import, the placeholder D1 and R2 bindings, `build/sites-vite-plugin.ts`, and the SSR test assertion that the hosting file exists.
3. Remove the unused `/_vinext/image` route and the `IMAGES` binding.
4. Replace the forwarded-host origin in `app/layout.tsx` with a configured `PUBLIC_ORIGIN` variable, with a localhost default.
5. Add `deploy` and `deploy:preview` scripts. Add a CI job that deploys a preview on pull requests and production on main, using repository secrets.
6. Verify the `.wasm` MIME type on the deployed origin and record it. Close the open issue from document 12.
7. After acceptance on the new origin, remove the version 1 storage key in a follow-up commit, per document 14.

## Out of scope

Custom domains. Access-protected previews. Terraform.

## Deliverables

- Configuration, scripts, CI job
- Layout origin change with a test
- `26_CLOUDFLARE_MIGRATION_NOTES.md` with the rollback steps and the acceptance checklist from document 07

## Acceptance

- A preview deployment serves the app, the worker chunk, and the WebAssembly file with `application/wasm`.
- The browser suite passes against the preview.
- A design file saved on the old origin opens on the new one.
- The old deployment stays live until the acceptance checklist is signed.

## Tests

SSR test updated. A unit test for the origin resolution. The browser suite against the preview.

## Risks

Secrets in CI. Use repository secrets only; never write a token into a file. The spec forbids logging dimensions or design names in any telemetry.

## Notes to record

Acceptance checklist results. Rollback rehearsal.
