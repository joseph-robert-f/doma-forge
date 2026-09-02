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
10. [`09_NEXT_AGENT_BRIEF.md`](09_NEXT_AGENT_BRIEF.md) — a concise implementation brief that can be passed directly to the next agent.
11. [`10_MULTI_PRODUCT_EXPANSION_PLAN.md`](10_MULTI_PRODUCT_EXPANSION_PLAN.md) — governance rules for the drawer tray and the 15-product catalog plan built on the same engine.
12. [`manifest.json`](manifest.json) — machine-readable package metadata and document inventory.

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
