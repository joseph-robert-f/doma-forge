# S14. Print Context in Validation

## Goal

Let a product's validation read the saved printer profile, so the two pots refuse a part wider than the person's bed and the shelf riser's one-piece height is a setting the bed height checks, instead of constants that assume one reference printer.

## Model and effort

Fable 5.1, high, for the contract change. Review by Opus 5, high, with the fallback reviewer at the same effort when the primary is unavailable.

## Depends on

S04 for the printer profile. S08 for the pots. S09 for the shelf riser. S13 for the contract as it stands.

## Scope

1. **A print context.** `PrintContext` holds the bed as three extents, or null while the profile is unsaved, and the nozzle diameter. `validate` takes it as an optional second argument. A product that ignores it is unchanged. The page builds the context once from the profile and passes it to both validation calls, target and compensated. Carried from 23_REVOLVED_FORMS_NOTES.md open issue 1, 24_BRACKET_FAMILY_NOTES.md open issue 4, and 28_CONTRACT_FOLLOW_UPS_NOTES.md follow-up 1.
2. **The pots read the bed.** The plant pot's and the saucer's widest-diameter rule uses the smaller bed axis less the 12 mm margin when the bed is known, and the 220 mm reference otherwise. The message names which bed it used. The field limits stay at 208 mm, because a spec is static.
3. **The riser's one-piece height is a parameter.** `onePieceHeight`, 100 to 500 mm, default 240, replaces the constant in the split plan. Validation refuses a one-piece height above the known bed height and names the bed. The geometry version is unchanged: the default reproduces every earlier mesh, and only the design hash changes because the spec has one more key.
4. **No new refusals from the bed alone.** The build-volume warning of S04 stays a warning for every product. Only a rule a product already had becomes bed-aware.

## Out of scope

The nozzle inside a product's own rules; the thin-wall rule already carries it. A geometry that reads the context directly. Bore and socket compensation. Any new product.

## Deliverables

- Contract change with tests
- Pot, saucer, and shelf riser changes with tests and re-prepared record 17
- `29_PRINT_CONTEXT_NOTES.md`

## Acceptance

- With an unsaved profile, every product validates exactly as before, on every default and preset.
- With a saved 180 mm bed, the default pot and saucer still pass, and a pot at the 208 mm field maximum is refused with a message that names the 180 mm bed.
- With a saved 200 mm bed height, a riser taller than the bed at the default one-piece height of 240 mm is refused on that field, and 200 mm passes. A riser that fits the bed is not refused, whatever the setting.
- Every golden triangle count and volume is unchanged.

## Tests

Standard. Context at unsaved, reference, smaller, and larger beds. A cleared one-piece height.

## Risks

A person who saves a wrong bed size sees refusals the reference printer would not give. The message names the bed and the profile so the fix is one edit away.

## Notes to record

The context shape. Why the pots' field limits stay static. Why the riser's height is a parameter and not a hidden input.
