# S06. Wave 1 Products

## Goal

Add four products that are presets of the S05 modules: marker cup block, battery organizer, tool fin rack, and stackable parts bin.

## Model and effort

Sonnet 5, medium, for the marker cup, battery organizer, and tool fin rack. Each is one product folder that calls existing modules. Opus 5, high, for the parts bin, because the stacking lip and its recess are new geometry with a fit tolerance. Review by Opus 5, high, per product. The four products can run as four parallel agents.

## Depends on

S05.

## Scope

Each product gets a folder under `lib/products/`, a schema, validation, geometry, two presets, a registry entry, and the standard tests.

1. **Marker cup block.** Same as the socket tray with one bore diameter, a tilt of 0 to 15 degrees, and a shelled underside. Validate that a tilted bore stays inside the outer wall.
2. **Battery organizer.** Bores for AA, AAA, C, D, 18650, and 2032 coin cells as presets, with a custom diameter. Cell length sets the bore depth with a 3 mm finger relief cut at the top of each bore.
3. **Tool fin rack.** A base slab with a fin array. Fin pitch, thickness, height, count. Rules: pitch minus thickness at least 12 mm; height over thickness at most 15; a fillet at the fin base; base at least 3 mm.
4. **Stackable parts bin.** The drawer tray shell plus a top stacking lip, a matching underside recess grown by the clearance, a front scoop, and an optional label ledge. Rules: lip wall plus two clearances at most wall minus 0.8 mm; wall at least 1.6 mm when stacking is on.

## Out of scope

New kernel modules. If a product needs one, stop and report; that is an S05 follow-up for Fable 5.1.

## Deliverables

Four product folders, registry entries, README entries, golden records, and `21_WAVE_1_PRODUCTS_NOTES.md` with one section per product.

## Acceptance

- Each product passes the registry invariants in `tests/products.test.ts` without changes to that file.
- Each product passes the standard geometry checks for minimum, default, maximum, and one conflict case.
- The parts bin: two bins with equal parameters stack, proven by a test that the recess bounds enclose the lip bounds with the clearance.
- No product name or copy refers to food, drink, or a health use.

## Tests

Standard per product. A stacking test for the bin.

## Risks

Tilted bores in the marker cup can exit the wall. The validation must compute the bore axis exit point, not only the top opening.

## Notes to record

Per product: parameter table, rules, kernel time, coupon record prepared.
