# DrawerForge engineering handoff

This package describes the DrawerForge application as implemented in the accompanying repository. It is intended to give another engineering agent enough product, UX, geometry, testing, and operational context to extend the application without rediscovering its core constraints.

## Snapshot

| Field | Value |
|---|---|
| Snapshot date | 2026-09-01 |
| Repository branch | `main` |
| Repository commit | `785ea4e0458b6f52cacab8a0bbef4cac057d62be` |
| Working tree at documentation start | Clean |
| Package version | `0.1.0` |
| Runtime requirement | Node.js 22.13 or newer |
| Current hosting model | OpenAI Sites packaging around a Cloudflare Worker build |
| Application data model | Browser-only; no backend, account, database, or cloud persistence |

## What exists today

DrawerForge lets a non-CAD user enter drawer dimensions, choose construction and grid parameters, preview a rounded, divided organizer in 3D, and download the exact preview mesh as a binary STL. Generation happens entirely in the browser using `manifold-3d` WebAssembly. Three.js renders the preview. The most recent valid design is stored in `localStorage`.

The current implementation includes:

- A responsive workshop-inspired configurator with synchronized sliders and numeric inputs.
- Cutlery, Desk Supplies, Hardware, and Custom starting states.
- Inline cross-field validation that preserves the last valid preview.
- Orbit, zoom, pan, fit, and reset controls in a persistent Three.js viewer.
- Watertight rounded tray geometry, evenly spaced dividers, and an optional front finger scoop.
- Binary STL serialization and an independent pre-download inspection pass.
- Unit, integration, geometry-topology, STL round-trip, and server-render smoke tests.
- Server-rendered metadata and a Cloudflare-compatible vinext/Vite build.

The user has reported that a generated STL imports and slices successfully in Bambu Studio. A physical print and dimensional report are still pending, so printer calibration and fit accuracy remain hypotheses rather than validated product guarantees.

## Important distinctions

1. **Implemented today:** everything documented as current behavior is grounded in the source at the snapshot commit.
2. **Selected but not implemented:** direct Cloudflare Workers hosting, GitHub/Cloudflare Builds, protected previews, project-file import/export, and print calibration are captured as the next direction, not as current functionality.
3. **Explicitly deferred:** accounts, cloud saves, arbitrary divider drawing, automatic tray splitting, slicer settings, multi-model projects, and backend infrastructure.

## Document map

1. [`ORIGINAL_GOAL.md`](ORIGINAL_GOAL.md) — the original build brief and acceptance target.
2. [`01_PRODUCT_AND_REQUIREMENTS.md`](01_PRODUCT_AND_REQUIREMENTS.md) — product purpose, users, current capabilities, scope, and requirements traceability.
3. [`02_SYSTEM_ARCHITECTURE.md`](02_SYSTEM_ARCHITECTURE.md) — module boundaries, runtime flows, state transitions, deployment shape, and repository map.
4. [`03_GEOMETRY_AND_STL.md`](03_GEOMETRY_AND_STL.md) — the authoritative geometry, coordinate, validation, tessellation, and binary STL contract.
5. [`04_UX_AND_DESIGN.md`](04_UX_AND_DESIGN.md) — user journeys, responsive behavior, visual system, interaction states, and accessibility choices.
6. [`05_DECISION_LOG.md`](05_DECISION_LOG.md) — important design decisions, rationale, consequences, and conditions for revisiting them.
7. [`06_TESTING_AND_QA.md`](06_TESTING_AND_QA.md) — automated coverage, current verification evidence, browser/print QA, and regression expectations.
8. [`07_OPERATIONS_AND_MIGRATION.md`](07_OPERATIONS_AND_MIGRATION.md) — current Sites coupling and the selected direct-Cloudflare migration path.
9. [`08_EXPANSION_ROADMAP.md`](08_EXPANSION_ROADMAP.md) — prioritized expansion work and the guardrails attached to each phase.
10. [`09_NEXT_AGENT_BRIEF.md`](09_NEXT_AGENT_BRIEF.md) — the implementation brief written before the sprint program; superseded by document 31 and kept as history.
11. [`10_MULTI_PRODUCT_EXPANSION_PLAN.md`](10_MULTI_PRODUCT_EXPANSION_PLAN.md) — governance rules for the drawer tray and the 15-product catalog plan built on the same engine.
12. [`11_PRODUCT_REGISTRY_REFACTOR_NOTES.md`](11_PRODUCT_REGISTRY_REFACTOR_NOTES.md) — decisions, deviations, open issues, and follow-ups from the product-registry refactor.
13. [`12_WEB_WORKER_GENERATION_NOTES.md`](12_WEB_WORKER_GENERATION_NOTES.md) — design, decisions, measurements, and follow-ups for off-thread mesh generation.
14. [`13_DESIGN_FILE_NOTES.md`](13_DESIGN_FILE_NOTES.md) — the portable design file format, import rules, decisions, and acceptance against roadmap Phase A.
15. [`14_WORKSPACE_STORAGE_NOTES.md`](14_WORKSPACE_STORAGE_NOTES.md) — the versioned local workspace envelope, the version 1 migration, and decisions.
16. [`15_SPRINT_PLAN.md`](15_SPRINT_PLAN.md) — the remaining sprints, their order, and the model and effort assigned to each.
17. [`16_FIT_TEST_COUPON_NOTES.md`](16_FIT_TEST_COUPON_NOTES.md) — the fit-test coupon ring, its wall rule, decisions, and follow-ups from sprint S01.
18. [`17_PRODUCT_ROUTES_NOTES.md`](17_PRODUCT_ROUTES_NOTES.md) — per-product routes, page metadata, the not-found page, and decisions from sprint S02.
19. [`18_VIEWER_SCALE_NOTES.md`](18_VIEWER_SCALE_NOTES.md) — the viewer scale formula, the print-pose hint, screenshot evidence, and decisions from sprint S03.
20. [`19_PRINTER_PROFILE_NOTES.md`](19_PRINTER_PROFILE_NOTES.md) — the printer profile, the compensation step, the calibration flow, the thin-wall rule, and decisions from sprint S04.
21. [`20_KERNEL_MODULES_NOTES.md`](20_KERNEL_MODULES_NOTES.md) — the shell, array, profile, and lightening modules, the rules every family B product follows, the socket tray, kernel timings, and decisions from sprint S05.
22. [`21_WAVE_1_PRODUCTS_NOTES.md`](21_WAVE_1_PRODUCTS_NOTES.md) — the marker cup block, the battery organizer, the tool fin rack, and the stackable parts bin, with their rules, timings, and decisions from sprint S06.
23. [`22_FAMILY_A_EXTENSIONS_NOTES.md`](22_FAMILY_A_EXTENSIONS_NOTES.md) — the layout parameter kind, dividers by position, leg posts, the remote caddy, the drawer riser, and decisions from sprint S07.
24. [`23_REVOLVED_FORMS_NOTES.md`](23_REVOLVED_FORMS_NOTES.md) — the revolve module and its profile builder, the plant pot and saucer, the card holder, segment counts, and decisions from sprint S08.
25. [`24_BRACKET_FAMILY_NOTES.md`](24_BRACKET_FAMILY_NOTES.md) — the bracket kernel module, the load rules as validation, the load model and its assumptions, the print-pose overhang test, the wall hook rail, the headphone mount, the shelf riser with press-fit leg extensions, the entryway valet, and decisions from sprint S09.
26. [`25_BROWSER_QA_NOTES.md`](25_BROWSER_QA_NOTES.md) — the Playwright suite, the CI browser job, runtimes, flake count, and decisions from sprint S10.
27. [`26_CLOUDFLARE_MIGRATION_NOTES.md`](26_CLOUDFLARE_MIGRATION_NOTES.md) — the direct Cloudflare deployment, the configured origin, the CI deploy job, the acceptance checklist, rollback, and decisions from sprint S11.
28. [`27_PRINT_PROGRAM_NOTES.md`](27_PRINT_PROGRAM_NOTES.md) — the print record program and decisions from sprint S12; the records themselves are in `sprints/PRINT_RECORDS.md`.
29. [`28_CONTRACT_FOLLOW_UPS_NOTES.md`](28_CONTRACT_FOLLOW_UPS_NOTES.md) — geometry loaded per product, the worker's fixed chunk, the coupon in the worker, printed walls the product reports, the diameter correction, and decisions from sprint S13.
30. [`29_PRINT_CONTEXT_NOTES.md`](29_PRINT_CONTEXT_NOTES.md) — the print context that validation may read, the bed-aware pot rules, the riser's one-piece height as a setting, and decisions from sprint S14.
31. [`30_OWED_REVIEWS_NOTES.md`](30_OWED_REVIEWS_NOTES.md) — the primary reviews of S09 and S13 run on the merged code, every finding and its disposition, and decisions from sprint S15.
32. [`31_SESSION_HANDOFF.md`](31_SESSION_HANDOFF.md) — the architecture handoff through S15: constraints, decisions, open issues, and priorities. Start here with document 32 for the S16 change; it supersedes document 09.
33. [`32_FRONT_SCOOP_GRID_NOTES.md`](32_FRONT_SCOOP_GRID_NOTES.md) — the S16 drawer tray scoop placement, geometry change, verification, review, and print follow-up.
34. [`sprints/`](sprints/) — one spec per sprint, S01 to S16, plus the print records.
35. [`manifest.json`](manifest.json) — machine-readable package metadata and document inventory.

`CHECKSUMS.sha256` contains SHA-256 hashes for every document and the manifest so a copied or extracted package can be verified.

## Fast start for the next agent

From the repository root:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run test:ssr
npm run dev
```

Before editing geometry, read `03_GEOMETRY_AND_STL.md` and run the geometry/STL tests. Before changing persistence or hosting, read `07_OPERATIONS_AND_MIGRATION.md`; browser storage is origin-scoped, so a hosting migration can otherwise strand a user's saved design.

## Non-negotiable extension invariants

- Preview and export must remain derived from one normalized parameter state.
- A download must never represent stale controls or geometry different from the visible preview.
- Invalid input must preserve the last valid preview and block export.
- Every generated part must remain finite, positively oriented, non-degenerate, and closed/manifold.
- Model coordinates are millimeters and the flat print base remains on `z = 0` unless a versioned format explicitly says otherwise.
- Existing saved designs must not silently regenerate into materially different physical parts after geometry semantics change.
- Heavy new geometry work should move off the browser main thread before it can make the interface unresponsive.
