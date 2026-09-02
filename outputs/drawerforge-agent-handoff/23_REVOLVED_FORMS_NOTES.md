# 23. Revolved Forms and the Card Holder Notes

Date: 2026-09-02
Status: Implemented on the S08 sprint branch.
Reads with: sprints/S08_REVOLVED_FORMS.md,
10_MULTI_PRODUCT_EXPANSION_PLAN.md sections 1.6, 2.3, 2.5, 2.6,
20_KERNEL_MODULES_NOTES.md sections 2 and 3,
19_PRINTER_PROFILE_NOTES.md, 25_BROWSER_QA_NOTES.md, 27_PRINT_PROGRAM_NOTES.md

This document records sprint S08. It adds the revolve kernel module, the two
family D products (the plant pot saucer and the nursery plant pot), and the
card and cartridge slot holder, which is a family B preset of the cutter
array with a tilted prism cutter.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/kernel/revolve.ts` | New. `REVOLVE_SEGMENTS`, `rimArcSegments`, `clampRimRadius`, `buildVesselProfile`, `revolveProfile`, `revolveShell`. |
| `lib/products/plant-saucer/` | `copy.ts`, `schema.ts`, `validate.ts`, `geometry.ts`, `presets.ts`, `index.ts`. |
| `lib/products/plant-pot/` | The same six files. |
| `lib/products/card-holder/` | The same six files. |
| `lib/products/registry.ts` | Registers `plantSaucer`, `plantPot`, `cardHolder` after `socketTray`. |
| `tests/revolve.test.ts` | 15 cases: the cylinder volume, the segment count, the three clamps, the profile geometry, the self-intersection sweep, the shell. |
| `tests/plant-saucer.test.ts` | 29 cases. |
| `tests/plant-pot.test.ts` | 28 cases, including the pot and saucer pair. |
| `tests/card-holder.test.ts` | 36 cases, including the tilted slot cutter. |
| `README.md` | Three product sections, three code-layout bullets, the kernel bullet, the geometry paragraph. |
| `sprints/PRINT_RECORDS.md` | Records 5, 6, and 7, target values only. |

The product contract in `lib/products/types.ts` did not change. No member was
added and no member changed. `revolve.ts` is the one new kernel module.

### 1.2 Test counts

| Gate | Before | After |
|---|---|---|
| Vitest | 279 in 15 files | 411 in 19 files |
| Server render | 5 | 5 |
| Playwright | 10 | 10, one failing: see open issue 2 |
| Drawer tray golden record | 362 triangles, volume 277462.54 | unchanged |
| Socket tray golden record | 4092 triangles, volume 412174.09 | unchanged |

Of the 132 new Vitest cases, 21 come from `tests/products.test.ts`, which
generates seven checks for every registered product and was not edited. Three
of the 132 came from the review of 2026-09-02; section 10 lists what that
review changed.

---

## 2. The revolve module API

All lengths are millimeters. A profile point is `[radius, height]`.
`CrossSection.revolve` turns the cross-section's own Y axis into the model's Z
axis, so a profile written in the radius-height plane needs no transform. Every
function that returns a solid gives the caller the only reference; the caller
deletes it.

### 2.1 Segments

- `REVOLVE_SEGMENTS = { draft: 48, standard: 96, fine: 192 }`. Segments in one
  full revolution. See D-1502.
- `rimArcSegments(segments)`. Points on the rolled-rim arc: a quarter of the
  segment count divided by two, rounded to an even number of at least two.
  48 gives 6, 96 gives 12, 192 gives 24. The count is always even, so the arc
  holds a point at the top of the bead and the part reaches its stated height
  exactly.

### 2.2 The profile builder

`buildVesselProfile(options): VesselProfile | null`

| Option | Meaning |
|---|---|
| `outerRadiusAtBase` | Outer radius at Z = 0, the footprint radius. |
| `height` | Total height, Z = 0 to the top of the rim. |
| `wallThickness` | Wall thickness, measured perpendicular to the wall. |
| `baseThickness` | Floor thickness, measured up from Z = 0. |
| `taperDegrees` | Wall taper from vertical. A positive angle opens upward. |
| `rimRadius` | The rolled-rim bead radius the user asked for. Zero gives a square rim. |
| `rimSegments` | Points on the bead arc. Defaults to the standard-quality count. |

It returns null when the numbers cannot make a simple profile: any value not
finite, a radius, wall, or floor at zero or below, a taper outside 0 to 60
degrees, a floor at or above the height, or a wall thick enough to close the
cavity. A caller reports "does not fit" instead, the way `planLightening`
returns null (20_KERNEL_MODULES_NOTES.md, section 2.4).

The result carries the two point lists and the numbers a product needs:

| Field | Meaning |
|---|---|
| `outer` | The outer boundary, closed, from the axis at Z = 0. |
| `inner` | The cavity, closed. It overshoots the top by `BOOLEAN_OVERLAP`. |
| `rimRadius` | The bead radius after the clamp. |
| `rimRadiusClamped` | True when the clamp reduced the request. |
| `wallTopZ` | Height of the top of the straight wall, where the bead starts. |
| `horizontalWall` | `wallThickness / cos(taper)`. The horizontal wall offset. |
| `taperTangent` | `radius(z) = radiusAtBase + z × taperTangent`. |
| `outerRadiusAtBase`, `innerRadiusAtBase` | The two taper lines at Z = 0. |
| `innerRadiusAtFloor` | Cavity radius on top of the floor. The usable floor radius. |
| `maximumRadius` | The widest outer radius. It sits at `wallTopZ`. |
| `openingRadius` | The narrowest clear radius at the rim. |

Construction of the three parts, in the radius-height plane:

- **Base.** The outer profile starts at `[0, 0]` and runs to
  `[outerRadiusAtBase, 0]`. The cavity starts at `[0, baseThickness]`. The
  material between them is the floor.
- **Tapered wall.** The outer line is `radius(z) = outerRadiusAtBase + z ×
  tan(taper)`. The cavity line is the same line moved in by
  `wallThickness / cos(taper)`, so the wall's perpendicular thickness is the
  number the user set at every height.
- **Rolled rim.** The straight wall stops at `wallTopZ = height − rimRadius`.
  A half-circle of radius `rimRadius`, centered at
  `[maximumRadius − rimRadius, wallTopZ]`, caps it. The bead's outer edge
  continues the wall exactly, so the bead rolls **inward** and never overhangs
  the outside (D-1504). Its top point sits at `height`. The cavity cuts the
  bead's inner half away, so the finished rim is a wall that domes over into a
  ring at the top.

### 2.3 The clamp

`clampRimRadius({ rimRadius, height, outerRadiusAtBase, wallThickness, taperDegrees })`

Pure. It returns zero for a request that is zero, negative, or not a number,
and never returns more than the request. Three limits apply, and the smallest
wins (D-1505):

1. **Height.** `r ≤ height / 4`. The spec's rule. A taller bead eats the
   straight wall and folds the profile over itself.
2. **Wall.** `r × (1 + tan θ) ≤ horizontalWall − BOOLEAN_OVERLAP`. The cavity
   cuts the inner half of the bead away. Past this limit the cavity swallows
   the top of the bead, the part stops reaching its stated height, and the
   bounds contract stops holding.
3. **Axis.** `r ≤ (outerRadiusAtBase + height × tan θ − 0.5) / (2 + tan θ)`.
   The bead's inner edge is at `outerRadius(height − r) − 2r`. It must stay
   0.5 mm clear of the axis, or the profile crosses itself at a small radius.

### 2.4 Revolving

- `revolveProfile(kernel, points, segments, revolveDegrees = 360)`. Builds the
  cross-section with `polygon` from `profiles.ts`, revolves it, deletes the
  cross-section, and returns the solid.
- `revolveShell(kernel, profile, segments)`. Returns `{ outer, cavity, shell }`.
  `shell` is `outer` minus `cavity`. The caller owns and deletes all three.
  `outer` and `cavity` are kept so a product can clip a feature to the outside
  or to the inside, the way `shellFromProfiles` returns `outer` in `shell.ts`.

---

## 3. Segment counts per quality

| Quality | Revolution (`REVOLVE_SEGMENTS`) | Rim arc | Pot drainage hole | Card holder corner |
|---|---|---|---|---|
| Draft | 48 | 6 | 12 | 12 |
| Standard | 96 | 12 | 24 | 24 |
| Fine | 192 | 24 | 48 | 48 |

The revolution count is four times the bore count in `QUALITY_SEGMENTS`
(20_KERNEL_MODULES_NOTES.md). A drainage hole is a small feature, not the
silhouette of the part, so it takes the bore count: one quarter of the
revolution count, with a floor of 12. The card holder is a family B product
and takes the bore counts unchanged for its rounded outer corners.

Triangles in the default part, per quality:

| Product | Draft | Standard | Fine |
|---|---|---|---|
| Plant pot saucer | 1056 | 3168 | 10848 |
| Nursery plant pot | 1168 | 3472 | 11536 |
| Card holder | 220 | 268 | 364 |

---

## 4. What each product does

### 4.1 Plant pot saucer

The user sets the **inner floor diameter**, which is the pot base plus 2 mm.
`deriveSaucerLayout` turns it into `outerRadiusAtBase` by following the taper
line back down to the bed, so `innerRadiusAtFloor × 2` equals the number the
user typed, exactly, at every taper (D-1507).

The build is: `revolveShell`, then the lift ribs, then the overflow notch.
Each lift rib is a bar 3 mm wide that crosses the whole floor through the
center, intersected with a cone that follows the cavity line plus the hidden
overlap, so each rib ends buried 0.2 mm in the wall (D-1509). The overflow
notch is a box cutter on the +X side, 12 mm across the chord, cutting down
from the top of the rim by `min(4 mm, half the water depth)`.

Rules: the inner diameter stops at 208 mm, the outside diameter stops at the
same 208 mm (D-1520), the taper runs 3 to 12 degrees, the wall starts at
1.6 mm, the saucer must hold 3 mm of water above the floor measured to the
lowest point of the rim (D-1521), and a lift rib must leave 1 mm under the rim.

### 4.2 Nursery plant pot

The user sets the **outside diameter at the base**, so the matching saucer
floor is that number plus 2 mm with no back-solving (D-1507). The build is
`revolveShell` minus one batched union of the drainage cylinders.

Rules from plan section 2.6: the hole is 4 to 8 mm, the wall angle stops at 45
degrees from vertical, and the holes go through the flat base only. A single
hole sits at the center; two or more sit on a circle of half the floor radius
(D-1512). The pot is rejected when it is more than 208 mm across at the rim,
when two holes leave under 2.5 mm between them, or when a hole leaves under
2.5 mm to the wall.

### 4.3 Card and cartridge slot holder

A family B product: `roundedSlab` minus one `cutterArray` of tilted prisms.
The prism comes from `polygon` extruded and then rotated about the Y axis, so
the cards lean along the row (D-1513).

A tilted slot needs more width than an upright one. Its mouth is
`slotWidth / cos(tilt)` across, and its floor moves along −X by
`slotDepth × tan(tilt)`. The whole footprint inside the slab is
`slotWidth × cos(tilt) + slotDepth × tan(tilt)`, and the slot's own axis is not
at the middle of that footprint (D-1514). `solvePitch` lays out the footprints;
generation moves each cutter to its axis with the layout's `pivotOffset`.

That formula is exact while `slotDepth ≥ slotWidth × sin(tilt)`, which every
sensible card holder satisfies, because a slot is always deeper than a card is
thick. Below that line the cutter's own tilted floor face, not its side plane,
sets the far edge, and the formula reserves more width than the slot uses. The
reviewer's example is a slot at the far end of both ranges: a card gauge of
25 mm, a 1.5 mm clearance, a 3 mm depth, and a 20 degree tilt reserve 26.0 mm
for a footprint that is really 9.3 mm. The layout is then conservative, never
short, so no slot ever reaches the rim; the cost is spare material between two
very shallow slots. See open issue 8.

The four plan corners of each end slot are checked against the rounded outer
corners with `pointClearsCorner`, which is the socket tray's `boreClearsCorner`
with a point in place of a bore (20_KERNEL_MODULES_NOTES.md, D-914).

---

## 5. Decisions

**D-1501. The revolve module returns two profiles and subtracts.** The spec
says "revolve it, and shell it by revolving an inward-offset profile". A
kernel 2D offset of the outer profile would round the rim bead and the floor
corner in ways the product cannot predict, so `buildVesselProfile` writes both
point lists itself from the same taper line. `revolveShell` then does one
subtract. This is the revolved counterpart of `shellFromProfiles`.

**D-1502. A revolved surface takes four times the bore segment count.** The
bore counts are 12, 24, and 48 (`QUALITY_SEGMENTS`). A revolved wall is the
whole silhouette of the part, not a small feature: at 48 segments a 200 mm pot
has a 13 mm facet, which a person sees and feels. The revolution counts are
therefore 48, 96, and 192. The spec's own test forces the same answer: a
revolved square gives the volume of the inscribed prism, whose error is
about `2π² / 3N²`, so 0.1 percent needs at least 81 segments. At 192 the error
is 0.018 percent. The extra triangles are cheap: the fine default saucer is
10848 triangles and 149 ms.

**D-1503. The bed is 220 mm, taken from the printer profile default.** The
plan's rule for the saucer is "inner diameter at most the bed less 12 mm". A
product cannot read `PrinterProfileV1`; `validate` takes parameters only. The
number is therefore the profile default of 220 mm, written as
`SAUCER_BED_WIDTH_MM` and `POT_BED_WIDTH_MM` with the reason next to it. The
app's own build-volume warning (S04) still fires against the user's real bed,
so a smaller machine is still told. See open issue 1.

**D-1504. The rolled rim rolls inward, not outward.** A bead that bulges past
the wall has an overhang on its underside that passes 45 degrees. Governance
rule 10 says a feature that needs supports is a failed feature. The bead is
therefore tangent to the outer wall and rolls inward over the wall top. Every
surface of the finished rim either faces up or leans inward, so the part
prints without supports.

**D-1505. The rim radius has three clamps, not one.** The spec asks for a
quarter of the rim height. That clamp alone does not stop the two failures the
spec's Risks describe. The wall clamp keeps the cavity from swallowing the top
of the bead, which is what keeps the part at its stated height and keeps the
bounds contract true. The axis clamp is the one that matters "at small radii":
without it a 5 mm bead on a 6 mm radius crosses the axis. All three are in
`clampRimRadius`, and `tests/revolve.test.ts` sweeps 7 radii × 4 heights × 3
walls × 5 tapers and proves the profile stays simple in every case.

**D-1506. The clamp reports; it does not reject.** Governance rule 10 allows
either a clamp or a rejection. A rejection here would be a message about a
number the user cannot reason about, so the app clamps and the calculated
result says so: "1.6 mm, reduced from 3 mm". The requested value stays in the
signature and in the file name, per governance rule 1.

**D-1507. The saucer's parameter is the floor diameter and the pot's is the
base diameter.** Both are the diameter at the join, so the pair value is one
addition: saucer floor = pot base + 2 mm. The alternative, naming the rim
diameter, makes the pairing depend on the height, the taper, and the rim
radius, and a user who changes the height would silently need a new saucer.
The widest diameter is a derived value on both products instead.

**D-1508. Wall thickness is perpendicular to the wall.** The horizontal offset
between the two taper lines is `wall / cos(taper)`. At the pot's 45 degree
limit a horizontal reading of a 2.2 mm wall would print 1.56 mm, under the
thin-wall rule. The perpendicular reading is the one a slicer and a caliper
both agree with.

**D-1509. A lift rib crosses the whole floor through the center.** The
acceptance is that the saucer is watertight and that a horizontal slice below
the rim is one closed contour. A ring rib, or a spoke that stops short of the
wall, puts a second solid island in the slice. A bar that runs wall to wall
through the center keeps the section one connected solid at every height, and
it prints as a straight standing wall.

**D-1510. The overflow notch widens the bounds tolerance.** The notch removes
the widest ring of the revolution over a 12 mm chord on the +X side, so the
mesh's maximum X falls short of the contract by the chord's sagitta plus one
facet of the revolution. `boundsContract` adds exactly those two terms to its
tolerance when the notch is on, and 1e-3 when it is off. The measured drift is
0.233 mm against a 0.395 mm tolerance for the defaults with the notch.

**D-1511. The pots are not compensated.** `CompensableParameters` names
parameters per axis, and `compensate` applies the X list and then the Y list to
the same object. A diameter named on both axes would take both corrections, so
the part would grow by `correctionX + correctionY`. Naming it on one axis only
would correct a round part in one direction. Neither is right, so
`plantSaucer` and `plantPot` omit `compensable` and the printed record asks for
the diameter shrink as a number. See open issue 3.

**D-1512. Drainage holes sit on a circle of half the floor radius.** The rule
has to guarantee the acceptance "the drainage holes never cut the wall" for
every value in the ranges. Half the floor radius does that with the largest
hole in the smallest pot, and it keeps the holes where water reaches them. The
wall-clearance rule stays in `validate` as a guard; inside the spec ranges it
cannot fire, and its test drives it with a base diameter that skipped
normalization.

**D-1513. The card holder's slots tilt about the Y axis.** The cards lean
along the row, not backward. A backward lean rotates the slot about X, and the
slot's own length then projects into Z: a 34 mm slot at 20 degrees eats 11.6 mm
of depth before it cuts anything, which leaves no slot at a 12 mm depth. A
sideways lean projects only the slot's thickness into Z, which costs nothing.

**D-1514. The slot footprint is `slotWidth × cos(tilt) + slotDepth × tan(tilt)`,
and the slot axis is not at its center.** Found by a test. The first version
used the mouth width plus the floor offset, which is 0.3 mm too wide at 20
degrees, and put the axis on the wrong side of the footprint center. The wrong
sign moved every slot by twice the pivot offset; the default's 11.4 mm web hid
it, and the 400 mm, 60 mm deep, 20 degree case cut the end slot through the
rim. The exact numbers, and a slice test at ten depths through every fixture,
now cover it.

**D-1515. The card holder has no underside lightening.** The spec lists five
inputs for this product and no pockets. A slot already removes most of the
material above the base, and the base under a deep slot is thin. Adding
`lightenUnderside` would be a sixth feature the spec did not ask for.

**D-1516. Two unreachable validation rules were removed or marked.** A rule
that no value in the ranges can trigger is dead code and cannot be tested. The
pot's "minimum inside depth" rule was removed, because the minimum height of
40 mm already exceeds the largest base plus 20 mm. The pot's wall-clearance
rule was kept, because it is the guard behind an acceptance item, and its test
says so.

**D-1517. "One closed contour in every horizontal slice below the rim" is read
as one solid component at every height.** A slice through a saucer wall is an
outer contour and one hole, which is two contours and one solid piece. A slice
through the floor is one contour with no hole. A slice through the lift ribs is
one solid piece with one hole per sector. The invariant that carries the
acceptance is therefore: **one solid component at every height below the rim,
and no hole through the floor**. Both products test it at 19 heights per
fixture.

**D-1518. The kernel time test allows two seconds.** The same reasoning as
D-913. The slowest measured case is the fine maximum saucer at 164 ms.

**D-1519. The card's key is `cardGauge`, not `cardThickness`.** Found in
review. `wallLikeKeys` in `lib/printer-profile.ts` finds a printed wall by key:
a number parameter in millimeters whose key holds "wall" or "thickness" is a
wall. A card is not a printed wall, so the thin-wall rule from governance rule
9 refused the download for every card under two nozzle widths, and its message
called the card a wall. The key is renamed; the label the user reads is still
"Card thickness". The rename does not change the signature, because
`signatureFromSpecs` joins the parameter values in spec order and the key keeps
its place, so the file names and the golden record are unchanged. A test now
asserts that `wallLikeKeys(cardHolder.specs)` returns `baseThickness` and
`wallThickness` only.

**D-1520. The saucer's bed rule applies to the outside, not only to the
floor.** Found in review. The plan's rule names the inner diameter, and the
outside of a saucer is always wider than its floor: a 208 mm floor with a 12
degree taper, a 4 mm wall, and a 40 mm rim is 230.2 mm across, which does not
fit a 220 mm bed. The pot's rule is therefore copied to the saucer, with the
same sentence and the saucer's own fixes, and it names `taperDegrees`. One
consequence: the top of the inner-diameter range is now unreachable. The field
still stops at 208 mm because that is the plan's rule, but a 208 mm floor needs
about 204 mm to pass the outside rule, so the largest floor that validates is
about 204 mm at the thinnest wall and the least taper. The message names the
number and the four fixes, so a person is never left guessing.

**D-1521. The water depth is measured to the lowest point of the rim.** Found
in review. The rule tested the rim height against the floor plus 3 mm and
ignored the overflow notch, so a 9 mm rim on a 6 mm floor with the notch on
passed while holding 1.5 mm. The rule now tests `layout.holdingDepth`, which is
measured to the notch floor when the notch is on, and the message reports the
rim height that reaches 3 mm, how much the notch takes off, and "no overflow
notch" as a third fix. `minimumRimHeight(baseThickness, overflowNotch)` solves
`depth − min(4, depth / 2) ≥ 3` rather than hard-coding the answer, so the
number stays right if the notch depth changes.

**D-1522. A cleared count field shows an em dash, not NaN.** Found in review.
`derive` and `summary` are called on every keystroke, and a cleared integer
field holds NaN until the user types again. The pot's drainage row printed
"NaN holes of 6 mm on a 0 mm circle" and both summaries printed "NaN holes" and
"NaN slots". Every count is now guarded on `Number.isFinite`, and the
cleared-field test loops cover `drainHoles`, `slotCount`, `rimRadius`, and
`liftRibs` and assert that no derived row and no summary ever holds the text
"NaN".

---

## 6. Deviations from the spec

1. The spec says "clamp the rim radius to a quarter of the rim height". The
   module clamps to the smallest of three limits, of which that is one
   (D-1505). The quarter-height limit alone does not prevent the
   self-intersection the same section describes.
2. The spec's revolve test reads "a square profile gives a cylinder volume
   within 0.1 percent at fine quality". That is only true above about 81
   segments, so fine is 192 segments, not the 48 of the shared construction
   group (D-1502). The shared group's 12, 24, 48 stays in force for bores and
   for rounded corners, including the card holder's.
3. The pot's "matching saucer diameter" is stated as the pot **base** diameter
   plus 2 mm, and the pot's own size parameter is the base diameter (D-1507).
   The catalog row says "outer diameter"; the widest diameter is a derived
   value.
4. The pots omit `compensable` (D-1511). The card holder has it, on
   `holderWidth` and `holderDepth`, like the socket tray.
5. The printed coupon records are prepared in `sprints/PRINT_RECORDS.md` as
   records 5, 6, and 7, with target values only. They are not filled; a person
   prints and measures.
6. The saucer's inner-diameter field stops at 208 mm, which the plan's rule
   asks for, but the outside rule added in review makes the top of that range
   unreachable (D-1520). The largest floor that validates is about 204 mm.
7. The card holder's schema key for the card is `cardGauge`, not
   `cardThickness` (D-1519). The label is unchanged.

---

## 7. Measurements

Node 22, one warm kernel, in this environment. Times include the mesh copy out
of WebAssembly memory.

| Case | Size | Quality | Triangles | Time |
|---|---|---|---|---|
| Saucer defaults | 166.5 mm across × 15 mm | standard | 3168 | 34 ms |
| Saucer small pot preset | 97.1 × 10 mm | standard | 2592 | 34 ms |
| Saucer medium pot preset | 148.3 × 14 mm | standard | 3224 | 44 ms |
| Saucer large pot preset | 201.3 × 20 mm | standard | 3280 | 46 ms |
| Saucer minimum | 63.9 × 8 mm | draft | 384 | 4 ms |
| Saucer maximum, notch and 6 ribs | 201.4 × 40 mm | fine | 6938 | 164 ms |
| Pot defaults | 120 mm base, 130 mm high | standard | 3472 | 27 ms |
| Pot seedling preset | 90 mm base, 90 mm high | standard | 2796 | 26 ms |
| Pot deep preset | 150 mm base, 200 mm high | standard | 3672 | 29 ms |
| Pot minimum | 50 mm base, 40 mm high | draft | 432 | 5 ms |
| Pot maximum, 8 holes | 200 mm base, 220 mm high | fine | 8480 | 108 ms |
| Holder defaults | 180 × 60 × 30 mm, 10 slots | standard | 268 | 6 ms |
| Holder memory cards preset | 100 × 32 × 20 mm, 12 slots | standard | 300 | 3 ms |
| Holder cassettes preset | 120 × 74 × 30 mm, 6 slots | standard | 204 | 2 ms |
| Holder minimum | 40 × 20 × 8 mm, 1 slot | draft | 28 | 1 ms |
| Holder heavy | 400 × 220 × 60 mm, 24 slots | fine | 588 | 11 ms |

Every case is inside the 2 s test budget by a factor of at least 12.

Golden records at geometry version 1, defaults:

| Product | Triangles | Volume | Bounds |
|---|---|---|---|
| Plant pot saucer | 3168 | 66133.06 | ±83.2302 × ±83.2302 × 0 to 15 |
| Nursery plant pot | 3472 | 149662.25 | ±73.5584 × ±73.5584 × 0 to 130 |
| Card holder | 268 | 314885.38 | ±90 × ±30 × 0 to 30 |

Built chunk sizes, production build:

| Chunk | Before S08 | After S08 | Budget |
|---|---|---|---|
| `generation.worker-*.js` | 65951 B | 91406 B | 81920 B |
| `ProductApp-*.js` | not measured | 599919 B | 665600 B |

### 7.1 Browser smoke

Recorded after the production build in this environment with Chromium under
software WebGL.

| Step | Result |
|---|---|
| `/products/plant-saucer` | "Ready · 166.5 mm across × 15 mm high · 160 mm floor", title "DrawerForge — Plant Pot Saucer" |
| Saucer download | `drawerforge-plant-saucer-160x15-896046.stl`, 158484 bytes |
| `/products/plant-pot` | "Ready · 120 mm base · 147.1 mm rim × 130 mm high · 4 holes" |
| Pot download | `drawerforge-plant-pot-120x130-4h-237a74.stl`, 173684 bytes |
| `/products/card-holder` | "Ready · 180 × 60 × 30 mm · 10 slots" |
| Holder download | `drawerforge-card-holder-180x60x30-10s-ec344b.stl`, 13484 bytes |
| Product switcher | 5 links on every route |
| Pot conflict: 8 holes of 8 mm on a 50 mm base | "8 holes of 8 mm leave 0.8 mm between neighbours. Keep at least 2.5 mm. Use fewer holes, a smaller hole, or a wider base." Download disabled. Status "Paused · Fix 1 setting; showing the last valid model." |
| Back to 3 holes | Ready again |
| Pair: pot derived "Matching saucer floor" into the saucer | The saucer at a 122 mm floor reports "Pot base up to 120 mm" |
| Console errors | Only the known local WebAssembly MIME fallback (12_WEB_WORKER_GENERATION_NOTES.md and 25_BROWSER_QA_NOTES.md, D-1003). No other error. |

Re-run after the review fixes, same environment:

| Step | Result |
|---|---|
| Card control | `param-card-gauge-number` present, `param-card-thickness-number` gone, label still "Card thickness" |
| A 0.5 mm card with a 0.1 mm clearance | "Ready · 180 × 60 × 30 mm · 10 slots", no error under the field, download enabled, 13484 bytes. Before the rename the thin-wall rule refused it. |
| Saucer, 9 mm rim on a 6 mm floor with the notch | "Rim height must be at least 12 mm, so the saucer holds 3 mm of water above the 6 mm floor. The overflow notch takes 1.5 mm off the depth. Use a taller rim, a thinner floor, or no overflow notch." Download disabled. |
| The same saucer at a 12 mm rim | Ready again |
| Saucer, 208 mm floor, 40 mm rim, 12 degree taper, 4 mm wall | "The saucer is 230.2 mm across at the rim. Keep it at most 208 mm, the 220 mm bed less 12 mm. Use less taper, a shorter rim, a thinner wall, or a smaller floor." Download disabled. |
| Console errors | The same WebAssembly MIME fallback only. |

---

## 8. Open issues

1. **The bed size is a constant in two products.** `SAUCER_BED_WIDTH_MM` and
   `POT_BED_WIDTH_MM` are both 220. A person with a 180 mm bed sees a 208 mm
   maximum in the field and a build-volume warning from the printer profile
   afterwards. Passing the profile into `validate` is a contract change, so it
   waits for a sprint that owns the contract.
2. **The worker chunk is over its 80 KB budget.** The production
   `generation.worker` chunk was 65951 B with two products and is 91406 B with
   five. `tests/browser/performance-budget.spec.ts` fails on it. The budget is
   S10's file and S06 and S07 add more products in parallel, so this sprint did
   not edit the number: one person should set one number once, after the
   parallel branches land. On the same measurement the page chunk is 599919 B
   against a 650 KB budget, so that one is close as well.
3. **A round part cannot be compensated.** See D-1511. The contract needs
   either a third list, "diameter", or a rule that a parameter named on both
   axes takes the correction once.
4. **No printed record yet.** Records 5, 6, and 7 hold target values only.
   Governance rule 6 needs one filled record per product.
5. **The rim bead ends in a ring of zero width.** The top of a rolled rim is a
   smooth dome apex, so the last 0.2 mm of the wall is thinner than a nozzle.
   It prints as a single thin ring on the last layer. A printed record decides
   whether the bead needs a flat of one nozzle width at the top.
6. **The saucer's lift ribs are a bar, not a ring.** A bar through the center
   keeps the slice one solid piece (D-1509), but it also divides the water into
   sectors. A person who wants the water to move around the saucer needs a
   different rib shape, which needs a second solid component in a slice and a
   different reading of the acceptance.
7. **The card holder's webs are not checked against the nozzle.** The same
   issue as the socket tray's open issue 5: the thin-wall rule reads parameter
   names, and the solved web between two slots is not a parameter. The
   `cardGauge` rename (D-1519) removes a false positive from that rule; it does
   not add the missing check.
8. **The slot footprint is conservative for a very shallow, very thick slot.**
   The formula is exact while `slotDepth ≥ slotWidth × sin(tilt)` and reserves
   spare width below that line: 26.0 mm for a real 9.3 mm footprint at a 25 mm
   card gauge, a 3 mm depth, and a 20 degree tilt. The layout is never short,
   so nothing breaks the rim; a person who wants that combination just gets
   fewer slots than the slab could hold. An exact branch needs the tilted floor
   face in the layout.
9. **A large corner radius is checked, a large card is not.** The corner rule
   names the corner radius, and a person whose card is too wide for a rounded
   slab has to work that out from the corner message. The socket tray has the
   same shape of message (20_KERNEL_MODULES_NOTES.md, D-914).

---

## 9. Follow-ups

1. Set one worker-chunk budget after S06, S07, and S08 land (open issue 2).
   Consider splitting the registry so the worker loads one product's geometry
   on demand.
2. Family D products after these two, such as a lamp shade or a cable spool,
   start from `buildVesselProfile` and `revolveShell` and follow section 2.
   A new profile part goes in the builder, not in the product.
3. Add a diameter axis to `CompensableParameters` (open issue 3), then set
   `compensable` on both pots and re-record their coupons.
4. Consider a fit-test coupon for the pot and saucer pair: a 20 mm tall ring at
   the pot base diameter and a matching saucer floor, so a person can test the
   2 mm gap without printing a whole pot.

---

## 10. What the review changed

An independent review of the first S08 commit found one blocking item and seven
smaller ones. All eight are applied. The reviewer confirmed the rest: the
profiles are simple and support-free across the tightest combinations, the bead
never crosses the inner wall, the three clamps, the cylinder test, the memory
handling, the saucer watertightness, the drainage holes never reaching the wall
across 272609 combinations, the pairing and the catalog wording, the card
footprint math and its corner case, the presets, the segment counts, the
decision to omit `compensable` on the pots, rule 13 elsewhere, and the gates.

| # | Finding | Fix |
|---|---|---|
| 1 | Blocking. `cardThickness` matched the thin-wall regex, so rule 9 refused the download for any card under two nozzle widths and called the card a wall. | The schema key is `cardGauge`; the label is unchanged. D-1519. |
| 2 | The rim-height rule ignored the overflow notch, so a 9 mm rim on a 6 mm floor held 1.5 mm. | The rule tests `layout.holdingDepth`. D-1521. |
| 3 | The saucer's bed rule covered the floor only, so a 229 mm saucer passed on a 220 mm bed. | The pot's outside rule is copied to the saucer. D-1520. |
| 4 | README: "the pair fits" is a fit claim with no printed record. | Replaced with the geometric statement. |
| 5 | README: the saucer print notes ended with a sentence whose two words are also the name of a dish, against rule 13. | The sentence is deleted. A plant pot has no heat source, so the warning had no reason to be there. |
| 6 | A cleared count printed "NaN holes" and "NaN slots". | Guarded on `Number.isFinite`. D-1522. |
| 7 | Two comments cited open issue 1 for compensation. | They cite D-1511 and open issue 3. |
| 8 | The slot footprint formula's exactness condition was not recorded. | Section 4.3 and open issue 8. |

Two facts the fixes settled:

- The `cardGauge` rename does **not** change any file name or the golden
  record. `signatureFromSpecs` joins the parameter values in spec order, and
  the key keeps its place, so the hash is the same. Print record 7 keeps
  `drawerforge-card-holder-100x32x20-12s-85683b.stl`; only its parameter list
  is renamed.
- The saucer's maximum test case moved from a 208 mm floor to a 180 mm floor,
  because the outside rule now rejects the old one. The measurement table in
  section 7 is re-recorded for the new case.
