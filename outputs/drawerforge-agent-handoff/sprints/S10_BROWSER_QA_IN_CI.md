# S10. Real-Browser QA in CI

## Goal

Run the browser checks that today live in scratch scripts as part of the CI gate, with real WebGL, real downloads, and accessibility checks.

## Model and effort

Sonnet 5, medium, for the test design and CI wiring. Haiku 4.5, low, for porting the existing scripts into test files. Review by Opus 5, high.

## Depends on

None.

## Scope

1. Add `@playwright/test` as a dev dependency, pinned. Use the Chromium the runner provides; do not download browsers in CI when the environment already has them.
2. Port the four scratch scripts from documents 12 to 14 into `tests/browser/`: worker smoke, rapid edits, design file save and open, and the storage migration. Each asserts what the notes recorded.
3. Add an axe accessibility check on the default page with zero serious violations as the bar.
4. Add a performance budget: first "Ready" within 5 seconds on the runner; the page chunk under 650 KB; the worker chunk under 80 KB.
5. Run the browser suite as a second CI job after the build, against `vinext start`.
6. Add a seeded property test in Vitest: 200 random valid parameter sets generate a closed mesh with the contract bounds.

## Out of scope

Visual regression screenshots in the gate. Mobile device emulation.

## Deliverables

- `tests/browser/*.spec.ts`, Playwright config, CI job
- Property test
- `25_BROWSER_QA_NOTES.md` with runtimes per test

## Acceptance

- The CI run stays under 8 minutes.
- Every ported script's assertions pass in CI.
- A deliberate break, such as removing the worker file, fails the browser job.

## Tests

The suite is the deliverable.

## Risks

Software WebGL is slow on runners. Keep viewer-heavy steps to one test and set a generous timeout for it only.

## Notes to record

Runtimes. Flake count over the first ten runs.
