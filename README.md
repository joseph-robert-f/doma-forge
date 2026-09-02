# DrawerForge

DrawerForge is a browser-only parametric generator for simple, 3D-printable drawer organizers. Enter a drawer’s clear inside dimensions, tune the tray construction and compartment grid, inspect the result in 3D, and download the exact visible mesh as a binary STL. No account, backend, or CAD installation is required.

## Local setup

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The development server prints the local URL, normally `http://localhost:3000`.

## Commands

```bash
npm run dev              # live Vite/vinext development server
npm run lint             # ESLint
npm run typecheck        # strict TypeScript check
npm test                 # unit, geometry, STL, and app integration tests
npm run build            # production/Cloudflare Worker build
npm run test:ssr         # production build plus server-render smoke test
```

## Parameters and validation

All dimensions are millimeters. Organizer width and depth are calculated as the drawer interior dimension minus the selected clearance on both sides. Internal compartment dimensions account for the two perimeter walls and every divider. Rows and columns are evenly spaced.

DrawerForge rejects non-finite or out-of-range values, a base that leaves too little wall, a corner radius larger than the tray, and layouts with compartments under 10 mm. Invalid edits never replace the last valid preview and always disable STL download. The latest valid normalized design is stored locally in the browser and can be reset to practical defaults.

Draft, Standard, and Fine change curved-feature tessellation only. Standard is the recommended balance for editing and export.

## Design files

A design file holds one product's settings in millimeters. Use it to move a design between devices or to keep more than one design.

1. Enter a design name. The name is optional. It becomes the first part of each file name.
2. Select **Save design file**. The browser downloads `<name>-drawer-tray-<hash>.drawerforge.json`.
3. On any device, select **Open design file** and choose the file. The design replaces the current settings only after every check passes.

A file with an unknown format, an unsupported version, a missing parameter, or an out-of-range value is refused with a message. The current design does not change. A file saved by a different app version loads with a warning that the mesh may differ.

The design file never holds printer data. Printer corrections belong to a local printer profile.

## Fit test

Select **Download fit test** to get a small, fast print that proves the drawer fit before the full tray prints. The fit-test coupon is a 5 mm high ring with the tray's outside profile. It has no base, no dividers, and no scoop.

Print this ring first. It uses little material and shows whether the tray fits the drawer. The ring wall is never thinner than 2 mm, even if the tray wall is set thinner. A thin wall is weak.

The **Download fit test** button follows the same rules as **Download STL**. It stays disabled until the current settings pass validation and the preview finishes. The file name is `drawerforge-fit-test-<width>x<depth>-<hash>.stl`. The design name, when set, becomes the first part of the file name, the same way it does for the STL download.

## Bit, socket, and driver tray

The second product is a flat tray with a bore for every socket, bit, or driver. Open it from the product switcher or at `/products/socket-tray`.

Set the outside size, the number of rows, the bores per row, and the bore depth. Each row has its own bore diameter. Row 1 is at the front. Measure the widest item in a row with a caliper and add your own clearance; the app does not add one. The rows and the bores are spaced evenly, with the same web between neighbours as between a bore and the rim.

The app rejects a layout that leaves less than 2.5 mm between two bores or between two rows, and it names the row and the fix. The bore depth cannot exceed the tray height minus the base, so the base under the bores is always the base you set. A chamfered bore mouth adds a 0.8 mm lead-in. Underside pockets remove material below the base; each pocket ceiling bridges at most 40 mm, so the tray prints flat without supports.

The presets are typical outside diameters for quarter-inch and half-inch drive sockets and for quarter-inch hex bits. They are starting points, not a brand's sizes.

Print notes for the socket tray: print it flat, bores up, with no supports. Use three perimeters and a stiff filament. A slice above the base shows one outer contour and one hole per bore, and the tests check that. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Printer profile and calibration

A printer profile holds what one machine needs: the bed size, the nozzle diameter, and the X and Y correction. The profile stays in this browser. It is not part of a design file, and it is not sent anywhere.

Select **Printer** to open the section. The defaults are a bed of 220 × 220 × 250 mm and a nozzle of 0.4 mm. Both corrections start at 0 mm.

### What a correction does

A correction is the millimeters that this printer prints small in one axis. The app adds the correction to the modeled part before it builds the mesh. It adds the X correction to the outside width and the Y correction to the outside depth. It changes no other value.

The app shows one line for each corrected axis:

```
X · Modeled 299.5 mm = target 299 mm + 0.5 mm correction
```

The correction changes the mesh, the preview, the STL, and the fit-test coupon. It does not change your target, the calculated results, the design file, or the design that this browser saves. The same design therefore prints to the same size on a different machine after that machine's own correction.

A file name keeps the design hash and gets a marker for the correction, for example `drawerforge-drawer-tray-299x199x50-2x3-08d29d-cx0p5.stl`. Two prints of one design under different corrections get different file names.

### How to calibrate

1. Set the correction to 0 mm in X and in Y for a first calibration.
2. Select **Download fit test** and print the coupon.
3. Measure the outside width and the outside depth of the print. Use a caliper.
4. Open the **Printer** section. Read the expected width and depth.
5. Enter the two measurements.
6. Read the proposal. It shows `existing + expected − measured` for each axis.
7. Select **Apply correction**. The proposal replaces the correction. It does not add to it.
8. Print the coupon again and measure it again to confirm the result.

Apply clears the two measurements. A second Apply of the same measurement is therefore not possible, and the correction cannot double.

### Warnings and errors

The app shows a **warning** when the part is larger than the bed in X, Y, or Z. A part equal to the bed gives no warning. A warning never stops a download: you can split the part or use another machine.

The bed warning starts only after you save a printer profile. Open the **Printer** section and enter your bed size once. Until then the bed values are placeholders, and the app shows the line "Enter your bed size to get build-volume warnings." instead of a warning about a bed you did not enter.

The app shows an **error** when a wall is thinner than two nozzle widths. A wall that thin is weak, so DrawerForge does not print it. The error names the nozzle and the wall, and it keeps **Download STL** and **Download fit test** disabled until you set a larger wall or a smaller nozzle.

The app also shows an error when a correction takes a value past its limit. The example is a drawer width of 600 mm with a 0.5 mm correction. The field still shows 600 mm, which is legal, so the message names the correction: "The X correction takes the drawer width past its limit." Lower the correction, or lower the value.

## Code layout

- `lib/kernel/` — shared geometry code: the Manifold loader, profile builders (`profiles.ts`), the shell pattern (`shell.ts`), cutter arrays and the pitch solver (`arrays.ts`), underside lightening (`lightening.ts`), and the mesh copy.
- `lib/products/types.ts` — the `ProductDefinition` contract every product satisfies.
- `lib/products/shared.ts` — normalization, range validation, signature, slug, and hash helpers.
- `lib/products/drawer-tray/` — the drawer organizer: schema, validation, geometry, presets.
- `lib/products/socket-tray/` — the bit, socket, and driver tray: schema, the layout solver, validation, geometry, presets.
- `lib/products/registry.ts` — the ordered list of products the app can build.
- `lib/generation/` — the Web Worker that runs `product.generate()` off the main thread, its message protocol, and the page-side client.
- `lib/design-file.ts` — the portable `.drawerforge.json` format, export, and non-destructive import.
- `lib/printer-profile.ts` — the local printer profile, the pure `compensate()` step, the compensation and calibration text, the build-volume warning, and the thin-wall error.
- `lib/workspace.ts` — the versioned local storage envelope with one current design per product, and the version 1 migration.
- `app/components/ProductApp.tsx` — renders any product from the registry.
- `app/components/ParameterControls.tsx` — number, boolean, and enum controls driven by specs.
- `app/components/ModelViewer.tsx` — the Three.js preview.

To add a product, create a folder under `lib/products/`, export a `ProductDefinition`, and add it to the registry. `tests/products.test.ts` checks every registered product.

## Geometry and export

The drawer tray is constructed as one solid with a rounded outer profile. A manifold-guaranteeing WebAssembly geometry kernel, running in a dedicated Web Worker so the page stays responsive, subtracts one exact inward-offset cavity, clips and unions the row/column dividers into that shell, and then cuts the optional front finger scoop. This keeps the rounded perimeter continuous even at large corner radii. The result is copied once into a Three.js triangle mesh; that same in-memory mesh drives both the preview and the custom binary STL serializer.

Automated geometry checks cover representative 1×1, 1×3, 2×3, and 4×4 organizers. They verify requested bounds, finite coordinates, positive signed volume, non-degenerate triangles, outward winding, and exactly two oppositely directed faces per mesh edge. Cross-section and point-in-solid regressions also prove that extreme valid radii and the Hand tools preset retain a continuous perimeter around every compartment. Export tests independently parse the binary STL and compare its bounds to the preview mesh.

The socket tray starts as a rounded slab. One batched union of every bore cutter is subtracted in one Boolean, then the underside pockets. Its tests slice the mesh above the base and count one outer contour and one hole per bore, and slice through the pockets and count the pocket grid.

STL has no embedded unit metadata. DrawerForge models coordinates as millimeters, so import downloads into a millimeter-based slicer without scaling.

## v1 limitations

- Rectangular, evenly divided compartment grids only
- One organizer per design; no automatic multi-piece splitting
- No arbitrary divider drawing, slicer settings, or multi-model projects
- The last valid design persists in the current browser’s local storage; use a design file to move it
- The front finger scoop has an automatically constrained size and position

## Engineering handoff

The repository includes a self-contained engineering handoff for agents and
contributors in [`outputs/drawerforge-agent-handoff/`](outputs/drawerforge-agent-handoff/README.md).
It covers product requirements, architecture diagrams, geometry and STL
contracts, UX decisions, tests, deployment migration, and the recommended
expansion roadmap. A portable ZIP is also available at
[`outputs/drawerforge-agent-handoff-2026-09-01.zip`](outputs/drawerforge-agent-handoff-2026-09-01.zip).
