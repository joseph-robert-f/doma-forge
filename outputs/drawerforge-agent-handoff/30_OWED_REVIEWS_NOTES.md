# 30. Owed Reviews Notes

Date: 2026-09-03
Status: Implemented on the S15 sprint branch.
Reads with: sprints/S15_OWED_REVIEWS.md, 24_BRACKET_FAMILY_NOTES.md,
28_CONTRACT_FOLLOW_UPS_NOTES.md, 29_PRINT_CONTEXT_NOTES.md

This document records sprint S15. Sprints S09 and S13 were reviewed by the
fallback reviewer because the primary was unavailable on both days. This
sprint ran the two primary reviews on the merged code, verified against
the current tree, and applied what they found. Every number here is
measured in this sprint's checkout; section 6 holds the measurements.

---

## 1. What the reviews covered

Each review ran in its own read-only agent at high effort. Each read the
sprint's diff for intent and the current tree for fact, because S13 moved
the bracket kernel into planner and builder modules and S14 changed
`validate` and the riser. A defect a later sprint had already fixed was
not a finding.

The S09 review swept the four bracket products across the corners of
their parameter ranges: 1 140 rail, 3 144 mount, 488 riser, and 1 880
valet valid parameter sets, each generated and checked for status,
volume, bounds, closed edges, and overhangs in the print pose. The S13
review diffed every moved kernel function against the pre-S13 source,
walked the static import graph from the page and the worker, and proved
two of its findings by mutation: it removed the code a test claimed to
guard and watched the test stay green.

---

## 2. The S09 findings

| # | Severity | Finding |
|---|---|---|
| S09-1 | blocking | The shelf riser's rib union leaves zero-area triangles where a rib face lands exactly on the deck outline or on the pocket-field edge. The three-geometry guard then refuses the mesh, so the preview shows an error and there is no download. 35 of 488 valid range-corner sets; 48 of 453 at a 600 by 400 by 3 deck. The defaults and the presets are clean, which is why no fixture caught it. |
| S09-2 | should-fix | The rail and the mount measure the screw band from the hook root top, not the hook lip top. A lip above 11 mm can stand in front of a countersink at a plate height near the minimum, so no screwdriver reaches it. |
| S09-3 | should-fix | Rule 9 gap. The riser's deck skin over a lightening pocket is 2 mm at every deck thickness up to 4 mm, and `printedWalls` did not report it. At a 1.2 mm nozzle the download was allowed with a 2 mm skin. The socket wall was reported as the 3 mm constant while the geometry builds 2.9 mm after the press-fit clearance. |
| S09-4 | nit | The overhang helper in the test suite reports a float32 sliver on the valet as a 90 degree overhang. Its area guard is far too small for a 400 mm part. |
| S09-5 | nit | The split plan's deck leg always takes the full one-piece height, so an extension can be shorter than its own peg: four 0.5 mm collars on 14 mm pegs to add half a millimetre. |
| S09-6 | nit | The coupon file name has no product id. Unambiguous with one coupon product; ambiguous since S09 made the rail the second. |

Verified sound by the S09 review: the hook rule, the screw row, the rib
and leg-split plans, the load arithmetic and its messages, the J-hook
profile at the 45 degree limit, the print poses, the screw geometry and
the 8 mm edge rule against rounded corners, the coupon pairing, the
valet's solved last well and rest wedge, and rule 13 on every string.

---

## 3. The S13 findings

| # | Severity | Finding |
|---|---|---|
| S13-1 | should-fix | The model download named the file with every nonzero axis correction, while the fit test named it with only the axes that reach the product. For the pot and the saucer, whose list is the diameter, an X +0.5 and Y -0.5 profile produced a mesh identical to the uncorrected one and a file name that said it was corrected. D-1714 was applied on one of two call sites. |
| S13-2 | should-fix | The loader's rejection-eviction test asserted nothing. An earlier case had already loaded every product, so the failing stub was never called and the assertion block was skipped. Removing the eviction left the suite green. |
| S13-3 | should-fix | The registry chunk budget cannot detect a builder leaking into a definition: the bundler hoists a module both sides import into a shared chunk, and the registry chunk does not grow. The source-reading test guarded five fixed file names per product and not the registry, the shared module, or the page. |
| S13-4 | should-fix | The parts bin's shipped defaults and two presets are refused at a 0.6 mm nozzle, on the 0.8 mm recess skin of D-1713. Section 7.4 of document 28 recorded one refusal at 0.6 mm; there are four. The 1.5 mm row was also miscounted. |
| S13-5 | should-fix | The calibration proposal counted the existing correction twice. It computed existing plus modeled less measured, and the modeled size already holds the existing correction. From a correct correction, entering the verification measurement proposed double. Pre-existing from S04; S13's records 12 and 13 walk a person through that loop. |
| S13-6 | nit | The README said the reported features include gussets. No product reports one, on purpose. |
| S13-7 | nit | Two comments were left stale by the move: the client still said the protocol pulls in every product, and the mesh helper still said the drawer tray keeps its own copies. |

Verified sound by the S13 review: the kernel split is a pure move, no
builder reaches the page or the worker today, the loader cache is correct
under concurrent calls and rejection, the coupon path is race-free under
the client's latest-wins rule, the twelve printed-wall lists match their
geometry and the three products without one print nothing a named
parameter does not cover, the diameter arithmetic, the test dedupe kept
every assertion, and rule 13.

---

## 4. Dispositions

Every finding was applied. None was disputed. The table names the
change and the test that holds it.

| # | Change | Held by |
|---|---|---|
| S09-1 | `finishSolid` in `lib/kernel/mesh.ts` drops every triangle whose doubled-area vector is exactly zero, before the mesh leaves the kernel. The vertex table is untouched. Closure holds after the drop: zero bad edges in both failing meshes. | `tests/shelf-riser.test.ts`, "leaves no triangle without area", on the review's two parameter sets: validate, generate, `modelToBufferGeometry`, closed edges. |
| S09-2 | The rail's screw band starts 8 mm above the higher of the hook root top and the hook lip top; the mount's `topOfFeatures` the same. The rail's minimum-height message now says "the hook" and offers a shorter lip. Every default and preset of both products still validates; the headset-only preset's minimum rose from 68 to 77 mm against its 90 mm plate. The rail's geometry version is 2, because the defaults' countersinks moved 1.5 mm (D-1910). | Boundary tests at lip 11 and 11.5 mm in both product suites; a slice test at `screwZ + 0.3` that finds no hook material in front of either screw axis on the review's rail. |
| S09-3 | The riser reports `deck-skin` ("Deck over a pocket", deck thickness less the pocket depth) whenever it is lightened, and reports the socket wall as the geometry builds it, 2.9 mm at a 20 mm section. | "flags the deck skin alone at a 1.2 mm nozzle"; "passes the defaults and every preset at a 0.4 mm and a 0.6 mm nozzle". |
| S09-4 | `overhangFaces` skips a face below 0.01 mm², with the reason in the comment. | `tests/entryway-valet.test.ts`, the review's valet reports no overhang face. |
| S09-5 | `planLegSplit` caps the deck leg at the clear height less the peg length, so an extension is never shorter than its peg, and floors it at the peg length, so the socket stays in the leg; a leg too short for both is refused with a new `joint` reason (D-1909). The defaults do not split and the boot-riser plan is unchanged. The riser's geometry version is 2 (D-1910). | `tests/kernel-brackets.test.ts`, the review's set gives a 75 mm deck leg and a 21 mm extension on a 21 mm peg, plus a sweep asserting the invariant across the range. |
| S09-6 | The coupon file is `drawerforge-fit-test-<product id>-<width>x<depth>-<hash>.stl`. The id is the signature's first field. | `tests/coupon.test.ts`, `tests/wall-hook-rail.test.ts`, the integration suite, and the browser fit-test spec. |
| S13-1 | The model download passes `product.compensable` to `withCorrectionTag`, as the fit test already did. | A unit case on the real pot definition, and an integration case downloading the pot's model under a cancelling X and Y correction and asserting no tag. |
| S13-2 | The eviction test installs its own loader under a fresh key, rejects once, resolves once, and asserts both results and the call count with no branch. | The rewritten test; removing the eviction fails it. |
| S13-3 | A new test walks the static import graph from the registry, the protocol, the worker, and the page, skipping type imports and dynamic imports, and fails on any builder module. The fixed-name test stays beside it. The registry budget's comment now says what it measures. | The graph test; a builder import added to a schema fails it. |
| S13-4 | No code change. Section 7.4 of document 28 is corrected, and its open issue 6 says the defaults are refused at a 0.6 mm nozzle. See D-1903. | The sweep in section 6. |
| S13-5 | `calibrationProposal` receives the target extent, its docstring and its text say "target", and the card says a correctly calibrated print should measure the target size. Documents 19 and 27 are amended. | A unit case proving the fixed point: from a correct correction and a print at the target, the proposal is the same correction. The integration case now proposes 0.1 mm where the sprint proposed 0.6 mm. |
| S13-6 | "and gussets" is dropped from the README. | Read. |
| S13-7 | The two comments say what the modules do now. | Read. |

One test fixture moved with S09-2: the rail's all-fields-at-maximum
fixture had a 20 mm lip, which now needs a 122 mm rail against a 120 mm
field maximum. The fixture has an 18 mm lip and says why. That corner
of the rail's range is no longer a legal part; open issue 2 records it.

---

## 5. Decisions

**D-1901. A finding is verified against the current tree, not the old
diff.** Two sprints had moved the code under review. Each reviewer read
the old diff for intent and the current files for fact, and a defect a
later sprint had fixed was not a finding. Both reviews reported current
file and line numbers, so the fix agents worked from the report alone.

**D-1902. Zero-area triangles are dropped at the mesh exit, with an
exact-zero test.** The alternative was to move each rib face off the deck
outline and the pocket-field edge. That is a per-case fix, and the next
coplanar union brings the artifact back. `finishSolid` is the one place
every product's mesh passes through, so the drop covers every product
and every future one. The test is exact zero on doubles read from the
mesh's own float32 values, not an epsilon: the offending corners are
exactly collinear, so exact zero catches all of them, and an epsilon
could drop a small real face. The three-geometry guard keeps its own
epsilon behind it.

**D-1903. The parts bin's defaults stay, and the notes tell the truth.**
The review offered a thicker default wall so the recess skin clears a
0.6 mm nozzle. Record 8 has not been printed, and it is the record that
decides whether a 0.8 mm skin backed by the lip prints well. Moving the
default again before that print discards the reason for the print. The
defaults and two presets are therefore refused at a 0.6 mm nozzle with
the message that names the fix, and document 28 now says so in its
sweep table and its open issue. Record 8 decides.

**D-1904. The calibration proposal reads the target.** The fixed point
of `existing + target − measured` is a print that measures the target,
reached in one step from any starting correction. The old form reached
it only from zero. The card names the number beside the measurement as
the target size a correctly calibrated print should measure, because
that is the number a person compares the caliper against.

**D-1905. The screw band clears the hook lip.** The rule promised 8 mm of
plate between a countersink and any hook; measuring from the root top
kept that promise only for lips under 11 mm. The change is validation
only; every golden is unchanged. Its cost is one corner of the rail's
range: a 20 mm lip needs a 122 mm rail, and the field stops at 120.

**D-1906. The coupon file name carries the product id.** It reads the id
from the signature's first field, which every product sets, so the
change stays inside the shared helper.

**D-1907. The import-graph test guards the split; the registry budget
measures size.** A builder a definition imports is hoisted into a shared
chunk, so the registry chunk cannot grow from the leak. The budget stays
as a size budget on the definitions the form needs, and the graph test
is the guard the notes of S13 claimed the budget was.

**D-1908. An extension is never shorter than its peg.** The deck leg is
capped at the clear height less the peg length. The defaults do not
split, and the boot-riser plan is byte-identical.

**D-1909. The deck leg is never shorter than its socket, and a leg that
cannot hold the joint is refused.** The cap of D-1908 alone let the deck
leg fall under the peg length at leg sections of 37 mm and over, and the
socket, bored a peg length deep, then ran into the deck: 740 legal
parameter sets, the worst with 0.5 mm of deck over a 33 mm square hole,
and nothing reported it. Found by the review of the fixes. The plan now
floors the deck leg at the peg length as well, and when a leg cannot give
both sides of the joint a peg length it returns a third refusal reason,
`joint`, with the peg length. The riser's message names the two ways
out: a clear height of at least two peg lengths, or a smaller section for
a shorter peg, or no split at all. The sweep test now asserts both bounds
across sections up to 40 mm.

**D-1910. The rail and the riser are at geometry version 2.** The
contract bumps the version when equal parameters start producing a
different mesh. The rail's default countersinks moved from 33.5 to
35 mm with S09-2, and the riser's split plan changes off-preset with
S09-5 and D-1909. The goldens did not move, because a hole sliding
through a flat face keeps its triangle count and volume and because the
riser's defaults and presets do not split, which is exactly the case the
version exists for: a saved design file from before S15 reloads with the
"geometry has been updated" notice, and the file-name hash, which covers
the version, no longer names two meshes. Records 15 and 17 carry the new
names.

---

## 5a. The review of the fixes

The fix diff had its own independent review by the primary reviewer at
high effort before the pull request opened. It mutated each applied fix
in a scratch copy and watched the new test go red, and found six items:
one blocking, two should-fix, three nits. Every one was applied.

| # | Severity | Finding | Done |
|---|---|---|---|
| R1-1 | blocking | The leg cap of S09-5 let the deck leg fall under the peg length, so the socket bored into the deck; 740 legal sets, the worst with 0.5 mm of deck over a 33 mm hole, nothing reported. | The floor and the `joint` refusal of D-1909, with the sweep asserting both bounds. |
| R1-2 | should-fix | The rail's defaults build a different mesh (the countersinks moved 1.5 mm) and the riser's split plan changes off-preset, at geometry version 1. | Both products are at version 2 (D-1910); records 15 and 17 carry the new names. |
| R1-3 | should-fix | For a diameter-only product the proposal paired a per-axis existing correction with a mesh that moved by the mean, so repeated verification prints walked X and Y apart by 0.1 mm a round while the part stayed right. | The pot and the saucer pass the mean as the existing correction for both axes, and the text says "existing mean correction". A unit simulation shows the walk with the old pairing and the fixed point with the mean; an integration case on the pot route holds it through two rounds. |
| R1-4 | nit | The drop's exact-zero test and the viewer's 1e-10 guard were two different tests, and the comment gave the wrong mechanism for closure. | The kernel exports the epsilon, the viewer imports it, and the comment says the slivers arrive as oppositely wound pairs. |
| R1-5 | nit | The import-graph walk skipped a relative specifier it could not resolve, in silence, and did not start from the route files. | Unresolved specifiers fail the test, `.js` resolves to `.ts`, and the routes are entry points. |
| R1-6 | nit | Four notes still stated the old coupon name; one amended sentence in document 19 was broken. | Amended in place. |

A second-pass review of the round-two delta ran before the commit; its
result is at the end of this section.

The second pass swept all 63.7 million legal riser parameter points and
found no split plan with the socket in the deck or the extension under
its peg; 6 765 516 of those points split. It found nothing blocking and
four nits, all applied: the joint message offered two peg lengths of
leg where the height rule then refused it (217 of 957 joint refusals, at
a 40 mm section and a one-piece height of 100 or 101), so that number is
offered only when it works and the message names a larger one-piece
height otherwise; the diameter-only test on the page reads list lengths
the way `activeCorrections` does; the import-graph walk starts from the
layout and the not-found route as well, follows bare side-effect
imports, and lists the routes without an existence filter so a renamed
route fails loudly; and the golden line in document 24 says the records
are unchanged at version 2.

---

## 6. Measurements

### 6.1 Tests

| Suite | Before | After |
|---|---|---|
| Vitest | 981 in 32 files | 1002 in 32 files |
| Browser | 11 of 11 | 11 of 11, 1.3 minutes |
| Server render | 5 | 5 |
| Deploy config | 2 | 2 |

### 6.2 Chunks, production build, `dist/client/assets`

| Chunk | Bytes | Budget |
|---|---|---|
| Page | 598 830 | 665 600 |
| Worker | 2 854 | 16 384 |
| Registry | 139 209 | 180 224 |

### 6.3 Golden records

All fifteen unchanged. The mesh drop of S09-1 touches no golden, because
no default or preset produces a zero-area triangle. The screw-band change
moves the rail's default screw height from 33.5 to 35 mm through a flat
plate face, so neither the triangle count nor the volume moves. The rail
and the riser are at geometry version 2 all the same (D-1910), so their
file-name hashes moved: rail defaults `83772e` to `8da4a7`, riser
defaults `e7fd6b` to `3c7117`.

### 6.4 Range-corner sweeps from the S09 review

| Product | Valid corner sets generated | Result before the fixes |
|---|---|---|
| Wall hook rail | 1 140 | all sound |
| Headphone mount | 3 144 | all sound |
| Shelf riser | 488 | 35 with zero-area triangles (S09-1) |
| Entryway valet | 1 880 | 20 with one float32 sliver reported as an overhang (S09-4) |

### 6.5 The thin-wall rule over every default and preset

Every product's defaults and presets, uncorrected profile, at six nozzle
diameters. "Reported only" counts the refusals on a feature that exists
because the product's `printedWalls` reports it.

| Nozzle | Refusals | Product-feature pairs | Products | Reported only |
|---|---|---|---|---|
| 0.4 mm | 0 | 0 | 0 | 0 |
| 0.6 mm | 4 | 2 | 1 | 3 |
| 0.8 mm | 10 | 3 | 1 | 6 |
| 1.0 mm | 15 | 6 | 3 | 9 |
| 1.2 mm | 84 | 24 | 12 | 13 |
| 1.5 mm | 140 | 39 | 12 | 32 over 10 pairs across 6 products |

The 0.6 mm and 0.8 mm rows are the parts bin alone. The riser's deck skin
of S09-3 joins the 1.2 mm row.

---

## 7. Open issues

1. **The parts bin ships refused at a 0.6 mm nozzle** at its defaults and
   two presets, on the 0.8 mm recess skin (D-1903). Record 8 decides
   between a larger reserve and a thicker default wall.
2. **The rail's all-maximum corner is no longer legal.** A 20 mm lip needs
   a 122 mm rail against a 120 mm field. The message offers a shorter lip
   or a taller rail; the rail's height field could rise to 130 mm in a
   product sprint if a person asks for the combination.
4. **Design files of the rail and the riser saved before S15 show the
   geometry notice on load** (D-1910). The parameters are unchanged and
   the mesh is the same for every default and preset; the notice is
   honest for the rail, whose screw holes moved.
3. **Documents 08, 09, and the S04 spec keep the old proposal wording**,
   `existing + expected − measured`. They are the roadmap, the brief, and
   the spec as written, and are left as history; documents 19 and 27,
   which a person follows, are amended.

---

## 8. Follow-ups

1. The S09 review's range-corner sweeps and the second pass's full-grid
   sweep of the riser's split plan found the defects no fixture
   reached. A sampled corner sweep per product, under a time budget, would
   hold that ground in CI. Add it in a test sprint, not per product.
2. When the next product with a coupon lands, the coupon file name already
   carries its id; nothing to do.
3. The follow-ups of documents 28 and 29 stand: the bore correction after
   the socket tray records, the field limits from the profile, and the
   registry split past twenty products.
