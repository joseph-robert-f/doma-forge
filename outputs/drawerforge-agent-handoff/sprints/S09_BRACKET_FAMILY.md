# S09. Bracket Family

## Goal

Add the wall-mount family with load rules, proven by four products: the wall hook rail, the headphone and controller wall mount, the shelf riser, and the entryway valet.

## Model and effort

Fable 5.1, high. These parts carry load across print layers. The validation rules decide whether a printed part snaps. This is the highest-risk geometry in the catalog and it sets the rules every later bracket follows. Review by Opus 5, high.

## Depends on

S03 for the print pose. S04 for the bed and nozzle profile. S05 for the kernel.

## Scope

1. `lib/kernel/brackets.ts`: a back plate, a screw-bore array with countersinks at a given spacing, hull gussets, and a J-profile hook extrusion with a filleted root.
2. **Load rules as validation, not warnings.** Hook root at least 8 mm. Projection at most 2.5 times the root and never over 60 mm. Screw bores at least 8 mm from any edge and never inside a hook root. Leg height over section at most 12. Gussets always on. Ribs when a deck span is over 150 mm.
3. **Wall hook rail.** Rail length, height, hook count, projection, screw spacing, optional shelf depth up to 80 mm with gussets.
4. **Headphone and controller wall mount.** Plate, one wide hook at least 20 mm, an optional pocket for a controller, screw bores.
5. **Shelf riser.** Deck on four legs from S07, ribs, deck lightening, press-fit leg sections above 240 mm total height.
6. **Entryway valet.** The drawer tray shell with uneven wells from S07 and an angled phone rest at 8 to 25 degrees, clipped to the shell, with a slot.
7. Each product sets a print orientation: plate flat on the bed, hook or pocket pointing up. Each shows a load note from a simple estimate: perimeters times root area times a constant, stated as approximate.

## Out of scope

Anchors and screws. Loads over 5 kg. Any product that heats.

## Deliverables

- Bracket kernel module with unit tests
- Four product folders, registry entries, README entries, golden records
- `24_BRACKET_FAMILY_NOTES.md` with the load model and its assumptions

## Acceptance

- Every load rule has a test at the boundary that fails by one step and passes at the limit.
- No product can produce an unsupported overhang over 45 degrees in its print pose. A test rotates the mesh into the print pose and checks face normals.
- Coupon records prepared for all four products, with a note that the hook rail coupon is a single hook.

## Tests

Standard per product. Overhang test in print pose. Load rule boundaries.

## Risks

The load estimate can be read as a guarantee. Label it "approximate" in the UI, state the assumptions in the notes, and never show a number without the material and perimeter count it assumes.

## Notes to record

Load model. Overhang test method. Rules that came from a printed failure.
