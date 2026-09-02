# Testing and QA

## Verification philosophy

DrawerForge produces a physical artifact from browser input, so verification has four distinct layers:

1. **Parameter correctness** — formulas, normalization, validation, and preset behavior.
2. **Mesh correctness** — manifold topology, orientation, bounds, and numeric safety.
3. **Application correctness** — UI state, persistence, stale-preview prevention, and browser download.
4. **Manufacturing correctness** — slicer acceptance, printer-specific dimensional result, strength, and fit.

Passing an earlier layer does not imply the later layer. In particular, a watertight STL that slices successfully can still print undersized, oversized, warped, or mechanically weak on a particular machine/material.

## Standard command set

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run test:unit
npm run test:integration
npm run build
npm run test:ssr
```

Node.js 22.13 or newer is required.

## Automated test inventory

### `tests/parameters.test.ts` — 10 cases

- Numeric-string coercion and canonical defaults
- 0.001 mm rounding behavior
- Row/column integer rounding
- Derived outside and cell dimensions
- Non-positive/out-of-range drawer input
- Base consuming the available wall
- Radius beyond bounds
- Rows/columns producing undersized cells
- Exact 10 mm cell acceptance
- Just-under-10 mm rejection

### `tests/presets.test.ts` — 2 cases

- Required preset IDs and validity
- Isolated copies that cannot mutate the source preset

### `tests/geometry.test.ts` — 10 expanded cases

Representative 1×1, 1×3, 2×3 with scoop, and 4×4 organizers are checked for:

- Kernel status and positive volume
- Finite coordinates
- Nonzero triangle area
- Unit normals and positive signed volume
- One connected component
- Requested bounds and base at Z=0
- Exactly two oppositely directed faces per edge after coordinate quantization

Additional cases cover:

- Scoop preserves bounds and removes material
- Triangle count increases Draft → Standard → Fine
- Cutlery cross-section has one exterior and one hole per cell
- Extreme valid corner radius/wall combinations retain a continuous perimeter

### `tests/stl.test.ts` — 4 cases

- Exact preview-facet serialization and bounds match
- Independent Three.js `STLLoader` parse
- Deterministic locale-independent filename
- Rejection of malformed buffers, empty geometry, and indexed source geometry

### `tests/app.integration.test.tsx` — 11 cases

The Three.js viewer is mocked while the real parameter, Manifold, conversion, and STL code runs. Coverage includes:

- Slider/number synchronization
- Out-of-range and off-step input behavior
- Stable viewer component across updates
- Stale preview disables export
- Invalid controls preserve the last valid model
- Preset selection and Custom transition
- Nonempty binary download and filename
- Export remains blocked until regeneration completes
- Reset to defaults
- Save and restore latest valid local design

### `tests/rendered-html.test.mjs` — 2 Node tests

- Production Worker renders the complete product shell and metadata
- Disposable starter/backend scaffolding is absent and Sites metadata is packaged

### Intended count

The current source defines 37 Vitest cases after parameterized expansion plus 2 production SSR/build tests.

## What automated tests do not prove

- Real WebGL startup, model appearance, orbit/pan/zoom, fit/reset, shadows, resize, or GPU cleanup
- Browser WASM asset delivery in a hosted environment
- Touch interaction, browser zoom, mobile software keyboard, or landscape phone layout
- Actual downloaded-file behavior in Safari/Chrome/Firefox
- Screen-reader announcements, contrast, and keyboard-only end-to-end flow
- Runtime self-intersection detection independent of the Manifold kernel
- Performance/memory at 600 × 600 mm, 6 × 8, Fine quality
- Physical dimensional accuracy, material shrinkage, warping, surface quality, or drawer fit

## Snapshot verification record

| Evidence | Status at handoff |
|---|---|
| Repository state | Clean `main` at `785ea4e` before documentation files |
| Source/test audit | Completed; tests and assertions reviewed directly |
| Fresh domain/geometry/STL unit run | Passed: 4 files, 26 tests, 755 ms test duration using one Vitest thread worker |
| Fresh jsdom integration run | Could not execute assertions: Vitest timed out starting its thread worker after 60 seconds |
| Fresh typecheck/build/lint run | Attempts stalled in this shared environment after their startup banners and were interrupted; no diagnostic or application assertion failure was emitted |
| Generated STL parsed/sliced externally | User reported successful import and slicing in Bambu Studio |
| Physical printed part | Pending |
| Durable browser screenshots/Playwright report | Not present in repository |

The next agent should run the full command set in a clean process before editing and again after the change. The 26 passing unit cases are valid evidence; do not interpret the remaining packaging-environment timeouts as either passes or application failures.

## Hosted browser QA checklist

Run at desktop (approximately 1440 × 1000), compact desktop/tablet (around 900 × 900), and mobile (390 × 844 or smaller).

### Load and environment

- Page returns 200 and correct title/metadata.
- No browser console errors or unhandled promise rejections.
- `manifold.wasm` returns successfully with the expected content type/size.
- First preview reaches Ready without a layout shift that hides controls.
- Reload restores the most recent valid design.

### Controls and state

- Every slider and number field stays synchronized.
- Off-step numeric input remains exact; slider input later snaps.
- Out-of-range input remains visible and reports a useful inline message.
- Named presets load expected dimensions; manual edit selects Custom.
- Invalid layout preserves the last model and displays Paused.
- Reset restores defaults and a new valid model.
- Rapid edits cannot cause an older model to replace the latest state.

### Viewer

- Drag orbits, wheel/pinch zooms, and right-drag/touch pans where supported.
- Fit model frames the part without clipping.
- Reset view returns the canonical view.
- Resize/orientation changes update aspect and framing.
- Scrolling the viewer offscreen and back does not lose the model or create errors.
- Repeated changes do not visibly grow canvas count or degrade interaction.

### Export

- Download is disabled while invalid, stale, loading, updating, or errored.
- Valid download produces one nonempty `.stl` file with deterministic naming.
- Inspect the downloaded buffer or import it into Bambu Studio/PrusaSlicer/OrcaSlicer as millimeters.
- Slicer dimensions equal the UI's outside dimensions within float tolerance.
- Preview and export show the same scoop/grid/radius/quality.

### Responsive/accessibility

- Mobile preview appears before controls; no horizontal overflow at 320 px.
- Header and sticky export do not obscure content.
- Keyboard reaches every form control and action in a sensible order.
- Focus indicator is clearly visible.
- Error messages and status changes are announced with appropriate alert/status behavior.
- At 200% browser zoom, controls remain usable and primary actions remain reachable.
- Reduced-motion mode removes noticeable transitions.

## Print validation protocol

Use the first physical print to establish evidence before changing defaults.

### Record

```text
Printer:
Slicer and version:
Material and brand:
Nozzle diameter:
Layer height:
Line width / wall count:
Infill:
Bed surface and adhesion method:
Model quality setting:
Target outside X × Y × Z:
Measured outside X × Y × Z:
Target wall/base/divider thickness:
Measured wall/base/divider thickness:
Drawer clear dimensions:
Selected per-side clearance:
Observed drawer fit:
Warping/elephant-foot notes:
Scoop usability:
Divider rigidity:
Print time and material mass:
Photos attached:
```

Measure in several places with calipers after the part cools. Separate consistent XY scale error from localized first-layer/warping effects.

### Interpret cautiously

- A consistent X/Y error may justify a printer profile correction.
- A bottom-only oversize is more likely first-layer/elephant-foot behavior than global model scale.
- Material shrinkage should not be embedded into the portable design parameters without an explicit profile.
- One printer/material combination is not enough evidence to change global defaults for everyone.

## Recommended test additions before substantial expansion

1. Playwright production-build tests with real WebGL and actual download capture.
2. Automated console/network failure assertions and WASM reachability.
3. Axe/contrast audit and a keyboard-only smoke path.
4. Seeded property tests across valid parameter combinations and boundary cases.
5. Max-complexity timing and heap budget.
6. Corrupt, quota-blocked, and unavailable storage behavior.
7. Geometry-error UI path by injecting controlled generator failures.
8. Project-file import/export round trips and backward compatibility.
9. Fit-test mesh topology/STL inspection.
10. Slicer/physical calibration fixtures documented as repeatable release evidence.
