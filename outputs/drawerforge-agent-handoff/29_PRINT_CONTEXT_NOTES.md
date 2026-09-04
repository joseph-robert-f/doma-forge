# 29. Print Context Notes

Date: 2026-09-03
Status: Implemented on the S14 sprint branch.
Reads with: sprints/S14_PRINT_CONTEXT.md, 19_PRINTER_PROFILE_NOTES.md,
23_REVOLVED_FORMS_NOTES.md, 24_BRACKET_FAMILY_NOTES.md,
28_CONTRACT_FOLLOW_UPS_NOTES.md

This document records sprint S14. A product's validation may now read the
saved printer profile. Two rules use it: the pots' widest-diameter rule
reads the bed, and the shelf riser's one-piece height, now a setting, is
checked against the bed height. Nothing else changes. Every number here is
measured in this sprint's checkout; section 7 holds the measurements.

---

## 1. What changed

### 1.1 Files

| Area | Files | Change |
|---|---|---|
| Printer profile | `lib/printer-profile.ts` | `PrintContext` and `printContextOf(profile, bedIsKnown)`. |
| Contract | `lib/products/types.ts` | `validate(parameters, context?)`. |
| Page | `app/components/ProductApp.tsx` | Builds the context once from the profile and the saved flag; passes it to both validation calls. |
| Plant pot | `lib/products/plant-pot/{schema,validate,index}.ts` | `maximumPotDiameter(context)`; the widest rule reads it; the message names the bed it used. |
| Plant saucer | `lib/products/plant-saucer/{schema,validate,index}.ts` | `maximumSaucerDiameter(context)`, the same way. |
| Shelf riser | `lib/products/shelf-riser/{schema,validate}.ts` | `onePieceHeight` parameter, 100 to 500 mm, default 240; the split plan takes it; validation refuses a value above the saved bed height. |
| Kernel | `lib/kernel/bracket-rules.ts` | `LegSplitRequest.onePieceHeight?`, defaulting to `ONE_PIECE_HEIGHT_MM`; a non-finite value gives no split. |
| Records | `sprints/PRINT_RECORDS.md` record 17 | Parameter list and file name for the new hash. |
| Tests | `tests/printer-profile.test.ts`, `plant-pot`, `plant-saucer`, `shelf-riser`, `kernel-brackets`, `products.test.ts`, `app.integration.test.tsx` | 33 new cases; see section 7.2. |
| Docs | `README.md`, `15_SPRINT_PLAN.md`, `sprints/S14_PRINT_CONTEXT.md`, this document | |

---

## 2. The context

`PrintContext` holds the bed as three extents, or null, and the nozzle
diameter. The bed is null until the person saves a profile, because until
then the profile holds the placeholder bed nobody entered
(19_PRINTER_PROFILE_NOTES.md), and a rule that read it would refuse parts
on a bed that does not exist. With a null bed every product validates
exactly as before, on every default and preset; the contract test checks
that for all fifteen products.

The nozzle is in the context for a later rule; nothing reads it here. The
thin-wall rule already carries the nozzle through `thinWallIssues`.

Only `validate` takes the context. `derive`, `generate`, and
`boundsContract` do not: a geometry that read the bed directly would give
one design two meshes on two printers with nothing in the design to say
so. The riser shows the alternative: the bed-dependent value is a
parameter, so the design carries it, the hash carries it, and the file
name carries it (D-1803).

---

## 3. The two rules

### 3.1 The pots

The pot's widest-diameter rule and the saucer's outside-diameter rule used
a 220 mm constant, the reference bed. A person with a 180 mm bed saw a
208 mm limit and, after the preview, a bed warning that let the download
through. The rule now reads the smaller of the saved bed's width and depth,
less the same 12 mm margin, and the message says "your 180 mm bed less
12 mm" instead of "the 220 mm bed less 12 mm".

The field limits stay at 208 mm (the pot's base diameter field stops at
200 mm). A spec is static: the form renders it once and the design file's
range check reads it. A bed larger than the reference therefore gains
nothing here, which is the honest outcome: a person with a 300 mm bed
still gets a 208 mm pot, and the README says so. Making a field limit
follow the profile is a contract change to `ParameterSpec` that no product
has asked for yet (open issue 1).

### 3.2 The riser

The one-piece height was a constant, 240 mm, the 250 mm reference bed less
10 mm. A taller printer still split a 241 mm riser; a shorter one got a
deck body it could not print, with only the bed warning to say so
(24_BRACKET_FAMILY_NOTES.md, open issue 4). It is now a parameter of the
riser, "One-piece height", 100 to 500 mm, default 240, in the legs group,
with a description that says what it is before the person meets it. The
split plan takes it as an input. Validation refuses a one-piece height
above the saved bed height, but only when the riser as laid out is taller
than the bed; the message names the bed, the deck body's height, and the
fix. A riser that fits the bed prints whatever the setting says.

At the default the plan is the old plan, so every riser mesh built before
this sprint is built again from the same numbers. The geometry version is
unchanged. The design hash changes, because the signature covers every
spec key and there is one more; record 17 is re-prepared with the new
file name.

---

## 4. What stays a warning

The build-volume warning of S04 is unchanged for every product. A part
larger than the bed still downloads, because a person can split it or use
another machine. The pots' rule is one the products already had, now
reading the right bed. The riser's rule is new, and this sprint's first
draft of it fired on any riser whenever the setting exceeded the bed, a
124 mm riser on a 200 mm bed included; that was a refusal from the bed
alone, against D-811, and the review caught it. The rule now fires only
when the riser as laid out is taller than the bed, which is the case the
split exists for.

---

## 5. Decisions

**D-1801. The context is an optional second argument to `validate`, with
a null bed until the profile is saved.** An optional argument leaves every
product that ignores it unchanged, in code and in tests. Null, not the
placeholder bed, because the placeholder is not a fact about any printer.
The nozzle rides along for a later rule.

**D-1802. The pots read the smaller bed axis less the margin; the field
limits stay static.** A round part needs the smaller axis. The static
limit is what a spec is; the notes and the README say a larger bed gains
nothing here.

**D-1803. The riser's one-piece height is a parameter, not a hidden
input, and the bed checks it only when the riser is taller than the bed.**
The alternative was a context inside `generate`, with the mesh identity
and the file name extended to carry the bed. That makes one design two
parts on two printers with nothing in the design file to say so, and a
print record that cannot name what was printed. A parameter puts the fact
in the design, the hash, the file name, and the record. The profile checks
the claim, and only when the claim decides whether the part fits: the
layout's height over the bed height. A setting that is wrong but idle
refuses nothing (D-811).

**D-1804. A non-finite one-piece height gives no split.** A cleared field
is reported by validation as a missing number and the download is
refused, so the layout's choice cannot reach a file. No split is the
choice that keeps the preview a plausible riser rather than a stack of
pieces from a NaN plan.

**D-1805. Both split refusals are reachable.** With the one-piece height
pinned at 240 mm the "section" refusal could not be reached through
validation, because the slenderness rule refused a leg under 12 mm first.
With the setting as low as 100 mm it is reachable, for example a 124 mm
riser on 10 mm legs at a 100 mm one-piece height, and the test covers both
that and the "height" refusal. An earlier draft of this note said the
opposite; the review corrected it.

**D-1806. A bed smaller than the smallest part gets its own message.** A
60 mm bed would otherwise produce "keep it at most 48 mm" for a pot whose
smallest rim is 50 mm, and a 1 mm bed a negative limit. Below the smallest
part the fields allow, the message says the bed is too small for any pot
or saucer this app makes, names the smallest, and points at the profile.

**D-1807. The bed in a message is "the N mm bed in your printer profile",
not "your N mm bed".** The saved flag flips on any profile edit, a nozzle
change included, so a saved profile can still hold the placeholder bed.
The wording is true either way.

**D-1808. Dead constants are gone.** `POT_MAXIMUM_DIAMETER_MM` and
`SAUCER_MAXIMUM_OUTSIDE_DIAMETER_MM` had no reader once the rules read the
context, and the saucer's test of the second was a constant checking
itself. `BedLimit` lives in `lib/printer-profile.ts` next to
`PrintContext`, and both pots use it.

---

## 5a. The review

The primary reviewer was available for this sprint, after five overloads
on S09 and S13. It reported fourteen findings on the working tree, all
applied:

1. **Blocking.** The one-piece rule refused the default riser on a 200 mm
   bed although the riser is 124 mm tall: a refusal from the bed alone,
   against D-811 and the spec's own scope item 4. Applied: the rule fires
   only when the riser as laid out is taller than the bed (D-1803).
2. **Should fix.** A cleared one-piece height was not in the riser's
   finite-number list, so the layout claimed a 296 mm one-piece leg while
   the field was empty. Applied: the key is in the list and in the
   cleared-field test.
3. **Should fix.** D-1805 and a test comment claimed the "section" split
   refusal was unreachable; it is reachable at a low one-piece height.
   Applied: corrected, with a test that reaches it.
4. **Should fix.** A bed under the smallest part produced a limit no field
   could reach, down to a negative number. Applied as D-1806.
5. **Should fix.** Stale copy and comments still said 240 mm: the riser's
   intro, the pot schema's comment, the riser's geometry-version comment.
   Applied.
6. **Should fix.** "The bed height less a margin" contradicted a rule that
   allowed the bed height exactly. Applied: the phrase is gone; the
   setting is the person's own claim, normally the bed height.
7. **Should fix.** The checksums were stale. Applied at the end of the
   sprint, as always.
8. **Should fix.** Section 7 was a placeholder at review time. Filled.
9. **Should fix.** Nothing tested the page's wiring of the context.
   Applied: an integration test saves a 150 mm bed, opens the pot, and
   reads the error that names that bed.
10. **Nit.** The contract test could not fail for the right reason.
    Applied: it asserts the exact set of defaults and presets a 150 mm bed
    refuses, seven, and that nothing else changes.
11. **Nit.** The kernel test did not pin the default. Applied: it asserts
    the deck body at 236 mm, in four named cases.
12. **Nit.** "Your 220 mm bed" could name a placeholder, because the saved
    flag flips on any profile edit. Applied as D-1807; `known` now follows
    usable axes, and the nozzle's lack of a flag is documented.
13. **Nit.** Dead constants, a duplicated type, declaration order. Applied
    as D-1808.
14. **Nit.** The short label "One piece" made an awkward range message.
    Applied: "One-piece height".

The reviewer verified and found sound: an unsaved profile changes nothing
on either validation path for all fifteen products; five risers at
one-piece heights from 100 to 500 mm build closed, match their bounds
contracts exactly, show no overhang in the print pose, and agree across
the pieces row, the summary, the file name, and the component count; the
split never lays out taller than the setting; a pre-S14 design normalizes
to the old plan; the golden record is unchanged; rule 13 is clean.

---

## 6. Deviations from the spec

1. The spec's acceptance row for the 180 mm bed used a pot at the 208 mm
   field maximum; the pot's base diameter field stops at 200 mm, so the
   test uses a 160 mm base flared to about 195 mm at the rim, which the
   180 mm bed refuses and the reference bed accepts.
2. The spec's acceptance row for the 200 mm bed said the default riser is
   refused at a 240 mm one-piece height. It is not, and must not be: the
   default riser is 124 mm tall and fits (D-811). The row holds for a
   riser taller than the bed, which is what the test checks. The spec's
   scope item 4 wins over its acceptance row.

---

## 7. Measurements

### 7.1 Chunks

| Chunk | S13 | S14 |
|---|---|---|
| Worker fixed chunk | 2,854 B | 2,854 B |
| Registry chunk | 136,369 B | 138,249 B |
| Page chunk | 598,518 B | 598,579 B |

The context is a few lines in the page and the profile module; no chunk
moves by more than the copy it carries.

### 7.2 Test counts

| Suite | Before (S13) | After |
|---|---|---|
| Vitest | 948 in 32 files | 981 in 32 files |
| Server render | 5 | 5 |
| Deploy config | 2 | 2 |
| Browser suite | 11 | 11 |

The 33 new cases: the context shape (1); the pots on an unsaved profile, a
180 mm bed, a bed larger than the reference, and a bed too small for any
part (7); the riser's field limits, its split at other one-piece heights,
its bed rule on a riser that fits and one that does not, and a cleared
field (4); `planLegSplit` with the default, at and under the setting, and
with NaN (4); the contract test on every product with an unsaved profile
and the exact set a 150 mm bed refuses (16); the page wiring on the pot
route with a saved 150 mm bed (1).

### 7.3 What a 150 mm bed refuses

Seven of the fifteen products' defaults and presets, and no other: the
saucer's defaults, medium pot, and large pot; the pot's defaults, desk
pot, and deep pot; the riser's boot riser, 305 mm tall. Every other
product validates exactly as before, and every message names the 150 mm
bed.

### 7.4 Golden records

All fifteen unchanged. The riser's file name hash moves from `bdd8f7` to
`e7fd6b`, because the signature covers the new key; record 17 carries the
new name (`3c7117` since S15, which bumped the riser's geometry version).

### 7.5 Browser suite

Eleven of eleven on the production build. The first Ready preview at
1.8 s against the 5 s budget.

---

## 8. Open issues

3. **The primary review is still owed for S09 and S13.** This sprint had
   it; see section 5a. Closed in S15; see 30_OWED_REVIEWS_NOTES.md.

---

## 9. Follow-ups

1. If a product needs a field limit from the profile, add an optional
   `limitFromContext` to `NumberSpec` in one contract sprint, and let the
   pots' diameter fields use it.
2. When the nozzle enters a product's own rule, it is already in the
   context; add the rule, not a second argument.

---

## 10. Notes to record, from the spec

- **The context shape.** Section 2 and D-1801.
- **Why the pots' field limits stay static.** Section 3.1 and D-1802.
- **Why the riser's height is a parameter and not a hidden input.**
  Section 3.2 and D-1803.
