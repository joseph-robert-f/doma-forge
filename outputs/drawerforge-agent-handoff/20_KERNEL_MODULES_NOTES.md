# 20. Kernel Modules and the Socket Tray Notes

Date: 2026-09-02
Status: Implemented on the S05 sprint branch.
Reads with: sprints/S05_KERNEL_MODULES_AND_SOCKET_TRAY.md,
10_MULTI_PRODUCT_EXPANSION_PLAN.md sections 1.3, 1.6, 2.2, 2.5,
11_PRODUCT_REGISTRY_REFACTOR_NOTES.md, 17_PRODUCT_ROUTES_NOTES.md,
19_PRINTER_PROFILE_NOTES.md

This document records sprint S05. It adds the shared kernel modules that
every family B product uses, moves the drawer tray onto the shell module
with its mesh unchanged, and ships the bit, socket, and driver tray as the
reference product. Every later product sprint reads section 2, the module
API, and section 3, the rules a family B product follows.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/kernel/shell.ts` | `BOOLEAN_OVERLAP`, `roundedSlab`, `shellFromProfiles`, `roundedShell`. The shelled-tray pattern. |
| `lib/kernel/arrays.ts` | `solvePitch`, `cutterArray`, `unionSolids`, `boreCutter`. The comb-array pattern. |
| `lib/kernel/profiles.ts` | Adds `polygon` and `chamferedCircle`. `roundedRectangle` is unchanged. |
| `lib/kernel/lightening.ts` | `planLightening`, `lightenUnderside`. Underside pockets with a bridge limit. |
| `lib/products/drawer-tray/geometry.ts` | Uses `roundedShell` for the outer body and the cavity. Nothing else changed. |
| `lib/products/socket-tray/` | `copy.ts`, `schema.ts`, `validate.ts`, `geometry.ts`, `presets.ts`, `index.ts`. |
| `lib/products/registry.ts` | Registers `socketTray` after `drawerTray`. |
| `tests/helpers/mesh-checks.ts` | `closedEdgeCounts`, `connectedComponentCount`, `horizontalSliceTopology` for any product. |
| `tests/kernel-modules.test.ts` | 20 cases: the pitch solver at the boundary, the array with 1, 2, and 24 cutters, the bore cutter and the exact chamfer depth, the profiles, the shell, the lightening planner, the corner clip. |
| `tests/socket-tray.test.ts` | 30 cases: presets, layout, every validation rule including the corner rule and a cleared field, the file name, the derived values, six geometry cases, the conflict case, slice topology, the pocket grid at a large corner radius, the chamfer, mesh quality, the kernel time, the STL round trip, the golden record. |
| `README.md` | The "Bit, socket, and driver tray" section, the code layout, the geometry paragraph. |

The product contract in `lib/products/types.ts` did not change. No member
was added and no member changed.

### 1.2 Test counts

| Gate | Before | After |
|---|---|---|
| Vitest | 212 in 12 files | 269 in 14 files |
| Server render | 5 | 5 |
| Drawer tray golden record | 362 triangles, volume 277462.54 | unchanged |

---

## 2. Module API

All lengths are millimeters. Every function that returns a solid gives the
caller the only reference. The caller deletes it. A function that takes a
solid says whether it deletes it.

### 2.1 `shell.ts`

- `BOOLEAN_OVERLAP = 0.2`. The hidden overlap that keeps Boolean faces off
  each other. Every module and every product uses this one value.
- `roundedSlab(kernel, { width, depth, height, cornerRadius, segments })`.
  A centered rounded rectangle extruded from Z = 0 to `height`. The starting
  body of a family B product.
- `shellFromProfiles(outerProfile, innerProfile, height, baseThickness)`.
  Extrudes the outer profile, subtracts the inner profile extruded from the
  base up through the top. Returns `{ outer, shell }`. Does not delete the
  profiles.
- `roundedShell(kernel, { width, depth, height, cornerRadius, wallThickness, baseThickness, segments })`.
  The shelled-tray pattern: the inner profile is smaller by the wall on
  every side, with the corner radius reduced by the wall and clamped at
  zero. Returns `{ outer, shell }`. A product keeps `outer` to clip internal
  features, then deletes both.

### 2.2 `arrays.ts`

- `solvePitch({ span, count, cutterSize, minimumWeb })`. Lays `count`
  cutters of `cutterSize` evenly along `span` with the same web between
  neighbours as at each end: `web = (span − count × size) / (count + 1)`,
  `pitch = size + web`, `firstCenter = −span / 2 + web + size / 2`. Returns
  `{ ok: true, pitch, web, firstCenter }` or `{ ok: false, web, minimumWeb }`.
  A negative `web` means the cutters overlap. The solver names no field;
  the product does.
- `cutterArray(kernel, factory, { pitchX, pitchY, countX, countY, origin })`.
  Calls `factory` once, places translated copies on the grid, unions them
  in one batch. Deletes the factory's solid. Throws on a count under 1.
- `unionSolids(kernel, solids)`. One batched union that deletes every input.
  One input is returned as is. An empty list throws.
- `boreCutter(kernel, { diameter, depth, chamfer, segments, topZ })`. A
  flat-bottomed cylinder that enters the face at `topZ`, goes down `depth`,
  and overshoots the face by the overlap. `chamfer > 0` adds the 45 degree
  cone from `chamferedCircle`. The X and Y origin is the bore axis.

### 2.3 `profiles.ts`

- `polygon(kernel, points)`. A cross-section from at least three points.
  The kernel fixes the winding.
- `chamferedCircle(kernel, radius, chamfer, segments)`. The cone cutter for
  a chamfered bore: a frustum of height `chamfer + 0.2` whose bottom radius
  is `radius` and whose top radius is `radius + chamfer + 0.2`, so the slope
  is 45 degrees over the whole height. Place its base `chamfer` below the
  face. Returns a solid, not a cross-section; see D-905.

### 2.4 `lightening.ts`

- `planLightening({ width, depth, cornerRadius, rim, pocketDepth, maximumSpan, web, pocketRadius, segments })`.
  Pure. Splits the area inside the rim into a grid of pockets so that no
  pocket is wider than `maximumSpan` on either axis. Returns
  `{ countX, countY, spanX, spanY, pocketDepth }` or null when the pocket is
  shallower than 1 mm, the slab is under 8 mm inside the rim, or a value is
  not finite.
- `lightenUnderside(kernel, slab, options)`. Cuts the planned grid up from
  Z = 0, clipped to the outer profile inset by the rim (corner radius
  `cornerRadius − rim`, clamped at zero), so a corner pocket follows a
  large outer corner instead of cutting through it. Returns
  `{ solid, plan }`. Deletes `slab` when it cuts; returns `slab` untouched
  with `plan: null` when there is no plan.

---

## 3. Rules every family B product follows

1. Start with `roundedSlab`. Subtract one batched union of every cutter.
   Then subtract the lightening. Three Booleans, whatever the count.
2. Solve every layout with `solvePitch` in a pure `deriveLayout` function in
   `schema.ts`. Validation, derived values, and generation read the same
   layout. Generation refuses a layout that validation rejects.
3. The minimum web is 2.5 mm between cutters and between a cutter and the
   rim. The solver enforces it; the product's message names the row, the
   count, the size, the web, and the fix.
4. A cutter depth never exceeds the height minus the base. The base the user
   sets is the base under the cutters.
4a. The layout is solved in the inner rectangle, and the end cutters of every
   row are then checked against the rounded outer corners with
   `boreClearsCorner`. A corner that would cut a cutter open is a validation
   error on `cornerRadius` that names the largest radius that fits.
4b. `deriveLayout` never throws. A cleared field holds NaN until the user
   types again; the layout then reports "does not fit" and validation
   reports the field. The form calls `derive` on every keystroke, so a
   throw here would take the page down.
5. Underside pockets go through `lightenUnderside` with a bridge limit of
   40 mm. A part prints with the pockets on the bed, so each pocket ceiling
   is a bridge. Governance rule 10: a feature that needs supports is a
   failed feature.
6. Each product keeps a kernel-free `copy.ts` with its `*_ID` export, so the
   server-render test can read the id under plain Node (D-603).
7. Mesh checks come from `tests/helpers/mesh-checks.ts`. A product's geometry
   test slices above its base and counts one outer contour and one hole per
   cutter.

---

## 4. Decisions

**D-901. The drawer tray moves onto `roundedShell` with no mesh change.**
`roundedShell` runs the same kernel calls in the same order as the original
geometry: outer profile, extrude, inner profile with the radius reduced by
the wall and clamped at zero, extrude with the overlap, translate to the
base, subtract. The golden record (362 triangles, volume 277462.54, bounds
±149.5 × ±99.5 × 50) is unchanged and its test did not change. Only the
delete order of the profiles differs, and a delete does not touch geometry.

**D-902. The pitch solver uses one web everywhere.** The web between two
cutters equals the web between a cutter and the span end. The alternative,
cells of equal pitch with the cutter centered in each, gives an end web of
half the inner web and a rim that looks wrong. With one web, a single cutter
is centered and every count divides the span the same way.

**D-903. The solver takes the cutter size.** The spec lists span, count, and
minimum web. A pitch cannot be solved without the cutter's size along the
span, so the request carries `cutterSize`. The result carries `firstCenter`
so a product does not recompute it.

**D-904. The solver returns a result; the product writes the message.** The
kernel knows no field names. `validateSocketTray` maps a rejected row
layout to `holesPerRow` and a rejected row spacing to `rows`. Each message
names the row, the count, the bore, the web, the minimum, and the three
fixes (fewer, smaller, wider or deeper), per governance rule 11.

**D-905. `chamferedCircle` returns a solid.** The spec calls it a profile
and a cone cutter in one line. A cone is a solid, so the function returns
a `Manifold`. It lives in `profiles.ts` because the spec puts it there. Its
slope is 45 degrees over its whole height, including the 0.2 mm overshoot,
so the mouth of the bore is a true chamfer.

**D-906. Rows are limited to four, with one diameter field per row.** The
spec asks for a bore diameter per row. The contract has flat number
parameters, so the schema has `boreDiameter1` to `boreDiameter4` and `rows`
from 1 to 4. A diameter above the row count is ignored by the layout, by
validation, and by generation, but it stays in the signature and the file
name hash because it is a parameter (governance rule 1). The group text
says so.

**D-907. Row 1 is at the front (negative Y).** Rows are placed by the row
spacing solved for the widest bore, so every row sits on the same pitch.

**D-908. The chamfer is a constant 0.8 mm behind a boolean.** Governance
rule 1 wants one parameter per feature; the feature is "chamfer on or off".
With a 2.5 mm web and a 0.8 mm chamfer on each side, the flat ridge between
two bore mouths is 0.9 mm wide. That ridge is a sloped edge, not a wall, so
it is not a thin-wall case.

**D-909. Underside pockets are a boolean with fixed rules.** Bridge limit
40 mm, rib 2.5 mm, pocket corner radius 2 mm, pocket depth
`height − boreDepth − base`. With the defaults the pocket is 4.6 mm deep in
a 5 × 3 grid. When the bore depth reaches its limit the pocket depth is zero
and the planner returns null, so the tray is solid and the derived line
says "none".

**D-910. The socket tray is compensated on its outside size only.**
`compensable: { x: ["trayWidth"], y: ["trayDepth"] }`, the same semantics as
the drawer tray. The bores are not compensated; see open issue 1.

**D-911. Presets are named by drive size, not by brand.** Quarter-inch,
half-inch, and driver bits. The bore values are typical outside diameters
and the README says to measure.

**D-912. `tests/helpers/mesh-checks.ts` duplicates the drawer tray's test
helpers.** The drawer tray's golden test file stays untouched by rule. The
helpers are copied, not moved. Follow-up 1 removes the copy.

**D-913. The kernel time test allows two seconds.** The spec's threshold is
one second and the measured value is 0.3 s. A CI runner can be two to three
times slower than this environment, so the test allows two seconds: a
regression to the size of the threshold fails, a slow runner does not. The
measured value is in section 6.

**D-914. A large corner radius is checked against the end bores.** Found in
review. The layout is solved in the rectangle inside the rim, and that
rectangle is not inside the outer profile when the corner radius is large.
With a 60 × 40 tray, a 20 mm corner, 5 mm bores, and a 1.2 mm rim, the four
corner bores opened into the outside while every other check passed. The
fix is a validation rule, not a clamp: the rule names `cornerRadius` and
the largest radius that keeps every end bore inside the wall, found by
stepping down in the field's own 0.5 mm steps. A chamfered mouth is wider
by the chamfer, so that is the radius checked. The golden record and the
presets are unaffected.

**D-915. Underside pockets are clipped to the inset outer profile.** Found in
review. The same rectangle-versus-corner defect opened the corner pockets
at a large corner radius. The pocket grid is intersected with the outer
profile inset by the rim, the way the drawer tray clips its dividers to the
outer body. For the defaults the clip radius is 1 mm and the pocket radius
2 mm, so the clip does not touch the defaults and the golden record is
unchanged; the test suite confirms it.

**D-916. "Base under bores" reports the printed material.** Found in
review. With pockets, the material under a bore floor is the base
thickness; without pockets it is the height minus the bore depth. The
derived line now shows whichever is true. With the defaults it reads
2.4 mm, not 7 mm.

---

## 5. Deviations from the spec

1. The heavy case is 12 by 4 bores, not 8 by 6. Rows are limited to four
   (D-906). Both are 48 bores; the array width is the harder case for the
   pitch solver.
2. The `shell.ts` spec line reads "extrude a profile and subtract an
   inward-offset cavity". The module offers both `shellFromProfiles` for any
   two profiles and `roundedShell` for the rounded-rectangle case, because
   the drawer tray's inner profile is a rounded rectangle with a reduced
   radius, not a kernel offset of the outer one. A kernel offset would change
   the drawer tray's mesh.
3. The printed coupon record is prepared in `sprints/PRINT_RECORDS.md` under
   "Socket tray" with the target values for the defaults. It lands in the
   S12 integration commit on the same branch, not in the S05 commit, because
   S12 owns that file. It is not filled; a person prints and measures.

---

## 6. Measurements

Kernel time in this environment, Node 22, one warm kernel, measured in
`tests/socket-tray.test.ts` and in a scratch run. Times include the mesh
copy out of WebAssembly memory.

| Case | Bores | Pockets | Quality | Triangles | Time |
|---|---|---|---|---|---|
| Defaults, 200 × 110 × 25 | 2 × 8 | 5 × 3 | standard | 4092 | 81 ms |
| Quarter-inch preset | 2 × 7 | 4 × 3 | standard | 3468 | 41 ms |
| Half-inch preset | 2 × 6 | 7 × 4 | standard | 4972 | 49 ms |
| Driver bits preset | 1 × 12 | none | standard | 1836 | 22 ms |
| Minimum, 60 × 40 × 10 | 1 × 1 | 2 × 1 | standard | 380 | 7 ms |
| Maximum, 400 × 300 × 60 | 4 × 12 | none | standard | 7020 | 89 ms |
| Heavy, 400 × 300 × 40 | 4 × 12 | 10 × 8 | fine | 30668 | 297 ms |
| 300 × 200 × 25, no pockets | 4 × 8 | none | fine | 9420 | 88 ms |

The heavy case is under the spec's one second threshold by a factor of
three. The worker's terminate threshold does not need tuning.

Golden record at geometry version 1, defaults: 4092 triangles, volume
412174.09, bounds [−100, −55, 0] to [100, 55, 25].

Browser smoke: see section 6.1.

### 6.1 Browser smoke

Recorded after the production build in this environment with Chromium
under software WebGL.

| Step | Result |
|---|---|
| `/products/socket-tray` first Ready | 1.9 s after navigation, "Ready · 200 × 110 × 25 mm · 2 × 8 bores" |
| Page title | "DrawerForge — Bit, Socket, and Driver Tray" |
| Product switcher | 2 links, the socket tray marked current |
| Fit-test button | not rendered; the product has no coupon |
| Download STL, defaults | `drawerforge-socket-tray-200x110x25-2x8-5561e9.stl`, 4092 triangles, 204684 bytes |
| Preset "Half-inch drive set" | Ready, `drawerforge-socket-tray-260x130x32-2x6-0da6d2.stl`, 4972 triangles |
| Conflict: 12 bores per row on that preset | Error under the field: "Row 1: 12 bores of 27 mm do not fit in the 256 mm inside the rim. Use fewer bores per row, a smaller row 1 bore, or a wider tray." Download disabled. Status "Paused · Fix 2 settings; showing the last valid model." |
| Back to 6 bores per row | Ready, the same file as before the conflict |
| Switch to the drawer tray and back | Both titles correct; the socket design keeps 6 bores per row |
| Console errors | Only the known local WebAssembly MIME fallback (12_..., D-1003). No other error. |

---

## 7. Open issues

1. **Bore diameter is not compensated.** The printer correction from S04
   applies to the outside width and depth. A hole prints small by roughly
   the same amount the outside prints small, but in the other direction.
   The fit that matters for this product is the bore. A per-feature hole
   correction is a printer profile change, not a product change, and needs
   a printed record first.
2. **Four rows maximum.** A tray with more rows needs either more diameter
   fields or a per-row list parameter, which the contract does not have.
3. **The diameter fields of unbuilt rows stay visible.** The form renders
   every spec. A "hidden when" rule on a spec would be a contract change.
4. **No printed record yet.** The socket tray has a prepared record with
   target values only. Governance rule 6 needs one filled record before
   wave 1 is called done.
5. **The webs are not checked against the nozzle.** The printer profile's
   thin-wall rule reads parameters whose key names a wall or a thickness,
   so it sees the rim and the base. It cannot see the solved webs, which are
   this product's real thin features. At a nozzle of 1.5 mm or more, two
   nozzle widths exceed the 2.5 mm minimum web and nothing reports it.
   Passing the nozzle into the layout, or the solved webs into the
   thin-wall check, is a contract question for the next product sprint.
6. **Bed contact.** With the defaults the pockets leave a 2 mm rim and
   2.5 mm ribs on the bed, about 15 percent of the footprint. The README
   says to use a brim if the first layer lifts. A printed record decides
   whether the rib width needs to grow.
7. **The ridge between two chamfered mouths at the minimum web is 0.9 mm.**
   It builds cleanly and it is a sloped edge, not a wall (D-908). The
   derived line reports the 2.5 mm web at the bore wall, not the ridge.

---

## 8. Follow-ups

1. Move `tests/geometry.test.ts` onto `tests/helpers/mesh-checks.ts` in a
   test-only change, once someone is ready to touch that file on purpose.
2. Family B products in S06 (battery organizer, marker block, fin rack) start
   from `roundedSlab`, `solvePitch`, `cutterArray`, and `lightenUnderside`,
   and follow section 3. The fin rack's cutter is a prism from `polygon`.
3. Consider a hole correction in the printer profile after the first three
   socket tray records exist (open issue 1).
4. The fit-test coupon import in `ProductApp.tsx` is still drawer-tray
   specific (16_FIT_TEST_COUPON_NOTES.md). The socket tray has no coupon, so
   nothing changed here; a family B coupon would be one bore in a small
   slab.
