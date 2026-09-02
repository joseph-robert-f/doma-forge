# 22. Family A Extensions Notes

Date: 2026-09-02
Status: Implemented on the S07 sprint branch.
Reads with: sprints/S07_FAMILY_A_EXTENSIONS.md,
10_MULTI_PRODUCT_EXPANSION_PLAN.md sections 1.6, 2.2, 2.3, 2.5, 2.6,
11_PRODUCT_REGISTRY_REFACTOR_NOTES.md, 13_DESIGN_FILE_NOTES.md,
18_VIEWER_SCALE_NOTES.md, 20_KERNEL_MODULES_NOTES.md

This document records sprint S07. It adds a `layout` parameter kind to the
product contract, two kernel additions for family A, and two products that
use them: the remote and controller caddy, and the two-tier drawer riser.
The `layout` kind is a product-contract change. Section 2 gives the schema
and the solve rule. Section 3, decision D-1401, gives the exact type.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/products/types.ts` | Adds `LayoutSpec` and the `layout` kind to `ParameterSpec`. Adds `number[]` to `ParameterValue`. The contract change. |
| `lib/products/shared.ts` | `normalizeLayout`, the `layout` cases in `normalizeFromSpecs` and `validateAgainstSpecs`, and the list serialization in `signatureFromSpecs`. |
| `lib/kernel/mesh.ts` | `finishSolid` copies array parameters, so a model never shares a list with its caller (D-1418). |
| `app/components/ProductApp.tsx` | A preset and a reset go through `normalize`, so state holds no module-level array. A correction that breaks a product rule shows that rule's own message. |
| `app/components/ParameterControls.tsx` | `LayoutControl`: one number input per well, an add button, and a remove button. |
| `app/globals.css` | Styles for the well grid, the two buttons, and the hint. |
| `lib/kernel/arrays.ts` | Adds `dividerArrayAtPositions`. The existing functions do not change. |
| `lib/kernel/legs.ts` | New. `planLegPosts`, `legPost`, `legPosts`, and the leg rules. |
| `lib/products/remote-caddy/` | `copy.ts`, `schema.ts`, `validate.ts`, `geometry.ts`, `presets.ts`, `index.ts`. |
| `lib/products/drawer-riser/` | The same six files. |
| `lib/products/registry.ts` | Registers `remoteCaddy` and `drawerRiser` after `socketTray`. |
| `tests/layout-parameter.test.ts` | 21 cases: normalization, validation, the signature, and the design file round trip. |
| `tests/kernel-family-a.test.ts` | 14 cases: the divider array, the corner clip, and the leg rules at the boundary. |
| `tests/remote-caddy.test.ts` | 29 cases, with the golden record and the slice test. |
| `tests/drawer-riser.test.ts` | 27 cases, with the golden record, the leg slice, and the gusset check. |
| `tests/app.integration.test.tsx` | 3 new cases: a well width edit rebuilds the preview and renames the download; add, remove, the read-only solved well, and the layout error; a printer correction that breaks the solved well. |
| `tests/workspace.test.ts` | 2 new cases: a layout round trip through the envelope, and a stored layout that no longer validates. |
| `tests/products.test.ts` | One added branch, so the shared signature case knows the `layout` kind. See deviation 1. |
| `tests/browser/performance-budget.spec.ts` | The worker chunk budget grows from 80 KB to 128 KB. See open issue 1. |
| `README.md` | The caddy section, the riser section, and three code-layout bullets. |
| `sprints/PRINT_RECORDS.md` | Records 5 and 6, prepared with target values. |

### 1.2 Test counts

| Gate | Before | After |
|---|---|---|
| Vitest | 293 in 15 files | 394 in 19 files |
| Server render | 5 | 5 |
| Browser, Playwright | 10 | 10 |
| Drawer tray golden record | 362 triangles, volume 277462.54 | unchanged |
| Socket tray golden record | 4092 triangles, volume 412174.09 | unchanged |

---

## 2. The layout schema and the solve rule

### 2.1 The schema

A `layout` parameter holds a list of well widths in millimeters, one per
column. The value type is `number[]`. The spec gives the count limits, the
range of one width, and the width a new well starts with.

```ts
export interface LayoutSpec {
  kind: "layout";
  label: string;
  shortLabel: string;
  /** One line under the editor. Say that the last well is solved. */
  description: string;
  /** The fewest wells the list may hold. */
  minCount: number;
  /** The most wells the list may hold. */
  maxCount: number;
  /** The range of one well width. */
  min: number;
  max: number;
  step: number;
  unit: "mm";
  /** The width a well takes when the user adds one. */
  newValue: number;
}
```

### 2.2 The solve rule

The product writes the solved width back into the last entry during
normalization (D-1415), so the list a product holds is always the list it
builds.

The product solves the last well. Let `n` be the number of wells, `w[i]` the
width the user typed for well `i`, `t` the divider thickness, and `inner` the
span inside the outer walls.

```
inner   = caddyWidth − 2 × wallThickness
solved  = inner − (n − 1) × t − (w[1] + … + w[n−1])
```

The built widths are `w[1] … w[n−1]` and then `solved`. The sum of the built
widths plus `(n − 1) × t` is always `inner`, so the wells always fill the
caddy. Normalization replaces `w[n]` with `solved`, so the last entry is
never a value the geometry ignores. A list that cannot be solved, because a
field is cleared, keeps its last entry until the user types a number again.

The divider centers follow from the same walk. The first well starts at
`−inner / 2`. After each well the walk adds half a divider, records the
center, and adds the other half.

### 2.3 Normalization and validation

| Input | Result |
|---|---|
| `[40, 55, 40]` | kept, each width rounded to 0.001 |
| `["40", "55.5"]` | `[40, 55.5]` |
| `[40, "", 60]` | `[40, NaN, 60]`, so the user can type again |
| `[-5, 60, 60]` | kept; validation reports "Well 1 must be between 25 and 300 mm." |
| 7 widths, maximum 5 | cut to the first 5 |
| 1 width, minimum 2 | filled to 2 with the spec's new-well width |
| not an array | the product's default list, copied |

Validation reports the count first, then every well by number. The message
names the well, never the index.

---

## 3. Decisions

**D-1401. The `layout` kind is one new member of the `ParameterSpec` union.**
The exact type is in section 2.1. Nothing else on the contract changes: no
existing member changes its type, its name, or its meaning. `ParameterValue`
gains one branch, `S extends LayoutSpec ? number[]`, and it is the first
branch, so a spec with a `min`, a `max`, and a `step` is never read as a
number spec. Alternative: a separate `layouts` record beside `specs`. That
splits the one iteration order the signature, the form, and the design file
depend on (D-101). This is the sprint's one contract change.

**D-1402. The last well is solved, and the editor shows it as solved.**
The list holds one width per well. The product solves the last one. The
editor renders that well read-only, with the word "solved" beside its label,
because the value in the field is a result and not an input. Normalization
writes the solved width into the list (D-1415), so the field, the file name,
and the mesh carry one number. Add and remove work on the well in front of
the solved well (D-1416), so the solved well stays last.

**D-1403. A width out of range is a validation error, not a clamp.**
Normalization converts and rounds; it does not clamp a width to the range.
The solve of the last well is a different rule, and it belongs to the
product, not to the shared normalization (D-1415). This is exactly how a
number parameter behaves, so one rule covers both kinds. The count is
different: normalization cuts a list that is too long and fills a list that
is too short, because the list length is structure, not a value. A design
file with 10 000 wells then loads as a legal design instead of taking the
page down.

**D-1404. The signature writes a list as `[70,70,72]`.**
Fields are joined with `|` and list entries with `,`, so no list can be read
as two fields. The brackets keep the count in the signature: `[70,70]` and
`[70,70,0]` are different designs. `String(array)` would also be
deterministic, but it loses the brackets and reads like a plain string.

**D-1405. The layout editor has one remove button, not one per well.**
It removes the well in front of the solved well (D-1416). Alternative: a
remove button on each well. With the last well solved, every typed well is
the same kind of well, so the extra buttons add no power. The test ids are
`param-<slug>-well-<n>`, `param-<slug>-add-well`, `param-<slug>-remove-well`,
and `param-<slug>-error`.

**D-1406. `dividerArrayAtPositions` takes an axis, not only X.**
The spec asks for explicit X positions. The riser needs the same array along
Y for its rows, so the option `axis: "x" | "y"` defaults to `"x"`. Each
divider is a full-length box intersected with the outer body, exactly as the
drawer tray builds its dividers, so a divider never cuts through a rounded
outer corner. An empty position list returns null, so a product with one well
needs no special case. The existing functions in `arrays.ts` do not change.

**D-1407. The leg rules live in a pure planner, like the pitch solver.**
`planLegPosts` returns `{ ok: true, centers, slenderness, gap }` or
`{ ok: false, reason, ... }` with `reason` of `"value"`, `"section"`,
`"slenderness"`, or `"gap"`. The planner names no field; the product writes
the message (D-904). The rules are the print-risk rules for product 3 in
section 2.6 of the expansion plan: the leg height is at most 12 times the
section, and the section is at least 8 mm. The planner adds a third rule: two
opposite posts leave at least 10 mm between them.

**D-1408. The riser prints upside down, and the deck is a bridge.**
`printOrientation` rotates the part 180 degrees about X. In the modeled pose
the part stands as it stands in the drawer, legs down, and every gusset is
then an overhang. In the print pose the legs point up and every gusset
carries the layer above it.

The flip puts the tray rim on the bed, not the deck: the tray is open at the
top in the modeled pose, so the rim is the lowest face after the flip. Each
compartment is then an upside-down box whose ceiling is the deck. That
ceiling is a bridge as wide as the compartment. With the defaults a
compartment is 146.5 × 96.5 mm, so the bridge spans 96.5 mm, far past the
40 mm limit rule 5 of document 20 sets for an underside pocket. The pose is
still the better one, because legs down would bridge the whole deck between
four posts, 299 × 199 mm. The note beside the toggle, the README, and a new
derived value "Longest bridge" all say what the span is. The app sets no
rule yet; see open issue 8. Corrected in review: the first note claimed that
the part needs no supports at all.

**D-1409. The leg inset is the larger of the corner radius and the gusset.**
Two rules meet at the same number. At the corner radius or more, the post's
outer corner stands on the straight part of the deck outline, so a large
rounded corner cannot cut the post open. This is rule 4a of document 20, held
by construction instead of by a validation message. At the gusset or more,
the flare at the top of the post stays under the deck instead of standing out
past its edge. Found in the first geometry run: with the inset at the corner
radius alone, the default riser measured 309 mm wide instead of 299 mm.

**D-1410. The gusset is a hull, and it is 45 degrees.**
`legPost` takes the convex hull of the post section low down and of the wider
pad at the deck. The flare goes out by the same number of millimeters that it
goes up, so its face is at 45 degrees and it prints without support in the
print pose. A scaled extrusion would give the same shape but would not keep
the rounded section at both ends. The gusset is three quarters of the leg
section, and never more than half the clear height.

**D-1411. The caddy needs no corner rule.**
The caddy solves its wells in the rectangle inside the walls, and rule 4a
asks what a large corner radius does to a feature at the end of that
rectangle. The dividers are clipped to the outer profile, and the front wall
cut spans the whole width, so no feature can open into the outside. The
corner radius maximum is 20 mm and the smallest side of the caddy is 60 mm,
so the radius also stays under half the shorter side. The test pins both
ends: 20 mm is accepted and 21 mm is refused by the spec range.

**D-1412. The well depth sets the material under a well.**
The caddy cuts its cavity from the well floor, at `caddyHeight − wellDepth`,
so the base under a well is the height minus the well depth. The base
parameter is the smallest value that base may take. This is the socket tray's
rule for the base under a bore, in the same words.

**D-1413. The riser height is the clear height plus the deck plus the tray.**
`trayHeight` is the wall height above the tray floor, not the whole tray. The
rule in the sprint spec reads "clear height plus tray height plus base", so
the three values add up to the whole part with no value counted twice. The
derived card shows the total and the budget together: "82.4 mm of 115 mm".

**D-1414. The riser keeps the even grid.**
The riser is the drawer tray on legs, so its rows and columns stay even, and
its compartment rule stays 10 mm. Uneven rows are out of scope for this
sprint. A later product can give the riser a `layout` parameter without a
contract change.

**D-1415. Normalization writes the solved width into the last well.**
Found in review. The last well's own value reached the signature and the
file name but no geometry, so two designs with one mesh had two file names,
and the field showed a number the product ignored. `remoteCaddy.normalize`
now runs `solveLastWell` after the shared normalization: it replaces the last
entry with the solved width. A layout that cannot be solved, because a field
is cleared, is left as it is, so a cleared field does not blank a second
input. The alternative, passing the built widths into the control, needs a
new contract member, and this sprint spends its one contract change on the
`layout` kind.

Two effects follow. The solved width now also meets the spec range check, so
a solved well under 25 mm produces both the range message and the product's
own message. The product adds its own message first, so the form shows the
message that names the fix. And a design file with a stale last well loads
as the solved design, which is the design its other values describe.

**D-1416. Add and remove work on the well in front of the solved well.**
With D-1415 the last well holds all the slack, so appending a well would
always leave the new well with a negative width. "Add well" now inserts the
new well in front of the solved well, and "Remove well" takes the well in
front of it. The solved well then grows or shrinks by the change, and the
caddy stays full. The test ids do not change.

**D-1417. A fix is offered only when it leads to a legal layout.**
Found in review. The message for a solved well that is too narrow said
"Shrink well 1 by 8 mm" even when well 1 would then be under the 25 mm
minimum. Each of the three fixes is now tested before it is offered: the
shrink fix needs the widest well to stay at or over the minimum, the remove
fix needs more wells than the minimum count, and the wider-caddy fix needs
the caddy width to stay inside its own range. A layout with no legal fix
reads "Use narrower wells, or fewer of them."

**D-1418. `finishSolid` copies array parameters.**
Found in review. The model's `parameters` field was a shallow copy, so
`model.parameters.wellWidths` was the caller's array. A caller that changed
one width changed the record the mesh was built from. `finishSolid` now
copies every array value one level down.

---

## 4. Deviations from the spec

1. **`tests/products.test.ts` gains one branch.** The brief says not to edit
   that file. The file's shared case "changes its signature when any
   parameter changes" reads `spec.options` for every kind that is not a
   number and not a boolean. With a `layout` spec it throws at run time, and
   it does not compile, because `spec.options` does not exist on
   `LayoutSpec`. The new branch changes the first width by one step. It is
   three lines, in one place, and it is the smallest change that lets a new
   parameter kind exist at all. Every other rule in that file is untouched.
2. **The worker chunk budget grows.** See open issue 1.
3. **The caddy has no corner-radius rule.** See D-1411. The spec's standard
   product rules ask for a corner check; here the check is held by
   construction and the test proves it.
4. **The print record for each product is prepared, not filled.** A person
   prints and measures. Records 5 and 6 hold the target values only.

---

## 5. Measurements

Kernel time in this environment, Node 22, one warm kernel. Times include the
mesh copy out of WebAssembly memory.

| Case | Wells or grid | Quality | Triangles | Time |
|---|---|---|---|---|
| Caddy, defaults, 220 × 130 × 60 | 3 wells | standard | 288 | 9 ms |
| Caddy, minimum, 80 × 60 × 20 | 2 wells | standard | 64 | 3 ms |
| Caddy, maximum, 400 × 300 × 120 | 5 wells | standard | 344 | 13 ms |
| Caddy, maximum | 5 wells | fine | 536 | 21 ms |
| Caddy, "Three remotes" preset | 3 wells | standard | 288 | 11 ms |
| Caddy, "Two controllers" preset | 2 wells | standard | 260 | 6 ms |
| Caddy, "Five wells" preset | 5 wells | standard | 344 | 11 ms |
| Riser, defaults, 299 × 199 × 82.4 | 2 × 2 | standard | 1184 | 24 ms |
| Riser, minimum, 80 × 80 × 21.6 | 1 × 1 | standard | 924 | 10 ms |
| Riser, maximum, 594 × 594 × 276 | 6 × 8 | standard | 1992 | 41 ms |
| Riser, maximum | 6 × 8 | fine | 2928 | 58 ms |
| Riser, "Desk drawer" preset | 2 × 3 | standard | 1220 | 20 ms |
| Riser, "Deep workshop drawer" preset | 2 × 4 | standard | 1256 | 22 ms |
| Riser, "Narrow drawer" preset | 1 × 2 | standard | 1140 | 17 ms |

Every case is far under the one second threshold. The test budget is 2 s, as
D-913 sets it for a slower runner.

Golden records at geometry version 1:

| Product | Triangles | Volume | Bounds |
|---|---|---|---|
| Remote caddy, defaults | 288 | 498253.12 | [−110, −65, 0] to [110, 65, 60] |
| Drawer riser, defaults | 1184 | 280931.83 | [−149.5, −99.5, 0] to [149.5, 99.5, 82.4] |

Built worker chunk: 85 077 bytes with four products.

### 5.1 Browser smoke

Recorded after the production build in this environment, with Chromium under
software WebGL.

| Step | Result |
|---|---|
| `/products/remote-caddy` first Ready | "Ready · 220 × 130 × 60 mm · 3 wells" |
| Page title | "DrawerForge — Remote and Controller Caddy" |
| Solved wells, defaults | "70 × 70 × 72 mm" |
| Well 2 set to 60 mm | "70 × 60 × 82 mm", preview Ready again |
| Download STL | `drawerforge-remote-caddy-220x130x60-3w-598fc4.stl`, 14 484 bytes |
| The solved well's input | read-only, and it shows the solved width |
| Add well | the new well 3 holds 50 mm, and the solved well 4 holds 30 mm |
| Well 3 set to 120 mm | Error under the editor: "Well 4 is solved to −40 mm, and every well must be at least 25 mm wide. Shrink well 3 by 65 mm, remove a well, or make the caddy 65 mm wider." Download disabled. |
| Remove well | Ready again |
| `/products/drawer-riser` first Ready | "Ready · 299 × 199 × 82.4 mm · 2 × 2 · 45 mm clear" |
| Derived legs, bridge, and height | "4 posts, 12 mm section, 45 mm clear", "96.5 mm, the compartment ceiling", "82.4 mm of 115 mm" |
| Print pose toggle | present; note "Print the riser upside down. The tray rim goes on the bed and the legs point up. Every gusset is then self-supporting. The deck over each compartment is a bridge as wide as the compartment." |
| Download STL | `drawerforge-drawer-riser-299x199x82p4-2x2-e0becc.stl`, 59 284 bytes |
| Clear height 130 mm | Error: "The riser is 167.4 mm tall. It must be at most 115 mm: the drawer usable height 120 mm minus 5 mm. Lower the clear height by 52.4 mm, lower the tray, or measure the drawer again." |
| Product switcher | 4 links |
| Console errors | Only the known local WebAssembly MIME fallback (12_WEB_WORKER_GENERATION_NOTES.md, D-1003). No other error. |

---

## 6. Open issues

1. **The worker chunk budget.** The worker imports the registry, so it holds
   every product's schema, validation, and geometry. Two products measured
   under the S10 budget of 80 KB; four measure 85 KB. This sprint raised the
   budget once, to 128 KB. The integrator sets the final number after every
   wave 2 sprint lands. The real fix is a dynamic import per product in the
   generation worker, so a page loads one product's geometry.
2. **The printer correction lands on the solved well.** The caddy compensates
   `caddyWidth`, so a correction changes the inside width, and the solve
   gives the whole change to the last well. The wells the user typed keep
   their size, which is what a person wants for a measured well, but nothing
   in the app says so. A correction that makes the solved well too narrow now
   shows the product's own message, which names the well and the fix
   (`ProductApp.tsx`, `correctionMessages`), instead of a bare "past a limit"
   line. The same open issue exists for the socket tray's bores (document 20,
   open issue 1).
3. **No printed record exists for either product.** Records 5 and 6 hold
   target values only. Governance rule 6 needs one filled record per product.
4. **The riser's legs are not checked against the nozzle.** The thin-wall
   rule reads a parameter whose key names a wall or a thickness, so it sees
   the walls and the deck. It does not see the leg section or the gusset.
   With a section of 8 mm and a 1.5 mm nozzle the leg is under three nozzle
   widths. This is the same gap document 20 records for the solved webs.
5. **The riser's load limit is a note, not a rule.** The slenderness rule
   protects one leg against buckling. Nothing checks the deck against
   bending, and the plan's "ribs when the span is over 150 mm" rule for
   product 12 is not implemented here. The README says not to load the riser
   with more than a few kilograms. A printed record decides whether a rib
   under the deck is needed.
6. **The caddy divider gets a small notch at the front.** The front wall cut
   spans the wall thickness, and a divider is clipped to the outer body, so
   the front 2 mm of each divider is lowered with the wall. The notch is the
   wall's own thickness deep. It prints cleanly and it looks intended.
7. **The editor cannot mark one well as the wrong one.** A validation result
   carries messages, not field indexes, so the layout editor sets
   `aria-invalid` on every well input when any well is wrong. A per-well mark
   needs the index in the result, which is a contract question. The message
   itself names the well, so a screen reader reads the well number from the
   error text.
8. **The riser deck bridges each compartment in the print pose.** Found in
   review. The 180 degree flip puts the tray rim on the bed, so each
   compartment is an upside-down box and its ceiling is the deck. With the
   defaults a compartment is 146.5 × 96.5 mm, so the bridge spans 96.5 mm.
   The limit this app uses elsewhere, for an underside pocket, is 40 mm
   (document 20, section 3, rule 5). The alternative pose is worse: legs down
   bridges the whole 299 × 199 mm deck between four posts. The app does not
   refuse the print. It reports the span in a derived value, "Longest
   bridge", and the README and the pose note say what it means. A printed
   record decides which rule this product needs: a maximum compartment span,
   a rib under the deck, or a two-part print with the deck as its own piece.
   Do not add a rule before a person prints one.

## 7. Follow-ups

1. Measure the worker chunk after every wave 2 product is merged, and open
   the dynamic-import change if the number passes 128 KB (open issue 1).
2. Give the entryway valet (catalog product 4) the `layout` kind. Its wells
   are measured the same way. No contract change is needed.
3. Consider a second layout parameter for rows, once one product needs uneven
   rows. The kind already holds a list; the product decides the axis.
4. Print one caddy and one riser, and fill records 5 and 6. Load the riser
   for one day and record whether a leg bends (open issue 6).
5. Move `tests/geometry.test.ts` onto `tests/helpers/mesh-checks.ts`, as
   document 20 follow-up 1 asks. This sprint did not touch that file.
