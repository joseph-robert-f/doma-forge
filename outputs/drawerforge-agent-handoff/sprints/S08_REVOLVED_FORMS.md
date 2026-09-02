# S08. Revolved Forms and the Card Holder

## Goal

Add the revolve module and the two family D products, the nursery plant pot and the plant pot saucer. Add the card and cartridge slot holder, a family B preset.

## Model and effort

Opus 5, high, for the revolve module and the two pots. Sonnet 5, medium, for the card holder. Review by Opus 5, high. The card holder can run as a parallel agent.

## Depends on

S05.

## Scope

1. `lib/kernel/revolve.ts`: build a 2D profile polygon in the XZ plane, revolve it, and shell it by revolving an inward-offset profile. A profile builder for base, tapered wall, and rolled rim.
2. **Plant pot saucer.** Inner diameter, rim height, wall, taper 3 to 12 degrees, lift ribs, optional overflow notch. Rules from the plan: inner diameter at most bed minus 12 mm; taper at least 3 degrees; wall at least 1.6 mm.
3. **Nursery plant pot.** Outer diameter, height, wall, drainage holes 4 to 8 mm in the flat base only, wall at most 45 degrees from vertical, a matching saucer diameter shown as a derived value.
4. **Card and cartridge slot holder.** A slab with a slot cutter array from S05: card thickness plus clearance, card width, count, slot depth, tilt 0 to 20 degrees. Presets for SD cards, game cartridges, and cassettes.
5. Copy for the pots must not mention watering food plants or herbs. Say "plant".

## Out of scope

Threads. Self-watering inserts. Multi-part pots.

## Deliverables

- Revolve module with unit tests
- Three product folders, registry entries, README entries, golden records
- `23_REVOLVED_FORMS_NOTES.md`

## Acceptance

- The saucer is watertight in geometry: one closed contour in every horizontal slice below the rim.
- The pot's drainage holes never cut the wall.
- The pot and saucer pair: saucer inner diameter equals pot base diameter plus 2 mm when the user takes the derived value.
- Mesh quality changes the segment count of every revolved surface.

## Tests

Standard per product. Revolve unit tests: a square profile gives a cylinder volume within 0.1 percent at fine quality.

## Risks

A revolved shell with a rolled rim can self-intersect at small radii. Clamp the rim radius to a quarter of the rim height and test the minimum.

## Notes to record

Profile builder API. Segment counts per quality for revolved surfaces.
