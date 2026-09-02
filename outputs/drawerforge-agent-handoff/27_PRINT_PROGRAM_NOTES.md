# 27. Print Program Notes

Date: 2026-09-02
Status: Documented for S12 Physical Print Program sprint.
Reads with: sprints/S12_PHYSICAL_PRINT_PROGRAM.md, sprints/PRINT_RECORDS.md, 16_FIT_TEST_COUPON_NOTES.md, 19_PRINTER_PROFILE_NOTES.md

This document records sprint S12. It establishes the physical print record
template and the first three fit-test coupon records for the drawer tray. It
also updates the README with print guidance and softens claims about fit.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `sprints/PRINT_RECORDS.md` | The record template with all required fields, the calibration protocol as numbered steps, and the first three drawer tray fit-test coupon records with target values filled and measured values empty. |
| `README.md` | New "Print notes" subsection under "Fit test" with orientation, perimeters, layer height, and material guidance for the drawer tray coupon. Softened language on the fit test claim from "proves" to "tests whether". |

### 1.2 The print record

A record holds one printed coupon or part. The fields are:

- Date of the print
- Product and geometry version (e.g., "Drawer tray, geometry version 1")
- Preset or parameters (the configuration name or the exact values)
- Design file name (the STL file name as downloaded)
- Printer, nozzle, material (the machine and filament used)
- Perimeters, layer height (slicer settings)
- Target outside width x depth x height in mm (computed by the sprint agent)
- Measured outside width x depth x height in mm (filled by the person after printing)
- Correction applied, X and Y, in mm (the printer profile correction in effect)
- Fit result (one of: too tight, fits, loose, with the gap in mm if applicable)
- Photo (file name of a photo of the print)
- Notes (any other observations)

The target values come from the derived dimensions in the app: for the drawer tray,
`outside width = drawerWidth - 2 × clearancePerSide` and `outside depth = drawerDepth - 2 × clearancePerSide`.
The coupon height is always 5 mm.

### 1.3 The calibration protocol

After the first three drawer tray coupons are printed and measured, the
calibration protocol guides a person to apply a dimensional correction. The
steps live in the PRINT_RECORDS.md file and reference the **Printer** section
in the app, which follows the "How to calibrate" flow from the README. The
protocol is:

1. Print with 0 mm correction in both X and Y.
2. Let the print cool and measure the outside width and depth.
3. Enter the two measurements in the app's **Printer** section.
4. Read the proposal (existing + expected − measured).
5. Select **Apply correction**.
6. Print again and measure to confirm.

### 1.4 The first three records

Three drawer tray records are prepared with target values filled:

1. **Defaults**: 300 × 200 mm drawer → 299 × 199 × 5 mm coupon.
   Preset: defaults (2 × 3 compartments, 8 mm corner radius, 50 mm height).
   Design file: `drawerforge-fit-test-299x199-<hash>.stl`.

2. **Hand tools preset**: 360 × 260 mm drawer → 359 × 259 × 5 mm coupon.
   Preset: Hand tools (2 × 4 compartments, 10 mm corner radius, 55 mm height).
   Design file: `drawerforge-fit-test-359x259-<hash>.stl`.

3. **Desk supplies preset**: 320 × 220 mm drawer → 319 × 219 × 5 mm coupon.
   Preset: Desk supplies (2 × 3 compartments, 8 mm corner radius, 45 mm height).
   Design file: `drawerforge-fit-test-319x219-<hash>.stl`.

The hash is a six-character hex string from `shortHash(product.signature(parameters))`.
It is the same hash the full tray's STL file carries. It is unknown at authoring time,
so the records use the placeholder `<hash>`. The person fills it in after the first
download.

### 1.5 Print notes

The README's new "Print notes" subsection under "Fit test" guides a person to:

- Print the coupon flat on the bed.
- Do not use supports.
- Use enough perimeters to print the ring wall solid. Three perimeters is a minimum.
- Use a stiff filament. PLA and PETG are satisfactory.

### 1.6 Softened fit claims

The README originally said the fit test "proves the drawer fit". This is a claim
that fit is confirmed, which no record supports at authoring time. The sentence
is softened to "tests whether the tray fits the drawer", which describes what
the print is for without claiming the result.

---

## 2. Decisions

**D-1201. The record template matches the sprint spec exactly.**
The template has every field the spec lists: date, product and geometry version,
preset or parameters, design file name, printer, material, nozzle, perimeters
and layer height, target dimensions, measured dimensions, correction applied
X and Y, fit result with the gap in mm, photo file name, and notes. Four fields
are added: design file name, layer height, notes, and the geometry version the
Risks section requires. No spec field is removed.

**D-1202. The first three records are for the drawer tray fit-test coupon only.**
The spec says "After the first three drawer tray coupons, run the S04 calibration
flow". The first three records are therefore drawer tray records. A socket tray
record (if S05 adds one) starts in a separate section with a clear hand-off
sentence for the integrator.

**D-1203. Target dimensions come from the derived-dimensions formula.**
For the drawer tray, `outside width = drawerWidth - 2 × clearancePerSide` and
`outside depth = drawerDepth - 2 × clearancePerSide`. The coupon height is 5 mm
(fixed per the coupon design). These values are computed at authoring time from
the preset or parameter values and recorded in the template. The person fills
in measured values after printing and cooling.

**D-1204. The design file name uses the coupon naming convention from S01.**
The coupon filename pattern is `drawerforge-fit-test-<width>x<depth>-<hash>.stl`,
where width and depth come from the coupon's own bounds (the outside dimensions).
The hash is the same six-character hash the full tray's STL file carries. At
authoring time the hash is unknown, so it is written as `<hash>`. The person
writes the actual hash after the first download.

**D-1205. The calibration protocol is captured in the PRINT_RECORDS.md file.**
The protocol is a numbered step-by-step guide that runs once after the first
three coupons are printed and measured. The steps reference the README's
"How to calibrate" section and the app's **Printer** section. They live in
PRINT_RECORDS.md so the print records and the calibration procedure are in
one place.

**D-1206. The README's fit-test claim is softened from "proves" to "tests whether".**
The sprint spec requires that "The README never claims a fit that has no record".
The original sentence "proves the drawer fit" is a claim that fit is confirmed.
This is softened to "tests whether the tray fits the drawer", which describes
the purpose of the print without claiming a result that no record supports.

---

## 3. Deviations from the spec

Scope item 3 and the Acceptance criterion need a physical print. Neither is done.
The records are prepared and empty. See section 5 follow-up 1.

---

## 4. Open issues

1. **Hash computation at authoring time.** The records use `<hash>` as a
   placeholder because the hash comes from `shortHash(product.signature(parameters))`,
   which runs only inside the app at download time. A later sprint could precompute
   hashes from parameter sets if they are needed elsewhere, but they belong in
   the records only after a real download occurs.

2. **Layer height guidance.** The print notes mention layer height but do not
   specify a value. Layer height depends on the filament, the nozzle diameter,
   and the machine. A default of 0.2 mm is common, but the guidance is left
   generic so a person can choose what suits their machine.

3. **Photo documentation.** The record template includes a "Photo" field but does
   not mandate how photos are stored or named. This is left to the person who
   prints. A convention could be established later if needed (e.g., SHA256 hash of
   the image file, or a date-and-preset-based naming scheme).

---

## 5. Follow-ups

1. **Measure and fill the first three records.** A person should print the three
   drawer tray coupons at 0 mm correction, measure them, fill in the measured
   values and fit results, and record photos. Then run the calibration protocol
   for the first time.

2. **S05 adds the first socket tray record.** When the socket tray product ships,
   the S05 agent should prepare the first socket tray record in the "Socket tray"
   section of PRINT_RECORDS.md, following the same pattern as the drawer tray
   records.

3. **Update records with product geometry changes.** Whenever a product's `geometryVersion`
   changes, any outstanding printed records become stale. New records should be
   prepared with the new version number. The records document shows which version
   each print used, so a person can keep track of which tray design matches which
   print.

4. **Consider a records status dashboard.** As records accumulate, a dashboard
   could summarize the status of each product: whether calibration is complete,
   how many records exist, whether any geometry versions are obsolete. This is
   out of scope for this sprint.

---

## 6. Notes to record (from the spec)

The records are the notes. Every claim of fit, every measurement, and every
correction is recorded in `sprints/PRINT_RECORDS.md` as a row in a table. The
README names what the coupon shows (whether the tray fits) but not what the
records contain (the actual result). The sprint spec calls this "Never fill a
measured value without a print" — a rule enforced by a person who holds the
physical coupon and the caliper, not by the app itself.

