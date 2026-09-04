# 19. Printer Profile and Dimensional Correction Notes

Date: 2026-09-02
Status: Implemented on the S04 sprint branch.
Reads with: sprints/S04_PRINTER_PROFILE.md, 08_EXPANSION_ROADMAP.md Phase B,
13_DESIGN_FILE_NOTES.md, 14_WORKSPACE_STORAGE_NOTES.md, 16_FIT_TEST_COUPON_NOTES.md

This document records sprint S04. It adds a local printer profile with a bed
size, a nozzle diameter, and an X and Y dimensional correction. The correction
changes the printed size of a part. Every step is visible to the user, and
every step is reversible.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/printer-profile.ts` | `PrinterProfileV1`, normalization and validation, the pure `compensate()` step, the compensation lines, the calibration proposal, the bed warning, the thin-wall error, and the file-name marker. |
| `lib/workspace.ts` | The optional `printer` field on the version 2 envelope, `readPrinterEntry` (the profile plus whether one is saved), and `writePrinterProfile`. |
| `lib/products/types.ts` | Adds the optional `compensable?: CompensableParameters` member to `ProductDefinition`. No existing member changed. |
| `lib/products/drawer-tray/index.ts` | Adds `compensable: { x: ["drawerWidth"], y: ["drawerDepth"] }`. |
| `app/components/ProductApp.tsx` | The Printer section, the compensation lines, the calibration flow, the second validation pass on the compensated parameters, the warning and error surfaces, and the one place where compensation runs. |
| `app/globals.css` | Styles for the Printer section, the compensation lines, the calibration card, and the warnings. |
| `README.md` | The new "Printer profile and calibration" section. |
| `tests/printer-profile.test.ts` | 49 cases: normalization, validation, purity of `compensate`, the compensation lines, the proposal formula, the bed warning, the thin-wall error, the correction-range messages, a product stub with no compensable list, the file-name marker, and the geometry bounds with and without a correction. |
| `tests/workspace.test.ts` | 7 new cases: an envelope without the field, no field until a profile is written, the version stays 2, a design write keeps the profile, a bad stored value is normalized, a write is refused when the workspace is not writable, and an unchanged profile is not rewritten. |
| `tests/app.integration.test.tsx` | 17 new cases: the section opens, the compensation line, the preview rebuild, the two file names, the design file keeps the target, the calibration flow, one axis at a time, no bed warning before a profile is saved, the bed warning at 221 and not at 220 with a saved profile, the first save that starts the rule, the wall error that refuses the download, the correction that leaves a parameter range, a clamped entry, restore from the workspace, and no write without an edit. |

### 1.2 The profile

```json
{
  "version": 1,
  "name": "My printer",
  "bedWidth": 220,
  "bedDepth": 220,
  "bedHeight": 250,
  "nozzleDiameter": 0.4,
  "correctionX": 0,
  "correctionY": 0
}
```

It is stored in the version 2 workspace envelope under `printer`.

### 1.3 The formula and where it runs

Per axis: **`modeled = target + correction`**.

`compensate(parameters, profile, compensable)` adds `correctionX` to every
parameter named in `compensable.x` and `correctionY` to every parameter named
in `compensable.y`. It reads nothing outside its three arguments, changes no
argument, and returns a new object. With a zero correction, or with no
`compensable` list, the result is deep-equal to the input.

It runs in exactly one place: one `useMemo` in `ProductApp`. Two values come
out of that place and every consumer takes one of them.

| Consumer | Parameters |
|---|---|
| `product.generate()` through the worker | Compensated |
| `product.coupon()` for the fit test | Compensated |
| The mesh bounds contract check | Compensated |
| The mesh identity that triggers regeneration | Compensated |
| `product.validate()` and the field errors | Target |
| `product.derive()`, the calculated results | Target |
| `product.summary()`, the viewer status | Target |
| `product.signature()` shown as the design identity | Target |
| `product.filename()` and its six-character hash | Target |
| The design file | Target |
| The design saved in this browser | Target |

The printed coupon therefore carries the same correction the tray carries. A
person measures the coupon, and the measurement describes the tray.

### 1.4 Why the design file stays uncorrected

A correction describes one machine, not one design. Two machines that print
the same design need two different corrections to reach the same size. A
design file that held a modeled value would print wrong on the second machine,
and it would print wrong on the first machine after the user calibrates again.
The file holds the target. Each machine adds its own correction at build time.
This is D-304 from the design-file sprint, now implemented.

### 1.5 Test results

| Check | Result |
|---|---|
| `npm run lint` | Pass, 0 problems |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 210 cases (was 137 before this sprint) |
| `npm run test:ssr` | Pass, 5 cases |
| `npm run build` | Pass |
| Real Chromium smoke against the production build | Pass, see section 4 |

The golden mesh test in `tests/geometry.test.ts` is unchanged and green.
`geometryVersion` is unchanged.

---

## 2. Decisions

**D-801. The profile has hard limits. A value outside a limit is clamped, and the app says so.**
`normalizePrinterProfile()` always returns a usable profile: a missing or unreadable value takes the default, and a value outside its limit is clamped. `validatePrinterProfile()` reports every value that normalization had to change, and the Printer section shows that message under the field. The field then shows the clamped value, so the user sees the number the app will use. The limits are wide on purpose. They stop a value that cannot describe a printer, such as text, an infinity, or a correction of one meter. They are: bed 1 to 5000 mm on each axis, nozzle 0.05 to 5 mm, correction −25 to 25 mm.

**D-802. The workspace envelope stays at version 2. The `printer` field is optional.**
The version 2 reader builds its result from the fields it knows. It ignores every other field, so it already tolerates an envelope that holds a `printer` field. The new reader tolerates an envelope that has none: it returns the default profile. Absence is valid in both directions, so a version bump and a migration would add a step with nothing to migrate. A test proves that an envelope written before this sprint reads correctly, keeps its design, and gets no `printer` field until the user edits the profile. **The cost:** a build older than this sprint writes the envelope back without the `printer` field, so a rollback loses the profile. The profile is one device's six numbers, and the user re-enters them in a minute. A design is not at risk, because the older build keeps every design it can read. A version 3 would not prevent this loss; it would only stop the older build from reading the envelope at all, which is worse.

**D-803. `compensate` is pure, and the contract gains exactly one optional member.**
`ProductDefinition` gains `compensable?: CompensableParameters` and nothing else. `compensate()` takes the parameters, the profile, and that list. It is a plain function in `lib/printer-profile.ts`, not a product member, so a product cannot apply a correction of its own and no product can be compensated twice.

**D-804. The drawer tray lists `drawerWidth` under X and `drawerDepth` under Y.**
`outsideWidth = drawerWidth − 2 × clearancePerSide`. A millimeter added to `drawerWidth` is therefore a millimeter added to the printed outside width, one to one. Clearance, walls, dividers, and the corner radius are not compensated: they are not outside dimensions, and correcting them twice over would change the fit in a way the user did not ask for. The compartments grow by `correction ÷ columns` along X and `correction ÷ rows` along Y, which is never more than the correction. A test proves this.

**D-805. The compensation display comes from the part, not from the parameter.**
The line reads "Modeled 299.5 mm = target 299 mm + 0.5 mm correction". 299 mm is the tray's outside width, not the 300 mm drawer width the user typed. The numbers come from `product.boundsContract()` for the target parameters and for the compensated parameters. The line therefore states the real printed effect for any product, including a future product whose parameter does not map one to one to its outside size. A negative correction uses a minus sign: "target 199 mm − 0.4 mm correction". A line appears only when that axis has a correction and the part's size actually changes.

**D-806. The mesh identity holds the correction. The design identity does not.**
The preview regenerates when `product.signature(compensated)` changes, so a correction edit rebuilds the mesh, and a stale preview disables the downloads until the new mesh is ready. The design identity, `product.signature(target)`, drives the file name hash and the design file. Two names for two ideas: what was built, and what was asked for.

**D-807. The mesh bounds check uses the compensated parameters. Validation uses the target.**
The mesh comes from the compensated parameters, so the contract it is checked against must come from the same parameters. Otherwise every correction would fail the safety check. The user's own settings are still checked by `product.validate()` on the target, which is what the field errors and the download gate report.

**D-808. The STL name keeps the target hash and gets a correction marker.**
`drawerforge-drawer-tray-299x199x50-2x3-08d29d-cx0p5.stl`. The hash stays the hash of the design, so an STL and its design file still match by eye, and two people with the same design see the same hash whatever their printers do. The marker names the correction that built this file: `cx0p5`, `cym0p2`, or both. Two files from one design under different corrections therefore never share a name, and a file in a downloads folder says which correction produced it. A hash of the compensated values was the alternative. It would break the match with the design file and it would hide the correction, which is the opposite of what this sprint is for. The fit-test coupon name follows the same rule for its hash and its marker, but not for its size. The coupon name takes its width and depth from the coupon mesh itself, which is compensated: `drawerforge-fit-test-299p5x199-137f96-cx0p5.stl` (since S15 with `drawer-tray` after `fit-test`) beside `drawerforge-drawer-tray-299x199x50-2x3-137f96-cx0p5.stl`. The two sizes therefore differ by the correction. This is correct for each name: the STL name states the design the user asked for, and the coupon name states the ring a person will hold and measure against the expected value.

**D-809. Apply replaces the correction and clears the measurement.**
The proposal is `existing + target − measured`, and the proposal text names all three numbers, so the existing correction is visible before the user commits. (Amended in S15. The sprint shipped `existing + expected − measured` with the modeled size as `expected`, which already holds the existing correction, so from a correct correction the proposal was double. See 30_OWED_REVIEWS_NOTES.md, S13-5.) Apply writes the proposal over the correction. It never adds. Apply then clears the two measured fields, and the Apply button goes back to disabled. A second Apply is therefore not possible from the same measurement. This matters because after the first Apply the measurement is stale: it describes a part printed with the old correction, and applying it again would compound the error. The message says what the new correction is and asks for a new print.

**D-810. Calibration works one axis at a time.**
A user who measures only the width gets a proposal for X alone, and Y is untouched. Apply is enabled as soon as one axis has a measurement. Nothing forces a person to type a number they did not measure.

**D-811. The bed case is a warning. The thin-wall case is an error.**
`10_MULTI_PRODUCT_EXPANSION_PLAN.md` section 1, rule 9 says: "A wall or web below two nozzle widths is a validation error. Do not print it." The sprint spec asked for a warning for both cases. Governance wins, so this is a **deviation from the sprint spec**, recorded here and in section 3. A wall under two nozzle widths now refuses both downloads, and the reason appears on the surface the STL button already uses, `#download-help`, with the nozzle and the wall named: "Outer wall thickness is 2 mm. A 1.2 mm nozzle needs at least 2.4 mm. A thin wall is weak."
A part larger than the bed stays a warning. It is not a print defect: a person can split the part or use another machine. The warning block renders next to the validation summary, above the export bar, not inside the Printer section, because that section is collapsed by default and a warning inside it would be invisible. The block is always mounted with `role="status"`, and it is hidden with CSS when it is empty, so a warning that appears later is announced. This is the same pattern the design-file message line uses. The bed test is strict, `size > bed`: 220 mm on a 220 mm bed gives no warning, and 221 mm gives one. It uses the modeled size, because that is what prints.

**D-812. A wall is found by key and by unit, not by the contract.**
The contract gains exactly one member this sprint, so it does not name wall parameters. `wallLikeKeys()` returns every number parameter in millimeters whose key holds "wall" or "thickness". For the drawer tray that is `wallThickness`, `baseThickness`, and `dividerThickness`, and all three are printed walls. A warning appears when a value is under two nozzle widths. See the follow-ups: a later contract change can name these directly.

**D-813. The profile is written only after the user edits it.**
A visit that only reads the profile writes nothing, so an envelope from an older build keeps its exact bytes until a real edit happens. A refused write reports "Local save unavailable" on the same status line the design saves use, and the write rules are the design rules: no write after an unreadable read or a newer envelope.

**D-814. "Reset defaults" does not touch the printer profile.**
Reset restores the design: parameters, name, and messages. A printer profile is a property of the machine, not of the design. A user who resets a design has not changed printers.

**D-815. Each printer number field keeps a draft while it is typed.**
A controlled number field that normalizes on every keystroke cannot accept "0.5", because the intermediate "0." parses to 0. Each field therefore holds the raw text while it has focus and shows the app's own value again on blur. The app's value updates on every keystroke that parses to a number, so the preview follows the typing.

**D-816. Zero correction is proved twice.**
`tests/geometry.test.ts` is unchanged and still green, which proves the mesh for the golden parameters is byte-identical. `tests/printer-profile.test.ts` proves that `compensate()` with a zero correction returns parameters deep-equal to its input, and that the mesh built from those parameters has identical vertices and triangles. Nothing can change with the correction at 0 mm, because the parameters that reach the kernel are the same object values.

**D-817. A correction that leaves a parameter range is an error, and the message names the correction.**
A target value can be legal while the corrected value is not. A drawer width of 600 mm with a 0.5 mm X correction gives 600.5 mm, which is past the 600 mm spec limit. Before this fix the kernel path threw and the viewer showed "Drawer width must be between 80 and 600 mm" while the field showed a legal 600. `ProductApp` now runs `product.validate()` a second time on the compensated parameters. When the target passes and the compensated set fails, `correctionRangeMessages()` maps each failed field back to its axis and states: "The X correction takes the drawer width past its limit." The message appears in the validation summary, in the disabled reason under the download buttons, and in the paused viewer status. The preview keeps the last valid model and both downloads stay refused. The field itself gets no error, because the value the user typed is legal.

**D-818. The save line reports the printer write, and a design write that changed nothing is silent.**
A correction edit rebuilds the mesh, so the generation effect runs and saves the design. The design has not changed, so the line used to flip to "Saved on this device" for a save that wrote nothing. `ProductApp` now keeps the design it last persisted and sets that message only when the design really changed. A successful profile write sets "Printer saved on this device" on the same line. A refused write of either kind still sets "Local save unavailable". One line, one truth, and no flicker between two claims.

**D-819. Every printer-derived surface reads the active corrections.**
`activeCorrections(profile, compensable)` returns the profile with both corrections at zero for a product that names no compensable parameter. The compensation lines, the calibration proposal, the file-name marker, and the warnings all read that value, not the raw profile. Without it, such a product would propose `existing + expected − measured` with an `existing` that never reached the part, and the proposal would count the correction twice.

**D-820. The bed rule waits for a saved profile. The wall rule does not.**
The default tray is 299 mm wide and the default bed is 220 mm, so before this decision every new user met a build-volume warning on the first load. A warning that everybody sees, that nobody asked for, and that names a bed nobody entered is noise, and noise teaches a person to ignore the warning that matters. The bed rule now applies only when the workspace envelope holds a `printer` field, which means the user saved a profile. `readPrinterEntry()` reports that as `saved`, and `bedWarnings()` takes it as `bedIsKnown`. While no profile is saved the Printer section shows one line instead: "Enter your bed size to get build-volume warnings."
The thin-wall refusal still applies from the first load. The 0.4 mm nozzle default is a real assumption about a real machine, not a placeholder, and rule 9 is a print-safety rule: a wall that thin is weak whatever the machine is.
The edge: a user who opens the section and edits only the correction saves a profile that still holds the placeholder bed, and the bed rule starts from that value. The rule is "the field exists", as specified, and the field is one the user has now seen and can change. The alternative, a per-field "confirmed" flag, buys little and costs a shape change in the envelope.

---

## 3. Deviations from the spec

1. **The spec writes `compensate(parameters, profile)` with two arguments.** The implementation takes a third, `compensable`, so the function stays pure and takes no product with it. The sprint task allowed this shape.
2. **The browser-smoke script is not committed.** It is a copy of the shared `pw/` harness and stays in the scratchpad, as in S01 and S03. The numbers in section 4 are therefore not reproducible from the repository alone.
3. **The thin-wall case is an error, not a warning.** The sprint spec asks for a warning. `10_MULTI_PRODUCT_EXPANSION_PLAN.md` section 1, rule 9 says a wall below two nozzle widths is a validation error and must not print. Governance wins. See D-811.
4. **The profile has a `name` field with an input.** The spec lists the name in `PrinterProfileV1` but does not ask for a control. A stored field the user cannot edit would be dead weight, so the section has a name input with the test id `printer-name`.

Every other Scope, Deliverables, Acceptance, and Tests item is implemented as
written.

---

## 4. Measurements

### 4.1 Browser smoke

Method: `npm run build` and `npm run start` on port 3104, driven by
Playwright in headless Chromium. The script parses the binary STL header and
every triangle vertex itself and reports the bounds. The smoke ran three times: on the
sprint commits, after the review fixes, and after the bed-rule change. Every
run reports the same STL numbers, character for character.

| Step | Observed |
|---|---|
| Ready with the defaults | `Ready · 299 × 199 × 50 mm · 2 × 3` |
| STL with no correction | `drawerforge-drawer-tray-299x199x50-2x3-137f96.stl`, 362 triangles, extents 299 × 199 × 50 mm |
| Set X correction 0.5 mm | Compensation line: `X · Modeled 299.5 mm = target 299 mm + 0.5 mm correction` |
| Viewer status and calculated result after the correction | Both still show the target, 299 × 199 × 50 mm |
| STL with the correction | `drawerforge-drawer-tray-299x199x50-2x3-137f96-cx0p5.stl`, 362 triangles, extents **299.5** × 199 × 50 mm |
| Difference from the uncorrected STL | X +0.5 mm, Y 0 mm, Z 0 mm |
| Expected size in the calibration card | `A correctly calibrated print should measure width 299 mm and depth 199 mm, the target size.` (amended in S15; the sprint showed the modeled 299.5 mm here) |
| Measured 299.4 mm entered | `New X correction 0.1 mm = existing 0.5 mm + target 299 mm − measured 299.4 mm` (amended in S15; the sprint proposed 0.6 mm from the modeled size, which was the double count of S13-5 in document 30) |
| After Apply | X correction 0.1, measured field empty, Apply disabled |
| Printer section before any profile is saved | One line, `Enter your bed size to get build-volume warnings.` No warning, although the 299 mm part is wider than the 220 mm placeholder bed |
| Printer section after the profile is saved | The line is gone |
| Bed width 299 mm, part 299 mm | No warning |
| Bed width 298 mm, part 299 mm | `The part is 299 mm in X. The bed is 298 mm in X.` |
| Download button during the warning | Enabled |
| Nozzle 1.2 mm, walls 2 mm | Both downloads refused. The reason names each wall: `Outer wall thickness is 2 mm. A 1.2 mm nozzle needs at least 2.4 mm. A thin wall is weak.` and the same for the base and the dividers |
| Nozzle back to 0.4 mm | Downloads available again |
| Page errors | Two, both the known WebAssembly MIME fallback from the development server path: "wasm streaming compile failed" and "falling back to ArrayBuffer instantiation". The kernel loads and the mesh builds. |

The X extent of the downloaded STL is exactly 0.5 mm larger than the target,
and no other axis moves. This is the sprint's central acceptance item.

### 4.2 Counts

| Measurement | Value |
|---|---|
| Automated tests before this sprint | 137 |
| Automated tests after this sprint | 210 (73 new: 49 in `tests/printer-profile.test.ts`, 7 in `tests/workspace.test.ts`, 17 in `tests/app.integration.test.tsx`; 13 of the 73 came from the review and the bed-rule change) |
| Golden tray triangle count, corrected and uncorrected | 362, unchanged |
| Compartment change for a 0.6 mm correction, 3 columns | 0.2 mm per compartment |
| Bed warning with the shipped defaults | None until a profile is saved. See D-820. The default tray is 299 mm wide and the default bed is 220 mm, so the rule would otherwise fire on every first load. |

---

## 5. Open issues

1. **One profile per device.** The spec puts multiple profiles out of scope. A user with two printers must edit the numbers between prints. The stored shape is one object, so a later `printers` array needs a migration.
2. **No Z correction.** Out of scope. The bed height still gives a warning.
3. **The wall heuristic is a heuristic.** `wallLikeKeys()` reads parameter keys. A later product with a wall parameter named something else gets no wall warning, and a product with a "thickness" parameter that is not a printed wall gets one it does not need. See the follow-ups.
4. **A rollback loses the profile.** See D-802.
5. **A large correction can push a compensated parameter past its spec range.** The app now refuses the download and names the correction; see D-817. The remaining gap is that the field itself shows no error, because the value in it is legal. A user who does not read the summary may look for the fault in the wrong place.
6. **The correction is not in the design file, so a shared design does not carry it.** This is deliberate, see section 1.4, but it means a person who sends both the STL and the design file must say which correction the STL used. The file-name marker carries that information.

---

## 6. Follow-up action items

1. Add an explicit way for a product to name its printed walls, instead of the key heuristic. Do it with the next planned contract change, not on its own.
2. Record the first physical calibration in `sprints/PRINT_RECORDS.md`: print the coupon at 0 mm correction, measure it, apply, print again, and write both measurements.
3. Consider a "correction is active" mark in the viewer status, next to the design name, for a user who works with the Printer section collapsed.
4. Consider a second profile and a profile picker when a second machine is a real need.

---

## 7. Ideas noted, not scheduled

- A correction history: the last five applied corrections with their dates, so a user sees a machine drift.
- A per-axis scale factor beside the offset, for a machine whose error grows with size. The offset alone is right for a fixed extrusion-width error.
- An export of the profile as its own small file, for a workshop with several browsers on one machine.

---

## 8. Review record

An independent review of the two sprint commits ran before this document was
finished. It found no blocker and eight items. All eight are applied.

| Item | Result |
|---|---|
| A compensated value could leave a parameter range and fail in the kernel with a message that named a field limit the field satisfied | Fixed. Second validation pass, D-817, plus a unit case and an integration case. |
| Governance rule 9 makes a thin wall an error, not a warning | Fixed. D-811, README, and tests updated. Recorded as a deviation from the sprint spec. |
| The calibration proposal and the warnings read the raw profile, not the active corrections | Fixed. D-819, with a unit case for a product stub that names no compensable parameter. |
| A field message survived the commit of its draft, and empty text was validated | Fixed. The message clears with the draft, and an empty field is not a bad value. |
| The warning block was mounted only when it had content, so it was never announced | Fixed. It is always mounted with `role="status"` and hidden with CSS when empty. |
| Copy: "A thinner wall prints weak" | Replaced with "A thin wall is weak." in the message and in the README, including the fit-test paragraph that carried the same idea. |
| A printer-only edit claimed a design save | Fixed. D-818. |
| The coupon file name states a compensated size while the STL name states the target | Recorded in D-808. Both are correct for what they name. |

The bed rule was changed once more after that review, at the coordinator's
request: a warning on every first load is noise, so the rule now waits for a
saved profile. See D-820. The thin-wall refusal was left as it is, because
the nozzle default is a real assumption and rule 9 is a print-safety rule.
