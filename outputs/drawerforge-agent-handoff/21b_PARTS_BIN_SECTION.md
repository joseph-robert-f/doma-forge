# 21b. Stackable Parts Bin Section

Date: 2026-09-02
Status: Implemented on the S06 parts bin worktree.
Reads with: sprints/S06_WAVE_1_PRODUCTS.md item 4,
20_KERNEL_MODULES_NOTES.md sections 2 and 3,
10_MULTI_PRODUCT_EXPANSION_PLAN.md sections 1.6, 2.3, 2.5.

**Note for the integrator.** This file is the parts bin section of
`21_WAVE_1_PRODUCTS_NOTES.md`. Another agent owns that document and writes
the sections for the marker cup block, the battery organizer, and the tool
fin rack. Merge the content below into that document as one product
section, then delete this file. The decisions use the D-1351 series, which
the sprint plan reserves for the parts bin. The other three products use
D-1301 upward.

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
3. **At the rule's limit the wall beside the recess is 0.4 mm.** That is one
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
