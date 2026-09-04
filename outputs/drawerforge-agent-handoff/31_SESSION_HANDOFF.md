# 31. Session Handoff

Date: 2026-09-04
Status: Current. This document replaces `09_NEXT_AGENT_BRIEF.md`, which
describes the repository before the sprint program.
Reads with: `README.md`, `15_SPRINT_PLAN.md`, `10_MULTI_PRODUCT_EXPANSION_PLAN.md`

This document gives a new team the state of DrawerForge at the end of
sprint S15. It gives the background, the decisions that constrain new
work, the logic behind those decisions, the open issues, and the
priorities. Read it first. Then read the source. The source is the
truth; this document tells you where to look.

---

## 1. What the product is

DrawerForge makes printable organizers in a web browser. A person sets
parameters, sees the part, and downloads an STL file. The application
does all of this in the browser.

Facts that shape every decision:

- There is no backend, no database, no account, and no secret.
- The geometry kernel is `manifold-3d`, compiled to WASM. It runs in a
  dedicated Web Worker.
- The viewer is Three.js. It shows a flat-normal copy of the kernel mesh.
- The STL file is written from that same mesh. What a person sees is what
  a person prints.
- The application is a Next/vinext application. It deploys directly to
  Cloudflare Workers at `https://drawerforge.joseph-r-fehr.workers.dev`.
- The catalog holds fifteen products. Each product is a parametric solid
  with its own rules.

The catalog is built from four families. A family shares one kernel
module, so a new product inside a family is small work and a new family
is large work. `10_MULTI_PRODUCT_EXPANSION_PLAN.md` section 2.2 holds the
full table.

| Family | Shared module | Products |
|---|---|---|
| A. Shelled trays and bins | Rounded-rectangle shell, cavity, dividers | Drawer tray, parts bin, remote caddy, drawer riser, entryway valet |
| B. Comb and bore arrays | Slab with a cutter array | Socket tray, marker cup block, battery organizer, tool fin rack |
| C. Brackets and wall mounts | Back plate, screw bores, gussets | Wall hook rail, headphone mount, shelf riser |
| D. Revolved forms | Profile, revolve, offset shell | Plant pot, plant saucer, card holder |

---

## 2. Where the work stands

Sprints S01 to S15 are complete. Each sprint has a spec in `sprints/` and
a notes document in this package. Documents 16 to 30 are the sprint
notes, in order.

Sprint S12, the physical print program, is open. It waits for a person.
Section 9 gives the detail.

The verification state at the end of S15:

| Check | Result |
|---|---|
| Unit, geometry, STL, and application tests | 1002 in 32 files |
| Real-browser tests | 11 of 11 |
| Server-render tests | 5 |
| Deploy configuration tests | 2 |
| Golden records | 15, all unchanged since they were recorded |
| Page chunk | 598 830 bytes against a 665 600 byte budget |
| Worker chunk | 2 854 bytes against a 16 384 byte budget |
| Registry chunk | 139 209 bytes against a 180 224 byte budget |

Run the checks with `npm run lint`, `npx tsc --noEmit`, `npx vitest run`,
`npm run build`, `npm run test:ssr`, `npm run test:deploy-config`, and
`npm run test:browser`. The browser tests need a build first.

---

## 3. The architecture you must know

### 3.1 The product contract

`lib/products/types.ts` holds `ProductDefinition`. Every product supplies
the same members: the identity, the parameter specs, the defaults, the
presets, the copy, `normalize`, `validate`, `signature`, `filename`,
`boundsContract`, `generate`, and optional members for a fit-test coupon,
compensable parameters, and printed walls.

Two members carry rules that are easy to miss:

- `printedWalls(parameters)` reports the thin features that no parameter
  names. Examples are a solved web, a skin over a pocket, and a press-fit
  socket wall. The thin-wall rule reads this list.
- `validate(parameters, context?)` may read a print context. The context
  holds the bed size, or null when the profile is unsaved, and the nozzle
  diameter.

A change to this contract is the most expensive change in the codebase.
Fifteen products implement it. Plan such a change as its own sprint.

### 3.2 The kernel split

`lib/kernel/` holds two kinds of module:

- **Planners** are pure. They solve numbers. Examples are `pitch.ts`,
  `lightening-plan.ts`, `leg-plan.ts`, `bracket-rules.ts`,
  `vessel-profile.ts`, and `overlap.ts`. A product's schema, validation,
  and definition may import these.
- **Builders** make solids. Examples are `arrays.ts`, `lightening.ts`,
  `legs.ts`, `brackets.ts`, `revolve.ts`, `shell.ts`, `profiles.ts`, and
  `manifold.ts`. Only a product's `geometry.ts` and `coupon.ts` may
  import these.

The split keeps the kernel out of the page and out of the worker's fixed
chunk. A test in `tests/products.test.ts` walks the static import graph
from the registry, the generation protocol, the worker, and the routes.
It fails when a builder is reachable, and it fails when a relative import
cannot be resolved. Do not weaken that test.

### 3.3 Geometry loads on demand

`lib/products/geometry-registry.ts` holds a loader for each product's
geometry. `loadGeometry(id)` imports it, caches the promise, and forgets
a failed load so the next attempt retries. The generation worker holds
the loader table only. This is why the worker chunk is 2 854 bytes and
does not grow with the catalog.

### 3.4 The generation protocol

`lib/generation/` holds the request and the client. A request names the
product, the parameters, and a kind: `"model"` or `"coupon"`. The worker
builds both. The page never loads the kernel.

The client keeps the latest request only. An edit during a build cancels
the build. The page reports the cancellation in plain words.

### 3.5 The printer profile

`lib/printer-profile.ts` holds the profile, the compensation, the
calibration, and the thin-wall rule. A person saves a printer name, a bed
size, a nozzle diameter, and an X, Y, and Z correction.

Three rules use the profile:

1. **Compensation.** A product lists the parameters that a correction may
   move. An X or Y list takes that axis. A diameter list takes the mean
   of X and Y, because a round part has no axis.
2. **The thin-wall rule.** A printed wall below two nozzle widths is a
   validation error. Section 5 explains why this rule has no exception.
3. **The print context.** The bed and the nozzle reach `validate`.

---

## 4. Design decisions that constrain new work

The decision log in `05_DECISION_LOG.md` and each sprint's notes hold the
full record. These are the decisions that a new team must not break by
accident.

**The mesh a person sees is the mesh a person prints.** The viewer, the
bounds, and the STL file all come from one kernel solid. Do not build a
second mesh for display.

**A parameter set is either valid or it is not.** An invalid set keeps
the last valid preview and blocks the download. There is no partial
export.

**A safety rule has no consent path.** A person cannot agree to a thin
wall. The download stays blocked. The message names the fix.

**The bed is never a refusal on its own.** A part larger than the bed
gets a warning, not an error. Only a rule that a product already had may
read the bed and refuse. A person may own a printer that the profile does
not describe.

**A design file names the design, not the printer.** The file-name hash
covers the parameters and the geometry version. The correction is a
separate tag on the name. Two prints of one design under two corrections
never share a name.

**The geometry version protects saved work.** When equal parameters start
to build a different mesh, the product's geometry version increases. A
saved design file then shows a notice when it loads.

**Rule 13: no food, drink, kitchen, cutlery, or health copy.** This rule
covers labels, messages, presets, documents, and tests. Every product in
this catalog holds parts, tools, or a plant. Do not add a product or a
preset that breaks this rule, and do not describe an existing product in
words that break it.

---

## 5. The logic behind the rules

A new team works better when it knows why a rule exists. These are the
arguments, not the rules.

**Why a thin wall is an error and not a warning.** A wall below two
nozzle widths does not print. The slicer either drops it or makes a
single weak bead. The person then wastes filament and time on a part that
fails. A warning moves the cost to the person. An error moves the cost to
the parameter that caused it, where the fix is one number.

**Why the bed only warns.** The profile is a claim about a machine. The
claim can be wrong, stale, or unsaved. A person with a large printer must
never be blocked by a number that describes a different machine. A rule
that a product already had, such as the widest pot the app makes, may
read the bed to give a better number. It may not create a new refusal.

**Why the print record decides a dimensional question.** The application
holds a model of a printer. A print holds the truth. When a rule depends
on how plastic behaves, such as a press-fit clearance or a load limit, we
write the rule, prepare a record, and wait for the print. We do not tune
the number twice on a guess. This is why several defaults stay as they
are; section 9 lists them.

**Why the kernel is split.** A schema needs the numbers that a builder
solves. If the schema imports the builder, the whole kernel lands in the
page. Splitting the pure planner from the builder gives the schema its
numbers and keeps the page small.

**Why every sprint gets an independent review.** Two sprints, S09 and
S13, shipped without the primary review. S15 ran those reviews on the
merged code. They found thirteen defects, one of which stopped a product
from previewing across seven percent of its range. Range-corner sweeps
found the defects that the fixtures missed. The review is not a
formality. Budget for it.

---

## 6. How a sprint runs

`15_SPRINT_PLAN.md` section 1 holds the routing policy and the rules.
Follow them.

1. Each sprint has a spec in `sprints/`. Write the spec before the code.
   A spec must be complete enough for an agent that has only this package.
2. Route the work by the policy in document 15. Use the smallest capable
   tier. Reserve the strongest tier for a contract change, a new geometry
   family, and an architecture decision that later sprints build on.
3. An agent that finds it must change the product contract stops and
   reports. That change is its own sprint.
4. Every sprint gets an independent review before the pull request opens.
   Apply every finding, or record why not.
5. Each sprint adds one notes document, numbered in sequence. The document
   holds decisions, deviations, measurements, open issues, and follow-ups.
   Number the decisions in one series per sprint.
6. Each sprint is one squash commit and one pull request. A person merges.
7. Update the index after a document is added: `README.md`,
   `manifest.json`, and `CHECKSUMS.sha256`.
8. The merge gate is lint, typecheck, test, build, server render, and the
   browser suite, all green.

---

## 7. Current issues

These are live. They affect work that a new team starts today.

1. **The print program has no data.** No print record is filled in. Every
   record in `sprints/PRINT_RECORDS.md` holds target values only. Four
   rules wait for measurements: the bore correction, the press-fit
   clearance of the shelf riser joint, the load constant of the bracket
   family, and the parts bin recess skin.
2. **The parts bin is refused at a 0.6 mm nozzle** at its defaults and at
   two presets. The recess skin is 0.8 mm, which is exactly two widths of
   a 0.4 mm nozzle. Record 8 decides between a larger reserve and a
   thicker default wall. Do not change the default before that print.
3. **The page chunk is 598 830 bytes against a 665 600 byte budget.** It
   holds Three.js and the viewer. There is room for the catalog but not
   for a second viewer feature of that size.
4. **The registry chunk grows with the catalog.** Split it the way the
   geometry was split when the catalog passes twenty products.
5. **The bracket family's load numbers are a model.** The copy calls them
   approximate everywhere. Print record 15 is the first measurement.

---

## 8. Open issues carried from the sprint notes

Each entry names the document that holds the detail.

| Issue | Where |
|---|---|
| The WASM MIME type warning in local development | 12, open issue 1 |
| A duplicate WASM asset of about 529 KB in the server bundle | 12, open issue 5; 26, open issue 3 |
| The Cloudflare acceptance checklist is not signed off | 26, section 6 |
| The version 1 storage migration may be removed after that sign-off | 26, follow-up 4 |
| The remote caddy reports `frontWallHeight` as a wall by its key name | 28, open issue 7 |
| A web narrowed at its mouth is reported at its narrowest point | 28, open issue 8 |
| The headphone mount's lower screw sits under the hanging headset | 24, open issue 5 |
| The rail's all-maximum corner is no longer a legal part | 30, open issue 2 |
| Design files of the rail and the riser show the geometry notice once | 30, open issue 4 |
| Documents 08, 09, and the S04 spec keep the old proposal wording | 30, open issue 3 |

---

## 9. Priorities

In order. The first item is the only one that a person, not an agent,
must do.

**1. Print the first records.** Print the drawer tray fit-test coupon and
run the calibration protocol in `sprints/PRINT_RECORDS.md`. Then print the
socket tray, the parts bin, and the shelf riser boot preset. These four
records unblock the bore correction, the parts bin skin decision, the
press-fit clearance, and the load constant. Nothing an agent does can
replace this.

**2. The bore and socket correction.** After the socket tray records
exist, design the correction on the `compensable` shape that S13
extended. A bore and a peg move opposite to an outside wall. This is a
contract change. Route it to the strongest tier.

**3. A sampled corner sweep in the test suite.** The S09 review found two
defects by sweeping parameter-range corners. The fixtures missed both. A
sampled sweep per product, under a time budget, holds that ground. Run it
as a test sprint, not per product.

**4. Field limits from the print context.** Add an optional
`limitFromContext` to `NumberSpec`, and let the pots' diameter fields use
it. Carried from document 29, follow-up 1.

**5. The Cloudflare acceptance checklist.** Run it against a real preview
and a real production deploy. Then close the storage migration and the
WASM MIME type items.

**6. New products, only after the above.** The catalog covers four
families. A new product in an existing family is routine work. A new
family needs its own kernel module and its own print-safety rules.
