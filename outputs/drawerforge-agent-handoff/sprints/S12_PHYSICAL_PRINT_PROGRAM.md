# S12. Physical Print Program

## Goal

Turn the app's untested fit and calibration claims into measured facts, one printed coupon at a time.

## Model and effort

Haiku 4.5, low, for the record template, the per-product print notes, and updating the records from measurements a person supplies. A person prints and measures. This sprint runs alongside every product sprint.

## Depends on

S01 for the coupon. S04 for the calibration flow.

## Scope

1. Create `sprints/PRINT_RECORDS.md` with one record per printed coupon: date, product, preset, printer, material, nozzle, perimeters, target dimensions, measured dimensions, correction applied, fit result, photo file name.
2. For each product sprint, the sprint agent prepares a record with the target values filled in. The person prints and fills in the rest.
3. After the first three drawer tray coupons, run the S04 calibration flow and record the correction that results.
4. Keep a short "print notes" paragraph per product in the README: orientation, perimeters, material.

## Out of scope

Automated correction. Any claim of fit before a record exists.

## Deliverables

- `sprints/PRINT_RECORDS.md` with the template and the first records
- README print notes per product

## Acceptance

- Every shipped product has at least one filled record before its wave is called done.
- The README never claims a fit that has no record.

## Tests

None. The records are the evidence.

## Risks

Records go stale when geometry changes. Each record names the geometry version it was printed under.

## Notes to record

The records are the notes.
