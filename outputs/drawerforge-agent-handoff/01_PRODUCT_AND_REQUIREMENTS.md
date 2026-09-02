# Product and requirements specification

## Product definition

DrawerForge is a browser-based parametric CAD-lite tool for ordinary people who need a simple drawer organizer but do not want to learn or install CAD software. A user measures a drawer, configures a rectangular compartment grid, inspects the resulting solid, and downloads a slicer-ready STL.

The application is intentionally narrower than a general modeling tool. Its value comes from a guided workflow, safe constraints, and a strong correspondence between the measurements entered, the preview shown, and the file downloaded.

## Target users and jobs

### Primary user

A home, workshop, office, or hobbyist 3D-printer owner who can measure a drawer and operate a slicer but is not necessarily comfortable with CAD.

### Core job

> Given the clear interior dimensions of my drawer, help me produce one printable organizer with practical walls and evenly divided compartments, and let me confirm what I am about to download.

### Secondary jobs

- Start from a familiar use-case preset rather than a blank configuration.
- Iterate on fit and layout without remounting or losing the 3D view.
- Recover the last valid design on the same device.
- Understand why an input is invalid and retain a useful preview while correcting it.

## Current functional specification

### Inputs

All length inputs are expressed in millimeters.

- Drawer interior width and depth
- Fit clearance per side
- Organizer height
- Outer wall thickness
- Base thickness
- Divider thickness
- Outer corner radius
- Compartment rows and columns
- Mesh quality: Draft, Standard, Fine
- Optional front finger scoop

Every numeric input has a synchronized range control and numeric field. Manual changes switch the preset selection to Custom.

### Derived output

The interface displays:

- Outside organizer width, depth, and height
- Approximate nominal compartment width and depth
- Preview generation state
- Whether the design passes validation
- An STL download action when the current preview matches the current normalized parameters

### Presets

| Preset | Key differences from defaults |
|---|---|
| Cutlery | 360 × 260 mm drawer, 55 mm height, 10 mm radius, 2 × 4 grid, 2.2 mm dividers |
| Desk Supplies | 320 × 220 mm drawer, 45 mm height, 2 × 3 grid |
| Hardware | Default drawer size, 38 mm height, 4 × 4 grid, no scoop |
| Custom | Current manually edited parameters; selecting it does not overwrite values |

### Persistence

- Only the latest valid normalized design is saved.
- Storage key: `drawerforge-design-v1`.
- Envelope: `{ version: 1, parameters }`.
- Storage is local to the current browser and origin.
- Corrupt or incompatible stored data is removed or ignored.
- Reset restores the practical default parameter object.

### Export

- Export is binary STL only.
- The export is produced from the exact non-indexed Three.js geometry used by the current preview.
- The app verifies facet count, finite coordinates, triangle area, normal alignment, and bounds before triggering download.
- The deterministic filename contains outside width, outside depth, height, rows, and columns.
- STL is unitless; DrawerForge coordinates are intended to be interpreted as millimeters.

## Validation behavior

The application rejects:

- Non-numeric, non-finite, or out-of-range numeric values
- Non-integer row/column values after normalization is bypassed
- Clearance that leaves no positive outside width or depth
- A base that leaves less than 4 mm of wall above it
- A corner radius greater than half the shorter outside dimension
- A grid whose walls/dividers consume the available interior
- Nominal compartments narrower or shallower than 10 mm

When input becomes invalid:

- Inline errors appear on affected controls.
- The validation summary becomes an alert.
- Generation pauses after the state update.
- The last valid model remains visible.
- Download is disabled and its help text explains why.

## Requirements traceability

| Original requirement | Current status | Evidence |
|---|---|---|
| Browser-only generation, no backend/auth/database | Implemented | Geometry, persistence, and export are client-side; no app API or database module exists |
| React, TypeScript, Three.js, robust solid kernel | Implemented | React/Next/vinext, TypeScript, Three.js, `manifold-3d` WASM |
| Workshop-inspired responsive split layout | Implemented | `app/globals.css`, desktop split and mobile stacked layout |
| Slider plus numeric field for each dimensional parameter | Implemented | `NumericParameterControl` and integration tests |
| Millimeters throughout | Implemented | Labels, calculations, STL notice, coordinate conventions |
| Short-debounce preview regeneration | Implemented | 140 ms delay after valid signature change |
| Presets and Custom | Implemented | Three named presets plus custom state |
| Save latest valid design and reset | Implemented | Versioned localStorage envelope and reset action |
| Rounded tray, solid base, walls, regular compartments | Implemented | Manifold boolean construction |
| Optional safe front scoop | Implemented | Automatically bounded cylinder subtraction |
| Concise inline validation, retain last valid preview | Implemented | Field errors, summary, paused state, stale-export guard |
| Orbit, zoom, pan, grid, lighting, view controls | Implemented | `DrawerViewer` |
| Dispose replaced geometry/materials | Implemented for normal viewer lifecycle | Viewer swaps and scene cleanup dispose Three.js resources |
| Exact visible mesh exported as binary STL | Implemented | Same `BufferGeometry` object feeds preview/export |
| Deterministic filename | Implemented | `deterministicStlFilename` |
| Unit, geometry, STL, integration tests | Implemented | Six test files plus SSR smoke test |
| Real desktop/mobile browser QA | Previously performed during build; repeat for changes | No durable screenshot evidence is stored in the repository |
| Validity in a production slicer | User-reported pass | User imported and sliced an STL in Bambu Studio |
| Physical print validation | Pending | User plans to print and report photos/results |
| README and known limitations | Implemented | Repository `README.md` |

## Current scope boundaries

The following are not defects in v1; they were deliberately excluded:

- Unequal or freely drawn compartments
- Multiple organizers in one project
- Automatic split-to-bed logic or joints
- Printer, material, nozzle, layer, or slicer profiles
- Labels, magnet pockets, fasteners, stacking features, lids, or inserts
- Accounts, sharing, cloud storage, collaboration, or billing
- Server-side model generation
- 3MF, STEP, OBJ, or CAD-source export
- Guaranteed physical fit across printers and materials

## Success criteria for future work

An expansion is successful only when it:

1. Preserves or explicitly versions the current design semantics.
2. Provides deterministic, reviewable parameters rather than hidden geometry mutations.
3. Maintains the preview/export equivalence and stale-download guard.
4. Adds geometry regression tests for both nominal and edge cases.
5. Has a clear print assumption and, where appropriate, a test coupon or calibration procedure.
6. Remains usable on mobile and with keyboard navigation.
7. Does not require a backend unless the feature inherently needs shared/server state.

