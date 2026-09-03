# 24. Bracket Family Notes

Date: 2026-09-03
Status: Implemented on the S09 sprint branch.
Reads with: sprints/S09_BRACKET_FAMILY.md,
10_MULTI_PRODUCT_EXPANSION_PLAN.md sections 1.6, 2.2, 2.3, 2.5, 2.6,
20_KERNEL_MODULES_NOTES.md, 22_FAMILY_A_EXTENSIONS_NOTES.md,
19_PRINTER_PROFILE_NOTES.md, 27_PRINT_PROGRAM_NOTES.md

This document records sprint S09. It adds the bracket family to the kernel,
the load rules as validation, a load model with stated assumptions, a
print-pose overhang test, and four products: the wall hook rail, the
headphone and controller mount, the shelf riser, and the entryway valet.
The catalog goes from eleven products to fifteen. The one contract change
is additive: an optional `couponBoundsContract` (D-1617).

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/kernel/brackets.ts` | New. The hook rule, the J-hook profile and solid, `extrudeAlongX`, screw cutters with countersinks, the screw row plan, the hull gusset, the rib plan, the leg split plan, and the load model. |
| `lib/products/wall-hook-rail/` | `copy.ts`, `schema.ts`, `validate.ts`, `geometry.ts`, `presets.ts`, `index.ts`. The geometry exports `buildWallHookRail` for the coupon. |
| `lib/products/headphone-mount/` | The same six files. |
| `lib/products/shelf-riser/` | The same six files. |
| `lib/products/entryway-valet/` | The same six files. |
| `lib/products/registry.ts` | Registers the four products after `cardHolder`, in the order above. |
| `lib/products/types.ts` | Adds the optional `couponBoundsContract` member (D-1617). |
| `app/components/ProductApp.tsx` | The fit-test download reads the product's coupon bounds contract; the drawer-tray constant import is gone. |
| `lib/products/drawer-tray/index.ts` | States its coupon bounds: the tray footprint, 5 mm tall. |
| `tests/products.test.ts` | One added case: a product with a coupon states its coupon bounds. |
| `tests/helpers/print-pose.ts` | New. Turns a mesh as the viewer does and reports every face that points down more than 45 degrees, except faces on the bed. |
| `tests/kernel-brackets.test.ts` | 18 cases: the hook rule at its boundaries, the J-hook profile and its turn, the screw cutters and the row rule, the gusset, the ribs, the leg split, and the load model. |
| `tests/wall-hook-rail.test.ts` | 35 cases, with the golden record, the print-pose check on six fixtures, the slices, and the coupon. |
| `tests/headphone-mount.test.ts` | 27 cases, with the golden record, the print-pose check, and the pocket ring slice. |
| `tests/shelf-riser.test.ts` | 30 cases, with the golden record, the print-pose check, the pocket and rib slices, and the split-leg slices. |
| `tests/entryway-valet.test.ts` | 26 cases, with the golden record, the print-pose check, and the well, slot, and wedge slices. |
| `tests/browser/performance-budget.spec.ts` | The worker chunk budget grows from 176 KB to 224 KB, and the test title reads the constant. See open issue 1. |
| `README.md` | Four product sections with print notes, one merged kernel bullet, four code-layout bullets, and a paragraph on the print-pose test. |
| `sprints/PRINT_RECORDS.md` | Records 15 to 18, prepared with target values. Record 15 is the single-hook coupon. |
| `15_SPRINT_PLAN.md`, `README.md`, `manifest.json`, `CHECKSUMS.sha256` | The status line, the document map, the inventory, and the checksums. |

### 1.2 Test counts

| Gate | Before | After |
|---|---|---|
| Vitest | 681 in 27 files | 844 in 32 files |
| Server render | 5 | 5 |
| Browser, Playwright | 10 | 10 |
| Golden records of the eleven earlier products | | unchanged |

---

## 2. The load model

### 2.1 The formula

The spec asks for "a simple estimate: perimeters times root area times a
constant, stated as approximate". The implementation is a bending estimate,
because a hook fails in bending at its root and a deck fails in bending
between its legs, and a pure area model does not see the projection. Both
are in `lib/kernel/brackets.ts`:

| Case | Load in newtons | Used by |
|---|---|---|
| Cantilever, load at the tip | `W = σ · w · t² / (6 · arm)` | Hook rail hook and shelf, mount hook, valet rest |
| Beam, load spread along it | `W = 8 · σ · w · t² / (6 · span)` | Mount pocket floor, shelf riser deck |

`w` is the section width across the bending axis, `t` the section
thickness, `arm` the projection or the rest height, `span` the pocket width
or the longest span between two legs.

### 2.2 The constant and its assumptions

`σ = 5 MPa`, the allowable bending stress. It is about a quarter of the
layer adhesion strength of PLA printed with three perimeters at 0.2 mm
layers, so the estimate carries a safety factor near four against the weak
direction. The print pose puts the hook root's tension across the layers,
which is why the layer strength is the right one to derate.

The assumptions are fixed and named in every note: "3 perimeters in PLA,
approximate". Perimeters are not a parameter (D-1611). A person who slices
with four perimeters gets a conservative number; a person who slices with
two gets an optimistic one, and the README says so.

### 2.3 The cap

Loads over 5 kg are out of the spec's scope. `loadNote` never shows a
number above 5 kg. It shows "5 kg or more at 3 perimeters in PLA,
approximate. This app rates nothing above 5 kg." The default mount hook, the
default valet rest, and every shelf riser deck reach the cap. The default
hook rail hook shows "about 3.3 kg".

### 2.4 Calibration

Nothing here is measured yet. Print record 15, the single-hook coupon,
loads a default hook to failure. The mass at which it breaks, divided by
the 3.3 kg estimate, is the first calibration of the constant. Until that
record exists the estimate is a model, and every note says "approximate".

---

## 3. The print-pose overhang test

### 3.1 Method

`tests/helpers/print-pose.ts` turns every vertex of a generated mesh with a
`THREE.Euler` built from the product's `printOrientation.rotationDegrees`,
in degrees, the same call `app/components/ModelViewer.tsx` makes for the
"Print pose" toggle. A product without a hint is checked in its modeled
pose. For every triangle it computes the unit normal from the turned
vertices. A face whose normal points down, and whose angle from vertical
is over 45 degrees plus 0.05 degrees of tolerance, is an overhang, except a
face whose three corners lie at the lowest Z of the turned part: that face
is on the bed.

Every product test runs the check on six fixtures, the range corners
included, and asserts an empty list. The assertion message names the worst
faces by angle and centroid.

### 3.2 What the test caught

The first shelf riser build had 26 faces at 90 degrees: the ribs started
at the deck underside, so where a rib crossed a lightening pocket its
bottom face hung over the pocket cavity. The fix starts every rib inside
the deck skin, below the pocket floors, so a rib fills the pocket it
crosses. The slice test at pocket level now counts the 15 pockets cut into
24 holes by the two ribs, which proves the fill.

### 3.3 What the test cannot see

A bridge has a downward face that the normals test reports. So a product
that passes has no bridges either, which is stricter than the spec asks.
The drawer riser from S07 keeps its deck bridge and is not under this
test. The test also cannot see a thin wall, a small island, or a first
layer that lifts; those are slicer and printer matters.

The one face at the limit is the 45 degree ramp under each hook lip. It
is designed at exactly 45 degrees so the lip can print in the plate-down
pose (D-1603).

---

## 4. The load rules

Every rule from 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 2.6 is a
validation error, and every one has a boundary test that passes at the
limit and fails one step over.

| Rule | Where | Boundary test |
|---|---|---|
| Hook root at least 8 mm | `checkHookRule`, the `hookRoot` spec minimum | root 8 passes, 7.5 fails |
| Projection at most 2.5 times the root | `checkHookRule`, message on `hookProjection` | root 8: 20 passes, 20.5 fails; root 12: 30 passes, 30.5 fails |
| Projection never over 60 mm | `checkHookRule`, and the spec maximum | root 24: 60 passes, 60.5 fails the range |
| Fillet at the root | `jHookProfilePoints`, 3 mm above and below the arm | profile bounds, and the turn test |
| Screw bores at least 8 mm from any edge | `planScrewRow` for the plate ends; the Z band in each layout for the plate top and bottom, the hook root band, and the gussets | rail: spacing 215 passes, 216 fails; height 42 passes, 41 fails; with the shelf 77 and 76; mount: height 117 and 116, without the pocket 68 and 67 |
| Screw bores never inside a hook root | the screw band starts 8 mm above the root band's top fillet | the height rule above |
| Hook width at least 20 mm | the mount's `hookWidth` spec minimum | 20 passes, 19 fails |
| Leg height over section at most 12 | `planLegPosts` from S07 | section 10: 120 passes, 121 fails |
| Gussets always on | every post has a hull gusset, every shelf has end gussets; no parameter turns them off | the gusset slice tests |
| Ribs when a deck span is over 150 mm | `planRibs` under the shelf riser deck and under the rail shelf | span 150 gives none, 150.5 gives one; 200 mm deck gives one rib, 199 none |

---

## 5. Decisions

**D-1601. Every bracket is modeled in its wall pose: the wall is Y = 0,
and the hooks face -Y, toward the viewer.**
The kernel builders work with the plate in Y from zero to its thickness
and every feature toward +Y. Each product assembles its part that way and
turns it 180 degrees about Z at the end, so the finished part has the
plate in Y from minus its thickness to zero and every hook, pocket, and
shelf toward -Y. The viewer's default camera looks at the -Y side, the
side the tray products keep their front on, so the hooks show in the
default view instead of hiding behind the plate; the first browser check
of this sprint showed the rail from behind, which is what forced the turn.
The print pose is one turn of -90 degrees about X, which puts the wall
face on the bed and the hooks up. Alternative: model in the print pose, as
the shelf riser does. Rejected for the wall parts because a rail lying on
its back reads badly, and the drawer riser precedent (D-1408) already
shows a part as used with a toggle to its print pose.

**D-1602. The load rules are validation errors, not warnings.**
The spec says so, and the app already refuses a thin wall (D-1109 in the
printer profile notes) for the same reason: a warning about a part that
snaps is a part that snaps. Each message names the limit and the two ways
out: the longest projection this root carries, or the smallest root this
projection needs.

**D-1603. The J-hook lip has a 45 degree ramp on its inside.**
In the print pose the hook arm stands vertical and the lip is an eave at
its top. A square lip would have a flat underside, a 90 degree overhang
as wide as the lip. The ramp runs from the arm top to the lip top at
exactly 45 degrees, the steepest face the spec allows, so the lip prints
without support. The ramp costs projection: the hook needs fillet plus
lip thickness plus lip height of projection, and validation names it.

**D-1604. The rail and the mount carry `printOrientation` x: -90.**
The note under the toggle says the plate goes flat on the bed with the
hooks up, that the arms stand vertical, and that the only faces pointing
down are the 45 degree ramps. It claims no more than the overhang test
proves.

**D-1605. The screw rule measures 8 mm from the countersink edge.**
"At least 8 mm from any edge" is read as clear plate between the
countersink's outer edge and the plate end, the plate top or bottom, the
hook root band with its fillets, and the gusset band. The rail centers a
row of one to four screws at a user-set spacing along X, because a wall
has studs along X. The mount puts two screws on the vertical center line,
one 8 mm plus a head radius above the bottom and one the same below the
top, and derives their spacing, because a narrow mount goes on one stud.
The rail's screw Z is the middle of the band the rule leaves.

**D-1606. The shelf riser is modeled in its print pose, and it has no
print-pose toggle.**
The deck top lies on the bed at Z = 0, the lightened underside faces up,
and the ribs and the legs stand up from it. When the riser is over 240 mm
the four leg extensions stand beside the deck, feet on the bed, in the
same STL. A part modeled as used, with a 180 degree turn to the print
pose, cannot do that: the turn would leave the extensions in the air,
because their height differs from the deck body's. The drawer riser (S07)
is modeled as used because it has no extensions. The intro copy says the
preview shows the riser as it prints, and the README says to turn it over.

**D-1607. The leg split keeps the extension as short as possible.**
The deck body takes 240 mm minus the deck thickness of leg, and each
extension takes the rest plus a square peg. The peg side is the section
minus two 3 mm socket walls, the peg length is one and a half peg sides
and at least 10 mm, and the socket is 0.1 mm larger per side. The peg is
on the extension and the socket in the deck leg, so both bodies print
with their joint feature pointing up and nothing overhangs. The
`SPLIT_MINIMUM_SECTION_MM` rule of 12 mm exists in the kernel and in the
product message, but the slenderness rule always refuses first: a riser
over 240 mm needs a section over 19 mm. The rule stays for a product with
another range.

**D-1608. The lightening pockets stay inside the leg pads, and the ribs
start below the pocket floors.**
The pocket field rim is the leg inset plus the section plus two gussets
plus 2 mm, so every leg pad lands on solid deck and the gusset union
never opens into a pocket. A rib crossing a pocket starts at the pocket
floor minus the overlap, so it fills the pocket where it crosses instead of
bridging it. See section 3.2.

**D-1609. The controller pocket is a wide J-hook with two side walls, and
no root rule applies to it.**
The pocket floor is the hook arm and the pocket lip is the same 45 degree
ramp. The side walls stand from the floor to the lip top and carry the
floor, so the pocket depth may reach 80 mm on a 4 mm floor. The floor's
load note is a beam estimate across the pocket width.

**D-1610. The pocket sits above the hook, with a band slip gap.**
Headphones hang below the hook, so a pocket above it stays clear of them.
The pocket floor's bottom fillet starts 10 mm plus the band thickness
above the hook lip, so the band slips over the lip. The hook opening
between the plate and the lip is the projection minus the lip thickness
minus the lip height, and it must be at least the band thickness plus
2 mm; the message names the projection that clears it.

**D-1611. Perimeters are not a parameter.**
A perimeter count in the specs would change the signature and rebuild the
same mesh on every change. The load note assumes three perimeters and
says so every time. A user who prints with more gets a conservative
number.

**D-1612. The valet rest is a solid wedge clipped to the outer profile,
and its slot is a lip.**
The rest is a polygon in the Y-Z plane, extruded along X across the whole
tray and intersected with the outer outline extruded to the rest height,
so it follows the rounded back corners and never leaves the shell. A lip
2 mm thick and 6 mm tall stands in front of the wedge foot, and the slot
between them is the user's slot width. The wedge thins toward its top by
the rest height above the base top times the tangent of the angle, and
validation keeps 4 mm there; when no legal well depth can keep it, the
message moves to the rest height and names no impossible depth. The last well is solved and written back exactly as the remote
caddy does (D-1415).

**D-1613. None of the four products is compensated.**
The rail and the mount fit a wall through their screws, not through their
outside size. The riser and the valet stand free. The socket tray
precedent (D-1511 in the S08 notes, and the S05 follow-up on bore
compensation) omits `compensable` for the same reason.

**D-1614. The hook rail coupon is a single hook.**
`coupon()` validates the rail's parameters, then builds one hook on a
60 mm plate with two screws through `buildWallHookRail`, which skips the
spec range check because 60 mm is under the rail length minimum. Every
other rule holds by construction: one hook keeps its 20 mm gaps, the two
screws keep exactly 8 mm to the plate ends, and the height is the rail's
own. Print record 15 loads this coupon.

**D-1617. A product that builds a coupon states the coupon's bounds.**
`ProductDefinition` gains one optional member, `couponBoundsContract`,
required whenever `coupon` is set; `tests/products.test.ts` checks the
pairing. Before this sprint `ProductApp.tsx` built the coupon's safety
contract from the full model's X and Y bounds and a drawer-tray constant
for the height, with a comment asking the next product's coupon to replace
it. The rail coupon is 60 mm long and 50 mm tall, so that check refused it
at the first browser try. Now the drawer tray states its ring, the rail
states its single-hook plate, and the page imports nothing from any one
product. This is the sprint's one contract change, and it is additive.

**D-1615. The worker chunk budget goes from 176 KB to 224 KB.**
Fifteen products measure 197 KB, about 10 KB per product over a 46 KB
fixed part, exactly the slope S07 recorded. The budget leaves room for
two more products and still fails a doubling. Open issue 1 keeps the
lasting fix.

**D-1616. The headband thickness key is `bandGauge`.**
`lib/printer-profile.ts` treats every millimeter key that contains "wall"
or "thickness" as a printed wall and refuses it under two nozzle widths.
A 4 mm band is not a wall. The key follows the card holder's `cardGauge`
(S08); the label still says "Headband thickness".

---

## 5a. The review

The sprint's independent review found no blocking defect: no in-range
parameter set builds a wrong mesh, every load rule has its boundary, and
no load number appears without its assumptions. It found three messages
that led with a number the field could not take, each applied:

1. The rail's hook rule could ask for a root over the field's 20 mm
   maximum when the projection was long. The rail's root maximum is now
   24 mm, the mount's value, so 60 mm over 2.5 always fits.
2. The mount's band rule could ask for a projection over 60 mm. The
   message now names the projection only when it is inside the range,
   and otherwise says that no projection clears the band and offers the
   lip and the band.
3. The valet's rest rule could ask for a well depth under the field's
   30 mm minimum, or a negative one, when the rest and the valet depth
   alone made the rest too thin. The message moves to the rest height in
   that case and names no depth.

It also corrected D-1612's wording: the wedge thins over the rest height
above the base top, not over the whole rest height.

The review ran on the routing policy's fallback reviewer, because the
primary reviewer was unavailable through five launches on the day. The
primary's review stays owed; open issue 7 records it.

---

## 6. Deviations from the spec

1. **The shelf riser has no print-orientation toggle.** The spec's item 7
   says each product sets a print orientation. The riser is modeled in
   its print pose instead, for the reason in D-1606, and its copy says
   so. The valet also has no toggle, because a tray prints as modeled,
   exactly like the drawer tray.
2. **The load estimate is a bending model, not "perimeters times root
   area times a constant".** Section 2.1 gives the formula and the reason.
   The perimeter count is a stated assumption, not a factor.
3. **The rib rule is also applied under the rail's key shelf.** The spec
   names it for the shelf riser deck. A 400 mm shelf on two end gussets
   is the same problem, so it gets a rib gusset every 150 mm.
4. **The 8 mm screw rule is applied to the gusset band and the pocket
   walls as well as the plate edges and the hook root**, because a screw
   head under a gusset cannot be driven.
5. **The mount's screw spacing is derived, not set.** A narrow mount on
   one stud has no horizontal spacing to match, and the vertical spacing
   follows the plate height.
6. **One optional member is added to the product contract**,
   `couponBoundsContract`, because the app's coupon safety check could not
   accept any coupon but the drawer tray's (D-1617). The spec names no
   contract change; the S01 notes asked for exactly this one.

---

## 7. Measurements

| Item | Value |
|---|---|
| Kernel time, defaults, standard quality | rail 12 ms, mount 12 ms, riser 56 ms, valet 10 ms |
| Kernel time, largest range corner, fine quality | rail 42 ms (2 542 triangles), mount 18 ms (1 124), riser 208 ms (9 686, five bodies), valet 17 ms (482) |
| Golden records at geometry version 1 | rail 692 triangles, volume 69 278.04, bounds ±120 × -25..0 × 0..50; mount 624, 110 119.44, ±45 × -45..0 × 0..150; riser 2 862, 331 378.70, ±150 × ±100 × 0..124; valet 266, 1 006 792.52, ±120 × ±75 × 0..70 |
| Worker chunk | 197 245 bytes with fifteen products; budget 224 KB |
| Page chunk | 601 995 bytes; budget 650 KB |
| Vitest | 844 in 32 files, about 20 s |
| Browser suite | 10 of 10 in 1.3 minutes |
| Browser smoke, all fifteen routes | each reaches Ready, the switcher lists fifteen products, every download is a valid binary STL, no console errors; see the sprint pull request |

---

## 8. Open issues

1. **The worker chunk grows 10 KB per product.** The lasting fix is a
   dynamic import per product in the generation worker, so the chunk
   stops growing with the catalog. Carried from S07 open issue 1 and the
   S06 review. The budget is raised, not solved.
2. **The load constant is uncalibrated.** Print record 15 is the first
   measurement. Until then the notes are a model at a stated safety
   factor, and the copy calls them approximate everywhere.
3. **The press-fit clearance is untested.** 0.1 mm per side is a common
   value for a hand press fit in PLA at 0.4 mm nozzle. The boot riser
   preset in print record 17 tests it. The compensation from the printer
   profile does not reach the peg or the socket (D-1613).
4. **The one-piece height is a constant, not the printer profile's bed
   height.** 240 mm assumes the 250 mm reference bed. A taller printer
   still gets a split riser at 241 mm, and a shorter one gets a deck body
   too tall for it. The bed warning from S04 still names the height.
5. **The mount's lower screw sits below the hook.** A screwdriver reaches
   it straight on, because nothing is in front of it, but the hanging
   headset covers it once mounted. Mount the plate before hanging the
   headset. The alternative, a screw in the band gap, is reachable only
   with the headset off as well.
6. **The rail's hook root band is a fixed 3 mm above the plate bottom.**
   A large corner radius never reaches it because the hook gaps are at
   least 20 mm and the radius at most 10 mm, but a future rail with a
   hook at the very end would need the outline clip that the shelf and
   the gussets already use.

7. **The primary review is owed.** Section 5a's review was done by the
   fallback reviewer at the same effort. Run the primary review on the
   merged sprint when it is available, and apply what it finds as a
   follow-up.
---

## 9. Follow-ups

1. Dynamic import per product in `lib/generation/protocol.ts`, then lower
   the worker budget back under 128 KB (open issue 1).
2. Calibrate the load constant from print record 15, and record the
   result here as the first "rule that came from a printed failure".
3. Read the one-piece height from the printer profile's bed height once
   a product needs it, with the split plan taking the height as an input
   (open issue 4).
4. Consider bore and socket compensation for the peg joint together with
   the S05 bore compensation follow-up.

---

## 10. Notes to record, from the spec

- **Load model.** Section 2.
- **Overhang test method.** Section 3.
- **Rules that came from a printed failure.** None yet. Every rule in
  section 4 comes from 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 2.6,
  which reasons from how printed parts fail across layer lines. The rib
  fill in section 3.2 came from the overhang test, not from a print.
  Print records 15 to 18 are the first chance to add a printed rule.
