# S07. Family A Extensions: Uneven Wells and Leg Posts

## Goal

Extend the shelled-tray family with two capabilities the wave 2 products need: divider positions set by explicit well widths, and leg posts under a tray. Prove them with the remote and controller caddy and the two-tier drawer riser.

## Model and effort

Opus 5, high. Uneven wells need a new layout schema with a deterministic fraction rule, and legs carry load. Both are new geometry inside an existing family. Review by Opus 5, high, by a different agent instance.

## Depends on

S05.

## Scope

1. **Layout schema.** Add a `layout` parameter kind: an array of well widths in millimeters, one per column, where the last well is solved so the sum plus dividers equals the inner width. Add the kind to `ParameterSpec`, `normalizeFromSpecs`, `validateAgainstSpecs`, `ParameterControls`, and the signature. This is a product-contract change. Record it as a decision and keep the drawer tray on the even grid.
2. **Divider array by position.** Extend `lib/kernel/arrays.ts` with a divider array that takes explicit X positions.
3. **Leg posts.** `lib/kernel/legs.ts`: four rounded-square posts inset from the corners, with hull gussets to the deck. Rules: leg height over section at most 12; section at least 8 mm.
4. **Remote and controller caddy.** Two to five wells with explicit widths, well depth, a low front wall. Rule: every well at least 25 mm wide.
5. **Two-tier drawer riser.** The drawer tray on legs. Inputs: drawer width and depth, clear height over the contents, tray height, leg section, rows and columns. Rule: clear height plus tray height plus base at most the drawer usable height minus 5 mm, entered by the user.

## Out of scope

Freehand divider drawing. Uneven rows. Auto-split.

## Deliverables

- Layout kind across the shared modules, with unit tests
- Two kernel additions with unit tests
- Two product folders, registry entries, README entries, golden records
- `22_FAMILY_A_EXTENSIONS_NOTES.md`

## Acceptance

- A layout of widths that does not fit reports which well to shrink.
- The caddy slice shows one contour per well.
- The riser prints legs up on the deck; the print orientation from S03 is set.
- The drawer tray golden record is unchanged.

## Tests

Standard per product. Layout normalization: strings, negative values, too many wells. Leg rule at the boundary.

## Risks

The layout kind is the first non-scalar parameter. The signature must serialize it deterministically. The design file must round-trip it. Add both tests before the products.

## Notes to record

The layout schema and the solve rule for the last well. The contract change.
