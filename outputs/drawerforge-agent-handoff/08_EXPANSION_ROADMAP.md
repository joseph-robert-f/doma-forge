# Expansion roadmap

## Guiding strategy

Expand in this order:

1. Protect designs and establish repeatable physical accuracy.
2. Make deployment and browser verification reproducible.
3. Improve local workflow and project management without a backend.
4. Add geometry one print-safe feature at a time.
5. Add cloud features only when multi-device/sharing demand is proven.

This sequencing prevents a large catalog of shapes from accumulating on top of uncertain printer compensation, fragile persistence, or main-thread performance.

## Phase A — Design portability and hosting safety

### Deliverables

- Versioned `.drawerforge.json` import/export
- Non-destructive import validation and clear errors
- Design name used in project export and improved STL identity
- Legacy localStorage migration into a versioned local workspace envelope
- Direct Cloudflare migration described in `07_OPERATIONS_AND_MIGRATION.md`

### Acceptance

- Export → clear storage → import reproduces the same parameter signature and STL bounds.
- Unknown format/version fails without changing current state.
- A file exported on Sites imports successfully on the new Worker origin.
- Existing valid `drawerforge-design-v1` data restores after the local schema update.

## Phase B — Print reliability

### Printer profile

Keep machine behavior separate from portable design intent:

```ts
interface PrinterProfileV1 {
  version: 1;
  name: string;
  bedWidth: number;
  bedDepth: number;
  bedHeight: number;
  nozzleDiameter: number;
  xCorrection: number;
  yCorrection: number;
}
```

Profiles remain local initially. Make compensation visible:

```text
modeledWidth  = targetOutsideWidth  + xCorrection
modeledDepth  = targetOutsideDepth  + yCorrection
```

Never overwrite the user's drawer measurement or nominal clearance with hidden calibration.

### Calibration workflow

- Ask for expected and measured X/Y dimensions.
- Propose `existing correction + expected - measured`.
- Require explicit user application.
- Retain raw observations for review but do not put machine-specific compensation into portable design files.

### Fit-test STL

Generate a low-material perimeter test:

- 5 mm high
- Same compensated outside X/Y and corner radius
- At least 2 mm wall
- No base, regular dividers, or scoop
- Minimal sacrificial cross-bracing if needed to preserve shape during handling
- Deterministic name: `drawerforge-fit-test-<width>x<depth>.stl`

The fit test needs its own manifold, bounds, STL, and slicer regression cases.

### Warnings

- Warn if the model exceeds the configured build volume in both flat 90° orientations.
- Warn when walls/dividers are thinner than twice the configured nozzle diameter.
- Keep warnings non-blocking unless a combination is geometrically invalid.
- Explicitly state that the slicer remains authoritative.

## Phase C — Repeatable quality and performance

- Add Playwright desktop/mobile tests with real WebGL and file downloads.
- Parse downloaded STL inside the browser test and compare UI dimensions.
- Add automated accessibility/contrast checks.
- Add a max-complexity performance budget and user-visible timing instrumentation.
- Add seeded property tests across the valid parameter space.
- Move Manifold generation to a Web Worker when profiling shows interaction stalls or before major Boolean expansion.
- Transfer typed arrays rather than cloning large mesh data.
- Use request IDs/cancellation semantics equivalent to the current stale-result guard.

## Phase D — Local workflow improvements

These features can remain browser-only:

| Feature | Value | Architecture note |
|---|---|---|
| Named project library | High | Use IndexedDB; keep versioned records and recent/duplicate/delete flows |
| Import/export history | High | Store explicit snapshots, not mutable references |
| Undo/redo | High before advanced editing | Command or immutable-state history; exclude transient generation state |
| User presets | Medium | Treat as versioned parameter snapshots |
| Inches display | Medium | Keep canonical storage/geometry in millimeters; convert only at UI boundary |
| PWA/offline | Medium | Cache WASM/assets carefully and surface version/update state |
| Duplicate/compare designs | Medium | Use parameter signatures plus human-readable names |
| Print notes/photos | Medium | Local attachments may be large; use IndexedDB and export policy |

## Phase E — Geometry expansion

Recommended order balances value and modeling risk:

1. **Adjustable scoop** — width/radius/placement with safe wall/base constraints.
2. **Labels or label pockets** — prefer simple embossed/debossed text or replaceable label slots; test overhangs and font geometry.
3. **Nonuniform row/column ratios** — introduce a versioned layout schema whose fractions sum deterministically; keep an even-grid migration.
4. **Stacking lip/anti-slide feet** — print-orientation and drawer-clearance implications must be explicit.
5. **Magnet or anti-slip pockets** — enforce floor thickness and avoid accidental through-holes.
6. **Corner/bottom fillets** — expect higher Boolean/tessellation cost and test usable compartment dimensions.
7. **Oversized tray splitting** — last among early features because it creates joint tolerances, multiple parts, per-part naming, assembly guidance, bed arrangement, and likely 3MF/ZIP packaging.

For each feature:

- Add explicit parameters and schema versioning.
- Update signature, persistence, derived values, validation, project format, and identity.
- Add representative/min/max/conflict geometry cases.
- Prove one connected/expected component count, closed edges, bounds, volume, and STL round-trip.
- Slice representative artifacts and print at least one risk-focused coupon.
- Review support, overhang, first-layer, and wall-line assumptions.

## Phase F — Richer export

Retain STL for compatibility, then consider 3MF when the app needs:

- Explicit millimeter units
- Multiple split parts in one package
- Part names and transforms
- Project metadata
- Per-part colors/material hints

STEP or parametric CAD export would require a different representation and should not be promised from the current triangle/CSG pipeline without a dedicated feasibility study.

## Phase G — Optional cloud product

Only introduce a backend when confirmed user needs justify it:

- Accounts and multi-device sync
- Shareable immutable design links
- Collaborative editing
- Public/community template library
- Paid features or team controls
- Server-side rendering/generation for low-power devices
- Managed print jobs or printer-service integrations

If this phase begins, define privacy, retention, ownership, abuse, cost, and migration requirements before selecting storage/auth vendors. Drawer dimensions and project names should remain private by default.

## Ideas deliberately deferred

- Freehand arbitrary divider drawing before undo/redo and a layout schema
- Slicer settings that duplicate the user's established slicer
- Kubernetes, VPS, or always-on application servers for the current browser-only product
- Automatic printer correction based on a single print
- Silent changes to the 0.5 mm default clearance
- Geometry optimization that makes export differ from the preview without a clear mode and comparison

