# 15. Sprint Plan and Model Routing

Date: 2026-09-02
Status: Proposal. Sprint specs are in `sprints/`.
Reads with: 10_MULTI_PRODUCT_EXPANSION_PLAN.md, documents 11 to 14

This document lists the remaining major sprints, the order to run them, and the
model and effort level to assign to each. Each sprint has its own spec file. A
spec is complete enough to hand to a fresh agent with no other context than the
handoff package.

---

## 1. Model routing policy

Use the smallest model that can do the work to the quality bar in
10_MULTI_PRODUCT_EXPANSION_PLAN.md section 1.6. Reserve Fable 5.1 for work
where a wrong decision is expensive to undo.

| Model | Use for | Effort |
|---|---|---|
| Fable 5.1 | A new geometry family with print-safety rules. A change to the product contract. An architecture decision that later sprints build on. | high |
| Opus 5 | New geometry inside an existing family. Semantics that touch printed dimensions. The independent review of every sprint. | high |
| Sonnet 5 | A product that is a preset of an existing module. Routes, UI, and copy. Test suites. Operations configuration. | medium, high for ops |
| Haiku 4.5 | Document index, manifest, and checksum upkeep. Porting an existing script into a test file. Record templates. Renames. | low |

Rules:

1. Every sprint gets an independent review by Opus 5 at high effort before its pull request opens. The review reads the diff and reports findings. The sprint agent applies them.
2. A sprint agent that finds it must change the product contract stops and reports. That change is a Fable 5.1 task.
3. A sprint that produces a printed part ends with a printed coupon and a record in `sprints/PRINT_RECORDS.md`. The agent prepares the record. A person prints and fills in the measurements.
4. The merge gate is unchanged: lint, typecheck, test, build, SSR, all green in CI.
5. Each sprint adds one notes document to this package, numbered in sequence, with decisions, deviations, open issues, and follow-ups.

Effort levels: low, medium, high, max. They map to the effort setting of the agent runtime. Use max only when a sprint spec says so.

---

## 2. Sprint order

| # | Sprint | Model | Effort | Depends on | Size |
|---|---|---|---|---|---|
| S01 | Fit-test coupon export | Sonnet 5 | medium | none | S |
| S02 | Per-product route and page metadata | Sonnet 5 | medium | none | S |
| S03 | Viewer scale and print orientation | Sonnet 5 | medium | none | S |
| S04 | Printer profile and dimensional correction | Opus 5 | high | S01 | M |
| S05 | Kernel modules and the socket tray | Fable 5.1 | high | S02, S03 | L |
| S06 | Wave 1 products | Sonnet 5, Opus 5 for the parts bin | medium | S05 | M |
| S07 | Family A extensions: uneven wells and leg posts | Opus 5 | high | S05 | M |
| S08 | Revolved forms and the card holder | Opus 5 | high | S05 | M |
| S09 | Bracket family | Fable 5.1 | high | S03, S04, S05 | L |
| S10 | Real-browser QA in CI | Sonnet 5, Haiku 4.5 for porting | medium | none | M |
| S11 | Cloudflare direct migration | Sonnet 5 | high | S10 | M |
| S12 | Physical print program | Haiku 4.5 for templates | low | S01, S04 | ongoing |

S01, S02, S03, and S10 have no dependencies and can run in parallel. S06, S07,
and S08 can run in parallel after S05. S09 is last among the product sprints.

Size: S is one to two days for one agent. M is three to five. L is one to two weeks.

---

## 3. What each sprint delivers

- **S01** A 5 mm perimeter ring of the tray as its own STL, so a user checks the drawer fit in minutes.
- **S02** One route per product, page title and description from the product, the design name in the title, a favicon, and a not-found page.
- **S03** A viewer whose ground, grid, and lights scale to the part, and a print-orientation hint for products that need one.
- **S04** A local printer profile with bed size and X and Y correction, visible compensation, and build-volume warnings.
- **S05** The shared kernel modules every later product uses, proven by the socket tray as the reference product.
- **S06** Four more wave 1 products.
- **S07** Uneven divider positions and leg posts, proven by the remote caddy and the two-tier riser.
- **S08** The revolve module, proven by the plant pot and saucer, plus the card slot holder.
- **S09** The bracket family with load rules, proven by the hook rail, the headphone mount, the shelf riser, and the valet.
- **S10** Playwright tests in CI with real WebGL, a11y checks, and a performance budget.
- **S11** A source-controlled Cloudflare deployment with a trusted origin, and removal of the Sites coupling.
- **S12** A print record per product and the calibration protocol, filled by a person.

---

## 4. Spec file format

Each spec in `sprints/` has these sections in this order: Goal, Model and effort, Depends on, Scope, Out of scope, Deliverables, Acceptance, Tests, Risks, Notes to record. A section that does not apply says "None".
