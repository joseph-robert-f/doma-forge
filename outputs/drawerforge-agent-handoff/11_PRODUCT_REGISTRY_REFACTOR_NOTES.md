# 11. Product Registry Refactor Notes

Date: 2026-09-02
Status: Implemented on branch `claude/parametric-stl-expansion-emhw33`.
Reads with: 10_MULTI_PRODUCT_EXPANSION_PLAN.md, 02_SYSTEM_ARCHITECTURE.md, 05_DECISION_LOG.md

This document records the first tranche of Part 3 of the expansion plan:
the CI gate, refactor steps 1 to 7, and the preset rename. It lists each
decision, each deviation from the plan, the open issues, and the follow-up work.

---

## 1. What changed

### 1.1 Files

| Before | After | Note |
|---|---|---|
| `lib/parameters.ts` | `lib/products/drawer-tray/schema.ts`, `validate.ts` | Specs now carry `kind`. Groups moved here from the UI. |
| `lib/presets.ts` | `lib/products/drawer-tray/presets.ts` | `cutlery` preset renamed to `tools`. |
| `lib/organizer-geometry.ts` | `lib/products/drawer-tray/geometry.ts` + `lib/kernel/*` | Same algorithm. Kernel loader and profile builder are shared. |
| `lib/stl.ts` filename function | `drawerTray.filename()` | Product id and a hash added to the name. |
| `app/components/DrawerForgeApp.tsx` | `app/components/ProductApp.tsx`, `ParameterControls.tsx` | Renders any `ProductDefinition`. |
| `app/components/DrawerViewer.tsx` | `app/components/ModelViewer.tsx` | Same code. Neutral labels and ids. |
| `tests/presets.test.ts` | `tests/products.test.ts` | Registry-driven invariants plus the pinned drawer-tray preset list. |
| `tests/parameters.test.ts` | `tests/drawer-tray.test.ts` | Same cases. Named for the product it tests. |
| none | `.github/workflows/ci.yml` | Lint, typecheck, test, build, SSR. |

New: `lib/products/types.ts` (the contract), `lib/products/shared.ts` (normalize,
validate, signature, slug, hash helpers), `lib/products/registry.ts`.

### 1.2 Test results after the change

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:unit` | Pass, 39 cases (was 26) |
| `npm run test:integration` | Pass, 14 cases (was 11) |
| `npm run test:ssr` | Pass |

---

## 2. Decisions

Each entry gives the choice, the alternative, and the reason.

**D-101. Specs carry a `kind` discriminator.**
Chosen: `{ kind: "number" | "boolean" | "enum" }` unions in one `specs` record.
Alternative: separate `numericSpecs`, `flags`, and `choices` records.
Reason: one record keeps one iteration order for the signature, one lookup for the form, and one place to add a kind later.

**D-102. The parameter type is inferred from the specs.**
Chosen: `ParametersOf<typeof SPECS>` with `satisfies` on each spec and `as const` on the record.
Alternative: a hand-written interface that must match the specs.
Reason: a spec and its type cannot drift apart. The cost is one `as unknown as AnyProduct` cast in the registry, where the specific spec types are erased on purpose.

**D-103. Slugs are derived, not declared.**
Chosen: `parameterSlug("clearancePerSide") === "clearance-per-side"`.
Reason: the derived slugs match every existing test id, so no test id changed. A declared slug map was a second list to maintain.

**D-104. Boolean and enum controls use spec-derived test ids.**
Chosen: `param-finger-scoop-toggle`, `param-mesh-quality-fine`.
Before: `finger-scoop-toggle`, `quality-fine`.
Reason: one naming rule for all kinds. No test used the old ids.

**D-105. Products own derived values as display rows.**
Chosen: `derive()` returns `[{ id, label, value }]` with the value already formatted.
Alternative: return numbers and let the UI format.
Reason: the UI cannot know the unit or precision of a value it has never seen. Formatting stays next to the math that produces it. Test ids are `derived-<id>` and the two drawer-tray ids match the old ones.

**D-106. The mesh safety check is a bounds contract.**
Chosen: `boundsContract()` returns expected min, max, and tolerance. The app compares.
Reason: the old check assumed centered X/Y and base at Z=0. A revolved or bracket product can choose a different frame without touching the app.

**D-107. `generate()` stays async and returns a mesh copy.**
Plan said: `generate(kernel, params) -> Manifold`.
Chosen: `generate(params) -> Promise<GeneratedModel>`; the product calls `getKernel()` itself.
Reason: keeping kernel loading inside the product means the app never imports Manifold. That is the shape a Web Worker needs in step 8. `finishSolid()` in `lib/kernel/mesh.ts` does the status check and mesh copy for every product.

**D-108. Signature includes product id and geometry version.**
Chosen: `drawer-tray|g1|300|200|...`.
Reason: a signature is the identity of a mesh. Two products with equal numbers must not collide, and a changed algorithm must not reuse a preview.

**D-109. Filename gains the product id and a six-character hash.**
Before: `drawerforge-299x199x50-2x3.stl`.
After: `drawerforge-drawer-tray-299x199x50-2x3-d2bd1f.stl`.
Reason: the UX doc listed "the filename cannot distinguish geometrically different designs" as debt. The hash is FNV-1a of the signature, so wall thickness, mesh quality, and geometry version all change it. The readable size and grid stay in front.

**D-110. Persisted record keeps key and version, adds `productId`.**
Chosen: `{ version: 1, productId: "drawer-tray", parameters }` under `drawerforge-design-v1`.
Reason: the plan puts the storage migration in step 9 after the design-file export ships. Adding a field is backward compatible: a record without `productId` belongs to the drawer tray. A record with a different `productId` is ignored, not deleted.

**D-111. Normalization is one function for all kinds.**
Chosen: `normalizeFromSpecs()` drops unknown keys, rounds numbers to 0.001, rounds integers, and falls back to the default for an unknown enum or non-boolean flag.
Before: enum and boolean fell back the same way. Behavior is equal.
Change: the app now normalizes on every edit, including toggles. The old code normalized only numeric edits. The result is equal because normalize preserves valid values.

**D-112. The `cutlery` preset became `tools`.**
Same geometry. Label "Hand tools". Reason: scope rule 13 in the expansion plan.

**D-113. `tests/rendered-html.test.mjs` keeps literal copy assertions.**
Plan said: read from the registry.
Reason: the file is plain Node ESM and imports the built worker, not TypeScript. Importing the registry would need a build step for the test. The literals are the product's `copy` strings and the page title. Change them together.

**D-114. CI builds on every pull request, including the Cloudflare bundle.**
Reason: the SSR test is the only check that proves the worker renders. The build passed in this environment without Cloudflare credentials, so it will pass on a hosted runner. The job holds read-only `contents` permission.

**D-115. Validation checks every spec kind, not only numbers.**
Found in review: an enum value that skipped normalization passed validation and reached the kernel as `undefined` segments.
Chosen: `validateAgainstSpecs()` rejects an unknown enum value and a non-boolean flag, and the boolean and enum controls render field errors.
Also restored: a cleared integer field reports both "must be a number" and "must be a whole number", as the original code did. A test pins both.

**D-116. Golden mesh record for geometry version 1.**
`tests/geometry.test.ts` records 362 triangles, 277462.54 mm³, and bounds ±149.5 × ±99.5 × 0..50 for the defaults at standard quality. Volume tolerance is 0.1 percent. Triangle count and bounds are exact. This is the proof that the refactor kept the algorithm.

**D-117. `ProductApp` is keyed on `productId`.**
The component keeps parameter, preview, and preset state across renders. A different product must mount a fresh instance, so `page.tsx` passes `key={productId}`. A per-product route must do the same.

---

## 3. Deviations from the plan

| Plan item | What was done | Why |
|---|---|---|
| 1.3 `ProductForm.tsx` | `ProductApp.tsx` plus `ParameterControls.tsx` | The form, viewer, download, and persistence share one state machine. Splitting the form out would pass twelve props for no gain yet. |
| 1.3 `app/products/[id]/page.tsx` | Not done | One product exists. The page takes a `productId` prop, so the route is a small follow-up. |
| 1.3 `lib/kernel/shell.ts`, `arrays.ts` | Not done | Extract when the second product needs them. Moving the divider loop now would be a change to geometry code without a second caller. |
| 1.4 step 7 SSR assertions | Kept literal | See D-113. |
| 1.4 step 5 filename | Done, format in D-109 | Test updated to the new literal. |

---

## 4. Open issues

1. **Main-thread generation.** Unchanged. Step 8 is next. The `generate()` shape is ready for a worker.
2. **Persisted record has no migration path.** Step 9. Do not rename the key before roadmap Phase A ships the design-file export.
3. **`ModelViewer` scene scale is fixed.** Ground plane, grid, fog, and shadow camera assume a part about 100 to 600 mm across. A pot saucer or a battery holder will look small. Scale the scene furniture from the mesh bounds.
4. **`app/layout.tsx` trusts forwarded host headers** for the metadata origin. Pre-existing. Replace with a configured origin during the Cloudflare migration.
5. **Product copy and page metadata are split.** `page.tsx` still hard-codes the title and description. Move them to `product.copy` when the per-product route lands.
6. **Unknown product id throws during render.** `getProduct()` has no error boundary. Add a not-found state when the per-product route lands.
7. **Unused Cloudflare image route.** `worker/index.ts` still routes `/_vinext/image` to an `IMAGES` binding that is not provisioned. Pre-existing.

---

## 5. Follow-up action items

In order.

1. Done: golden mesh test for `drawer-tray` at geometry version 1.
2. Step 8: move `product.generate()` into a Web Worker. Transfer the typed arrays. Keep the request id guard. Cancel the superseded job.
3. Roadmap Phase A: design-file export and import.
4. Step 9: storage migration to a per-product, versioned envelope.
5. Fit-test coupon export for the drawer tray.
6. Add `app/products/[id]/page.tsx` and move title and description into `product.copy`.
7. Scale viewer scene furniture from mesh bounds.
8. Extract `lib/kernel/shell.ts` and `arrays.ts` when the cutter-array module starts.
9. Build the cutter-array module and the socket tray. Print one coupon.

---

## 6. Review record

An independent review of the diff ran before the commit. It found no blockers,
five should-fix items, and nine nits. All were applied except two:

- Split `ProductApp` into a form and a shell. Deferred until a second product shows which props the form needs.
- Return a not-found state for an unknown product id. Logged as open issue 6.

## 7. Ideas noted, not scheduled

- A `describeProduct()` test helper that runs the registry invariants for one product. Wave 1 adds five products and each needs the same checks.
- A `spec.advanced: true` flag so the shared construction group can collapse by default.
- A `product.printNotes(params)` hook that returns orientation and perimeter advice for the download panel. Family C products need it.
- Record the `geometryVersion` in the STL header text so a downloaded file can be traced to the algorithm that made it.
