# 10. Multi-Product Expansion Plan

Date: 2026-09-02
Status: Proposal. Not implemented.
Reads with: 02_SYSTEM_ARCHITECTURE.md, 05_DECISION_LOG.md, 08_EXPANSION_ROADMAP.md

This document has two parts.

- Part 1: How to expand and govern the current drawer-tray generator.
- Part 2: How to grow the app into a catalog of 15 custom-printed household products.

Part 2 does not replace 08_EXPANSION_ROADMAP.md. It sits on top of it.
Phase A (design files) and Phase C (Web Worker) of that roadmap are prerequisites.

Scope rule, 2026-09-02: No product may touch food, hold food, or hold an item that
touches food. No product may serve a health or medical use. The knife block is tabled
for the same reason. See 1.6 rule 13 and 2.1.

---

## Part 1. Expand and govern the drawer-tray generator

### 1.1 Health check (this branch, Node 22.22)

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:unit` | Pass, 26 cases |
| `npm run test:integration` | Pass, 11 cases |
| Physical print | Not done. Fit and calibration are hypotheses. |

### 1.2 Findings that block a second product

The engine is sound. The product definition is not in one place. It is in six places.

| # | Where | What is hard-coded | Reference |
|---|---|---|---|
| 1 | `lib/parameters.ts` | Numeric specs only. No boolean or enum kinds. | `PARAMETER_SPECS` |
| 2 | `app/components/DrawerForgeApp.tsx` | UI groups, slugs, and copy for each parameter. | lines 40-82 |
| 3 | same | Finger-scoop toggle and mesh-quality radios are bespoke JSX. | lines 611-650 |
| 4 | same | Derived-dimension card has a fixed shape. | lines 226-263 |
| 5 | same | Mesh safety check assumes centered X/Y and base at Z=0. | `generatedBoundsMatch`, lines 103-116 |
| 6 | `lib/stl.ts` | Filename bakes in `drawerforge` and rows x columns. | `deterministicStlFilename` |

Other constraints:

- Geometry runs on the main thread inside a timeout. Superseded jobs are not cancelled.
- The saved design has `version: 1`. That number identifies the parameter shape, not the geometry algorithm.
- `tests/presets.test.ts` asserts the exact preset list. `tests/rendered-html.test.mjs` asserts marketing copy.
- No CI, no source-controlled `wrangler.jsonc`, and `app/layout.tsx` trusts forwarded host headers.

### 1.3 Target structure

Move every product into one folder. Move every shared shape into one kernel folder.

```
lib/
  kernel/                 shared, product-agnostic
    manifold.ts           module loader, exception-safe dispose helpers
    profiles.ts           roundedRectangle, polygon, staircase, revolve profile
    shell.ts              extrude + inward-offset cavity
    arrays.ts             divider array, cutter array, screw-bore array
    mesh.ts               Manifold -> OrganizerMesh copy, analysis
  products/
    registry.ts           ordered list of ProductDefinition
    types.ts              ProductDefinition, ParameterSpec (number | boolean | enum)
    drawer-tray/
      schema.ts           specs, groups, defaults
      validate.ts         cross-field rules
      geometry.ts         generate(kernel, params) -> Manifold
      presets.ts
      index.ts            export const drawerTray: ProductDefinition
  stl.ts                  unchanged serializer, filename moves to product
app/
  components/
    ProductForm.tsx       renders any ProductDefinition
    ModelViewer.tsx       DrawerViewer renamed, strings made neutral
  products/[id]/page.tsx  one route per product
```

The contract each product must satisfy:

```ts
export interface ProductDefinition<P> {
  id: string;                 // "drawer-tray"
  geometryVersion: number;    // bump on any change to the mesh for equal params
  label: string;
  family: "shelled-tray" | "comb-array" | "bracket" | "revolved";
  groups: ParameterGroup<P>[];        // ordered UI groups; copy lives here
  specs: Record<keyof P, ParameterSpec>;
  defaults: P;
  presets: Preset<P>[];
  normalize(input: unknown): P;
  validate(params: P): ValidationResult<P>;
  derive(params: P): DerivedValue[];   // [{ label, value, unit }]
  generate(kernel: ManifoldToplevel, params: P): Manifold;
  boundsContract(params: P): BoundsContract;   // feeds the mesh safety check
  filename(params: P, derived: DerivedValue[]): string;
}
```

### 1.4 Refactor sequence for the drawer tray

Do these steps in order. Each step keeps all tests green.

1. Add `boolean` and `enum` kinds to `ParameterSpec`. Move `fingerScoop` and `meshQuality` into the specs.
2. Move `parameterGroups` and `parameterSlugs` out of the component into `schema.ts`. Derive slugs from keys.
3. Replace `DerivedDimensionsCard` with a list renderer fed by `derive()`.
4. Replace `generatedBoundsMatch` with `boundsContract()`.
5. Move `deterministicStlFilename` into the product. Add the product id and a short parameter hash to the name.
6. Create `registry.ts` with one entry. Point the page at the registry.
7. Rewrite `presets.test.ts` and the SSR copy assertions to read from the registry.
8. Move generation into a Web Worker. Transfer typed arrays. Keep the request-id guard. Add cancel on supersede.
9. Add `productId` and `geometryVersion` to the persisted record. Migrate `drawerforge-design-v1` on first load.

Steps 1 to 7 are pure refactor. Ship them before any new geometry.

### 1.5 Drawer-tray features to add next

Keep the order from 08_EXPANSION_ROADMAP.md Phase E.

| Order | Feature | New parameters | Risk |
|---|---|---|---|
| 1 | Adjustable finger scoop | scoopWidth, scoopDepth | Low |
| 2 | Fit-test coupon STL | none, separate export | Low. Highest print value. |
| 3 | Uneven column and row ratios | `layout: { columnFractions[], rowFractions[] }`, schema v2 | Medium |
| 4 | Stacking lip | lipHeight, lipWall | Medium |
| 5 | Label pocket on the front wall | labelWidth, labelHeight | Low |
| 6 | Auto split for trays over the bed size | printBed profile | High. Do last. |

Preset change: the `cutlery` preset places the tray in a kitchen drawer with food-contact
items. Replace it with a `tools` preset that has the same long-lane geometry. Update
`tests/presets.test.ts` in the same commit.

### 1.6 Governance rules

Apply these rules to every product and every feature.

1. Each physical feature is one explicit parameter. It is in the schema, the signature, the validation, the saved record, and the filename.
2. The preview mesh and the export mesh are the same object. Do not add a lighter preview.
3. An invalid edit does not replace the last valid preview. It disables download.
4. A change to the mesh for equal parameters is a geometry change. Increase `geometryVersion`. Add a golden test.
5. A golden test records volume, bounds, and triangle count for fixed parameters. Use a tolerance of 0.1 percent.
6. Each product ships with: a schema, a validator, a generator, two presets, four geometry cases, one STL round-trip test, and one printed coupon record.
7. Geometry cases cover: minimum, default, maximum, and one conflict case.
8. Every geometry test checks: kernel status, one component, closed edges, positive volume, finite values, and bounds.
9. A wall or web below two nozzle widths is a validation error. Do not print it.
10. A feature that needs supports is a failed feature. Clamp the geometry, or reject the input.
11. A validation message names the field and the fix. Example: "Each compartment must be at least 10 mm wide."
12. Merge gate: `lint`, `typecheck`, `test`, `build`, `test:ssr` pass in CI. Add the CI workflow before step 1 of 1.4.
13. No product, preset, label, or example copy may refer to food, drink, kitchen storage, cutlery, or a health or medical use. Review each new product and preset against this rule before it is merged.

---

## Part 2. Catalog of 15 custom-printed household products

### 2.1 Selection rule

Include a product only if all of these are true.

- The custom size is the reason to print it. A fixed-size shop product does not fit.
- The engine builds it from extrude, offset, revolve, hull, and booleans. No freeform surfaces, no threads.
- It prints on a 220 x 220 x 250 mm bed without supports, or it splits into parts that do.
- It does not touch food or drink. It does not hold an item that touches food. It has no health or medical use.

Products removed under the last rule, with the reason:

| Product | Reason |
|---|---|
| Knife and utensil slot block | Tabled. Holds knives. Secondary connection to food. |
| Pantry or fridge bin | Holds food. |
| Spice jar riser | Holds food containers. |
| Lid and cutting-board rack | Holds food-contact surfaces. |
| Funnel and decant adapter | Can be used with food or drink. |
| Hair dryer holster | Hot tool against printed plastic. Safety concern. |

### 2.2 Product families

One family module gives several products. Build the module once.

| Family | Shared module | Products | New kernel code |
|---|---|---|---|
| A. Shelled trays and bins | rounded-rect shell + cavity + dividers (exists) | 0, 1, 2, 3, 4 | stacking lip, leg posts, uneven divider positions, angled rest |
| B. Comb and bore arrays | slab + cutter array (prism, cylinder, cone) | 5, 6, 7, 8, 9 | cutter array, pitch solver, underside lightening |
| C. Brackets and wall mounts | back plate + screw bores + gussets | 10, 11, 12 | J-profile extrude, countersink, hull gusset |
| D. Revolved forms | 2D profile + revolve + offset shell | 13, 14 | profile builder, revolve |

### 2.3 Catalog

M = measure your space or object. C = construction. Effort is relative to the drawer tray: S same recipe, M one new primitive, L new family.

| # | Product | Room | Why custom | Key M inputs | Family | Effort | Wave |
|---|---|---|---|---|---|---|---|
| 0 | Drawer organizer tray | Desk, garage, closet | Fits the drawer interior | drawer width, depth | A | Exists | - |
| 1 | Stackable parts bin | Garage, craft | Fills the shelf width, stacks | bin width, depth, height | A | S | 1 |
| 2 | Remote and controller caddy | Living room | Wells match each remote and controller | well widths, well depth | A | M | 2 |
| 3 | Two-tier drawer riser insert | Desk, vanity | Height matches the items below | clear height over contents | A | M | 2 |
| 4 | Entryway valet with phone rest | Entry | Wells sized to phone, keys, watch | well widths, phone slot | A | M | 3 |
| 5 | Battery organizer | Garage, desk | Bores match AA, AAA, 18650, or coin cells | cell diameter, cell length, count | B | S | 1 |
| 6 | Bit, socket, and driver tray | Garage | Bores match the socket set | bore diameter per row | B | S | 1 |
| 7 | Marker and brush cup block | Kids, craft | Bore matches the pen | bore diameter, count | B | S | 1 |
| 8 | Tool fin rack for pliers and files | Garage | Fin pitch matches the tool thickness | fin pitch, rack width | B | S-M | 1 |
| 9 | Card and cartridge slot holder | Living room, desk | Slot matches SD cards, game cartridges, cassettes | card thickness, width, count | B | S | 2 |
| 10 | Wall hook rail with key shelf | Entry | Screw spacing matches the wall | rail length, screw spacing | C | L | 3 |
| 11 | Headphone and controller wall mount | Desk, living room | Hook and pocket match the device | device width, band thickness | C | M | 3 |
| 12 | Shelf riser or shoe stacker | Closet, garage | Leg height matches the shoes or boxes | leg height, deck size | C | M | 3 |
| 13 | Nursery plant pot with drainage | Any | Fits the shelf, the saucer, and the plant | outer diameter, height | D | S-M | 2 |
| 14 | Plant pot saucer | Any | Inner diameter matches the pot base | inner diameter | D | S-M | 2 |

Each product keeps five to nine primary inputs. The construction group is shared. See 2.5.

Products 5, 7, 8, and 9 are presets of the same cutter-array module with a different cutter shape. That is the leverage of family B.

### 2.4 Build waves

Wave 1 gives five products in three rooms with the least new code. It builds family B and one family A extension.

| Wave | Products | Modules delivered | Exit gate |
|---|---|---|---|
| 1 | 6, 7, 5, 1, 8 | Cutter array, pitch solver, stacking lip | Five products pass rule 1.6.6. Ten coupons printed. |
| 2 | 9, 2, 3, 14, 13 | Uneven divider positions, leg posts, revolve | Same gate. Pot and saucer print as a matched pair. |
| 3 | 12, 11, 10, 4 | Screw bores, gussets, J-profile, angled rest | Same gate. Load note on each bracket product. |

Do not start wave 1 before steps 1 to 8 of section 1.4 are merged.

### 2.5 Shared construction group

Every product shows the same collapsed "Construction" group. A product can narrow a range. A product cannot widen one.

| Parameter | Range | Default | Note |
|---|---|---|---|
| wallThickness | 1.2 to 4.0 mm | 2.0 | At least 1.6 when the part stacks or carries load |
| baseThickness | 1.2 to 6.0 mm | 2.4 | Not less than wallThickness |
| clearancePerSide | 0 to 3.0 mm | 0.5 | Fit-to-space products only |
| cornerRadius | 0 to 20 mm | 3.0 | Not more than half the shorter side |
| dividerThickness | 1.2 to 4.0 mm | 1.6 | Families A and B |
| meshQuality | draft, standard, fine | standard | Segments 12, 24, 48 |
| printBed X, Y, Z | printer profile | 220, 220, 250 | Drives size warnings and the split prompt |

The printer profile is the `PrinterProfileV1` record from roadmap Phase B. Store it once per device, not per product.

### 2.6 Print-risk products and the rule that protects each

| Product | Failure | Hard rule |
|---|---|---|
| 10 Wall hook rail | Hook snaps across layer lines | Hook root at least 8 mm. Projection at most 2.5 x root, never over 60 mm. Fillet at root. |
| 11 Headphone wall mount | Hook snaps under a heavy headset | Same root rule. Hook width at least 20 mm. |
| 8 Tool fin rack | Tall fin snaps under a plier handle | finHeight / finThickness at most 15. Fillet at base. Base at least 3 mm. |
| 12 Shelf riser, 3 Drawer riser | Leg buckles | legHeight / legSection at most 12. Gussets always on. Ribs when the span is over 150 mm. |
| 13 Nursery pot | Drain holes bridge badly | Hole diameter 4 to 8 mm. Holes in the flat base only. Wall at most 45 degrees from vertical. |

Show the print orientation in the viewer for family C products. The plate goes on the bed. The hook or pocket points up.

### 2.7 What to defer

- Freeform divider drawing. It needs the layout schema and undo first.
- 3MF export. Add it when a product needs multiple parts or part names.
- Accounts, sharing, and a print-service link. Wait for proven demand, as roadmap Phase G states.
- Threads, living hinges, and snap fits. The engine can model them, but the print tolerance work is not done.
- Any kitchen, bath-cabinet, or medicine product. Revisit only after a material and safety review.

---

## Part 3. First tranche for the next agent

Status 2026-09-02: items 1 and 2 are done, plus the preset rename from item 5.
See 11_PRODUCT_REGISTRY_REFACTOR_NOTES.md. Items 3, 4, the fit-test coupon, and 6 remain.

1. Add a CI workflow that runs the five merge-gate commands.
2. Do section 1.4 steps 1 to 7. Keep the diff to one product.
3. Do step 8, the Web Worker.
4. Do step 9, the persisted record migration.
5. Add the fit-test coupon export. Replace the `cutlery` preset with `tools`.
6. Build the cutter-array module and product 6, the socket tray. Print one coupon. Record the fit.

Stop after item 6. Review the printed result before wave 1 continues.
