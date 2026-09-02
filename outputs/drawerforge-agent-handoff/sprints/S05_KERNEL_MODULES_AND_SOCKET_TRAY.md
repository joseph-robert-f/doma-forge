# S05. Kernel Modules and the Socket Tray

## Goal

Build the shared geometry modules that every later product uses, and prove them with one reference product: the bit, socket, and driver tray.

## Model and effort

Fable 5.1, high. This sprint sets the shape of every family B product and touches the kernel every product calls. A weak module here costs every later sprint. Review by Opus 5, high.

## Depends on

S02 for the product route. S03 for viewer scale, because the tray is small.

## Scope

1. `lib/kernel/shell.ts`: extrude a profile and subtract an inward-offset cavity, the pattern the drawer tray uses. Move the drawer tray onto it without changing its mesh.
2. `lib/kernel/arrays.ts`: a cutter array. Takes a cutter solid factory, a pitch in X and Y, counts, and an origin. Returns one batched union. Add a pitch solver: given a span, a count, and a minimum web, return the pitch or an error.
3. `lib/kernel/profiles.ts`: add `polygon` and `chamferedCircle` (a cone cutter for a chamfered bore).
4. `lib/kernel/lightening.ts`: subtract underside pockets from a slab, leaving a base and a rim.
5. Product `socket-tray` in `lib/products/socket-tray/`: tray width and depth, rows, holes per row, bore diameter per row, bore depth, chamfer flag, plus the shared construction group. Two presets: quarter-inch set, half-inch set. Names must not refer to brands.
6. Validation rules from the plan: pitch minus bore at least 2.5 mm; array inside the inner rectangle; bore depth at most height minus base.
7. Register it. Add it to the route switcher. Golden test at geometry version 1.

## Out of scope

Any other product. Multi-piece splitting. Label channels.

## Deliverables

- Four kernel modules with unit tests that do not need a product
- The drawer tray moved onto `shell.ts` with its golden test unchanged
- The socket tray product, presets, geometry cases, STL round trip, and golden record
- `20_KERNEL_MODULES_NOTES.md` with the module API and the rules every family B product follows
- README entry for the product

## Acceptance

- Drawer tray golden record unchanged.
- Socket tray: every geometry case passes the standard checks; a slice above the base shows one outer contour and one hole per bore.
- The pitch solver rejects a layout whose web would be under 2.5 mm with a message naming the field.
- One printed coupon record prepared in `sprints/PRINT_RECORDS.md`.

## Tests

Standard geometry suite per product. Kernel unit tests for the array with 1, 2, and 24 cutters and for the pitch solver at the boundary.

## Risks

A batched union of many cylinders is the first heavy Boolean job. Measure kernel time for 8 by 6 bores at fine quality. If it exceeds one second, tune the worker's terminate threshold in the notes.

## Notes to record

Module API. Kernel timings. Any change to the product contract, which must be listed as a decision.
