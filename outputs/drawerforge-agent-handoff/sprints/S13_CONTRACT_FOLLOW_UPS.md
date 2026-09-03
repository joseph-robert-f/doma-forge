# S13. Contract Follow-ups

## Goal

Close the follow-ups that four sprint notes record and that only a change to the product contract can close: geometry that loads per product, the fit-test coupon in the worker, thin features the product reports itself, and a diameter axis for the printer correction.

## Model and effort

Fable 5.1, high. Each item changes the product contract or the generation protocol, which every product and later sprint builds on. Routine per-product work goes to Sonnet 5, medium. Review by Opus 5, high.

## Depends on

S01 for the coupon. S04 for the printer profile. S05 for the contract. S09 for the full catalog, so the chunk numbers are final.

## Scope

1. **Geometry per product.** Each product's definition loads its geometry module on demand. The registry, which the page and the worker both import, then holds only schemas, validation, derived values, and copy. The worker chunk and the page's registry chunk stop growing with the catalog's geometry. Lower the worker budget once, to the measured number plus room.
2. **Coupon in the worker.** The generation protocol gains a `kind` of `"model"` or `"coupon"`. The page requests the coupon through the same client as the preview, so the main thread never loads the kernel. The fit-test button shows a busy state while the coupon builds. Carried from 16_FIT_TEST_COUPON_NOTES.md follow-ups 1 and 4.
3. **Printed walls from the product.** A product may report the thin features it prints, solved webs and fixed ribs included, as a list of labeled millimeter values. The printer profile's thin-wall rule reads that list when a product supplies it, and falls back to the key-name heuristic when it does not. Products with solved webs, legs, ribs, or fixed lips supply the list. Carried from 20_KERNEL_MODULES_NOTES.md open issue 5, 21 open issue 3, 22 open issue 4, and 23 open issue 7.
4. **Diameter compensation.** `CompensableParameters` gains a `diameter` list. A diameter takes the mean of the X and Y corrections, once. The pot and the saucer set it. The print records for both say what to measure. Carried from 23_REVOLVED_FORMS_NOTES.md open issue 3 and follow-up 3.
5. **Test dedupe.** `tests/geometry.test.ts` uses `tests/helpers/mesh-checks.ts` instead of its own copies. Carried from 20 follow-up 1, 21 follow-up 4, and 22 follow-up 5.

## Out of scope

The printer profile inside `validate` (bed constants in the pots, the one-piece height in the shelf riser). Bore and socket compensation, which wait for printed records. Anchors, screws, and loads. Any new product.

## Deliverables

- Contract and protocol changes with unit tests
- Fifteen product definitions on lazy geometry; the products with thin features report them
- `28_CONTRACT_FOLLOW_UPS_NOTES.md`

## Acceptance

- The built worker chunk and the page's registry chunk hold no product geometry. The budget test measures the new numbers and a product added later changes them by its schema only.
- The coupon downloads from the worker with the same safety checks as before, and the button is disabled and labeled while it builds.
- A nozzle of 1.5 mm refuses the download for every product whose solved web is under 3 mm, with a message that names the web.
- Every golden record is unchanged.

## Tests

Standard. Chunk budget. Protocol round trip for both kinds. Thin-wall issues from a product's own list. Diameter compensation at zero, one-axis, and two-axis corrections.

## Risks

Lazy loading adds a network round trip before the first preview. Measure the first Ready time in the browser suite against its 5 s budget.

## Notes to record

Chunk sizes before and after. The rule for which features a product reports. The mean rule for diameters.
