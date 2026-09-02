# Design decision log

These records describe choices already embodied in the code or explicitly selected for the next phase. “Selected next” decisions are not yet implemented.

## D-001 — Browser-only product architecture

**Status:** Implemented

**Decision:** Run model construction, preview, persistence, inspection, and STL export in the browser. Do not require a backend, authentication, database, or cloud service.

**Why:** The product handles no shared data and modern browsers can run a robust WASM geometry kernel. This keeps the tool private, immediate, and inexpensive to operate.

**Consequences:** Designs are device/origin-local, heavy computation uses client resources, and server features cannot be assumed.

**Revisit when:** Accounts, sharing, collaboration, server rendering of models, or durable multi-device projects become requirements.

## D-002 — Manifold solid kernel instead of hand-authored mesh topology

**Status:** Implemented

**Decision:** Use `manifold-3d` WASM for Boolean solid construction and copy its output into Three.js.

**Why:** Watertightness and robust Boolean topology are core safety requirements. A kernel is safer than directly stitching triangles for rounded shells, dividers, and subtractive features.

**Consequences:** WASM delivery/setup and manual object deletion matter; complex jobs can block the main thread; kernel semantics are a dependency contract.

**Revisit when:** Required features exceed the kernel's capabilities or a server/CAD-native format becomes necessary.

## D-003 — One canonical normalized parameter model

**Status:** Implemented

**Decision:** Presets, restored storage, manual controls, generation, preview identity, and export all converge on `OrganizerParameters`.

**Why:** Prevents drift between display, solid construction, and file export.

**Consequences:** New physical features should be explicit parameters and participate in signatures, persistence versioning, validation, and filenames/project identity.

## D-004 — Exact visible geometry is the exported geometry

**Status:** Implemented

**Decision:** Serialize the currently displayed non-indexed `BufferGeometry`; do not generate a separate export mesh.

**Why:** Users should receive what they inspected. It also enables strong facet/bounds equality tests.

**Consequences:** Preview quality and export quality are currently the same. Any future lighter preview/heavier export mode must make the difference explicit and separately testable.

## D-005 — Preserve last valid preview on invalid edits

**Status:** Implemented

**Decision:** Invalid controls pause regeneration, retain the prior model, and disable download.

**Why:** Prevents a blank or unstable interface while still refusing invalid files.

**Consequences:** The UI must clearly mark the preview as stale. The parameter signature is part of the safety boundary.

## D-006 — Regular grid only for v1

**Status:** Implemented

**Decision:** Support evenly spaced rectangular rows and columns rather than arbitrary divider drawing.

**Why:** Enables a predictable parameter model, simple validation, robust topology, and accessible controls.

**Consequences:** Unequal compartments and object-specific layouts are out of scope. Adding them will require a new layout schema rather than overloading row/column counts.

## D-007 — Fixed Boolean overlap of 0.2 mm

**Status:** Implemented

**Decision:** Extend subtractive/union operands beyond adjacent faces to avoid coincident Boolean surfaces.

**Why:** Coplanar operations are numerically fragile.

**Consequences:** 0.2 mm is a hidden modeling tolerance. If coordinate scales or micro-features change materially, replace it with a documented scale-aware policy and new regression tests.

## D-008 — Fixed mesh quality tiers

**Status:** Implemented

**Decision:** Draft/Standard/Fine map to 12/24/48 segments for all curved features.

**Why:** Simple, understandable, and deterministic.

**Consequences:** Error varies with radius and Draft is visibly coarse for a 40 mm radius.

**Revisit when:** Export precision or file-size predictability becomes important; prefer target chord error.

## D-009 — Binary STL as the v1 interchange format

**Status:** Implemented

**Decision:** Export little-endian binary STL with recomputed normals and no server processing.

**Why:** Broad slicer compatibility, compact size, and straightforward validation.

**Consequences:** No reliable units, project semantics, part names, materials, or multi-part package. Consider 3MF for richer future exports while retaining STL.

## D-010 — Versioned latest-valid local persistence

**Status:** Implemented

**Decision:** Save one `{version: 1, parameters}` record only after successful generation.

**Why:** Avoid restoring broken designs and keep v1 simple.

**Consequences:** No projects/history and an origin migration strands data unless an import/export bridge ships first.

## D-011 — Long-lived imperative Three.js viewer

**Status:** Implemented

**Decision:** Mount one renderer/scene and swap model geometry rather than remounting the viewer on each edit.

**Why:** Preserves camera interaction, reduces GPU churn, and avoids leaks.

**Consequences:** Viewer lifecycle must remain explicitly managed and tested manually in a real browser.

## D-012 — Direct Cloudflare Workers as the first migration off Sites

**Status:** Selected next; not implemented

**Decision:** Retain the current vinext/Cloudflare Worker build initially, remove Sites packaging, add source-controlled Wrangler configuration, and deploy from GitHub through Cloudflare Builds.

**Why:** The current output is already a Worker plus static assets. This minimizes application risk while giving ownership of deployments, logs, previews, access, and future domain configuration.

**Consequences:** Cloudflare and experimental vinext coupling remain. A plain Vite SPA is a later portability option, not part of the first migration.

## D-013 — Public production and protected previews

**Status:** Selected next; not implemented

**Decision:** Expose the production `workers.dev` address publicly and protect non-production preview URLs with Cloudflare Access.

**Why:** The tool is intended for public use while unfinished branches should not be casually discoverable.

## D-014 — Wrangler first, Terraform later

**Status:** Selected next; not implemented

**Decision:** Keep Worker compatibility, routing, assets, and observability configuration in `wrangler.jsonc`; defer Terraform.

**Why:** One Worker with no custom domain or backend resources does not yet justify a second infrastructure tool.

**Revisit when:** A custom domain, Access policies, multiple environments, databases, queues, or organizational policy make a durable infrastructure graph valuable.

## D-015 — Print reliability before advanced shapes

**Status:** Selected next; not implemented

**Decision:** Prioritize project import/export, calibration, fit-test output, printer-aware warnings, and physical validation before labels, pockets, fillets, or arbitrary dividers.

**Why:** More geometry is not useful if modeled dimensions do not translate predictably to a real printer/drawer.

**Consequences:** Current geometry defaults remain unchanged until measured print evidence exists.

