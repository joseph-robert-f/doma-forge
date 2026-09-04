# 16. Fit-Test Coupon Notes

Date: 2026-09-02
Status: Implemented on the S01 sprint branch.
Reads with: sprints/S01_FIT_TEST_COUPON.md, 10_MULTI_PRODUCT_EXPANSION_PLAN.md, 11_PRODUCT_REGISTRY_REFACTOR_NOTES.md

This document records sprint S01. It covers a small, fast fit-test print for
the drawer tray. The print exports as its own STL from a second download
button.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/products/drawer-tray/coupon.ts` | The coupon geometry: `generateFitTestCoupon`, `buildFitTestCouponMesh`, `getCouponWallThickness`, the height and minimum-wall constants. |
| `lib/products/types.ts` | Adds the optional `coupon?(parameters): Promise<GeneratedModel<P>>` member to `ProductDefinition`. No existing member changed. |
| `lib/products/drawer-tray/index.ts` | Wires `coupon: generateFitTestCoupon` into `drawerTray` and re-exports the coupon helpers. |
| `lib/products/shared.ts` | Adds `fitTestCouponFilename(model, signature)`, a generic filename builder any product's coupon can use. |
| `app/components/ProductApp.tsx` | The **Download fit test** button, its handler, and the help copy. Renders only when `product.coupon` is present. Checks the coupon's bounds against the product's bounds contract before serializing. Reports a coupon failure through the design-file message, not the viewer status. |
| `app/globals.css` | A small gap between the STL and fit-test download buttons. |
| `README.md` | New "Fit test" user section. |
| `tests/coupon.test.ts` | Geometry checks (bounds, closed edges, one component, slice topology) for the defaults and two corner-radius cases; the volume-ratio check; the golden record; the STL round trip; the collapsed-ring guard. |
| `tests/app.integration.test.tsx` | 3 new cases: button state follows the STL button, the download name matches the pattern, the design name prefix applies. |

### 1.2 The geometry

The coupon is the tray's outer profile extruded to 5 mm. The outer profile
uses `roundedRectangle`, the same corner radius as the tray. A concentric
inner profile is cut from it. The cut runs through the full height, with
overlap past both faces.

Both profiles come from the same `roundedRectangle` kernel helper the tray
shell uses. The coupon's inside corner is rounded the same way the tray's
inside wall is: the inside radius follows `cornerRadius - ringWall`, clamped
to 0. This is not a plain rectangular offset. It keeps the coupon's wall a
constant thickness all the way around. That matches what a person actually
prints and measures.

The ring wall thickness is `max(2, wallThickness)`. A tray configured with a
thin outer wall, down to the spec minimum of 1.2 mm, still gets a 2 mm coupon
wall. The coupon ignores `baseThickness`, `dividerThickness`, `rows`,
`columns`, and `fingerScoop` entirely. None of them affect a baseless
single-wall ring.

### 1.3 Generation path: inline on the main thread

The spec allowed two paths: reuse the generation client, or generate inline
on the main thread with the kernel. This sprint took the inline path. Three
reasons follow.

- The existing `GenerationClient`/`GenerationRequest` protocol
  (`lib/generation/protocol.ts`, `client.ts`, `generation.worker.ts`) has one
  fixed request shape: `{ type: "generate", productId, parameters }`. It
  always resolves through `product.generate()`. A coupon path would add a
  `kind` field. That field would thread through the request type, the
  worker's dispatch, and the client's public method surface. That is a
  change to a second shared contract, beyond the one optional
  `ProductDefinition` member the spec authorized.
- The coupon is requested rarely, one click rather than on every keystroke
  like the live preview. It is also cheap to build: a two-profile extrude and
  one subtract, with no dividers, no scoop, and no union. The golden test run
  took under a second locally.
- `ProductApp.tsx` calls `product.coupon(parameters)` directly, the same way
  `lib/design-file.ts` calls `product.validate()` and `product.normalize()`
  today. This keeps the diff to the one authorized contract addition plus the
  UI file.

**The real cost of this choice.** A Web Worker is a separate realm from the
page's main thread. `getKernel()` inside `coupon.ts` does not reuse the
worker's WebAssembly instance. The first fit-test click on a page that has
already generated a preview loads a second Manifold kernel, on the main
thread. That load, and the coupon's own extrude-and-subtract work, then run
synchronously on the main thread, not in the worker. For the sizes this
sprint tested, the coupon build finishes in well under a second, so the page
does not visibly stall. A bigger kernel load or a slower step in a later
product family could change that.

### 1.4 Filename

The pattern is `drawerforge-fit-test-<width>x<depth>-<hash>.stl` (since S15, `drawerforge-fit-test-<product id>-<width>x<depth>-<hash>.stl`, because a second product has a coupon; see 30_OWED_REVIEWS_NOTES.md S09-6). The design
name prefix comes from the existing `namedMeshFilename()`, the same helper
the STL download uses. Width and depth come from the coupon's own bounds, not
from a drawer-tray-specific derived-dimensions call. The hash is
`shortHash(product.signature(parameters))`, the same six-character hash the
STL file for the same parameters carries. A coupon and its full tray print
therefore share a hash a person can match by eye. `fitTestCouponFilename()`
lives in `lib/products/shared.ts`, not in the drawer-tray folder, so a later
product's coupon can reuse it without a drawer-tray import.

### 1.5 UI

**Download fit test** sits beside **Download STL** in the export bar. It
renders only when `product.coupon` exists; a product without a coupon shows
no second button. It shares the `downloadDisabled` value the STL button uses,
so the two buttons are always in the same enabled state. The click handler
also checks `product.coupon` and a local `fitTestBusy` flag before starting.

Before serializing, the handler checks the coupon's bounds. X and Y are
checked against `product.boundsContract(preview.parameters)`. Z is checked
against 0 to `FIT_TEST_COUPON_HEIGHT`, using the contract's own tolerance.
This mirrors the bounds check the live preview already runs on the full
model. The handler then runs the same STL-level safety checks the STL
download applies. These checks are: finite geometry, positive triangle area,
and positive signed volume. The handler also runs an independent binary-STL
inspection. That inspection's bounds must match the geometry's own bounding
box.

A coupon failure is reported through `setFileMessage` with tone `"error"`.
A coupon failure means either a failed safety check or an error thrown by
`product.coupon` itself. `setFileMessage` is the same mechanism the
design-file save and open handlers use. It does not touch `viewerStatus`.
The earlier version of this handler set `viewerStatus` to
`"error"` on a coupon failure. That disabled both download buttons and
reddened a preview that was still valid, for a failure that had nothing to
do with the preview.

### 1.6 Test results

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 122 cases (was 111 before this sprint) |
| `npm run test:ssr` | Pass, 2 cases |
| Real Chromium smoke against the production build | Pass, see Measurements |

---

## 2. Decisions

**D-501. The coupon follows the tray's corner radius at the inside edge, not a plain offset.**
The inner profile is `roundedRectangle(innerWidth, innerDepth, cornerRadius - ringWall, segments)`. This is the same construction the tray shell uses for its own cavity. A plain rectangular offset would give the ring wall square inside corners. That would make the wall thicker at the corners than along the straight edges, which changes what the coupon is testing. Following the radius keeps the wall a constant thickness everywhere. The print a person handles then matches the tray's own wall behavior.

**D-502. The ring wall is clamped to a 2 mm minimum, independent of the tray wall setting.**
The spec's own risk note says a wall thinner than two nozzle widths prints weak. The drawer tray's `wallThickness` spec allows down to 1.2 mm. `getCouponWallThickness()` takes `max(2, wallThickness)` rather than let a thin-walled tray produce an unreliable coupon. The help copy states this rule, so a person is not confused when the coupon wall does not match a thin tray-wall setting exactly.

**D-503. Generation runs inline on the main thread, not through the Web Worker protocol.**
See section 1.3 for the choice and its real cost. The real cost is a second Manifold kernel load, plus synchronous main-thread work, on the first fit-test click; it is not a reuse of the worker's kernel. The inline choice stands for this sprint. See Follow-ups for the worker-protocol path a later sprint can take if this becomes a problem.

**D-504. The coupon ignores every parameter that does not shape a baseless single-wall ring.**
`baseThickness`, `dividerThickness`, `rows`, `columns`, and `fingerScoop` do not change a baseless single-wall ring's shape, so the coupon ignores them. `meshQuality` is not ignored: it still sets the curve segment count for both the tray and the coupon, so a fine-quality tray also gets a fine-quality coupon. This keeps the coupon a pure "does the outline fit" test, per the spec's Goal section, rather than a scaled-down tray replica.

**D-505. The coupon filename helper is generic, not drawer-tray-specific.**
`fitTestCouponFilename()` takes a `GeneratedModel` and a signature string. It reads width and depth from the model's own bounds. It lives in `lib/products/shared.ts`, next to the other cross-product filename and hash helpers, not in `lib/products/drawer-tray/`. It is a plain function, not a `ProductDefinition` contract change, so it does not touch the one authorized optional member.

**D-506. `coupon` is optional with no default; `AnyProduct` needed no separate edit.**
`AnyProduct` is `ProductDefinition<Record<string, ParameterSpec>>`, the same generic interface with its specs erased. The new optional member is already present on `AnyProduct` once it is added to `ProductDefinition`. No second edit was needed to thread it through.

---

## 3. Deviations from the spec

Every Scope and Deliverables item is implemented as written. One
implementation detail is not committed to the repository. The
browser-smoke script used for section 4.1 below is a throwaway copy of the
shared `pw/` harness. It is kept in the scratchpad directory, not in
`tests/` or any tracked path. The spec's own browser-smoke item asks only
that the smoke run once and the result be recorded here. It does not ask
for the script itself to ship. This is recorded as a deviation regardless,
because the script that produced the recorded numbers is not reproducible
from the repository alone.

---

## 4. Measurements

These measurements are recorded for the drawer tray's own defaults
(`DRAWER_TRAY_DEFAULTS`). The defaults are: drawer 300 × 200 mm, 0.5 mm
clearance per side, 50 mm height, 2 mm walls, 8 mm corner radius, 2 × 3
compartments, standard mesh quality.

| Measurement | Value |
|---|---|
| Coupon outside bounds (X, Y) | -149.5 to 149.5, -99.5 to 99.5 mm — equal to the tray's own outside bounds |
| Coupon bounds (Z) | 0 to 5 mm |
| Coupon ring wall (defaults) | 2 mm (equals `wallThickness`, already at the 2 mm floor) |
| Coupon triangle count (golden, defaults) | 224 |
| Coupon volume (golden, defaults) | 9754.816 mm³ |
| Tray volume (golden, defaults, from `tests/geometry.test.ts`) | 277462.54 mm³ |
| Coupon volume as a percentage of tray volume | 3.52 percent (acceptance bar: under 10 percent) |
| Coupon binary STL size (defaults) | 84 + 224 × 50 = 11284 bytes |
| Full tray binary STL size (defaults) | 18184 bytes |
| Total automated test count before this sprint | 111 |
| Total automated test count after this sprint | 122 (11 new: 8 in `tests/coupon.test.ts`, 3 in `tests/app.integration.test.tsx`) |

### 4.1 Browser smoke

The smoke ran against `npm run build && npm run start`, using a
Playwright/Chromium harness copied from the shared `pw/` scripts
(`fit-test-smoke.js`; see the Deviations section for its status). The app
reached `Ready · 299 × 199 × 50 mm · 2 × 3`. **Download fit test** was
enabled. Clicking it produced a real browser download:

```json
{
  "fitTest": { "name": "drawerforge-fit-test-299x199-137f96.stl", "size": 11284 }, (since S15: drawerforge-fit-test-drawer-tray-299x199-137f96.stl)
  "stl": { "name": "drawerforge-drawer-tray-299x199x50-2x3-137f96.stl", "size": 18184 }
}
```

The coupon and full-tray downloads share the hash `137f96`, because both came
from the same current design's parameters. This matches D-505's intent. The
coupon file size, 11284 bytes, matches the unit-test golden triangle count
exactly (`84 + 224 * 50 = 11284`). That confirms the production build's
coupon matches the tested geometry.

The console reported two benign, pre-existing WASM MIME-type warnings
("wasm streaming compile failed... falling back to ArrayBuffer
instantiation") and one unrelated 404. These come from the local production
server's static-asset headers, not from this sprint's code. The same
warnings appear on the plain STL download in the same run.

---

## 5. Open issues

None blocking on the spec itself. One environment note: this worktree's
`node_modules` was present but empty at the start of this sprint, holding
only Vite's cache directories. That made `tests/app.integration.test.tsx`
fail outside the sandbox's file-access allowlist, because Node module
resolution fell through to the parent checkout's `node_modules`. Running
`npm install` in the worktree populated it locally and resolved the failure.
This was unrelated to the coupon change itself; a clean stash of this
sprint's edits reproduced the same failure. It is recorded here in case
another sprint agent hits the same setup gap.

---

## 6. Follow-ups

1. Watch for the second main-thread kernel load or the main-thread coupon
   build noticeably blocking the page in a later product family. If that
   happens, extend the `GenerationRequest`/`GenerationResponse` protocol with
   a `kind: "model" | "coupon"` field. Route the coupon through the
   generation client and worker instead. That is a shared-contract change. It
   belongs to a sprint with the authority to make it, not S01.
2. S04 (printer profile and dimensional correction) depends on S01 per the
   sprint plan. The coupon's ring wall is currently a fixed geometric value.
   S04 should confirm whether X/Y correction should apply to the coupon the
   same way it applies to the tray, since the coupon's whole purpose is a
   physical fit check.
3. S12 (physical print program) should include the fit-test coupon in its
   print record template alongside the full tray, since the coupon is the
   print meant to happen first.
4. `fitTestBusy` guards against a second click starting a second build while
   one is in flight. It has no visible effect in the UI. The button stays
   enabled. It shows no busy state while a coupon build runs. A later sprint
   touching this button should add a visible busy state. The viewer already
   shows "updating" for the live preview; the button should do the same.
5. The coupon's filename hash comes from `product.signature(parameters)`.
   That signature folds in the tray's `geometryVersion`. The coupon has no
   `geometryVersion` of its own. Governance rule 4 in
   10_MULTI_PRODUCT_EXPANSION_PLAN.md says a mesh change for equal parameters
   is a geometry change, and requires a `geometryVersion` bump and a golden
   test. A change to only the coupon's geometry, with the tray's geometry
   unchanged, has no version number of its own to bump. A later sprint that
   changes the coupon geometry should address this. Two options: give the
   coupon its own version number, folded into the hash; or treat any coupon
   geometry change as a drawer-tray `geometryVersion` bump.

---

## 7. Notes to record (from the spec)

**Ring wall rule.** The coupon's ring wall is `max(2, wallThickness)`. It is
never thinner than 2 mm, regardless of the tray's own wall setting. See
D-502.

**Corner radius at the inside edge.** The coupon follows the tray's corner
radius at the inside edge. It does not use a plain rectangular offset. See
D-501.
