# 32. Front Scoop and Grid Clearance Notes

Date: 2026-09-23
Status: Implemented in the S16 branch; physical print pending.
Reads with: `sprints/S16_FRONT_SCOOP_GRID.md`, `03_GEOMETRY_AND_STL.md`,
`sprints/PRINT_RECORDS.md`

## 1. Report and cause

A user supplied a photo of a printed drawer organizer. The front scoop was
aligned with a divider, so the opening did not lead cleanly into a compartment.
The photo did not include the design's parameter values or a measurement, and
it is not stored in this package. The source confirmed two causes:

1. The cutter was fixed at X = 0. That is a column divider on every even grid.
2. Its radius depended on outside width and wall height, not compartment
   width. A valid 86 mm tray with seven 10 mm columns had a 6.45 mm radius
   centered inside a compartment only 10 mm wide.

## 2. Decisions

**D-2001. Keep one scoop near the tray center.** Odd-column trays keep the
notch at X = 0. Even-column trays place it in the left central front
compartment, as close to the center divider as the required clearance permits.
This preserves the existing one-notch behavior.

**D-2002. Leave 2 mm of rim beside neighboring dividers.** The radius retains
the 12 mm maximum, the 7.5 percent outside-width limit, and the minimum base
clearance. It gains a `compartmentWidth / 2 - 2` limit. In a 10 mm compartment
the radius is 3 mm. On an even grid the center is
`-(dividerThickness / 2 + 2 + radius)`; this leaves 2 mm on the side nearest
the center divider and at least 2 mm on the other side.

**D-2003. Carve the shell before adding dividers.** The Y-axis cutter now
reaches through a front rim that curves inward under a large corner radius.
It is applied to the shell before divider union, so the extra reach cannot
cut a row divider behind that rim. The finished model is still one solid.

**D-2004. Use one layout calculation in geometry and surface planning.** The
front-wall pattern keepout follows the moved notch and its reduced radius.

**D-2005. Increment the drawer tray geometry version to 3.** Existing design
files with an older geometry version load with the app's normal changed-mesh
warning. Version 3 changes filename hashes. The default part keeps its bounds
and volume within the existing golden tolerance, while the Boolean order
changes its triangulation from 362 to 360 faces.

## 3. Verification

The placement test sweeps valid combinations of outside width, fit clearance,
wall and divider thickness, and one to eight columns. It checks the entire
notch span against the selected compartment's boundaries. Mesh slice tests
cover two columns, seven 10 mm columns, and a maximally rounded 80 × 80 mm
tray. Each checks an open notch, a solid divider, a continuous wall below the
notch, one connected component, and closed mesh edges. The even-column
surface-pattern test checks the moved keepout center.

The focused run of `drawer-tray`, `geometry`, `products`, `coupon`,
`design-file`, and `workspace` tests passed 269 of 269 assertions. One
import-graph test that reads the repository exceeded its 30-second timeout
on this machine during the first run; the `products` file passed all 182
assertions when rerun with a 180-second local test timeout. The golden test
passes with 360 triangles, the existing volume tolerance, and unchanged
bounds. No Vitest configuration or dependency change is part of this sprint.

The pull request's CI workflow is the full lint, typecheck, unit, build,
server-render, deploy-configuration, and browser merge gate.

## 4. Independent review

A separate read-only reviewer checked the S16 diff, valid parameter bounds,
rounded front edge, Manifold resource ownership, surface keepouts, and tests.

| Finding | Disposition |
|---|---|
| The first run still expected 362 default triangles and failed at 360. | The golden count was updated; the existing volume and bounds assertions remain. |
| New edge-case slice tests did not prove closed mesh edges or one component. | Both assertions were added to every new generated-mesh case. |
| The relocated surface keepout lacked a focused even-column test. | A test now compares the front-wall circle to the shared scoop layout. |
| The sprint notes had not yet been written. | This document records decisions, review dispositions, and the pending print. |

The reviewer found no remaining placement or ownership defect.

## 5. Physical print

Record 19 in `sprints/PRINT_RECORDS.md` prepares an 80 × 80 × 20 mm, 2 × 2
tray with a 6 mm scoop radius and a 2 mm rim beside the center divider. It is
a full small tray: the existing 5 mm fit-test ring has no dividers or scoop.
A person must print, inspect, and measure it. The reported photo establishes
the original defect but does not verify the new geometry.

## 6. Open follow-up

Complete record 19 after a physical print. Record the printer, material,
nozzle, dimensions, visible gap beside the divider, and a photo of the new
front rim. Do not infer these measurements from the generated mesh.
