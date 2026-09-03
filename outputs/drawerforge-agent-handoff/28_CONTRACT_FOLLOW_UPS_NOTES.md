# 28. Contract Follow-ups Notes

Date: 2026-09-03
Status: Implemented on the S13 sprint branch.
Reads with: sprints/S13_CONTRACT_FOLLOW_UPS.md,
16_FIT_TEST_COUPON_NOTES.md, 19_PRINTER_PROFILE_NOTES.md,
20_KERNEL_MODULES_NOTES.md, 21_WAVE_1_PRODUCTS_NOTES.md,
22_FAMILY_A_EXTENSIONS_NOTES.md, 23_REVOLVED_FORMS_NOTES.md,
24_BRACKET_FAMILY_NOTES.md, 25_BROWSER_QA_NOTES.md

This document records sprint S13. The sprint closes the follow-ups that
four earlier sprint notes kept recording because only a change to the
product contract or the generation protocol could close them: the worker
chunk that grew with the catalog, the fit-test coupon that built on the
main thread, the thin-wall rule that could not see a solved web, and the
round part that no correction could reach. It adds no product.

Every number here is measured in this sprint's checkout. Section 7 holds
the measurements. Section 5 holds the decisions, D-1701 to D-1712.

---

## 1. What changed

### 1.1 Files

| Area | Files | Change |
|---|---|---|
| Kernel | `lib/kernel/pitch.ts`, `lightening-plan.ts`, `leg-plan.ts`, `bracket-rules.ts`, `vessel-profile.ts`, `overlap.ts` | New. The pure planners, cut out of `arrays.ts`, `lightening.ts`, `legs.ts`, `brackets.ts`, `revolve.ts`, and `shell.ts`. No function changed; each moved with its tests. |
| Kernel | `lib/kernel/arrays.ts`, `lightening.ts`, `legs.ts`, `brackets.ts`, `revolve.ts`, `shell.ts` | Keep only the solid builders. `shell.ts` re-exports the overlap constant so geometry modules keep their import. |
| Products | `lib/products/geometry-registry.ts` | New. One lazy loader per product id, in catalog order, with a cache. |
| Products | `lib/products/*/index.ts` | `generate` and `coupon` go through `loadGeometry`. No static import of `./geometry` or `./coupon` remains. Geometry re-exports removed; tests import geometry modules directly. |
| Products | `lib/products/drawer-tray/schema.ts`, `coupon.ts` | The coupon's pure constants and `getCouponWallThickness` moved to the schema, so the definition needs no kernel code for the coupon bounds. |
| Products | `lib/products/wall-hook-rail/schema.ts`, `geometry.ts` | `couponParameters` moved to the schema; `generateWallHookRailCoupon` is the geometry-side coupon builder. |
| Products | `lib/products/plant-pot/index.ts`, `plant-saucer/index.ts` | `compensable: { diameter: [...] }` on the base diameter and the inner floor diameter. |
| Products | `lib/products/parts-bin/schema.ts`, `presets.ts` | Default outer wall 3.4 mm; compact preset 3.2 mm (D-1713). |
| Products | `lib/products/socket-tray/index.ts` and the products in section 3.2 | `printedWalls`. |
| Contract | `lib/products/types.ts` | `printedWalls?(parameters): WallValue[]`. |
| Printer profile | `lib/printer-profile.ts` | `CompensableParameters.diameter`, `diameterCorrection`, `wallsFromSpecs`; `compensate`, `activeCorrections`, `correctionRangeMessages`, and `correctionFilenameTag` read the diameter list; `compensationNotes` reads the extents (D-1714). |
| Protocol | `lib/generation/protocol.ts`, `client.ts` | `GenerationRequest.kind` of `"model"` or `"coupon"`; the handler loads geometry from the geometry registry, not the product registry. |
| Page | `app/components/ProductApp.tsx` | The coupon builds through the generation client; the button reads "Building fit test…" and is disabled while it builds; a cancelled build says so. The thin-wall rule reads `printedWalls` when the product has it. |
| Build | `vite.config.ts` | `worker.format = "es"`, so the worker build splits dynamic imports into chunks. |
| Tests | `tests/products.test.ts` | Loader table equals the registry; coupon presence matches; unknown and prototype ids refused; the module cache; every definition-side module free of builder imports; `printedWalls` finite, labeled, positive, unique, and a superset of the key-name rule for every product's defaults and presets. |
| Tests | `tests/generation.test.ts`, `tests/printer-profile.test.ts`, `tests/app.integration.test.tsx`, `tests/browser/performance-budget.spec.ts` | Coupon kind round trip; diameter compensation; the busy label; the new worker and registry budgets. |
| Tests | `tests/geometry.test.ts` | Uses `tests/helpers/mesh-checks.ts`; 214 lines of private copies removed. |
| Docs | `README.md`, `15_SPRINT_PLAN.md`, `sprints/S13_CONTRACT_FOLLOW_UPS.md`, `sprints/PRINT_RECORDS.md` records 12 and 13, this document | |

### 1.2 Test counts

859 tests in 32 files before, 948 in 32 files after. Section 7.3.

---

## 2. Geometry per product

### 2.1 The problem

The generation worker imported the product registry, and each product
definition imported its geometry module statically. The worker chunk
therefore held every product's geometry and grew about 10 KB per product:
80 KB with two products, 197 KB with fifteen (24_BRACKET_FAMILY_NOTES.md,
open issue 1). The page's registry chunk held the same code again, because
the page imported the same definitions for its form. A person who opened
one product downloaded fifteen products' geometry twice.

### 2.2 The rule

A product definition holds what the page needs to show the form: the
schema, the validation, the copy, the presets, and the derived values. It
loads its geometry on demand, through one table of lazy loaders keyed by
product id. The worker imports that table and nothing else of the catalog.
A definition-side module (`index.ts`, `schema.ts`, `validate.ts`,
`copy.ts`, `presets.ts`) never imports a kernel module that builds a solid,
and never imports the product's own geometry statically.

The kernel had to be cut for that rule to hold. Product schemas import the
pitch solver, the lightening plan, the leg plan, the bracket rules, and
the vessel profile, and those lived in the same modules as the cutters,
the posts, the hooks, and the revolve. A module is the unit a bundler
splits on, so the builders followed the planners into the page's chunk
even though nothing on the page called them. Section 7 shows the effect:
the first build after the lazy loaders still had nine extrusions, two hulls,
and one revolve in the worker's fixed chunk. The split into planner and
builder modules removed all of them.

A source-reading test in `tests/products.test.ts` enforces the rule, so a
later product cannot put the builders back by accident. The test reads the
value imports of each definition-side module and fails on a builder module
or a static geometry import.

### 2.3 What the worker holds now

The worker's fixed chunk holds the protocol handler and the loader table:
2.8 KB for fifteen products. A product added later costs the worker one
loader line. Its geometry, its schema, and the kernel arrive in their own
chunks the first time a page asks for that product. The page's registry
chunk holds the definitions only, 126 KB for fifteen products, about
8.5 KB each, all of it used by the form.

---

## 3. The other three changes

### 3.1 The coupon in the worker

The fit-test coupon built on the main thread, so the page loaded the
kernel a second time for it (16_FIT_TEST_COUPON_NOTES.md, follow-up 1),
and the button showed no busy state (follow-up 4). The generation request
now carries a `kind`, `"model"` or `"coupon"`. The page asks the same
client for the coupon that it asks for the preview, with the same
compensated parameters and the same safety checks afterwards. The client's
latest-wins rule still holds: an edit during a coupon build cancels the
coupon, and the page says so instead of showing a generic failure. The
button reads "Building fit test…" and is disabled while the coupon builds.

### 3.2 Printed walls the product reports

The thin-wall rule read the parameters whose key names a wall or a
thickness. It could not see a solved web between two bores, a leg section,
a fixed rib, a lip, or a gusset (20_KERNEL_MODULES_NOTES.md open issue 5,
21 open issue 3, 22 open issue 4, 23 open issue 7). A product may now
report the thin features it prints, as labeled millimeter values, through
`printedWalls`. The rule reads that list when the product supplies it and
falls back to the key-name rule when it does not. A product that supplies
the list starts from the key-name rule's own list, so it can add to that
rule but never take from it; the contract test checks the superset.

The rule for what a product reports: a wall the user sets, a web the
layout solves between two or more features in one direction, and a
constant that is printed as a thin wall. Not a gap, a clearance, a bore
diameter, a floor already named by a thickness parameter, a chamfer, or a
load section such as a hook root, which the hook rule covers. A single
cutter's "web" is the end margin, not a thin feature, so it is not
reported. Section 5, D-1703, and the table below.

| Product | Reported beyond the key-name rule | Value at the defaults |
|---|---|---|
| Socket tray | Web between bores (minimum over rows, two or more bores), web between rows (two or more rows), web between underside pockets (constant, pockets on) | 2.5, 6.25, 2.5 mm |
| Marker cup block | Web between cups (two or more per row), web between rows, web between underside pockets | 7.2, 15.2, 2.5 mm |
| Battery organizer | Web between wells and web between rows, both narrowed by the finger relief where it widens the mouth, web between underside pockets | 4.8, 2.625, 2.5 mm |
| Card holder | Web between slots (two or more slots) | 11.43 mm |
| Parts bin | Wall beside the stacking recess (recess built), label ledge shelf, label ledge upstand (ledge on). See D-1713 | 0.8, 1.6, 1.2 mm |
| Drawer riser | Leg section. Not the gusset, which only flares the post outward | 12 mm |
| Shelf riser | Leg section, rib thickness (ribs present), web between lightening pockets (pockets on), socket wall (riser splits) | 14, 3, 4 mm; 3 mm when split |
| Plant pot | Web between a drain hole and the wall, web between neighbouring holes (two or more holes) | 26.05, 35.09 mm |
| Plant saucer | Lift rib width (ribs on) | 3 mm |
| Entryway valet | Slot lip, phone rest wedge top | 2, 41.89 mm |
| Headphone mount | Lip, pocket side wall (pocket on). Not the hook root, a load section the hook rule covers | 3, 3 mm |
| Wall hook rail | Lip. Not the gusset or the shelf, which build at the plate thickness the key-name rule already reports | 3 mm |
| Tool fin rack | None: the fin and the base are parameters the key-name rule finds; the space between fins is a clearance, and the fillet strip is not a wall | no member |
| Remote caddy | None: every wall is a parameter; the solved widths are compartments | no member |
| Drawer tray | None: every wall is a parameter | no member |

Measured over every product's defaults and presets: at the default
0.4 mm nozzle nothing fails the rule, reported or key-named. At 0.6 mm one
preset fails, the parts bin's compact preset on its 1 mm lip wall, which
the key-name rule already saw. At 1.5 mm the rule now refuses, beyond the
2 mm walls it always saw, the socket tray's and the marker block's web
between underside pockets, the battery organizer's web between rows and
between wells, the card holder's web between slots, the parts bin's ledge
shelf and upstand, and the valet's slot lip, each with a message that
names the web. Section 7 has the count.

### 3.3 The diameter correction

A parameter named on both axes of `CompensableParameters` took both
corrections, so a round part would have grown by their sum
(23_REVOLVED_FORMS_NOTES.md, D-1511). The pot and the saucer therefore had
no compensation at all. `CompensableParameters` gains a `diameter` list. A
diameter takes the mean of the X and Y corrections, once. The pot's base
diameter and the saucer's inner floor diameter are on that list. Records
12 and 13 in `sprints/PRINT_RECORDS.md` now ask for the diameter measured
across X and across Y, so the calibration protocol reads each as that
axis's measurement.

---

## 4. The test dedupe

`tests/geometry.test.ts` carried private copies of the closed-edge count,
the component count, and the horizontal slice topology that
`tests/helpers/mesh-checks.ts` had held since S05. The private and shared
implementations were the same logic; the only difference was the mesh
parameter's type name, which resolves to the same `KernelMesh`. The test
file now imports the helpers. Its eleven cases and their golden values are
unchanged.

---

## 5. Decisions

**D-1701. Geometry loads per product through one loader table, and the
kernel is cut into planners and builders.** The alternative, a dynamic
import inside each definition with no table, left the worker importing the
product registry and therefore every schema; the table lets the worker
import nothing else. The kernel cut is the part that made the chunk
numbers real: without it the builders rode along with the planners. Module
names: the planner keeps a name that says what it plans (`pitch`,
`lightening-plan`, `leg-plan`, `bracket-rules`, `vessel-profile`); the
builder keeps the original name. No function changed.

**D-1702. The coupon is a `kind` on the same request, not a second
protocol.** One client, one worker, one set of safety checks. The
latest-wins rule applies to a coupon like any other request; the page's
button is enabled only while no preview is pending, so the only way a
coupon is cancelled is an edit during its build, which the page reports.

**D-1703. A product reports its printed walls; the key-name rule stays as
the fallback and the floor.** A new optional member, not a change to
`validate`, so no product that does not need it changes. The list is a
superset of the key-name rule's list, enforced by test, so adding the
member can only make the rule stricter. The compensated parameters feed
the list, because a solved web is measured after the correction changes
the width it is solved from.

**D-1704. A diameter takes the mean of the two axis corrections, once.** A
third correction field would have asked the person for a number the
calibration protocol cannot produce from one print. The mean is what a
caliper across X and across Y averages. A machine whose two corrections
differ prints a circle as an oval by their difference, which no single
number corrects; the README says so.

**D-1705. The worker build uses the ES module format.** The default IIFE
format inlines every dynamic import back into the worker chunk. The worker
was already created as a module worker.

**D-1706. `loadGeometry` guards the loader table with `hasOwnProperty`.**
A request for `toString` or `constructor` would otherwise resolve a
prototype member and fail with a confusing error. The test covers it.

**D-1707. Geometry re-exports are gone from product definitions.** A
static re-export is a static import, so `export { generateX } from
"./geometry"` would have pulled the geometry back into the registry chunk.
Tests that need a geometry function import the geometry module directly.

**D-1708. The drawer tray's coupon constants live in its schema.** The
definition needs the coupon height for `couponBoundsContract`, and it must
not import `coupon.ts`, which needs the kernel. The two constants and the
pure wall rule moved; `coupon.ts` re-exports them for its tests.

**D-1709. The rail's coupon parameter set lives in its schema, and its
coupon builder in its geometry.** Same reason as D-1708. The builder
validates the rail's parameters first, as before.

**D-1710. The busy state is the button's own label.** "Building fit
test…" with `aria-busy`, and disabled. No spinner, no toast: the button is
where the person is looking.

**D-1711. The worker budget is 16 KB and the registry budget 176 KB.** The
worker's fixed chunk is 2.8 KB; a static import of any product or kernel
module would multiply that and fail the test at once. The registry chunk
is 126 KB; the budget leaves room for five more products at the measured
8.5 KB each, and a builder module leaking into a definition fails it.

**D-1713. The parts bin reports the skin beside its stacking recess, and
its defaults and stacking presets leave 0.8 mm there.** The lip is centered
in the outer wall (21_WAVE_1_PRODUCTS_NOTES.md, D-1352), so the wall leaves
`(wall − lipWall − 2 × clearance) / 2` on each side of the recess: 0.6 mm at
the old defaults, 0.55 mm in the compact preset. Both are under two widths
of a 0.4 mm nozzle, and rule 9 is unconditional. The first draft of this
sprint left the skin unreported so print record 8 could decide whether it
prints; the review rejected that, rightly: an unfilled record is a reason
not to ship a thin default, not a reason to hide it from the rule that
exists to catch it. The skin is now reported as "Wall beside the recess",
the default outer wall is 3.4 mm and the compact preset's 3.2 mm, so every
shipped parameter set leaves 0.8 mm or more, and one step thinner refuses
with a message that names the skin. The geometry version is unchanged:
equal parameters still give the same mesh. The parts bin's golden record
and print records 8 and 9 are re-recorded for the new defaults. The 0.8 mm
reserve rule in validation stays: it is the nozzle-independent floor, and
the thin-wall rule now carries the nozzle.

**D-1714. The compensation note reads the part, and the file-name tag reads
what reached the product.** Found in review. `compensationNotes` skipped an
axis whose profile correction was zero, so a round part with a Y-only
correction showed one note although both extents grew by the mean. It now
reads the two extents and writes a line for every axis that changed.
`correctionFilenameTag` marked every nonzero axis, so a pot under
`+0.5, −0.5` got a tag although its diameter took nothing. It now marks the
axes a product's compensable lists reach, `x` and `y` for the axis lists and
`d` with the mean for the diameter list, and nothing when the mean is zero.
Also from the review: the geometry loader forgets a failed load so the next
request retries, and the source-reading test catches a single-line
`export ... from "./geometry"` as well as an import.

**D-1712. The profile stays out of `validate`.** The bed constants in the
pots and the one-piece height in the shelf riser are recorded follow-ups
that need the printer profile inside validation. That is a change to
every product's `validate` signature and to the page's call sites, and the
bed warning already covers the outcome. Out of scope, still recorded as
open.

---

## 5a. The review

The primary reviewer was unavailable: four attempts across this sprint
ended in a server overload, as did the retry of the S09 primary review.
The fallback reviewer ran at the same effort on the whole diff and reported
five findings, all applied:

1. **Blocking.** The parts bin's recess skin was unreported and under
   rule 9 at the shipped defaults. Applied as D-1713: reported, and the
   defaults and presets changed so they pass.
2. **Should fix.** `compensationNotes` and `correctionFilenameTag` did not
   know the diameter list. Applied as D-1714, with tests.
3. **Should fix.** The source-reading test did not catch a single-line
   `export ... from "./geometry"`. Applied: the test reads `export` lines
   as well.
4. **Should fix.** `loadGeometry` cached a rejected promise for the life
   of the worker. Applied: a failed load is forgotten, with a test.
5. **Nit.** The handoff README's list numbering repeated 30. Applied.

The reviewer verified and found sound: the kernel cut (no logic change,
no circular import, one overlap constant), the lazy loading and its race
and error paths, the coupon's safety checks against the model's, every
`printedWalls` value against its geometry, the diameter arithmetic, the
budget test's duplicate-match guard, the nozzle substitutions in the
tests, the unchanged golden records, and the copy against rule 13.

---

## 6. Deviations from the spec

1. The spec's scope item 1 asked for geometry loaded per product. The
   kernel split (D-1701) was not in the spec; the first measurement showed
   it was needed for the chunk to hold no builder code, and it changed no
   function.
2. The spec's acceptance said "the page's registry chunk holds no product
   geometry". It holds none; it still holds every product's schema,
   validation, copy, and presets, which the form needs. The registry
   budget test (D-1711) measures that chunk.

3. The spec's acceptance said a 1.5 mm nozzle refuses every product whose
   solved web is under 3 mm. It does, for the webs. Some fixed features sit
   at exactly 3 mm (the riser rib, the mount lip and pocket wall, the rail
   lip, the saucer rib, the split socket wall) or have an 8 mm floor (a leg
   section), so no legal parameter set puts them under 3 mm; their tests
   use a larger nozzle to exercise the same path and say so in a comment.
4. The parts bin's defaults and stacking presets changed: the outer wall is 3.4 mm (was 3) and the compact preset's 3.2 mm (was 2.6), so the skin beside the recess passes rule 9 at a 0.4 mm nozzle. Its golden record is re-recorded; the geometry version is unchanged (D-1713). The spec's acceptance said every golden record stays unchanged; fourteen do.
5. The tool fin rack, the remote caddy, and the drawer tray supply no
   `printedWalls`, because the key-name rule already sees every wall they
   print; the tool fin rack's test asserts the absence and the coverage.

---

## 7. Measurements

### 7.1 Chunks, production build, `dist/client/assets`

| Chunk | S09 (15 products) | After lazy loaders only | After the kernel cut | S13 final |
|---|---|---|---|---|
| `generation.worker-*.js` | 197,979 B | 139,431 B | 134,248 B | 2,854 B |
| Solid calls in the worker's fixed chunk (`extrude`, `hull`, `revolve`, `delete`) | all | 9, 2, 1, 38 | 0, 0, 0, 0 | 0, 0, 0, 0 |
| `registry-*.js` (definitions the page's form needs) | 197,300 B | 45,665 B + 95,677 B shared | 45,929 B + 90,507 B shared | 136,369 B |
| `ProductApp-*.js` (page, Three.js and viewer) | 601,948 B | 602,415 B | 602,415 B | 598,518 B |
| `mesh-*.js` (kernel glue, on demand) | inside the worker | 2 × 42.8 KB | 2 × 43.1 KB | 43,079 B, one copy |
| `shared-*.js` (pure planners and helpers) | inside the registry | | | 44,768 B |
| `geometry-*.js` | none | 30 files | 30 files | 30 files, 106,033 B in all |

The two intermediate columns are the measurements that drove D-1701: the
lazy loaders alone left the builders in the shared chunk, and the kernel
cut alone left every schema in the worker. Each product's geometry is
emitted twice, once for the page's inline path (server render and jsdom;
never fetched by a browser) and once for the worker, about 3.5 KB each.
The registry chunk grew 10 KB between the kernel cut and the final build:
the `printedWalls` members.

Budgets: worker 16 KB, registry 176 KB, page 650 KB. All pass.

### 7.2 Browser

| Measurement | Value |
|---|---|
| Browser suite | 11 passed, 1.4 min (10 in S10; the registry budget is new) |
| First Ready preview, budget 5 s | 2.0 to 2.4 s across three runs (1.6 s in S10; the geometry chunk is one more round trip) |
| Fifteen-route smoke, cold browser, time to Ready | 1.0 to 1.7 s per product |
| Fifteen-route smoke, downloads | every STL valid, triangle counts equal to the golden records, zero page errors |

### 7.3 Tests

| Suite | S09 | S13 |
|---|---|---|
| Vitest | 859 in 32 files | 948 in 32 files |
| Server render (`test:ssr`) | 5 | 5 |
| Deploy config (`test:deploy-config`) | 2 | 2 |
| Lint, typecheck | clean | clean |

### 7.4 The thin-wall rule over every default and preset

| Nozzle | Refusals |
|---|---|
| 0.4 mm | none (after D-1713; before it, the parts bin's defaults and two presets on the 0.6 mm and 0.55 mm recess skin) |
| 0.6 mm | the parts bin's compact preset, 1 mm lip wall (key-name rule, as before) |
| 1.5 mm | every 2 mm wall as before, plus 21 reported webs, ribs, ledges, and lips across nine products |

### 7.5 Golden records

Fourteen golden records unchanged. The parts bin's is re-recorded for the
new default wall: 688 triangles as before, volume 154,444.59 mm³ (was
141,805.64), file name hash `e65f30` (was `7e1edf`).

---

## 8. Open issues

1. **The page chunk is 602 KB against a 650 KB budget**, unchanged by this
   sprint. It holds Three.js and the viewer. The budget has room for the
   catalog but not for a second viewer feature of that size.
2. **The printer profile is not inside `validate`** (D-1712). The pots'
   bed constant and the shelf riser's one-piece height stay constants.
3. **Bore and socket compensation** still wait for printed records
   (20_KERNEL_MODULES_NOTES.md open issue 1, 24 follow-up 4).
4. **A first preview now costs one more round trip**: the geometry chunk
   loads after the worker starts. The browser suite's 5 s Ready budget
   measures it; see section 7.
5. **The primary review of S09 is still owed** (24_BRACKET_FAMILY_NOTES.md
   open issue 7). The retry in this sprint failed the same way, on server overload, twice. Run it when the primary reviewer is available.

6. **The parts bin's recess skin is 0.8 mm at the defaults**, exactly
   two widths of a 0.4 mm nozzle (D-1713). Record 8 decides whether that
   skin, backed by the lip below it, prints well; if not, the fix is a
   larger reserve or a thicker default wall, not a smaller nozzle.
7. **The key-name rule has a false positive.** The remote caddy's
   `frontWallHeight` matches on "Wall" and is reported as a wall. It is a
   height of 20 mm or more, so the rule never fires on it, but the list is
   wrong by one entry. Carried from 19_PRINTER_PROFILE_NOTES.md open
   issue 3; the caddy could supply `printedWalls` to filter it.
8. **A web narrowed at the mouth is reported at its narrowest.** The
   battery organizer's finger relief widens each well's mouth by 6 mm at
   the top, and the reported web is the web at that mouth, not the full
   web below it. That is the conservative reading; a person who wants the
   relief on a 1.5 mm nozzle sees the refusal.

---

## 9. Follow-ups

1. When a product needs the bed size or the bed height inside validation,
   add a `context` argument to `validate` in one contract sprint, and move
   the pots' bed constant and the riser's one-piece height onto it.
2. After the first three socket tray records exist, design the bore
   correction (20 follow-up 3) together with the peg and socket correction
   (24 follow-up 4), on the `compensable` shape this sprint extended.
3. When the catalog passes twenty products, split the registry chunk the
   way the geometry was split: a product's definition loads with its
   route, and the switcher reads a short catalog list.

---

## 10. Notes to record, from the spec

- **Chunk sizes before and after.** Section 7.
- **The rule for which features a product reports.** Section 3.2 and
  D-1703.
- **The mean rule for diameters.** Section 3.3 and D-1704.
