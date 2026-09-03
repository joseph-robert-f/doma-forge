# 21. Wave 1 Products Notes

Date: 2026-09-02
Status: Implemented on the S06 sprint branch (three of four wave 1 products).
Reads with: sprints/S06_WAVE_1_PRODUCTS.md, 20_KERNEL_MODULES_NOTES.md,
10_MULTI_PRODUCT_EXPANSION_PLAN.md sections 1.6, 2.3, 2.5, 2.6.

This document records three of the four S06 wave 1 products: the marker and
brush cup block, the battery organizer, and the tool fin rack. A separate
agent builds the fourth, the stackable parts bin, in its own worktree; its
section is merged in below by the integrator. All three products here are
presets of the S05 kernel modules (`roundedSlab`, `solvePitch`,
`cutterArray`, `lightenUnderside`) and follow the rules in
20_KERNEL_MODULES_NOTES.md section 3. No new kernel module was needed.

Test counts added: 28 cases in `tests/marker-cup-block.test.ts`, 29 in
`tests/battery-organizer.test.ts`, 22 in `tests/tool-fin-rack.test.ts`. The
full suite is 379 cases in 18 files, up from 269 in 14 (20_KERNEL_MODULES
document, section 1.2), including the two products in this sprint's
sibling worktree that this branch does not build. This document also
records an independent review of the first commit on this branch, which
found three blocking geometry defects and eight smaller items; see
"Review findings and fixes" near the end. All eleven are applied. The
test counts and every number in this document are the post-review state.

---

## Marker and brush cup block

`lib/products/marker-cup-block/`. Same recipe as the socket tray
(`roundedSlab` minus a batched union of bore cutters minus underside
pockets), with one bore diameter shared by every cup instead of one per
row, and a tilt from 0 to 15 degrees about the X axis. The bore's mouth
stays put and its floor swings toward the front (negative Y; row 1 is
at the front, the same convention as the socket tray); a marker resting
in the cup, its axis extended past the mouth the opposite way from the
floor, visibly leans back, toward positive Y, away from the user
(D-1316).

### Parameters

| Parameter | Range | Default | Note |
|---|---|---|---|
| blockWidth | 60 to 400 mm | 120 | Outside width |
| blockDepth | 40 to 300 mm | 90 | Outside depth |
| blockHeight | 20 to 130 mm | 70 | Outside height |
| rows | 1 to 4 | 2 | Integer |
| cupsPerRow | 1 to 12 | 4 | Integer |
| boreDiameter | 5 to 35 mm | 20 | One diameter for every cup |
| boreDepth | 8 to 110 mm | 45 | Measured along the tilted axis |
| tiltDegrees | 0 to 15 | 8 | About the X axis; unitless field, degrees in the label |
| chamfer | on/off | on | 0.8 mm lead-in, same constant as the socket tray |
| wallThickness | 1.2 to 4 mm | 2 | Shared construction group, unchanged |
| baseThickness | 1.2 to 6 mm | 2.4 | Shared construction group, unchanged |
| cornerRadius | 0 to 20 mm | 6 | Shared construction group, unchanged |
| lightenUnderside | on/off | on | Same module as the socket tray |
| meshQuality | draft/standard/fine | standard | Shared construction group, unchanged |

### Rules

- The pitch solver's minimum web is 2.5 mm, the family default, applied to
  both the per-row (X) layout and the row-to-row (Y) spacing.
- Row-to-row (Y) spacing is solved with an effective cutter size of
  `boreDiameter / cos(tiltDegrees)`, the tilted mouth's own elongated Y
  extent, not the plain diameter. Column (X) spacing is unaffected by
  tilt, since the tilt is only about the X axis (D-1303).
- **The Risk this sprint calls out**: a tilted bore's mouth and its floor
  are checked independently against the outer wall, on the straight sides
  and the rounded corners. The mouth is an ellipse (unchanged in X,
  stretched in Y by `1 / cos(tilt)`, where the tilted cylindrical wall
  crosses the flat top face). The floor is a circle, compressed in Y by
  `cos(tilt)` and shifted in Y by `boreDepth * sin(tilt)` (the axis's own
  walk toward the front wall, opposite the mouth's own visible lean;
  D-1316). Both checks use the exact far-corner formula described in
  Decision D-1310. See "Kernel time" below and the dedicated test
  `rejects a tilted bore whose floor exits the wall while its mouth stays
  inside`.
- The tilted bore's own cutter is built with a wide, two-sided cap so the
  mouth ellipse opens fully at the flat top face, on both its near and far
  edge, whatever the rotation's own sign (D-1313). Found in review: the
  first version left a wedge of un-cut material roofing part of a
  chamfered mouth.
- Bore depth cannot exceed the deepest point the tilted bore's floor
  actually reaches, not its center: `(blockHeight - baseThickness -
  (boreDiameter / 2 + chamferExtra) * sin(tiltDegrees)) / cos(tiltDegrees)`
  (D-1314). The floor disc's low edge dips `radius * sin(tilt)` further
  than its center; the same reach feeds `lighteningOptions.pocketDepth`
  and `deriveLayout`'s `baseUnderBores`. Found in review: the center-only
  formula accepted a through hole and left as little as 0.49 mm of real
  material over a pocket ceiling the derived value claimed was the full
  base thickness.

### Kernel time

Node 22, one warm kernel, `tests/marker-cup-block.test.ts` and a scratch
run in this environment.

| Case | Cups | Triangles | Time |
|---|---|---|---|
| Minimum, 60×40×20 | 1 × 1 | 380 | 9.1 ms |
| Defaults, 120×90×70 | 2 × 4 | 3244 | 55.8 ms |
| Maximum, 400×300×130, tilt 15°, corner 18 mm | 4 × 10 | 18588 | 234.4 ms |
| Heavy, 400×300×130, tilt 15°, fine | 4 × 10 | 38044 | 484.1 ms |

Triangle counts and times rose from the pre-review numbers (2412 at the
defaults) because the two-sided cap (D-1313) adds real geometry to every
tilted bore; the maximum case's corner radius also dropped from 20 to
18 mm, since the corrected, exact corner check (D-1310) now catches a
real conflict at 20 that the earlier, flawed check missed.

Golden record at geometry version 1, defaults: 3244 triangles, volume
448525.81, bounds [-60, -45, 0] to [60, 45, 70].

Coupon record prepared: `sprints/PRINT_RECORDS.md`, "Marker and brush cup
block", Record 5 (defaults). Target values filled; measured values empty.

---

## Battery organizer

`lib/products/battery-organizer/`. Same recipe as the socket tray, with a
per-well cutter that is either a round bore (most cells) or a rectangular
slot (a coin cell, standing on edge), plus an optional finger relief
counterbore at the top of every well.

### Parameters

| Parameter | Range | Default | Note |
|---|---|---|---|
| organizerWidth | 60 to 400 mm | 120 | Outside width |
| organizerDepth | 40 to 300 mm | 85 | Outside depth; raised from 80 in review, see D-1315 |
| organizerHeight | 20 to 100 mm | 45 | Outside height |
| rows | 1 to 4 | 3 | Integer |
| cellsPerRow | 1 to 12 | 4 | Integer |
| cellDiameter | 5 to 40 mm | 14.5 | AA by default |
| cellLength | 2 to 70 mm | 50.5 | A coin cell's thickness, not its standing length |
| cellShape | round / slot | round | Slot stands a coin cell on edge |
| exposedHeight | 3 to 30 mm | 12 | How much of the standing length stays exposed |
| clearancePerSide | 0 to 3 mm | 0.5 | Shared construction group, unchanged |
| fingerRelief | on/off | on | 3 mm deep, 6 mm wider counterbore |
| wallThickness | 1.2 to 4 mm | 2 | Shared construction group, unchanged |
| baseThickness | 1.2 to 6 mm | 2.4 | Shared construction group, unchanged |
| cornerRadius | 0 to 20 mm | 4 | Shared construction group, unchanged |
| lightenUnderside | on/off | on | Same module as the socket tray |
| meshQuality | draft/standard/fine | standard | Shared construction group, unchanged |

### Rules

- Well depth is derived, not set directly: `standingLength - exposedHeight`,
  clamped at 0. `standingLength` is `cellLength` for a round cell and
  `cellDiameter` for a slot cell, because a coin cell stands on its edge,
  so its diameter is what runs vertical (D-1305).
- Well depth never exceeds `organizerHeight - baseThickness`.
- A round well's footprint is a circle, `cellDiameter + 2 * clearancePerSide`
  across. A slot well's footprint is a rectangle: `cellLength +
  2 * clearancePerSide` wide (X, along a row, so a row of coin cells packs
  by thickness) and `cellDiameter + 2 * clearancePerSide` long (Y, so rows
  separate by diameter).
- The pitch solver's minimum web is 2.5 mm, applied along X (`cellsPerRow`)
  and along Y (`rows`), using the well footprint's X or Y extent as the
  cutter size for that axis.
- The finger relief widens the footprint by 6 mm (3 mm on the semi-axis
  used for the corner check) when it is on; a large corner radius that
  would then cut into an end well is rejected, and turning the relief off
  is offered as one of the fixes.
- The relief is not itself a cutter the pitch solver lays out around: the
  row and column layout is still solved with the plain, un-widened well
  footprint and the family's 2.5 mm minimum web. When the relief is on,
  validation separately requires the achieved web to clear 8.5 mm
  (2.5 mm plus the relief's own 6 mm widening) on both axes, naming the
  relief and offering to turn it off (D-1315). Found in review: without
  this check, the defaults' own six-cells-per-row case left a 3.29 mm
  web, comfortably past the plain minimum; the 6 mm-wider relief merged
  three neighbouring reliefs into one shared trough per row instead of
  six separate wells.

### Kernel time

| Case | Wells | Triangles | Time |
|---|---|---|---|
| Minimum, 60×40×20 | 1 × 1 | 428 | 6.6 ms |
| Defaults, 120×85×45 | 3 × 4 | 3084 | 50.2 ms |
| Maximum, 400×300×100 | 4 × 8 | 14092 | 183.9 ms |
| Heavy, 400×300×100, fine | 4 × 8 | 29132 | 416.5 ms |

Triangle counts are unchanged from the pre-review numbers; only the
defaults' organizer depth (80 to 85 mm, D-1315) and its volume changed.

Golden record at geometry version 1, defaults: 3084 triangles, volume
330330.14, bounds [-60, -42.5, 0] to [60, 42.5, 45].

Coupon record prepared: `sprints/PRINT_RECORDS.md`, "Battery organizer",
Record 6 (AA preset). Target values filled; measured values empty.

---

## Tool fin rack

`lib/products/tool-fin-rack/`. A different recipe from the other two: a
rounded base slab, with a row of filleted fins **unioned** onto its top
face, not cut. No underside pockets (see Decision D-1308).

### Parameters

| Parameter | Range | Default | Note |
|---|---|---|---|
| rackWidth | 60 to 400 mm | 150 | Outside width |
| rackDepth | 40 to 300 mm | 90 | Outside depth |
| finCount | 2 to 20 | 6 | Integer |
| finThickness | 1.5 to 6 mm | 3 | Every fin shares this |
| finHeight | 10 to 90 mm | 40 | Above the base slab |
| wallThickness | 1.2 to 4 mm | 2 | Reused as the fin row's edge margin; see D-1312 |
| baseThickness | 3 to 6 mm | 4 | Narrowed from the shared 1.2 to 6 mm; see D-1311 |
| cornerRadius | 0 to 20 mm | 4 | Shared construction group, unchanged |
| meshQuality | draft/standard/fine | standard | Shared construction group, unchanged |

Fin pitch is not a raw parameter. It is solved from `rackWidth`,
`finCount`, and `finThickness`, the same way the socket tray solves bore
pitch (D-1307), and shown to the user as a derived value. Found in
review: the product's own copy still called the presets "fin-pitch
presets" and the custom option "your own measured spacing," as if
pitch were a setting. Both now describe the tool type and the fin count
and thickness a person actually sets (D-1319).

### Rules

- Fin pitch minus fin thickness (the pitch solver's web) is at least 12 mm,
  the print-risk rule from 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 2.6.
  This is `MINIMUM_WEB_MM = 12` passed straight into `solvePitch`.
- Fin height divided by fin thickness is at most 15.
- Every fin gets a filleted foot: the convex hull (`Manifold.hull`) of the
  plain fin body and a strip 4 mm wider (2 mm on each side) and 3 mm tall
  at its base. This is always on; it is a hard print-risk rule, not a
  toggle (D-1309).
- The base slab is at least 3 mm thick (the `baseThickness` spec minimum).
- A fin's own footprint, including the fillet's extra width, is checked
  against the rounded outer corners of the base slab with the exact
  far-corner formula (D-1310); an end fin that would overhang past the
  corner, unsupported, is rejected with the largest corner radius that
  fits.
- Every fin's foot sinks `BOOLEAN_OVERLAP` (0.2 mm) into the slab before
  the union, the house rule in 20_KERNEL_MODULES_NOTES.md section 2.1
  (D-1318). Found in review: the first version met the slab's top face
  exactly, an unsafe coincident-face union. The fillet strip is a plain
  rectangular prism, so sinking it only adds hidden material already
  inside the slab; the mesh and the golden record are unchanged.
- The blade gap is narrower at the filleted foot than at the top, by
  twice the fillet's own width (4 mm, `2 * FIN_FILLET_WIDTH_MM`). A
  derived value, "Blade gap at the fillet foot," reports it alongside
  the pitch solver's own gap.

### Kernel time

Fin geometry is plain cubes and one hull per fin, far cheaper than a round
bore array; every case here is well under budget.

| Case | Fins | Triangles | Time |
|---|---|---|---|
| Minimum, 60×40 | 2 | 60 | 1.1 ms |
| Defaults, 150×90 | 6 | 252 | 3.7 ms |
| Maximum, 400×300 | 20 | 588 | 10.9 ms |
| Heavy, 400×300, fine | 20 | 684 | 15.4 ms |

Triangle counts and volumes are unchanged from the pre-review numbers
(D-1318 only adds hidden material already inside the slab); the times
above are simply a re-measurement.

Golden record at geometry version 1, defaults: 252 triangles, volume
160238.77, bounds [-75, -45, 0] to [75, 45, 44].

Coupon record prepared: `sprints/PRINT_RECORDS.md`, "Tool fin rack",
Record 7 (defaults). Target values filled; measured values empty.

---

## Stackable parts bin

The fourth product of wave 1. Id `parts-bin`, export `partsBin`, label
"Stackable parts bin", family `shelled-tray`. It is the drawer tray's shell
with four new features: a stacking lip, an underside recess, a front scoop,
and a front label ledge. It adds no kernel module.

### 1. Files

| File | Role |
|---|---|
| `lib/products/parts-bin/copy.ts` | `PARTS_BIN_ID` and the page copy. No kernel import. |
| `lib/products/parts-bin/schema.ts` | Specs, defaults, groups, the constants, and the pure `deriveLayout`, `stackedRecessFrame`, and `stackFitClearances`. |
| `lib/products/parts-bin/validate.ts` | The two stacking rules and two size guards. |
| `lib/products/parts-bin/geometry.ts` | `buildPartsBinSolid` and `generatePartsBin`. |
| `lib/products/parts-bin/presets.ts` | Three presets. |
| `lib/products/parts-bin/index.ts` | The `ProductDefinition`, the derived values, the bounds contract, the file name. |
| `tests/parts-bin.test.ts` | 48 cases. |
| `lib/products/registry.ts` | `register(partsBin)` after `register(socketTray)`. |
| `README.md` | The "Stackable parts bin" section and the code-layout bullet. |
| `sprints/PRINT_RECORDS.md` | Records 8 and 9, prepared. |

### 2. Parameter table

| Parameter | Type | Range | Step | Default | Note |
|---|---|---|---|---|---|
| `binWidth` | number, mm | 60 to 400 | 1 | 150 | Outside width. No fit clearance. |
| `binDepth` | number, mm | 60 to 300 | 1 | 100 | Outside depth of the body. |
| `binHeight` | number, mm | 25 to 200 | 1 | 70 | Outside height to the rim. The lip stands above it. |
| `stacking` | boolean | — | — | true | Off gives a plain bin: no lip and no recess. |
| `lipHeight` | number, mm | 2 to 10 | 0.5 | 4 | How far the lip stands above the rim. |
| `lipWallThickness` | number, mm | 0.8 to 3 | 0.1 | 1.2 | The wall of the lip. |
| `stackClearance` | number, mm | 0.1 to 1 | 0.05 | 0.3 | The gap on each side of the lip. |
| `frontScoop` | boolean | — | — | true | A round notch in the front rim. |
| `labelLedge` | boolean | — | — | true | A card slot at the front foot. |
| `wallThickness` | number, mm | 1.2 to 4 | 0.1 | 3 | Outer wall. |
| `baseThickness` | number, mm | 1.2 to 6 | 0.1 | 3 | Base under the cavity. |
| `cornerRadius` | number, mm | 0 to 20 | 0.5 | 3 | Outer corner radius. |
| `meshQuality` | enum | draft, standard, fine | — | standard | Segments 12, 24, 48. |

Groups: 01 Size, 02 Stack, 03 Front, 04 Construction. The construction
group keeps the shared ranges of section 2.5 of the expansion plan. The
product narrows `binDepth` and `binHeight`; it widens nothing.

Fixed constants, behind the two booleans: label ledge shelf 1.6 mm, card
slot 1.6 mm, upstand 1.2 mm, projection 2.8 mm, upstand height 6 mm, side
inset 2 mm or the corner radius. Front scoop radius: 7.5 percent of the
width, at least 1.5 mm, at most 12 mm, and at least 2 mm above the base.

### 3. Rules

| Rule | Field | Message names |
|---|---|---|
| The outer wall is at least 1.6 mm when the bin stacks. | `wallThickness` | The 1.6 mm minimum, the reason, and two fixes. |
| The lip wall plus two clearances is at most the outer wall minus 0.8 mm. | `lipWallThickness` | The lip wall, the clearance, what they take, the wall, the 0.8 mm reserve, and the fixes each field can accept. |
| The base leaves at least 4 mm of wall above it. | `baseThickness` | The largest base. |
| The corner radius is at most half the shorter side. | `cornerRadius` | The largest radius. |

The last two rules cannot fire inside the parameter ranges: the smallest
height is 25 mm against a largest base of 6 mm, and the shortest side is
60 mm against a largest corner radius of 20 mm. They stay as guards, the
same way the drawer tray keeps its own base guard.

`deriveLayout` never throws. A cleared field holds NaN, the layout reports
`fits: false`, and the "Stacking lip" result reads "does not fit".

### 4. The lip and the recess

The lip is a rectangular ring that stands on the top rim. The recess is the
same ring, grown by the stacking clearance on every side, cut up into the
underside. Both rings are centered in the outer wall, so the wall keeps the
same material outside the recess and inside it.

With `w` for the outer wall, `t` for the lip wall, and `c` for the
clearance, measured inward from the outer face of the bin:

- lip: from `(w − t) / 2` to `(w − t) / 2 + t`.
- recess: from `(w − t) / 2 − c` to `(w − t) / 2 + t + c`.
- material left: `(w − t − 2c) / 2` outside the recess, and the same inside
  it. The rule keeps the sum at 0.8 mm or more.
- the lip runs from the rim to `rim + lipHeight`. The recess runs from the
  underside to `lipHeight + c`. The stack pitch is the bin height, so the
  two rims meet and the recess still has `c` above the lip.

A cut through one wall, at the defaults, in millimeters. The upper bin sits
on the lower bin:

```
            <----------- 3.0 outer wall ----------->
   +--------+---------------------------+----------+   z = 74.3  roof of the recess
   |        |                           |          |
   |  0.6   |        1.8 recess         |   0.6    |   upper bin
   +--------+                           +----------+   z = 70.0  seat, the two rims meet
                 0.3 |         | 0.3
   +--------+--------+---------+--------+----------+   z = 74.0  top of the lip
   |        |        | 1.2 lip |        |          |
   |        |        |         |        |          |   lower bin
   +--------+--------+---------+--------+----------+   z = 70.0  rim of the lower bin
   |                                               |
   |                 lower bin wall                |
   outside face                          inside face
```

The corner radius follows the same rule: the lip's outer corner radius is
the bin's corner radius minus the offset, and the recess's outer corner
radius is `c` larger. `roundedRectangle` clamps a radius under 0.01 mm to a
square corner, and the clamped rectangle is exactly the inner and the outer
parallel body of the ring it must clear. The gap therefore stays `c` around
the whole corner. Measured on the built profiles at the defaults, the
smallest gap between the lip and the recess above it is 0.300 mm at a square
corner and 0.297 mm at a round one. The 0.003 mm is the chord of the
24-segment arc, not a change of the fit; at the fine mesh quality, with 48
segments, the same gap is 0.299 mm. `tests/parts-bin.test.ts` measures all
three by growing the lip profile until it leaves the recess profile.

Construction, four Booleans whatever the features:

1. `roundedShell` gives the outer body and the cavity.
2. One union adds the lip ring and the label ledge.
3. One union collects the recess ring and the scoop cutter.
4. One subtraction cuts them.

### 5. Decisions

**D-1351. The bin sizes are outside sizes, and the stacking clearance is
its own parameter.** The catalog's M input for this product is the shelf,
not a drawer, so the drawer tray's `clearancePerSide` has no meaning here.
The one clearance this product needs is the fit between the lip and the
recess. It is `stackClearance`, 0.1 to 1.0 mm, and it is not the shared
`clearancePerSide` of expansion plan section 2.5, whose note says
"fit-to-space products only".

**D-1352. The lip is centered in the outer wall.** The spec's rule leaves
`wall − lipWall − 2 x clearance` of material, at least 0.8 mm. The lip is
centered, so that material is split evenly: the same skin outside the
recess and inside it. A lip flush with one face would put all 0.8 mm on one
side and nothing on the other, and the thinner side would then be the whole
recess wall. At the defaults each side is 0.6 mm. At the rule's limit each
side is 0.4 mm; see open issue 3.

**D-1353. The lip wall is an explicit parameter, and the wall rule is a
validation error.** Governance rule 1 gives each physical feature one
parameter, and the lip wall is the feature that carries the stack. The rule
is an error, not a clamp: a silent clamp would change a size the user set.
The message offers the largest lip wall, the smallest outer wall, and the
largest stacking clearance, per governance rule 11. Found in review: a fix
outside a field's own range is not a fix. Each of the three clauses is in
the message only when its own field can hold the value. With the defaults
and a 2 mm outer wall, only the outer wall clause is left, because a 0.6 mm
lip wall and a 0 mm clearance are both under their field minimums. When no
single field can fix the case, the message says so and asks for two
changes.

**D-1354. The default outer wall is 3.0 mm.** The shared construction group
gives 2.0 mm. The recess rule needs `wall >= lipWall + 2c + 0.8`, which is
2.6 mm at the default lip wall and clearance. A default at 2.6 mm would sit
on the rule's boundary, so the default is 3.0 mm and the wall keeps 0.6 mm
on each side of the recess. The range is unchanged, 1.2 to 4.0 mm, because
a plain bin has no lip and may use a thin wall.

**D-1355. The front scoop and the label ledge are booleans with fixed
constants.** The precedent is D-908, the socket tray's chamfer. The feature
is "the scoop is on" and "the ledge is on". The scoop radius follows the
drawer tray's own rule, so the two shelled-tray products scoop the same
way.

**D-1356. The label ledge sits at the front foot and stays under the rim.**
The shelf starts at Z = 0, so it prints on the bed with no support, and the
upstand rises 6 mm. The 1.6 mm gap between the upstand and the front face
is the card slot. The ledge never rises above the rim, so the bin above it
cannot touch it. The ledge stands 2.8 mm in front of the bin, which the
bounds contract states.

**D-1357. The bounds contract states the true box, and the derived values
name both boxes.** The lip stands above the bin height and the ledge stands
in front of the bin depth. The contract is
`[−W/2, −D/2 − ledge, 0]` to `[W/2, D/2, H + lipHeight]`. The first derived
row is "Outside, with the lip and the ledge" and it is that box. The second
row is "Bin body", the size the user set. The third row is "Stack pitch",
the height one more bin adds. A user who plans a shelf reads the body row;
the app checks the mesh and the bed against the outside row.

**D-1358. The scoop cuts the rim and a straight slot through the lip.** The
cutter is the drawer tray's half cylinder at the rim, plus a box of the
same width through the lip. The notch is therefore open to the top of the
model and nothing bridges over it. The lip has one gap at the front; the
other three sides align the stack. Without the slot the lip would arch over
the scoop.

**D-1359. The stacking proof is two tests and two negative controls.**
`stackFitClearances` measures the fit from the pure layout: the eight
values must equal the stacking clearance, except the seat, which is zero
because the two rims meet. The geometry test intersects a bin with a copy
of itself lifted by the stack pitch and finds a volume under 1e-6 mm³. Two
controls keep the proof from passing for the wrong reason: pressing the
copy 1 mm lower gives 944 mm³ of shared material, and shifting the copy
0.5 mm sideways gives 153 mm³, while a shift of 0.2 mm, inside the
clearance, still gives none.

**D-1360. `buildPartsBinSolid` is exported.** `generate` returns a mesh and
deletes its solid, so a stacking test cannot hold two solids. The geometry
module therefore exports the builder, which returns a solid the caller
owns. `generatePartsBin` validates, calls the builder, and calls
`finishSolid`, so the product contract is unchanged.

**D-1361. No new kernel module.** The bin uses `roundedShell` and
`BOOLEAN_OVERLAP` from `shell.ts`, `roundedRectangle` from `profiles.ts`,
and `unionSolids` from `arrays.ts`. The lip ring and the recess ring are
the difference of two rounded rectangles, extruded once. That is three
lines of product code, not a module. A ring builder in `profiles.ts` is a
follow-up, not a need.

**D-1362. The bin has no underside lightening.** `lightenUnderside` cuts
pockets up from Z = 0. The underside of this product carries the recess and
the seat that the bin below it presses against. Pockets there would remove
the seat. The bin is also a tall part, so its underside is a small part of
its material.

**D-1363. Geometry version 1.** The golden record for the defaults is 688
triangles, volume 141805.64, bounds [−75, −52.8, 0] to [75, 50, 74].

**D-1364. The print pose is the modeled pose.** The bin prints with the
open side up and the underside on the bed. The product therefore sets no
`printOrientation`, the same as the drawer tray.

**D-1365. The bin is compensated on its outside size only.**
`compensable: { x: ["binWidth"], y: ["binDepth"] }`, the same semantics as
the other two products. The lip and the recess are not compensated; see
open issue 2.

**D-1366. The default base is 3.0 mm.** The shared construction group gives
2.4 mm. The same group's note says that the base is not less than the outer
wall, and the outer wall of this product is 3.0 mm by default (D-1354). The
base of a bin also carries the parts, and it presses on the rim of the bin
below it, so the base is the last part that may flex. The range is
unchanged, 1.2 to 6.0 mm.

**D-1367. The status line reports the printed box.** Found in review. The
`summary` first reported the bin body, so the status line and the bounds
disagreed. It now reports the outside width, depth, and height, the lip and
the ledge included, the same way the drawer tray and the socket tray report
their outside size. The "Bin body" row of the calculated results still gives
the size the user set.

### 6. Deviations from the spec

1. The product ships three presets, not two. The spec asks for at least
   two. The third preset is the plain bin, which is the `stacking: false`
   path a preset should show.
2. The default outer wall is 3.0 mm, not the 2.0 mm of the shared
   construction group (D-1354). The default base is 3.0 mm, not the 2.4 mm
   of the same group (D-1366). No range is widened.
3. Two validation rules cannot fire inside the parameter ranges (section 3).
   They stay as guards.
4. The prepared print records are numbered 8 and 9, after the socket tray's
   record 4. The other three wave 1 products land records at the same time.
   Renumber them at integration if the numbers collide.
5. The bin gets two prepared records, not one: one bin proves the size, and
   two bins prove the stack. Governance rule 6 asks for one printed coupon
   record; the stack cannot be measured with one print.

### 7. Measurements

Kernel time in this environment, Node 22, one warm kernel, measured with
`partsBin.generate`. Times include the mesh copy out of WebAssembly memory.

| Case | Quality | Triangles | Time |
|---|---|---|---|
| Defaults, 150 × 100 × 70 | standard | 688 | 24 ms |
| Garage shelf preset, 200 × 150 × 110 | standard | 788 | 17 ms |
| Craft room preset, 110 × 80 × 45 | standard | 692 | 14 ms |
| Workbench preset, no lip | standard | 272 | 5 ms |
| Minimum, 60 × 60 × 25 | standard | 208 | 6 ms |
| Maximum, 400 × 300 × 200 | standard | 786 | 16 ms |
| Maximum, 400 × 300 × 200 | fine | 1410 | 28 ms |
| Defaults | fine | 1216 | 24 ms |
| Defaults | draft | 424 | 10 ms |
| Plain bin, no lip, no scoop, no ledge | standard | 220 | 2 ms |

The heaviest valid case is 28 ms, which is 35 times under the sprint's one
second threshold. The test budget is 2 s, for the reason in D-913: a CI
runner can be two to three times slower, and a regression to the size of
the threshold still fails.

Golden record at geometry version 1, defaults: 688 triangles, volume
141805.64, bounds [−75, −52.8, 0] to [75, 50, 74].

Stack proof, defaults: lifted by the 70 mm stack pitch, the shared volume
is 1.7e-13 mm³, which is zero at the kernel's precision. Pressed 1 mm
lower: 944.30 mm³. Shifted 0.5 mm sideways: 153.30 mm³. Shifted 0.2 mm
sideways, inside the 0.3 mm clearance: zero.

Corner gap, defaults, measured by growing the lip profile until it leaves
the recess profile: 0.3000 mm with square corners, 0.2974 mm with a 3 mm
corner radius at 24 segments, 0.2994 mm at 48 segments.

Test counts in this worktree:

| Gate | Before | After |
|---|---|---|
| Vitest | 286 in 15 files | 334 in 16 files |
| Server render | 5 | 5 |
| Lint, typecheck | clean | clean |
| Drawer tray golden record | 362 triangles, volume 277462.54 | unchanged |

Browser suite: see section 7.1.

### 7.1 Browser suite and browser smoke

`npm run build`, then `npm run test:browser`, once, after the code was
finished: 10 tests passed in 1.5 minutes, no failure. The suite covers the
drawer tray routes and the shared app, so it proves that the new registry
entry breaks nothing.

A smoke of the new route followed, with the harness in the scratch
directory, against the production build on port 3100. Port 3000 held
another worktree's server. The table below is the smoke that followed the
review fixes; the run before them differed only in the status line and in
the conflict message.

| Step | Result |
|---|---|
| `/products/parts-bin` first Ready | 1.7 s after navigation, "Ready · 150 × 102.8 × 74 mm · stacks" |
| Page title | "DrawerForge — Stackable Parts Bin" |
| Product switcher | 3 links, the parts bin marked current |
| Calculated results | 150 × 102.8 × 74 mm; body 150 × 100 × 70 mm; 70 mm per bin; inside 144 × 94 × 67 mm; lip 1.2 mm wide, 4 mm high, 0.3 mm clearance, 0.6 mm of wall on each side; scoop 11.25 mm radius; ledge 144 mm wide, 2.8 mm in front |
| Download STL, defaults | `drawerforge-parts-bin-150x100x70-stack-7e1edf.stl`, 688 triangles, 34484 bytes |
| Preset "Garage shelf bin" | Ready, `drawerforge-parts-bin-200x150x110-stack-a4c3c1.stl`, 788 triangles |
| Conflict: a 2 mm outer wall | Error under the lip wall field: "A lip wall of 1.2 mm with two 0.3 mm clearances takes 1.8 mm of the 2 mm outer wall. The recess must leave 0.8 mm of wall. Use an outer wall of at least 2.6 mm." Download disabled. Status "Paused · Fix 1 setting; showing the last valid model." |
| Back to a 3 mm wall | Ready, the same file as before the conflict |
| Stacking lip off | "does not stack", outside 200 × 152.8 × 110 mm, `drawerforge-parts-bin-200x150x110-plain-a97896.stl`, 304 triangles |
| Console errors | The known local WebAssembly MIME fallback (12_..., D-1003), and one refused request for `http://localhost:3000/favicon.ico`. `metadataBase` uses the configured public origin, which is port 3000 by default (26_..., S11), so the favicon of a page served on port 3100 points at the other port. It is an artifact of the port, not of this product. No other error. |

### 8. Prepared print record

`sprints/PRINT_RECORDS.md` gets a "Parts bin" heading with two prepared
records:

- Record 8, the first bin at the defaults. Target 150 × 100 × 70 mm, and
  74 mm over the lip. Target lip wall 1.2 mm and clearance 0.3 mm. File
  name `drawerforge-parts-bin-150x100x70-stack-7e1edf.stl`.
- Record 9, the stack test. Target stack pitch 70 mm and clearance 0.3 mm
  per side. A person prints the same file a second time, puts one bin on
  the other, and records the pitch and the side play.

Neither record is filled. A person prints and measures.

### 9. Open issues

1. **No printed record yet.** The bin has two prepared records with target
   values only. Governance rule 6 needs one filled record before wave 1 is
   called done. The stack test needs two prints.
2. **The lip and the recess are not compensated.** The printer correction
   from S04 applies to the outside width and depth. A printer that prints
   small makes the lip wall thin and the recess narrow at the same time, so
   the two errors partly cancel. The size of what is left is a printed
   question, not a code question.
3. **Closed in S13.** The parts bin now reports the wall beside the recess to the thin-wall rule through `printedWalls`, and its defaults and stacking presets carry an outer wall that leaves 0.8 mm on each side; see 28_CONTRACT_FOLLOW_UPS_NOTES.md, D-1713. The original text follows. **At the rule's limit the wall beside the recess is 0.4 mm.** That is one
   width of a 0.4 mm nozzle. The thin-wall error of S04 reads parameters
   whose key names a wall, so it sees `wallThickness` and
   `lipWallThickness`, but not this derived value. It is the same gap as
   the socket tray's solved webs, open issue 5 of 20_KERNEL_MODULES_NOTES.md.
   The derived results show the value, so a user can read it.
4. **The label ledge adds to the depth.** The bed warning and the bounds
   use the larger depth, which is correct for the print. A user who divides
   a shelf must read the "Bin body" row, not the "Outside" row.
5. **The scoop opens the lip at the front.** Three sides align the stack.
   At the smallest width, 60 mm, the scoop is 4.5 mm in radius and the gap
   is 9 mm of a 60 mm front.
6. **A stack of bins is not checked against the bed height.** The app warns
   about one part. Nothing warns that six bins are taller than the shelf.

### 10. Follow-ups

1. A fit-test coupon for this product: one corner of the bin, 40 mm on each
   leg, with the lip and the recess. It would test the stacking clearance
   in minutes instead of hours. The coupon member of the contract already
   exists; `ProductApp` still imports the drawer tray's coupon directly
   (16_FIT_TEST_COUPON_NOTES.md, follow-up 4 of doc 20), so that import
   must move first.
2. A `rectangularRing` helper in `profiles.ts` if a second product needs a
   ring of two rounded rectangles. One product does not justify a module.
3. A divided parts bin. The drawer tray's dividers and this shell are the
   same family, and the two could share one divider function.
4. Consider a lip compensation in the printer profile after the first three
   filled records (open issue 2).

## Decisions

**D-1301. The marker cup block shares one bore diameter across every cup.**
The spec reads "Same as the socket tray with one bore diameter." Unlike the
socket tray's `boreDiameter1` to `boreDiameter4`, one per row, this product
has a single `boreDiameter` spec used by every row and every cup, because
all cups hold the same kind of marker or brush.

**D-1302. Tilted-bore containment checks the mouth and the floor
independently, not one combined shape.** The spec's Risks section asks for
the bore axis exit point at the floor, not only the top opening. A tilted
cylinder's intersection with the flat top face (the mouth) is an ellipse
wider than the bore in the tilt direction; its own end cap (the floor) is a
circle narrower than the bore in the tilt direction, shifted toward the
back wall by `depth * sin(tilt)`. Neither shape's containment implies the
other's, so both are checked, at every row's end cups, on the straight
sides and the rounded corners.

**D-1303. Row spacing along Y uses the tilted mouth's elongated size, not
the plain bore diameter.** The mouth's Y extent is `boreDiameter /
cos(tiltDegrees)` per side of the axis, i.e. an effective diameter of
`boreDiameter / cos(tiltDegrees)`. Using the plain diameter for the row
pitch solver would let two tilted mouths overlap even though each one
individually clears the minimum web from its own nominal center. Column
(X) spacing inside a row is unaffected, since the tilt is only about the X
axis.

**D-1304. The finger relief is a fixed constant behind a boolean, like the
socket tray's chamfer.** Depth 3 mm, extra diameter 6 mm. Governance rule 1
wants one parameter per feature; the feature is "finger relief on or off,"
following D-908's precedent exactly.

**D-1305. A coin cell's standing length is its diameter, not its
`cellLength` field.** The spec lists the 2032 preset as "(20, 3.2)", the
same (diameter, length) shape as every other preset, so `cellLength` stays
the cell's thickness (3.2 mm) even for a coin cell. Applying the generic
"depth = length − exposed" formula to that value would give an
almost-zero, physically wrong bore depth. `standingLength(shape, diameter,
length)` picks `diameter` for a slot cell and `length` for a round cell.

**D-1306. A coin-cell slot packs by thickness along a row, by diameter
between rows.** The coin stands on edge with its diameter running
vertical, so what determines how many coins fit side by side in a row is
their thickness (`cellLength`); what determines how far apart two rows
must sit is their diameter (`cellDiameter`), since a taller, wider cell
needs a deeper row-to-row gap even though it is thin edge-on. The slot
cutter is a rectangular prism from `polygon` and `extrude`, unioned with an
optional wider relief prism — no new kernel module, the same pattern as
the round bore plus its chamfer cone.

**D-1307. Fin pitch is a derived value, not a raw parameter.** The spec
line "Fin pitch, fin thickness, fin height, fin count" reads as four raw
inputs, but section 3 rule 2 of 20_KERNEL_MODULES_NOTES.md requires every
family B layout to be solved with `solvePitch` in a pure `deriveLayout`,
the same pattern the socket tray uses for bore pitch. `rackWidth`,
`finCount`, and `finThickness` are the raw inputs; pitch comes out of
`solvePitch` with `minimumWeb` set to 12, the print-risk rule's own number,
in place of the family's default 2.5. Fin pitch is shown to the user as a
derived value, "Fin pitch," the same way the socket tray shows "Row N
pitch."

**D-1308. The tool fin rack has no underside lightening.** Its base slab
is already only 3 to 6 mm thick, sized specifically to be minimal while
staying strong under load-bearing fins. There is no wall or cavity to
hollow the way a shelled tray has one, and `planLightening`'s own minimum
(8 mm of material inside the rim) would rarely fit a slab this thin.
Deferred; see Follow-ups.

**D-1309. The fillet is always on, not a toggle.** Section 2.6 lists "a
fillet at the fin base" as a hard print-risk rule for this product, the
same status as "base at least 3 mm," which is enforced by a spec minimum
rather than a toggle. The fillet is the convex hull of the plain fin and a
wider, 3 mm tall strip at its foot (`Manifold.hull`), exactly as the spec
suggests.

**D-1310. Found in review: the corner-containment check must use a
cutter's far corner, not its center point.** All three products originally
computed the arc-distance test from a cutter's center `(x, y)`, adding the
shape's own half-extent to the final threshold after the fact — the same
pattern the socket tray uses for a plain circle (D-914), where it is exact.
Building the tool fin rack exposed the flaw: its single row of fins sits
exactly on the slab's Y centerline, so `y = 0` always, and the check's
`dy === 0` branch always returned "clear," no matter how close a fin's
actual end reached the corner. `footprintClearsOuterWall` (marker cup
block, battery organizer) and `footprintClearsOuterSlab` (tool fin rack)
are now keyed to the shape's own far corner, `(|x| + semiX, |y| + semiY)`,
against the arc — exact for an axis-aligned rectangle, conservative for an
ellipse or a circle. Re-run against the marker cup block's and battery
organizer's own tests: only the marker cup block's "maximum" geometry
fixture needed its corner radius lowered from 20 mm to 18 mm to stay
valid, because the corrected check caught a real near-corner conflict at
the old value that the flawed formula had missed.

**D-1311. `baseThickness` is narrowed to 3-6 mm for the tool fin rack.**
The shared construction group's range is 1.2 to 6 mm. Section 2.6's
print-risk rule for this product needs at least 3 mm under the fins, so
the minimum is narrowed, per the shared group's own rule that a product
may narrow a range but never widen one.

**D-1312. `wallThickness` is reused as the fin row's edge margin.** There
is no subtracted cavity in this product, so there is no literal "wall,"
but the parameter's physical role — material reserved between a feature
and the slab's outside edge — matches closely enough that reusing the
shared name and range, rather than inventing a new parameter, keeps the
product inside the shared construction group. The copy labels it "Edge
margin" for this product.

**D-1313. The tilted bore's cutter gets a wide, two-sided cap, not a
one-sided stretch of the whole cutter.** Found in independent review of
the first commit: a slice at the defaults' top face, z 69.99, was solid
from dy -9 to -3 of a cup center and open only from -1.44 — about 9 mm of
a 21.8 mm mouth roofed over by a wedge of un-cut material up to 1.2 mm
thick. `boreCutter` overshoots the flat top face by `BOOLEAN_OVERLAP`
(0.2 mm) along its own untilted axis; once tilted, the widest disk
(radius `diameter / 2 + chamfer`) needs `radius * tan(tilt)` more
overshoot on whichever side the tilt lowers, or its material never
reaches the real cutting plane there. The first fix tried stretched the
whole cutter — body and chamfer cone together — upward by that amount,
floor held fixed by extending `depth` to match; it fully opened a plain
cylindrical bore, but for a chamfered one it also dragged the narrow
chamfer cone away from the true mouth plane, so the widened side opened
correctly while the other side still fell short, out only to the plain
body's radius, not the wider chamfer. The cutter that ships is the
original, un-shifted body and chamfer cone, unioned with a separate,
plain cylinder of the widest radius, spanning that same reach on *both*
sides of the true mouth plane before the pivot and the rotation. A
uniform-radius cylinder has no directional bias, so it opens whichever
side the rotation's own sign sends low, without the product needing to
know which side that is. A new test, `fully opens the tilted mouth
ellipse at the top face, leaving no roofed wedge`, slices just under the
top face and checks both edges of the ellipse, plus its center. A second
new test, `removes the same volume tilted as upright, once the mouth is
fully open`, checks a mathematical property of the fix at zero chamfer: a
cylindrical bore of a given depth, pivoted at its mouth on the flat top
face, removes exactly the same volume from the slab whatever its tilt —
the wider opening on one side of the mouth exactly balances the shallower
reach at the center on the other. Before the fix, less volume was removed
as tilt increased, the signature of a bore floor left partly closed.

**D-1314. Bore depth, pocket depth, and base-under-bores all use the
tilted floor's own deepest reach, not its center's vertical drop.** Found
in review: the floor disc's center sits `boreDepth * cos(tilt)` below the
mouth, but the disc is tilted too, so its low edge — at the bore's own
radius, further widened to `boreDiameter / 2 + chamferExtra` so the same
formula bounds the chamfered mouth as well — dips a further `radius *
sin(tilt)`. Checking only the center accepted an input with a through
hole: blockWidth 120, blockDepth 90, blockHeight 40, rows 1, cupsPerRow 1,
boreDiameter 35, boreDepth 40, tiltDegrees 15, chamfer off, wallThickness
2, baseThickness 1.2, cornerRadius 0, lightenUnderside off. The same
omission was in `lighteningOptions.pocketDepth` and `deriveLayout`'s
`baseUnderBores`: the defaults' own pocket ceiling had only about 1 mm of
real base material above it where the derived value claimed the full
2.4 mm, and a deep, tilted preset's pocket ceiling could sit within half a
millimeter of the bore floor's true low point. The fix is one pure
formula, `boreVerticalReach(boreDepth, tiltRadians, boreRadius,
chamferExtra) = boreDepth * cos(tilt) + (boreRadius + chamferExtra) *
sin(tilt)`, used everywhere a bore's vertical reach into the block
matters: the deepest allowed bore depth in `validate.ts` is its inverse,
`(height - base - (radius + chamferExtra) * sin(tilt)) / cos(tilt)`; the
pocket depth and the no-pocket base-under-bores both subtract the reach
directly. A new test validates the through-hole input as rejected; another
generates the defaults with pockets on and slices just above the pocket
ceiling, confirming it stays solid — full base thickness, not a sliver.
The presets were re-checked against the corrected formula; all three still
validate with comfortable margin (the brush-cups preset's pocket, for
example, comes out 16.6 mm deep, not the sliver the pre-fix formula's own
numbers suggested a naive read of the bug report might imply).

**D-1315. Battery organizer: the finger relief must clear its own, wider
minimum web, checked separately from the plain pitch solve.** Found in
review: the row and column layout is solved with each well's plain,
un-widened footprint and the family's 2.5 mm minimum web; the finger
relief widens the *mouth* by 6 mm but is not itself a cutter the solver
lays out around (D-1304 already established it as a constant behind a
boolean, like the socket tray's chamfer). At the defaults, six cells per
row left a 3.29 mm web — comfortably past the plain 2.5 mm minimum — but
the 6 mm-wider relief merged three neighbouring reliefs into one shared
trough per row instead of six separate wells; a slice at z 43.5 showed 3
troughs, not 18 wells. The fix is a second validation check, active only
when `fingerRelief` is on: the achieved web on the row layout and on the
row spacing must both clear `MINIMUM_WEB_MM + FINGER_RELIEF_WIDEN_MM`
(8.5 mm), naming the row or the rows field, the relief, and the fix
(fewer wells, a smaller clearance, a bigger organizer, or the relief off).
This is a validation-only fix; the mesh does not change. It did, however,
turn the defaults (organizerDepth 80, three rows) invalid, so the default
depth moves to 85 mm, and the AAA, 18650, and 2032 coin cell presets grow
by a few millimeters in whichever dimension was tight, to clear the new
minimum. A rejected-case test (`cellsPerRow: 6` on the defaults) and a new
slice test inside the relief's own depth, on the corrected defaults,
confirm one hole per well, not a shared trough.

**D-1316. The marker cup block's tilt rotation is flipped so "leans back,
away from the user" describes the visible marker, not the bore's own
floor.** Found in review: with the original rotation sign, a positive
tilt sent the bore floor toward positive Y and the mouth's own effective
lean — the axis extended past the mouth, opposite the floor — toward
negative Y, the front, toward the user. The spec's own words, and every
piece of copy written to match them, describe a marker that leans back,
away from the user, when the tilt is positive; that is a claim about how
an inserted marker visibly appears to lean, the natural reading for a pen
cup, not about which way the underlying hole's floor recedes. The
rotation in `tiltedBoreCutter` is negated (`rotate(-tiltDegrees, 0, 0)`);
`boreFloorY` is negated to match, so the bore floor now walks toward the
front (negative Y) and the visible marker leans back (positive Y), making
the existing copy true rather than requiring it to be rewritten. No other
copy changed.

**D-1317. A corner conflict that fails even at a square corner (radius 0)
reports the tilt or the bore depth, not a corner radius of 0 mm.** Found
in review: when the straight wall itself is too close — the mouth's or
the floor's own footprint already exceeds the wall at radius 0 — no
smaller corner radius can fix it, yet the message still named
`cornerRadius` and offered "Use at most 0 mm," a fix that fixes nothing.
`findCornerConflicts` now checks `clears(0)` first; when it still fails,
it steps `tiltDegrees` down, in its own 1 degree step, re-solving the row
spacing at each candidate (the tilted mouth's own width sets that
spacing), until one clears at the field's own corner radius. If even
upright does not clear — the wall is too close for a reason tilt never
caused, such as the chamfer alone — it falls back to stepping `boreDepth`
down instead, since a shallower bore's floor walks back less. The
dedicated test for this — `rejects a tilted bore whose floor exits the
wall while its mouth stays inside` (D-1302's own scenario) — now expects
the message on `tiltDegrees`, not `cornerRadius`, matching what the fix
actually reports.

**D-1318. Tool fin rack: every fin's foot sinks `BOOLEAN_OVERLAP` into the
slab before the union.** Found in review: the fillet strip's own foot
landed exactly at Z = baseThickness, precisely coplanar with the slab's
top face — an unsafe coincident-face Boolean, the exact case
`BOOLEAN_OVERLAP` exists to avoid (20_KERNEL_MODULES_NOTES.md section
2.1). The strip's height grows by `BOOLEAN_OVERLAP` and its build shifts
so its top stays at the same, correct height while its bottom now reaches
`BOOLEAN_OVERLAP` below Z = 0 in the fin's own local frame. The strip is a
plain rectangular prism — its cross-section does not taper with height —
so the hull's visible shape from Z = 0 up through the fin's own top is
unchanged; the extra material is entirely inside the slab already, hidden
by the union. The golden record, and every triangle count and volume in
the "Kernel time" table above, are unchanged by this fix; only the
overlap the kernel sees at that one face changed.

**D-1319. Smaller review findings, applied together.** Six further items
from the same review, none of them a geometry change:
- The tool fin rack's own copy called its presets "fin-pitch presets" and
  its custom option "your own measured spacing," describing pitch as
  something a person sets. Both are reworded ("tool-type presets," "your
  own measured fin count and thickness") to match D-1307: pitch is
  derived, never set.
- A derived value, "Blade gap at the fillet foot," reports
  `fin gap - 2 * FIN_FILLET_WIDTH_MM` (4 mm narrower than the pitch
  solver's own gap, since the fillet widens each fin by
  `FIN_FILLET_WIDTH_MM` on every side); the README and the print record
  below now name both figures instead of only the wider, top-of-fin one.
- Print record 7's prepared target fin gap was wrong: 12.8 mm, an
  arithmetic slip from before this document's own kernel-time table was
  ever measured against the real code. The correct value, matching the
  derived "Fin pitch" line at the defaults, is 18.3 mm at the top, 14.3 mm
  at the foot.
- This document's own parameter table for the tool fin rack cross-referenced
  the wrong decisions for two shared-group parameters: `wallThickness`
  pointed at D-1313, which was not a decision yet at the time, and
  `baseThickness` pointed at D-1312, `wallThickness`'s own decision. Both
  now point at the right one (D-1312 for `wallThickness`, D-1311 for
  `baseThickness`).
- Two geometry tests exercised the very feature their names promised to
  check with that feature turned off: the marker cup block's mouth slice
  test built its model at zero tilt, and the battery organizer's
  finger-relief slice test built its model with the relief off. Both now
  build with the feature on, as the review requested, and a third test
  (`tests/marker-cup-block.test.ts`, the "derives the pitch per row..."
  case) no longer accepts the literal string `"none"` as satisfying a
  regular expression meant to check the pocket-grid string's shape; it now
  matches only the grid pattern, with a separate assertion for the
  no-pockets case.

---

## Deviations from the spec

1. Fin pitch is shown as a derived value rather than exposed as a raw,
   independently settable parameter (D-1307). Building it the other way
   round — pitch settable, rack width derived — would leave the array
   unable to fit a user's measured drawer or shelf width, which
   `10_MULTI_PRODUCT_EXPANSION_PLAN.md` section 2.3 lists as this
   product's actual "M input."
2. The tool fin rack has no `lightenUnderside` feature (D-1308), unlike
   the other two products in this sprint and the socket tray.
3. Both printed coupon records for this sprint (`sprints/PRINT_RECORDS.md`)
   carry target values only, the same status the socket tray's own record
   has (20_KERNEL_MODULES_NOTES.md deviation 3). A person prints and
   measures.

---

## Measurements

Kernel time tables are under each product's section above, re-measured
after the review fixes below. All cases stay well inside the 2 second
budget (20_KERNEL_MODULES_NOTES.md D-913); the heaviest case measured
here, the marker cup block's 40-cup fine case, is 484 ms, under a quarter
of the budget.

Full suite after this sprint's three products and the review fixes: 379
cases in 18 files (from 269 in 14 before S06; 373 before the review, which
added 6 net new cases across the three test files). `npm run lint`: 0
problems. `npm run typecheck`: clean. `npm run test:ssr`: 5 of 5.
`npm run build`: succeeds (run as part of `test:ssr`).

### Browser smoke

`npm run test:browser` after the production build, Chromium under software
WebGL, this environment, run once before the review, not re-run after it
(the review's own gates are lint, typecheck, `npm test`, and
`npm run test:ssr`; see "Review findings and fixes" below). 9 of 10 pass.
The one failure, `performance-budget.spec.ts` — "the built worker chunk
stays under 80 KB" — is not a regression in any one product; see Open
issue 1. The review fixes add a small amount of code to the marker cup
block (the wide-cap cutter, the corner-conflict tilt and depth fallback),
so the worker chunk this test measures is very likely a little larger
again; not re-measured here, for the same reason it was not adjusted the
first time — the fourth wave 1 product, built in a sibling worktree, adds
to the same chunk and this branch cannot see its size.

---

## Review findings and fixes

An independent review of this sprint's first commit found three blocking
geometry defects and eight smaller items. All eleven are applied here;
`geometryVersion` stays 1 for every product (nothing had shipped). See
Decisions D-1313 to D-1319 for the full detail on each.

| # | Finding | Fix |
|---|---|---|
| 1 | Marker cup block: a tilted bore's mouth was roofed by a wedge of un-cut material at the top face. | Wide, two-sided cap on the cutter (D-1313). Golden record re-recorded. |
| 2 | Marker cup block: the depth rule and the pocket depth used the tilted floor's center, not its lower, wider reach; accepted a through hole. | `boreVerticalReach`, one formula used everywhere the reach matters (D-1314). |
| 3 | Battery organizer: the finger relief was not in the pitch solve; accepted layouts that merged wells. | A second, relief-aware minimum web, validation only (D-1315). Defaults and three presets widened to clear it. |
| 4 | Tilt direction copy read backwards against the actual rotation. | Rotation sign flipped so the existing "leans back, away from the user" copy is true (D-1316). |
| 5 | A tilt conflict that failed even at a square corner still named `cornerRadius`, "Use at most 0 mm." | Falls back to naming `tiltDegrees`, then `boreDepth` (D-1317). |
| 6 | Print record 7's target fin gap was wrong (12.8 mm). | Corrected to 18.3 mm at the top, 14.3 mm at the foot (D-1319). |
| 7 | This document's own D-1311/D-1312 cross-references, in the tool fin rack parameter table, were swapped. | Corrected (D-1319). |
| 8 | The fin rack's blade gap at the filleted foot is narrower than the pitch gap, by 4 mm, unshown. | New derived value, "Blade gap at the fillet foot" (D-1319). |
| 9 | The fin rack's copy implied pitch was a setting. | Reworded to match D-1307: pitch is derived (D-1319). |
| 10 | Two geometry tests disabled the very feature they were meant to check (tilt off, relief off); a third test's regex silently accepted `"none"` for a pockets-on case. | All three tests now exercise the feature, or assert the narrower pattern (D-1319; see items 1 and 3 above for the geometry those tests cover). |
| 11 | Fin rack: the filleted foot met the slab's top face exactly, an unsafe coincident Boolean face. | Sunk `BOOLEAN_OVERLAP` into the slab (D-1318). Golden record unchanged — hidden material only. |

Confirmed correct by the reviewer, unchanged here: the tilted-bore math
generally, the corner check being exact on straight sides and conservative
at corners (D-1310), the battery organizer's presets and their depths, the
fin rack's other rules, memory handling, `derive()` on `NaN` and
`Infinity`, the golden records (as re-recorded), governance rule 13, and
the gates.

---

## Open issues

1. **The generation worker's chunk size budget test now fails.**
   `tests/browser/performance-budget.spec.ts` expects the built
   `generation.worker-*.js` chunk under 80 KB; it measures 95517 bytes
   after this sprint's three products are registered. The worker bundles
   every registered product's `generate()`, so its size grows with the
   catalog; the budget was set when the catalog held two products. This
   sprint's fourth product, the stackable parts bin, is built in parallel
   and adds further size this branch cannot measure. The budget constant
   (`WORKER_CHUNK_BUDGET_BYTES` in that test file) was not raised here,
   since the test file is outside this sprint's Scope and any change made
   now would not account for the fourth product. The integrator should
   raise it once, after merging all four wave 1 products, based on the
   final combined size.
2. **Bore and well diameters are not compensated.** Same status as the
   socket tray's open issue 1 in 20_KERNEL_MODULES_NOTES.md: the printer
   correction applies to outside width and depth only. Applies to the
   marker cup block's bores and the battery organizer's wells.
3. **The webs are not checked against the nozzle.** Same status as the
   socket tray's open issue 5. Applies to the minimum webs in all three
   products here, including the tool fin rack's 12 mm fin gap.
4. **No printed record exists yet for any of the three products.**
   `sprints/PRINT_RECORDS.md` carries prepared records with target values
   only (Records 5 to 7). Governance rule 6 needs a filled record before
   wave 1 is called done.

---

## Follow-ups

1. Raise `WORKER_CHUNK_BUDGET_BYTES` in
   `tests/browser/performance-budget.spec.ts` once all four wave 1
   products are merged (Open issue 1).
2. Consider whether the tool fin rack should get underside lightening once
   a lightening plan is designed for a slab this thin (D-1308), or decide
   explicitly that a load-bearing base stays solid.
3. A hole or well correction in the printer profile (S05 follow-up 3)
   grows more valuable with three more bore or well products in the
   catalog; still not built.
4. `tests/helpers/mesh-checks.ts` is now shared by five products' geometry
   tests; S05 follow-up 1 (move `tests/geometry.test.ts` onto it) is worth
   revisiting once someone is ready to touch that golden test file on
   purpose.
