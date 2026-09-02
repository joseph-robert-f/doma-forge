# 18. Viewer Scale Notes

Date: 2026-09-02
Status: Implemented in this worktree (sprint S03). Revised after the
independent review of commit `4fed435`.
Reads with: sprints/S03_VIEWER_SCALE_AND_ORIENTATION.md, 02_SYSTEM_ARCHITECTURE.md

This document records sprint S03. The viewer derives its ground plane,
grid, fog, and shadow camera from the part's bounding box. It does this on
every model change. A product can offer a print-pose toggle.

This revision folds in the review's one blocking finding and its other
findings. Section 3 has new decisions for each fix. Section 6 corrects one
open issue. Section 8 is new.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/viewer-scale.ts` | New. Pure math: `computeViewerScale(box)` turns a bounding box into ground size, grid size and spacing, fog range, shadow camera bounds, and a camera distance. No Three.js import. Also exports `DEFAULT_BOUNDING_BOX`, the default tray's box, shared with `ModelViewer.tsx`. |
| `tests/viewer-scale.test.ts` | New. Unit tests for the default tray, for 40, 300, and 600 mm parts, and for the review fixes below. |
| `app/components/ModelViewer.tsx` | Calls `computeViewerScale` once at mount and again on every geometry change. Ground, grid, fog, and the shadow camera all update in place. Adds the `printOrientation?` prop, a "Print pose" toggle, and the rotation and re-seat that show it. |
| `lib/products/types.ts` | Adds `PrintOrientationHint` (`rotationDegrees: {x,y,z}` plus `note`) and the optional `printOrientation?` member on `ProductDefinition`. |
| `app/components/ProductApp.tsx` | Passes `product.printOrientation` to `ModelViewer`. One line. |
| `tests/browser/` | New. `capture-screenshots.mjs` and a `fixtures/` folder holding a standalone page. That page mounts the real `ModelViewer` with a 40 mm cube. Not part of `npm test`. Not in CI. |

`lib/products/drawer-tray/index.ts` is unchanged. The tray does not set
`printOrientation`. It needs no edit to skip the toggle.

### 1.2 Test results

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 124 cases (was 118 before the review fixes; see section 1.2 history below) |
| `npm run test:ssr` | Pass, 2 cases |

Test count history in this worktree: 97 cases at the start. This sprint's
own `npm ci` fixed a missing-`node_modules` gap; see Deviation 3. The
count rose to 118 after that fix and the sprint's first commit. The
review fixes added six more cases: four for grid-cell consistency across
sizes, one for the tall-part shadow camera, one for non-finite bounds.
The count now stands at 124.

---

## 2. The scale formula

`computeViewerScale(box)` takes a box `{ min: [x,y,z], max: [x,y,z] }` in
millimeters. It returns:

| Field | Meaning |
|---|---|
| `groundSize` | Full width and depth of the ground plane. |
| `gridSize` | Full width and depth of the reference grid. Always `gridDivisions × gridSpacing`. |
| `gridSpacing` | Millimeters per grid cell. Always 1, 5, 10, 50, or 100. |
| `gridDivisions` | The grid helper's division count. Computed before `gridSize`, not after; see Decision D-709. |
| `fogNear`, `fogFar` | Scene fog start and end distance. |
| `shadowExtent` | Half-width of the key light's orthographic shadow camera (left/right/top/bottom). |
| `shadowNear`, `shadowFar` | Shadow camera near and far planes. |
| `cameraDistance` | Distance at which a camera with the viewer's field of view frames a sphere of the part's bounding radius, with a small margin. Used only before any model has generated. Once a model is visible, `ModelViewer`'s own frame-fit logic takes over; that logic is unchanged, and was already scale-aware through the live camera aspect ratio. |

Three radii drive every field:

- `radius3d`, half the box's 3D diagonal. Drives `groundSize`, fog,
  `cameraDistance`, and (with `footprintRadius`) `shadowExtent`.
- `footprintRadius`, half the box's diagonal in X and Y only.
- `footprintLongestSide`, the longer of the box's X and Y size. Drives
  `gridSpacing`. The raw target is one grid cell per 1/15 of that side.
  The raw target snaps to the nearest of 1, 5, 10, 50, or 100 mm on a log
  scale. The five steps are treated as evenly spaced orders of magnitude,
  not evenly spaced numbers. See Decision D-704.

Constants (all in `lib/viewer-scale.ts`):

```
groundSize     = clamp(round(radius3d * 11, 100), 400, 6000)
gridSpacing    = snap(footprintLongestSide / 15, [1, 5, 10, 50, 100])
gridDivisions  = max(2, round(groundSize * 0.6 / gridSpacing))
gridSize       = gridDivisions * gridSpacing
shadowRadius   = max(footprintRadius, radius3d)
shadowExtent   = clamp(round(shadowRadius * 3.6, 50), 100, 3000)
shadowNear     = 20
shadowFar      = max(shadowNear + 100, shadowExtent * 2 + sizeZ * 4)
fogNear        = round(radius3d * 4.1, 50)
fogFar         = round(radius3d * 12.7, 50)
cameraDistance = radius3d / sin(halfFov) * 1.18   (halfFov from a 38° vertical FOV, aspect 1, floor 8°)
```

Every box first passes through a finite-number check. See Decision D-711.

The multipliers (11, 3.6, 4.1, 12.7, and the 1/15 grid target) came from
one exercise. Start from the values that were hard-coded in
`ModelViewer.tsx`. Work backward to a multiplier that reproduces each one
for the default tray's bounding box,
`[[-149.5, -99.5, 0], [149.5, 99.5, 50]]`. See Measurements below for the
worked numbers.

---

## 3. Decisions

**D-701. The scale module takes a bounding box, not a Three.js object.**
Chosen: `Box3Like = { min: [x,y,z], max: [x,y,z] }`, a plain type with no
Three.js import.
Alternative: take a `THREE.Box3` directly.
Reason: the function is unit-tested without a WebGL context. It needs no
Three.js dependency in the test file. `ModelViewer.tsx` converts its
`THREE.Box3` to this shape in two lines at each call site.

**D-702. `computeViewerScale` returns numbers only; `ModelViewer` applies them.**
Chosen: the module has no side effects and touches no scene graph.
Alternative: pass scene objects (ground mesh, grid helper, light) into the
module. Have it mutate them.
Reason: this keeps the math testable in isolation. It keeps `ModelViewer`
the only place that knows how to update a live Three.js scene: dispose old
geometry, replace the grid helper, call `updateProjectionMatrix`.

**D-703. The grid recreates itself; the ground and shadow camera update in place.**
Chosen: on every model change, `ModelViewer` disposes the old
`GridHelper` and builds a new one at the new size and division count.
`GridHelper`'s geometry is fixed at construction, so it has no other
option. The ground's `PlaneGeometry` is replaceable on the existing mesh.
The key light's shadow camera bounds are ordinary numeric properties.
Reason: this matches what each object actually allows. Recreating the
ground mesh or the light would be unnecessary work.

**D-704. Grid spacing snaps on a log scale.**
Chosen: nearest step by `|ln(raw) - ln(step)|` over `[1, 5, 10, 50, 100]`.
Alternative: nearest step by linear distance.
Reason: the five steps roughly double, or roughly 5x, from one to the
next. A linear nearest-match would almost always pick 50 or 100 for
anything above 25 mm. The gap between 10 and 50 is much wider in absolute
terms than the gap between 1 and 5. The log scale treats every step as an
equally sized jump. A 40 mm part reliably lands on 5 mm. A 600 mm part
reliably lands on 50 mm. Neither defaults toward the same coarse step. See
Measurements.

**D-705. `cameraDistance` assumes a 1:1 aspect ratio and is used once, at mount.**
Chosen: the pre-model camera position is `CANONICAL_VIEW * cameraDistance`.
It is computed from the default tray's bounding box. This replaces the old
hard-coded `camera.position.set(320, -420, 300)`.
Alternative: also use `cameraDistance` inside `frameModel` (the function
that fits the camera to whatever is currently visible).
Reason: `frameModel` already computes a fit distance from the camera's
real, live aspect ratio and field of view. It does this every time it
runs: on resize, on a model change, on Fit model, on Reset view. That is
strictly more accurate than a value computed from an assumed 1:1 aspect.
Duplicating that logic in the scale module would let the two calculations
drift apart. `cameraDistance` only stands in for the brief window before a
model has generated, when `frameModel` has nothing to fit to yet.

**D-706. `printOrientation` is a plain field, not a method.**
Chosen: `printOrientation?: { rotationDegrees: {x,y,z}; note: string }` on
`ProductDefinition`.
Alternative: `printOrientation?(parameters: P): {...}`, computed per
parameter set.
Reason: the spec asks for "a rotation... plus one line of text" for a
product that needs one. It does not ask for a value that depends on the
current parameters. Every family that needs this (brackets, in S09) prints
in one fixed pose, regardless of its dimensions. A method would cost every
call site a parameter it does not need yet.

**D-707. The toggle rotates the mesh; it does not touch the ground, grid, or scale.**
Chosen: `ModelViewer` sets `modelMesh.rotation` from
`printOrientation.rotationDegrees`, X then Y then Z, degrees to radians.
It calls the existing `frameModel(false)` to refit the camera. The ground
and grid are not recomputed on a pose toggle.
Reason: `frameModel` already recomputes the object's world-space bounding
box with `Box3.setFromObject`. That reflects the rotation, so the camera
refits correctly. The ground and grid describe the workshop, not the
part. They do not need to change because the part turned over. Rescaling
them on every toggle click would cost something too. The grid spacing
could flicker between two snapped values. That happens for a part whose
rotated silhouette crosses a snap boundary. The flicker would distract
from the one thing the toggle is meant to show.

**D-708. The screenshot fixture mounts the real `ModelViewer`, built with the project's own Vite.**
Chosen: `tests/browser/fixtures/` is a tiny standalone page. It is
`index.html` plus `cube-fixture-entry.tsx`. It imports
`app/components/ModelViewer.tsx` directly. It gives that component a
hand-built 40 mm cube. `tests/browser/capture-screenshots.mjs` bundles the
page with `vite.build()` and `@vitejs/plugin-react`. Both are already
project devDependencies. The script serves the bundle with
`vite.preview()`. It screenshots the bundle with the Playwright harness
from the common brief, alongside the real production tray page.
Alternative: hand-roll a scene in plain Three.js that mimics `ModelViewer`.
Or wait for a real small product to exist.
Reason: no product this small exists yet; that is S05 onward. The sprint
needs a same-code comparison now. Bundling the actual component, not a
lookalike, is the only way a screenshot of it means anything. This
script is explicitly out of `npm test` and out of CI. Using the project's
own `vite` and `@vitejs/plugin-react` avoids adding a new dependency for
it.

**D-709. `gridDivisions` is computed first; `gridSize` is derived from it.**
Chosen: `gridDivisions = max(2, round(groundSize * 0.6 / gridSpacing))`,
then `gridSize = gridDivisions * gridSpacing`.
Rejected (this sprint's first commit): `gridSize = groundSize * 0.6`, then
`gridDivisions = round(gridSize / gridSpacing)`.
Reason: the rejected order rounds `gridDivisions` from a `gridSize` that
was not itself a multiple of `gridSpacing`. For a 600 mm cube, that gave
`gridSize = 3420` and `gridDivisions = 68`. The rendered cell came out at
`3420 / 68 = 50.294 mm`, not the 50 mm `gridSpacing` promised. Deriving
`gridSize` from the rounded `gridDivisions` fixes this. It makes
`gridSize / gridDivisions === gridSpacing` exactly, for every input.
`tests/viewer-scale.test.ts` checks this for 40, 300, 600, and 2000 mm
parts. Found in the independent review of commit `4fed435`.

**D-710. Shadow camera extent uses the larger of the footprint radius and the 3D radius.**
Chosen: `shadowRadius = max(footprintRadius, radius3d)`, feeding
`shadowExtent`.
Rejected (this sprint's first commit): `footprintRadius` alone.
Reason: `footprintRadius` only looks at X and Y. A tall, narrow part, say
40 × 40 × 600 mm, has a small footprint but a large 3D radius. The old
formula clamped `shadowExtent` to its 100 mm floor for that part: far too
narrow to cover its shadow. `radius3d` also accounts for height, so it is
always at least as large as `footprintRadius`. The `max` widens the
shadow camera exactly when height demands it. It leaves the shadow camera
unchanged for a flat, wide part like the default tray.
`tests/viewer-scale.test.ts`
checks this with a 40 × 40 × 600 mm box. Found in the independent review.

**D-711. Non-finite bounds fall back to `DEFAULT_BOUNDING_BOX`, not to `NaN` propagation.**
Chosen: `computeViewerScale` checks every component of `box.min` and
`box.max` with `Number.isFinite`. If any component is `NaN` or
`Infinity`, the function substitutes `DEFAULT_BOUNDING_BOX` instead. That
constant is now exported from `lib/viewer-scale.ts`. `ModelViewer.tsx`'s
own mount-time call reuses it too, instead of duplicating the box in two
files.
Alternative: let a bad box propagate. `Math.max(1, NaN)` is `NaN`, and
`Box3.isEmpty()` does not catch it, so this used to reach the renderer as
a blank scene with no error.
Reason: a caller's own bug, or a mesh whose bounds have not settled yet,
must not blank the viewer. Falling back to a known-good box keeps the
scene populated and gives a person something to look at while the actual
cause gets fixed. `tests/viewer-scale.test.ts` checks a `NaN` and an
`Infinity` case against the fallback. Found in the independent review.

**D-712. The print pose re-seats the part on the ground after rotating it.**
Chosen: after setting `modelMesh.rotation`, the effect resets
`modelMesh.position.z` to 0, calls `updateMatrixWorld(true)`, measures the
rotated part's own world-space bounding box, and sets
`modelMesh.position.z = -bounds.min.z`. Turning the toggle off resets both
rotation and position to zero.
Rejected (this sprint's first commit): rotate only, leave `position.z` at
0.
Reason: a rotation turns about the mesh's local origin, not about the
part's own base. A 90°-about-X rotation on a part built with its base at
Z = 0 puts half the part below Z = 0, below the ground. Re-seating after
the rotation fixes this. It measures the part's own bounds instead of
using a formula. That way it works for any rotation the toggle sets, not
only a multiple of 90°.
Verified with a standalone script outside the browser. It repeats the
same rotate-reset-measure-lift steps, then calls `Box3.setFromObject`.
The print pose comes out with `min.z` equal to 0, to machine precision.
Toggling back off restores the exact original bounds. Found in the
independent review.

**D-713. The shadow map is not disposed on a scale update.**
Chosen: `applyViewerScale` sets the shadow camera's `left`, `right`,
`top`, `bottom`, `near`, `far`, and calls `updateProjectionMatrix()`. It no
longer calls `keyLight.shadow.map?.dispose()` or sets `shadow.map = null`.
Rejected (this sprint's first commit): dispose and null the shadow map on
every model change. That forced Three.js to reallocate its depth-target
texture on the next render.
Reason: changing an orthographic camera's projection bounds does not
invalidate its depth-target texture. The renderer already redraws that
texture's contents every frame the shadow camera or the scene changes.
Freeing and reallocating the texture itself added a needless allocation
on every model change, with no correctness benefit. Found in the
independent review.

**D-714. `PW_HARNESS_DIR` is a required environment variable, not a hard-coded default.**
Chosen: `tests/browser/capture-screenshots.mjs` reads `PW_HARNESS_DIR`
from the environment. If it is unset, or set to a path that does not
exist, the script exits immediately with a message naming the problem.
Rejected (this sprint's first commit): a hard-coded default. It pointed
at this session's own scratch path. That path carries a session UUID no
other session or person can reuse.
Reason: the Playwright harness lives outside this repository, in a
per-session scratch directory. Its path is not something the script can
know or guess correctly for a different session or a different person's
machine. Failing fast with a clear message is more useful than silently
trying, and failing later, against a path that happens not to exist.
Found in the independent review.

---

## 4. Deviations from the spec

1. **Grid spacing at the default tray changed from 20 mm to 10 mm.** The
   spec asks for grid spacing snapped to one of `[1, 5, 10, 50, 100]`. The
   value that reproduces the old hard-coded look, `GridHelper(1200, 60,
   ...)`, is 20 mm. That value is not one of the five allowed steps. Every
   other value the scale module returns for the default tray reproduces
   the old constant exactly. Ground size is 2000, fog is 750/2300, shadow
   bounds are ±650, shadow far is 1500. Grid spacing is the one place
   where "snap to the
   allowed steps" and "keep the current look" cannot both hold. The spec's
   grid requirement is explicit, so it wins. The default tray now shows a
   10 mm grid instead of 20 mm: twice as many lines, still readable. See
   Measurements for the screenshot comparison. This is a visible but minor
   change. A person comparing the two screenshots side by side would need
   to look closely to notice it. Section 8 records the honest limit of
   that claim: it is this agent's own assessment, not a person's.
2. **The initial, pre-model camera position moved from magnitude ≈607 to
   ≈657.** The old value was hand-placed. The new value comes from
   `computeViewerScale`'s `cameraDistance` formula, run on the default
   tray's bounding box. The same one formula now serves both the unit
   tests and the viewer. In practice this change is invisible: the
   pre-model camera position is overwritten by `frameModel` within one
   render, as soon as any geometry loads. For the default tray, that
   happens well before a person sees a frame.
3. **This worktree's `node_modules` was empty on arrival.** Only Vite
   caches were present. `manifold-3d` and everything else were missing.
   `tests/app.integration.test.tsx` failed with `Denied ID
   /home/user/doma-forge/node_modules/manifold-3d/manifold.wasm?url`.
   Vite's module transform resolved the missing package by walking up past
   this worktree, into the main checkout's `node_modules`. It then refused
   to serve a file outside the worktree. This reproduced identically on
   the unmodified `main` branch, checked with `git stash`. It is a
   pre-existing environment gap, not something this sprint introduced. The
   fix was `npm ci` in this worktree, which is not itself a code change.
   This is not a deviation from the spec's content. It is recorded here
   because the "97 tests" figure in section 1.2 briefly read "98 passed, 1
   file failed" before that install.

---

## 5. Measurements

Worked numbers from `computeViewerScale`, cross-checked against a small
Node script and the unit tests, after the review fixes:

| Bounding box | groundSize | gridSize | gridSpacing | shadowExtent | shadowFar | fogNear/Far | cameraDistance |
|---|---|---|---|---|---|---|---|
| Default tray, 299×199×50 mm | 2000 | 1200 | 10 mm | 650 | 1500 | 750 / 2300 | ≈657 |
| 40 mm cube | 400 | 240 | 5 mm | 100 | 360 | 150 / 450 | ≈126 |
| 300 mm cube | 2900 | 1740 | 10 mm | 950 | 3100 | 1050 / 3300 | ≈942 |
| 600 mm cube | 5700 | 3400 | 50 mm | 1850 | 6100 | 2150 / 6600 | ≈1883 |
| 2000 mm cube | 6000 (clamped) | 3600 | 100 mm | 3000 (clamped) | 14000 | 7100 / 22000 | ≈6278 |
| 40×40×600 mm, tall and narrow | 3300 | 1980 | 5 mm | 1100 | 4600 | 1250 / 3850 | ≈1092 |

Every `gridSize / gridDivisions` in this table equals its own row's
`gridSpacing`, exactly. This was not true before Decision D-709; see
that entry for the 600 mm cube's old, wrong 50.294 mm cell.

`shadowExtent` for the 300 and 600 mm cubes is larger than it was before
Decision D-710: was 750 and 1550, is now 950 and 1850. This is not a
regression. A cube's 3D radius is always a little larger than its
footprint radius. A boxy part now gets a slightly more generous shadow
camera on every axis, not only on a tall, narrow one. The default tray's
`shadowExtent` is unaffected; it is still 650. A flat part's footprint
radius and 3D radius are already close to each other.

Every default-tray field except `gridSpacing` and `cameraDistance`
matches the value that was hard-coded in `ModelViewer.tsx` before this
sprint. The match is exact: 2000, 1200 (as `gridSize`), 650, 1500, 750,
2300. See Deviations for those two exceptions.

### Screenshots

Captured with `tests/browser/capture-screenshots.mjs`, against a
production build (`npm run build && npm run start`), at three points:

1. Before this sprint's change, using `git stash` to run the unmodified
   `ModelViewer.tsx` against the same script and fixture.
2. After this sprint's first commit (`4fed435`).
3. After the review fixes in this revision.

Set 2 and set 3 look the same to the eye, for the default tray and for
the cube. The review fixes changed shadow-camera math for cube-like and
tall-narrow parts. They also fixed the print pose. Neither the default
tray nor the flat 40 mm cube fixture exercises any of those three
changes. Section 8 lists the exact files kept from set 1 (before) and set
3 (after, current).

| Screenshot | Before | After |
|---|---|---|
| Default tray | Box centered. Same framing. Same shadow softness. Grid barely visible at this camera distance, in both. | Same framing and shadow. No visible regression. |
| 40 mm cube | Cube fills the frame about as well as the tray does; the existing `frameModel` fit logic was already scale-aware. But no grid line is visible anywhere near the cube. The fixed 20 mm-cell, 1200 mm grid is too coarse, and too far away at this zoom, to show up. The shadow is a large, soft, faint smear, disproportionate to the object: the shadow camera's fixed ±650 mm bounds spread its 1024×1024 shadow map over an area 16 times the cube's footprint. | Cube still fills the frame the same way. A crisp 5 mm grid is now clearly visible around its base. The shadow is a tight, well-defined shape, sized to the cube. |
| Print pose | N/A. The toggle did not exist. | Verified with a scratch fixture (a 20×80×15 mm bracket given a 90°-about-X `printOrientation`): the "Print pose" button appears only when `printOrientation` is set, shows the one-line note text, and clicking it rotates the part into its print pose and refits the camera. A separate, non-visual check (Decision D-712) confirms the part's lowest point lands exactly at Z = 0 after the rotation, not below it. |

---

## 6. Open issues

1. **The key light's height does not scale.** `keyLight.position.z` stays
   at 520 mm, regardless of part height. Decision D-710 fixed
   `shadowExtent` to widen with `radius3d`, so a tall part's shadow camera
   now has wide enough horizontal bounds. But that fix does not touch the
   light's own height. A part taller than roughly 500 mm would rise above
   the light itself. No amount of shadow camera bound tuning fixes a light
   that sits below the object it is meant to light. This sprint's scope
   (ground, grid, fog, shadow camera bounds, camera distance) does not
   list light position. Moving the light is out of scope here. S04's
   printer-profile work, and later product sprints, should watch for this
   once a product that tall exists. This paragraph replaces an earlier
   version. That version blamed the shadow camera bounds for the same
   problem. That blame was only half right; D-710 fixed the other half.
2. **`shadowNear` is a constant** (20 mm), for the same light-height
   reason as above. It happens to reproduce the old default-tray value
   exactly. It is safe for every size in the Measurements table. But it is
   not derived from anything in `computeViewerScale`.

---

## 7. Follow-ups

1. The drawer tray's own minimum is 80 mm on each of width and depth.
   When S05 or later adds a real product smaller than that, replace the
   `tests/browser/fixtures/` cube with it, or add a screenshot of it.
   Retire the synthetic fixture once it is no longer needed for
   comparison.
2. When S09 adds the bracket family, the first consumer of
   `printOrientation`, confirm the rotation convention here still fits.
   `rotationDegrees` applies in mesh-local order, X then Y then Z. If a
   bracket needs a different rotation order, or a pivot other than the
   part's own origin, that is a contract change. It belongs to that
   sprint, not to a silent change here.
3. If the key light's position and `shadowNear` ever need to scale too
   (Open issue 1), extend `computeViewerScale`'s return shape. Do not add
   a second, parallel calculation in `ModelViewer.tsx`.

---

## 8. Screenshot evidence for the integrator

The "tolerance a person accepts" wording in the spec's Acceptance section
describes a person's judgment. Every screenshot comparison in this
document is this agent's own visual read of the PNGs below. That
includes the default-tray "no visible regression" claims. None of it is
a person's sign-off. Treat it as a first pass, not a final one.

The PNGs are not committed to the repository. They live in this
session's scratch directory. That directory is not guaranteed to survive
past this session. The integrator should pull the files below into the
pull request before they go stale. The alternative is to ask this agent
to regenerate them, with `tests/browser/capture-screenshots.mjs`, in a
session where the scratch directory is still live. That script's usage
is in its own header comment.

Files, as of this revision (all PNG, all captured at devicePixelRatio 1):

| File | Pixel size | Bytes | What it shows |
|---|---|---|---|
| `screenshots-before/default-tray.png` | 817 × 700 | 118,392 | Default tray, unmodified `ModelViewer.tsx` (`git stash`). |
| `screenshots-before/cube-40mm.png` | 1282 × 802 | 76,928 | 40 mm cube fixture, unmodified `ModelViewer.tsx`. |
| `screenshots-after/default-tray.png` | 817 × 700 | 150,640 | Default tray, this revision (after the review fixes). |
| `screenshots-after/cube-40mm.png` | 1282 × 802 | 121,187 | 40 mm cube fixture, this revision. |
| `print-pose-check/pose-off.png` | 1002 × 702 | 126,328 | Scratch bracket fixture, print pose off (modeled pose). |
| `print-pose-check/pose-on.png` | 1002 × 702 | 128,944 | Scratch bracket fixture, print pose on, after the D-712 re-seat fix. |

All six files sit under this session's scratch root, at
`S03/screenshots-before/`, `S03/screenshots-after/`, and
`S03/print-pose-check/`. The default-tray and cube-40mm "before" and
"after" byte sizes differ. Production builds are not byte-identical run
to run: asset hashes and timestamps in the bundle both change. The pixel
dimensions match exactly. That is what the visual comparison actually
depends on.
