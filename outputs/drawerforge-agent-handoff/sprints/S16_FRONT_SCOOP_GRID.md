# S16. Front Scoop and Grid Clearance

## Goal

Keep the drawer tray's front finger scoop clear of its divider walls at every
valid grid size. A photographed print showed the centered notch aligned with
a divider.

## Model and effort

Existing-family geometry work at high effort, with an independent read-only
review before the pull request.

## Depends on

S05 for the shared rounded shell and S15 for the current geometry and tests.

## Scope

1. Compute one scoop location in a central front compartment. Keep an odd
   column layout centered; choose the left central compartment for an even
   layout. Keep the cut close to the tray center.
2. Cap the scoop radius to leave at least 2 mm of front rim between the cut
   and each adjacent column divider. Retain the existing height, width, and
   12 mm caps.
3. Cut through the front rim even where a large corner radius curves it
   inward. Do not cut a row or column divider.
4. Use the same location and radius for surface-pattern keepouts.
5. Increment the drawer tray geometry version and update the current geometry
   contract and affected golden names.
6. Prepare a print record for a small even-column tray. A person will print
   and inspect it; no measured result is inferred from automated tests.

## Out of scope

New scoop controls, multiple scoops, arbitrary divider layouts, and changes
to the other products' scoop geometry.

## Deliverables

- Scoop placement and geometry changes with focused regression tests
- Updated geometry version and documentation
- A prepared physical print record
- Independent review findings and dispositions in the sprint notes

## Acceptance

- Every valid drawer tray grid places a scoop inside one front compartment,
  with 2 mm of rim before the adjacent column divider boundaries.
- The notch opens the front wall on regular and maximally rounded layouts.
- All dividers remain continuous and the finished mesh remains closed.
- Lint, typecheck, test, build, server render, deploy configuration, and
  browser checks pass.

## Tests

Exercise odd and even column counts, 10 mm compartments, large corner radii,
and the generated mesh at a horizontal slice through the notch. Retain the
default solid golden record if its shape is unchanged.

## Risks

An extended cutter can reach a row divider if it is applied after the
divider union. Carve the shell before adding dividers, and prove the notch
still opens at a rounded corner. A geometry version change updates file
hashes even for parameter sets whose mesh stays the same.

## Notes to record

Record the placement rule, radius bound, mesh and filename changes, test
results, review findings, and what remains for the physical print.
