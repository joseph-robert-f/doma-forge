# S04. Printer Profile and Dimensional Correction

## Goal

Let a user record their printer's bed size and X and Y correction once, then see and apply the correction to every part. This is roadmap Phase B.

## Model and effort

Opus 5, high. The correction changes printed dimensions. The semantics must be explicit and reversible, and the UX must never silently change what the user asked for. Review by Opus 5, high, by a different agent instance.

## Depends on

S01, because the fit-test coupon is the calibration part.

## Scope

1. Add `lib/printer-profile.ts` with `PrinterProfileV1`: version, name, bed width, depth, and height, nozzle diameter, X correction, Y correction. Store it in the workspace envelope under a new `printer` field. One profile per device for now.
2. Add a collapsed "Printer" section to the form. Bed size and nozzle have defaults of 220, 220, 250, and 0.4.
3. Show compensation, never hide it: "Modeled 299.5 mm = target 299 mm + 0.5 mm correction". The design file still stores the target, never the modeled value.
4. Apply the correction in one place: a `compensate(parameters, profile)` step before `product.generate()`. The product contract gains an optional `compensable` list naming which parameters are outside dimensions. The drawer tray lists drawer width and depth.
5. Calibration flow: print the coupon, measure it, enter the measurement. The app proposes `existing correction + expected − measured` and the user must click Apply.
6. Warnings, not errors: a part larger than the bed in any axis; a wall under two nozzle widths.

## Out of scope

Automatic correction from one print. Multiple profiles. Z correction. Server storage.

## Deliverables

- Profile module, workspace field, and migration test for an envelope without it
- Printer section, compensation display, calibration flow
- `compensable?` on the contract and the drawer tray's list
- `19_PRINTER_PROFILE_NOTES.md`
- README section "Printer profile and calibration" for users

## Acceptance

- With zero correction the mesh is byte-identical to today. The golden test proves it.
- With a correction the outside bounds change by exactly the correction and inside compartment sizes change by the same amount, never more.
- A design file saved with a correction active contains the target values.
- The bed warning appears at 221 mm width on a 220 mm bed and not at 220.

## Tests

- Unit: profile normalization and validation; compensate is a pure function; the proposal formula.
- Geometry: bounds with and without correction.
- Integration: the calibration flow proposes and applies; the design file ignores the profile.
- Browser smoke: set a correction, download the STL, check the parsed bounds.

## Risks

A user can apply a correction twice by mistake. Show the current correction inside the proposal text and make Apply replace, not add.

## Notes to record

The compensation formula and where it runs. Why the design file stays uncorrected.
