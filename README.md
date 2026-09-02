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

## Code layout

- `lib/kernel/` — shared geometry code: the Manifold loader, profile builders, and mesh copy.
- `lib/products/types.ts` — the `ProductDefinition` contract every product satisfies.
- `lib/products/shared.ts` — normalization, range validation, signature, slug, and hash helpers.
- `lib/products/drawer-tray/` — the drawer organizer: schema, validation, geometry, presets.
- `lib/products/registry.ts` — the ordered list of products the app can build.
- `app/components/ProductApp.tsx` — renders any product from the registry.
- `app/components/ParameterControls.tsx` — number, boolean, and enum controls driven by specs.
- `app/components/ModelViewer.tsx` — the Three.js preview.

To add a product, create a folder under `lib/products/`, export a `ProductDefinition`, and add it to the registry. `tests/products.test.ts` checks every registered product.

## Geometry and export

The tray is constructed as one solid with a rounded outer profile. A manifold-guaranteeing WebAssembly geometry kernel subtracts one exact inward-offset cavity, clips and unions the row/column dividers into that shell, and then cuts the optional front finger scoop. This keeps the rounded perimeter continuous even at large corner radii. The result is copied once into a Three.js triangle mesh; that same in-memory mesh drives both the preview and the custom binary STL serializer.

Automated geometry checks cover representative 1×1, 1×3, 2×3, and 4×4 organizers. They verify requested bounds, finite coordinates, positive signed volume, non-degenerate triangles, outward winding, and exactly two oppositely directed faces per mesh edge. Cross-section and point-in-solid regressions also prove that extreme valid radii and the Hand tools preset retain a continuous perimeter around every compartment. Export tests independently parse the binary STL and compare its bounds to the preview mesh.

STL has no embedded unit metadata. DrawerForge models coordinates as millimeters, so import downloads into a millimeter-based slicer without scaling.

## v1 limitations

- Rectangular, evenly divided compartment grids only
- One organizer per design; no automatic multi-piece splitting
- No arbitrary divider drawing, slicer settings, or multi-model projects
- Designs persist only in the current browser’s local storage
- The front finger scoop has an automatically constrained size and position

## Engineering handoff

The repository includes a self-contained engineering handoff for agents and
contributors in [`outputs/drawerforge-agent-handoff/`](outputs/drawerforge-agent-handoff/README.md).
It covers product requirements, architecture diagrams, geometry and STL
contracts, UX decisions, tests, deployment migration, and the recommended
expansion roadmap. A portable ZIP is also available at
[`outputs/drawerforge-agent-handoff-2026-09-01.zip`](outputs/drawerforge-agent-handoff-2026-09-01.zip).
