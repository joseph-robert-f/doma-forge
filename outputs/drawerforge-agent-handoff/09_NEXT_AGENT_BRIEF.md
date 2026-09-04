# Next-agent brief

> Superseded on 2026-09-04 by
> [`31_SESSION_HANDOFF.md`](31_SESSION_HANDOFF.md). This brief describes the
> repository before the sprint program, at commit `785ea4e`. It is kept as
> history. Read document 31 for the current state.

## Mission

Extend DrawerForge safely from the repository's clean `main` snapshot at commit `785ea4e`. The application already creates, previews, validates, and exports watertight regular-grid drawer organizers entirely in the browser. Preserve its core geometric and UX guarantees while implementing the next approved phase.

## Read first

1. `README.md`
2. `03_GEOMETRY_AND_STL.md`
3. `02_SYSTEM_ARCHITECTURE.md`
4. `06_TESTING_AND_QA.md`
5. `07_OPERATIONS_AND_MIGRATION.md`

Then inspect the current source rather than relying solely on this handoff.

## Current facts

- Single-route React/Next/vinext application delivered as a Cloudflare Worker through Sites packaging.
- No backend, API, database, authentication, cloud persistence, or application secrets.
- `OrganizerParameters` is the single source of truth.
- `manifold-3d` WASM builds the solid.
- Three.js displays a non-indexed flat-normal copy of the kernel mesh.
- Binary STL serialization uses that exact displayed geometry.
- Invalid controls preserve the last valid preview and block export.
- Latest valid design is stored at `drawerforge-design-v1` in origin-scoped localStorage.
- Git has a local `main` branch and no remote.
- The user has sliced a generated file successfully in Bambu Studio; the first physical print is pending.

## Approved direction

1. Move hosting from Sites to direct Cloudflare Workers in a user-owned account.
2. Use a private GitHub repository and Cloudflare Builds.
3. Keep production public and protect branch previews with Cloudflare Access.
4. Use source-controlled Wrangler configuration; defer Terraform and custom domains.
5. Prioritize print reliability and design portability before advanced geometry.

## Recommended first implementation tranche

### A. Versioned design-file bridge

Implement:

```ts
interface DrawerForgeDesignV1 {
  format: "drawerforge-design";
  version: 1;
  name: string;
  units: "mm";
  parameters: OrganizerParameters;
}
```

Requirements:

- Export `.drawerforge.json` from the current valid normalized design.
- Import is non-destructive until format, version, units, normalization, and validation succeed.
- Report actionable errors for wrong version/shape instead of silently applying defaults.
- Unknown v1 fields may be ignored, but required fields must be present and valid.
- Add round-trip, wrong-version, malformed-data, and “current design unchanged on failure” tests.
- Migrate the current localStorage record into a versioned local workspace envelope without losing valid data.

This feature must ship on the current Sites origin before changing the production origin.

### B. Direct Cloudflare configuration

- Remove Sites-only build configuration and its test assertion.
- Add root `wrangler.jsonc` with explicit Worker entry, compatibility date/flags, assets, and observability.
- Remove the unused image-optimization path/binding unless it is intentionally provisioned.
- Add reproducible `check`, `deploy`, and preview-deploy scripts after verifying the generated artifact/config path.
- Replace untrusted forwarded-host metadata origin with a trusted configuration strategy.
- Keep the old Sites deployment available through acceptance and rollback.

### C. GitHub and hosted QA

- Create/push a private GitHub repository only with the user's configured credentials/authorization.
- Connect Cloudflare Builds for `main` production and branch previews.
- Protect previews, leave production public, and initially use `workers.dev`.
- Run every automated check plus the real-browser checklist.
- Verify design transfer from the Sites origin, WASM loading, storage, preview, and downloaded STL in Bambu Studio.

## Optional second tranche after print feedback

- Local printer profile with bed size, nozzle, and explicit X/Y corrections.
- Calibration calculation based on expected versus measured values.
- 5 mm-high perimeter fit-test STL.
- Non-blocking build-volume and nozzle/thickness warnings.
- Do not change the default 0.5 mm clearance from one anecdotal print.

## Constraints

- Do not add a backend for these phases.
- Do not silently change existing physical geometry semantics.
- If a semantic change is necessary, version both project format and geometry behavior.
- Preview/export must still share one mesh or clearly expose and test an explicit difference.
- Do not allow stale or invalid downloads.
- Preserve Z=0 flat-base orientation, millimeter coordinates, manifold topology, and closed-edge regression tests.
- Use exception-safe cleanup for any new Manifold objects.
- Move heavy work to a Web Worker before adding several expensive Boolean operations.
- Avoid unrelated framework migration during the direct Cloudflare cutover.
- Preserve user changes in a dirty working tree and never delete the existing deployment before replacement QA passes.

## Verification gate

Before handoff, provide evidence for:

```text
npm run lint
npm run typecheck
npm test
npm run test:ssr
```

Also provide:

- Hosted desktop and mobile QA results
- Browser console/network result
- Successful project export/import across origins
- Downloaded STL dimensions and independent parse
- Bambu Studio slice result
- Any remaining gap in physical print evidence

## Ready-to-paste prompt

```text
Continue DrawerForge from the repository's current main branch. Read every document in the drawerforge-agent-handoff package, especially the geometry/STL contract and operations migration plan, then inspect the source and run the baseline checks.

Implement the first approved tranche: a versioned, non-destructive DrawerForge JSON design export/import bridge with legacy localStorage migration, followed by removal of Sites-only packaging and an explicit direct-Cloudflare Worker configuration. Preserve the current vinext application during this migration. Do not add a backend, Terraform, a custom domain, or advanced geometry. Remove the unused Worker image-optimization binding unless it becomes intentionally configured. Use a trusted configured production origin for metadata.

Add focused tests for project-file round trips, malformed/wrong-version imports, non-destructive failures, storage migration, production Worker rendering, and the existing preview/export invariants. Run lint, typecheck, the complete test suite, and the production/SSR build. Then perform real-browser desktop/mobile hosted QA, including WASM loading, local persistence, project transfer, preview interaction, console/network checks, and an independently inspected STL download. Keep the previous Sites deployment available until the direct Worker passes acceptance.

Do not silently change geometry semantics or the default fit clearance. Report physical-print calibration as pending unless new measured evidence is supplied.
```

