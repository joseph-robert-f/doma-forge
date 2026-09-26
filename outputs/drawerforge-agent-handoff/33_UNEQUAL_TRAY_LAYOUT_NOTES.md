# 33. Unequal Drawer Tray Layout Notes

Date: 2026-09-26
Status: Implemented and merged in [PR #21](https://github.com/joseph-robert-f/doma-forge/pull/21) as commit `9ce09006e04721a50dc88e7b0237ca6d559418ab`; physical print pending.
Reads with: `32_FRONT_SCOOP_GRID_NOTES.md`, `13_DESIGN_FILE_NOTES.md`,
`14_WORKSPACE_STORAGE_NOTES.md`, and `sprints/PRINT_RECORDS.md`.

## Layout contract

The drawer tray's `rowLayout` and `columnLayout` each support `even` mode with
a count or `custom` mode with measured `fixedSizesMm`. Custom mode stores every
size except the last one; `deriveTrayLayout()` solves the last compartment
from the clear inside dimension after outer walls and dividers. Rows run from
front to back and columns from left to right. The limits are six rows, eight
columns, and 10 mm per compartment in either direction.

One derived layout supplies divider positions, scoop placement, patterned
surfaces, size summaries, validation, and the dimensioned top-down editor map.
The map clips compartments to the rounded cavity. The editor offers a 20-step
layout undo/redo history. Validation additionally requires an inscribed
10 × 10 mm floor square in each rounded corner cell, so a nominally wide
corner compartment cannot lose its useful floor to the corner curve.

## Stored designs and geometry

Design files are version 3 and the local workspace is version 4. Older tray
`rows` and `columns` counts migrate to even axis layouts; the legacy workspace
path also accepts numeric-string counts. Other products and printer settings
are retained during migration. Malformed new layout data is rejected before
normalization can silently replace it.

The drawer tray geometry version is 4. Signatures and STL filenames therefore
change, and an older design file receives the existing changed-geometry
warning. The fit-test coupon still verifies only the outside footprint; it
does not verify divider spacing, scoop access, or corner-cell print quality.

## Verification and remaining work

[CI run 36275823685](https://github.com/joseph-robert-f/doma-forge/actions/runs/36275823685)
passed lint, typecheck, unit and integration tests, production build,
real-browser QA, origin metadata validation, and preview deployment with zero
annotations. The CI follow-up pinned Ubuntu 24.04, updated the Playwright
cache action, and made the metadata check read the built Worker's configured
origin rather than an unrelated repository variable.

The [post-merge main run 36278732720](https://github.com/joseph-robert-f/doma-forge/actions/runs/36278732720)
also passed the production-origin check and production deployment.

Record 20 in `sprints/PRINT_RECORDS.md` prepares a small unequal tray with
both measured column widths and row depths. Fill it from a physical print;
automated mesh and browser checks cannot establish printed dimensional fit.
