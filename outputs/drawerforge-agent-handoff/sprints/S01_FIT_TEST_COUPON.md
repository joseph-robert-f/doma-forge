# S01. Fit-Test Coupon Export

## Goal

Give the user a small, fast print that proves the drawer fit before the full tray prints. The coupon is a 5 mm high ring with the tray's outside profile and no base.

## Model and effort

Sonnet 5, medium. The geometry reuses the rounded-rectangle profile and the shell step. The work is a new export path and its tests. Review by Opus 5, high.

## Depends on

None.

## Scope

1. Add `coupon(parameters)` to the drawer tray product. It returns a `GeneratedModel` built from the outer profile minus an inward offset of 2 mm or the wall thickness, whichever is larger. Height 5 mm. No base, no dividers, no scoop.
2. Add an optional `coupon` member to `ProductDefinition`. A product without one shows no coupon button. This is an optional addition to the contract; it does not change any existing member.
3. Add a "Download fit test" button beside "Download STL". It runs the same safety checks as the STL download.
4. Filename: `drawerforge-fit-test-<width>x<depth>-<hash>.stl`, with the design name prefix when one exists.
5. One line of help copy: "Print this ring first. It uses little material and shows whether the tray fits the drawer."

## Out of scope

Cross-bracing inside the ring. Printer correction, which S04 adds. Coupons for other products.

## Deliverables

- `lib/products/drawer-tray/coupon.ts`
- `coupon?` on `ProductDefinition` in `lib/products/types.ts`
- Button, handler, and copy in `ProductApp.tsx`
- Tests listed below
- `outputs/drawerforge-agent-handoff/16_FIT_TEST_COUPON_NOTES.md`
- README section "Fit test" for users

## Acceptance

- The coupon's outside bounds equal the tray's outside bounds in X and Y, and 0 to 5 in Z.
- The coupon has exactly one outer contour and one inner contour in a horizontal slice.
- The coupon volume is less than 10 percent of the tray volume for the defaults.
- The button is disabled whenever the STL button is disabled.
- The golden mesh test for the tray is unchanged.

## Tests

- Geometry: bounds, closed edges, one component, slice topology, for the defaults and for the maximum corner radius.
- Golden record for the default coupon: triangle count, volume, bounds.
- STL round trip through `inspectBinaryStl`.
- Integration: button state follows the STL button; the download name matches the pattern; the design name prefix applies.
- Browser smoke: download the coupon from the production build and check the file size.

## Risks

A wall thinner than two nozzle widths prints weak. Clamp the ring wall to at least 2 mm regardless of the tray wall setting, and say so in the help copy.

## Notes to record

Ring wall rule. Whether the coupon should follow the tray's corner radius at the inside edge or use a plain offset.
