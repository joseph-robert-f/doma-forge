# 25. Browser QA Notes

Date: 2026-09-02
Status: Implemented in this worktree (sprint S10). Revised after the
independent review of commit `af2f43a`.
Reads with: sprints/S10_BROWSER_QA_IN_CI.md, 12_WEB_WORKER_GENERATION_NOTES.md,
13_DESIGN_FILE_NOTES.md, 14_WORKSPACE_STORAGE_NOTES.md, 18_VIEWER_SCALE_NOTES.md

This document records sprint S10: real-browser QA in CI. It ports the scratch
Playwright scripts referenced by documents 12 to 14, plus S01's and S02's own
scratch scripts, into a Playwright test suite; adds an axe accessibility gate
and a build-size and startup performance budget; adds a seeded Vitest
property test for the drawer tray's bounds contract; and wires a second CI
job that installs Chromium on the runner and runs the suite.

This revision folds in the independent review's findings: nothing blocking,
eight should-fix items, all applied. Section 2 has a new decision for each
fix; section 3 records the CI timeout and the performance-budget notes the
review asked for.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `playwright.config.ts` | New. Repo-root Playwright config. One Chromium project. `webServer` runs `npm run start` against an already-built `dist`. Respects `PLAYWRIGHT_BROWSERS_PATH`; reads an optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override. |
| `tests/browser/support.ts` | New. Shared helpers: `waitForReady`, `waitForStatusPrefix`, `statusText`, `gotoReady`, `collectPageErrors`. |
| `tests/browser/worker-smoke.spec.ts` | New. Ported from the scratch harness's `smoke.js`. One generation worker survives five rapid edits; the edits settle; the STL download is valid. |
| `tests/browser/viewer-heavy.spec.ts` | New. Ported from `heavy.js`. The one viewer-heavy step in the suite (120 s test timeout, per the spec's Risks section): a 6x8, 600 x 600 mm, fine-quality tray, then a full regeneration from a finger-scoop toggle. |
| `tests/browser/design-file.spec.ts` | New. Ported from `design.js`. Save a named design file, clear storage and reload back to defaults, reopen the file to restore the design, and reject an unsupported version without changing state. |
| `tests/browser/storage-migration.spec.ts` | New. Ported from `migrate.js`. A planted version 1 `drawerforge-design-v1` record migrates into the version 2 workspace envelope in place, keeps a `migratedTo` marker, and the envelope becomes the source of truth after a later edit and rename. |
| `tests/browser/fit-test.spec.ts` | New. Ported from S01's `fit-test-smoke.js`. The fit-test coupon and the full STL both download as valid, non-trivial binary STL files. |
| `tests/browser/route-navigation.spec.ts` | New. Ported from S02's `route-smoke-s02.js`. The document title follows the design name; the design and title survive a full navigation to `/products/drawer-tray` and back to `/`. |
| `tests/browser/accessibility.spec.ts` | New. `@axe-core/playwright` against `/`, zero serious or critical violations. |
| `tests/browser/performance-budget.spec.ts` | New. First "Ready" within 5 s; the built `ProductApp-*.js` page chunk under 650 KB and `generation.worker-*.js` under 80 KB, read from `dist/client/assets` on disk. |
| `tests/bounds-property.test.ts` | New. Vitest. A seeded PRNG draws 200 valid drawer tray parameter sets; each must `generate()` a closed mesh whose bounds satisfy `boundsContract`. |
| `.github/workflows/ci.yml` | Adds a second job, `browser`, gated on `needs: verify`. The existing `verify` job is untouched. |
| `app/globals.css` | One-line fix: `.section-number`'s text color moved from `--copper` to the already-defined `--copper-dark` token. See Decision D-1006. |
| `.gitignore` | Adds `/test-results/`, `/playwright-report/`, `/blob-report/`. |
| `package.json` | Adds `@playwright/test`, `@axe-core/playwright`, and `playwright-core` as pinned dev dependencies; adds the `test:browser` script. |

`tests/browser/capture-screenshots.mjs` and `tests/browser/fixtures/` (sprint
S03) are unchanged. They match no `*.spec.ts` pattern, so `playwright.config.ts`
never picks them up; they stay out of the browser suite and out of CI, as S03
intended.

### 1.2 Test results

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 139 cases (was 137; `tests/bounds-property.test.ts` adds 2) |
| `npm run test:ssr` | Pass, 5 cases |
| `npm run test:browser` | Pass, 10 cases. See section 3 for runtimes. |

---

## 2. Decisions

**D-1001. The `browser` CI job rebuilds from source; it does not share `dist` with `verify`.**
Chosen: the new job runs its own `npm ci` and `npm run build`, independent of
the `verify` job.
Alternative: upload `dist` as an artifact from `verify` and download it in
`browser`.
Reason: the common brief's hard rule is "keep the existing job unchanged."
Sharing `dist` would mean adding an `actions/upload-artifact` step to
`verify`, which is a change to that job even if a small one. An independent
rebuild costs a few extra seconds of CI time (the local build takes about 3 s;
see Measurements) and keeps `verify` exactly as it was. `needs: verify` still
gives the ordering the spec asks for: the browser job only runs after the
existing job succeeds.

**D-1002. `@playwright/test`, `playwright-core`, and `@axe-core/playwright` are pinned to versions that keep one `playwright-core` in the tree.**
Chosen: `@playwright/test` at `1.56.1`, matching `playwright-core` at
`1.56.1` (also pinned directly), matching the Chromium revision (1194)
already installed at `/opt/pw-browsers` in this environment.
Problem found: `@axe-core/playwright` declares a loose peer dependency on
`playwright-core` (`>= 1.0.0`). Without a direct pin, `npm install` satisfied
that peer by fetching a second, newer `playwright-core` (`1.62.1`, expecting
Chromium revision 1234) at the top level of `node_modules`, alongside the
`1.56.1` copy nested under `playwright`. Nothing failed locally because
`@axe-core/playwright`'s `AxeBuilder` only calls `page.evaluate()` on a
`Page` handed to it by `@playwright/test`; it never launches a browser
itself. But a stray, mismatched `playwright-core` sitting in `node_modules`
is a live risk for a later change that does touch browser launch.
Reason: pinning `playwright-core` directly gives npm one version to
deduplicate against, so `npm ci` installs exactly one copy, matching the one
Chromium revision this environment provides. Confirmed with `npm ls
playwright-core` and by inspecting `node_modules/playwright-core/browsers.json`
after `npm ci`.

**D-1003. Known-benign console errors are filtered out of the page-error assertion.**
Chosen: `collectPageErrors()` in `tests/browser/support.ts` drops two console
error patterns: `wasm streaming compile failed` and `falling back to
ArrayBuffer instantiation`.
Reason: `12_WEB_WORKER_GENERATION_NOTES.md` open issue 1 already documents
this: the local production server (`vinext start`) serves `.wasm` as
`application/octet-stream`, so Chromium logs a streaming-compile warning and
falls back to array-buffer instantiation, which still works. Every ported
spec that asserts `errors` is empty failed against this warning before the
filter was added. Fixing the MIME type is a server-configuration change, out
of this sprint's scope. The filter is narrow (two exact substrings) so a
real, unrelated console error still fails the assertion.

**D-1004. The suite runs one worker, one Chromium project, not in parallel.**
Chosen: `fullyParallel: false`, `workers: 1` in `playwright.config.ts`.
Reason: every spec drives the same `webServer` production process and
exercises `localStorage`, workers, and downloads against real, software
WebGL. Parallel workers would share that one server process and its state
in ways the specs do not isolate for (two pages editing `localStorage` at
once, for instance). Software WebGL is also already the slow part; running
tests concurrently would not obviously make the suite faster on a
CPU-constrained runner, and it would remove the simple, serial ordering this
suite's specs assume.

**D-1005. The viewer-heavy step is isolated in its own spec file, with its own long timeout.**
Chosen: `tests/browser/viewer-heavy.spec.ts` calls `test.setTimeout(120_000)`,
well above the suite's default 60 s. Every other spec keeps the default.
Reason: this matches the spec's Risks section directly: "Keep viewer-heavy
steps in one test with its own generous timeout." The 6x8, 600 mm, fine
quality tray plus a full-mesh regeneration is the heaviest single sequence in
the suite (see Measurements); giving it, and only it, a wide timeout avoids
inflating the budget for every other, lighter spec.

**D-1006. A pre-existing color-contrast violation is fixed, not filtered.**
Chosen: `.section-number`'s text color changes from `--copper` (`#a4451f`)
to `--copper-dark` (`#813719`), an existing design token already used
elsewhere in `app/globals.css`. The contrast ratio against `--paper-deep`
(`#e4dac8`) goes from 4.39:1 to 6.08:1; WCAG AA requires 4.5:1 for this text
size.
Alternative: mark this one axe rule as a known exception and exclude it from
the check.
Reason: the spec's bar is "zero serious violations," not "zero new serious
violations." The finding was real, affected four elements (the "01"-"04"
section-number badges), and the fix is a one-line, already-in-palette color
swap with no other visual system change. Excluding the rule would have been
more code, for a worse outcome, to work around a defect the check is
specifically meant to catch. Confirmed with a full axe run against the built
page after the fix: zero violations at any impact level, not just serious or
critical.

**D-1007. The chunk-size budget reads `dist/client/assets` from disk, inside a Playwright test that never opens a page.**
Chosen: `tests/browser/performance-budget.spec.ts`'s two size checks are
plain synchronous tests with no `page` fixture destructured, so Playwright
never launches a browser page for them; they call `node:fs` directly against
the repository's own build output.
Reason: the spec says "measure chunk sizes from the built dist, not from
network," precisely because a network transfer size depends on compression
and caching, not the shipped bytes. Reading the file directly is the only
way to get the real, uncompressed byte count the spec asks for. Running
these two checks as ordinary Playwright tests, rather than a separate script,
keeps them in the same report and the same `npm run test:browser` command as
every other browser-suite check.

**D-1008. The property test narrows its random ranges below the full spec bounds, then rejects and redraws anything `validate()` refuses.**
Chosen: `tests/bounds-property.test.ts`'s `randomCandidate()` draws from
ranges narrower than `lib/products/drawer-tray/schema.ts`'s min/max (for
example, `columns` from 1 to 5, not 1 to 8). `sampleValidParameters()` still
calls the product's own `validate()` on every draw and only keeps a sample
that passes; a draw that fails is discarded and redrawn.
Reason: the full spec range makes many combinations invalid on the product's
own terms (`MINIMUM_COMPARTMENT_MM`, the corner-radius-vs-outside-size
check, and so on; see `lib/products/drawer-tray/validate.ts`). Full-range
uniform sampling would spend most of its draws on combinations `validate()`
rejects, which is wasted kernel time for no test value. Narrowing the ranges
raises the accept rate; the rejection step against the product's real
`validate()` means the test never has to duplicate that function's rules by
hand, and never accepts a set the product itself would refuse. All 200
samples are still random and still seeded, and the seed makes every run of
this test draw the exact same 200 parameter sets.

**D-1009. The browser CI job installs Chromium only, keyed by the pinned `@playwright/test` version, and skips the OS-dependency step on a cache hit.**
Chosen: `actions/cache` on `~/.cache/ms-playwright`, keyed on
`${{ runner.os }}-<the version read from package.json>`. On a cache miss,
`npx playwright install --with-deps chromium` installs both the browser and
its OS packages. On a cache hit, `npx playwright install-deps chromium`
installs only the OS packages (the browser binary already exists from the
cache); this step is fast and keeps the runner's OS dependency versions
correct even though the browser download is skipped.
Reason: `--with-deps` alone, run every time, would re-download Chromium on
every CI run and defeat the point of caching. Skipping OS deps entirely on a
cache hit is riskier: the runner image's system libraries can change between
Playwright's `install-deps` runs even when the cached browser binary has
not. Reading the version from `package.json` at run time, rather than
hard-coding it in the workflow, means a future version bump only has to
change one file.

**D-1010. Local Chromium discovery needs no `executablePath`; a documented environment variable exists for when it does.**
Chosen: `playwright.config.ts` reads `PLAYWRIGHT_CHROMIUM_EXECUTABLE` and
only sets `launchOptions.executablePath` when that variable is set.
Reason: this environment already sets `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
and the pinned `@playwright/test@1.56.1`'s bundled `playwright-core` expects
exactly the Chromium revision (1194) already installed there (confirmed by
inspecting `node_modules/playwright-core/browsers.json`; see D-1002).
Playwright's own browser-discovery logic finds it without help. The env-var
override exists for the case the common brief names directly: a later
`@playwright/test` bump that expects a revision this environment does not
have. The documented local default for that variable is
`/opt/pw-browsers/chromium`, the symlink Playwright's own installer already
maintains to the current revision's binary.

**D-1011. The `browser` CI job's timeout is set to the acceptance bar itself, 8 minutes, not a looser safety margin.**
Chosen: `timeout-minutes: 8` on the `browser` job in `.github/workflows/ci.yml`,
down from an initial 15.
Alternative: keep a looser ceiling (15 minutes, or `verify`'s 20) and treat
the 8-minute figure as advisory, checked by reading the job's actual
duration after each run.
Reason: found in review. A looser CI-enforced timeout does not enforce the
spec's acceptance bar ("the CI run stays under 8 minutes") at all; it only
enforces some larger number nobody chose on purpose. Setting the job's own
timeout to 8 minutes makes a run that overruns the budget fail loudly, on
the first run that does it, instead of quietly drifting past the budget
until someone happens to look. See section 3.2 for the follow-up this
implies: the first run on a real GitHub-hosted runner is the number that
actually tests this, and Open issue 2 already flagged that this sprint could
not produce it from this worktree.

**D-1012. `route-navigation.spec.ts` asserts the product switcher's link count is non-zero before comparing it across routes.**
Chosen: `expect(switcherCountOnRoot).toBeGreaterThan(0)`, immediately after
reading `switcherCountOnRoot`, before the later
`expect(switcherCountOnProductRoute).toBe(switcherCountOnRoot)`.
Reason: found in review. Without it, a `product-switcher` that rendered zero
links on both routes (a real regression, such as an empty registry or a
broken selector) would still pass the equality check: `0 === 0`. The new
assertion fails first, and fails on the actual defect, in that case.

**D-1013. The heavy-viewer test's long-task check asserts the observer recorded something, not just that a number came back finite.**
Chosen: `page.evaluate` now returns `{ longestTaskMs, longTaskCount }`. The
test asserts `longTaskCount` is greater than 0, keeping `longestTaskMs` only
as a recorded, non-asserted measurement (as it always was; see the spec's
own Risks section, which asks for no hard millisecond ceiling here).
Rejected alternative: delete the long-task block and its comment entirely,
since the original `Number.isFinite(longestTaskMs) && longestTaskMs >= 0`
pair was tautological — `Math.max(0, ...[])` on an empty array already
returns `0`, a finite, non-negative number, whether or not the
`PerformanceObserver` ever fired.
Reason: found in review. Deleting the block would have been the simpler
fix, but it would also delete the one signal in this test that the
`PerformanceObserver` API itself worked in headless Chromium during a real,
heavy regeneration — the exact condition `12_WEB_WORKER_GENERATION_NOTES.md`
section 3.2 used to make its own measurement. Keeping the block, with a real
assertion on the count, keeps that coverage instead of only asserting the
status text.

**D-1014. The property test's closed-mesh check tracks both the per-edge visit count and the signed balance, and every failure names the parameters that produced it.**
Chosen: `closedManifoldEdgeIssues()` (renamed from `isClosedManifold()`)
returns a list of human-readable issue strings instead of a boolean, and
tracks `{ count, balance }` per edge rather than `balance` alone. The test's
`expect` calls pass a message built from `JSON.stringify(parameters)`.
Reason: found in review. A balance-only check cannot distinguish a healthy
edge (two visits, opposite winding, balance 0) from a pathological one with
an even, self-cancelling number of visits — four visits, two forward and
two backward, also balance to 0. The count check (`count === 2`) catches
that case; the balance check still catches the case the count check cannot,
same-direction double winding, which balances to +2 or -2 while the count
stays 2. Neither check subsumes the other. Before this fix, a failure only
said `expected false to be true` with no way to tell which of the 200
seeded samples caused it short of re-running the sampler by hand and
bisecting; the parameter set is now printed directly in the failure
message.

**D-1015. `fit-test.spec.ts` requires the full model's STL to be strictly larger than the fit-test coupon's, not merely more than half its size.**
Chosen: `expect(stlSize).toBeGreaterThan(fitTestSize)`, replacing
`expect(stlSize).toBeGreaterThan(fitTestSize / 2)`.
Reason: found in review. The fit-test coupon is a thin perimeter ring
(`16_FIT_TEST_COUPON_NOTES.md`); the full model has the same perimeter plus
walls, a base, and dividers on top of it, so it is always larger, not just
usually more than half the coupon's size. The looser check would have
passed even if the full-model export had silently regressed to something
smaller than the coupon it is supposed to contain.

**D-1016. The accessibility test reports its violation summary through `expect`'s own message parameter, not a thrown error before an unreachable assertion.**
Chosen: `expect(blocking, summary).toEqual([])`, with `summary` always
computed (an empty string when `blocking` is empty).
Rejected (original): `if (blocking.length > 0) throw new Error(...)`
followed by `expect(blocking).toEqual([])`, which could never itself fail,
since the `throw` above it already exits the test on every case the
`expect` was meant to catch.
Reason: found in review. The rejected form worked (the `throw` did fail the
test with a useful message), but the `expect` beneath it was dead code that
misstated what was actually enforcing the check. `expect(actual,
message)` is `@playwright/test`'s own supported form for exactly this: one
real assertion, with a diagnosable message, and no unreachable code beside
it.

**D-1017. `capture-screenshots.mjs` resolves `playwright-core` from this repository's own `node_modules` first, before falling back to `PW_HARNESS_DIR`.**
Chosen: `loadPlaywright()` tries `require.resolve("playwright-core")` with
default resolution (this repository's `node_modules`) first. Only if that
fails does it fall back to `PW_HARNESS_DIR`, exactly as before. The
early fail-fast check in `main()` now calls `loadPlaywright()` itself,
rather than a harness-only check, so it fails on the same combined
condition the real call site will hit.
Reason: found in review. This script predates sprint S10, from a time when
`playwright-core` existed nowhere in this repository and `PW_HARNESS_DIR`
was the only source. Sprint S10 added `playwright-core` as a pinned dev
dependency for the main test suite; this script had not been told. Any
session or machine that has run `npm ci` on this repository since S10 can
now run this script with no environment variable at all. `PW_HARNESS_DIR`
remains as a fallback for a checkout that predates S10's `package.json`, or
any other reason the repository's own copy might be unavailable.

---

## 3. Measurements

### 3.1 Per-test runtimes (local, `npm run test:browser`, clean run)

| Test | Runtime |
|---|---|
| `accessibility.spec.ts` › no serious or critical axe violations | 12.9 s |
| `design-file.spec.ts` › save, clear storage, reopen, reject an unsupported version | 21.0 s |
| `fit-test.spec.ts` › fit-test coupon and full STL download | 6.5 s |
| `performance-budget.spec.ts` › first Ready within 5000 ms | 1.9 s |
| `performance-budget.spec.ts` › page chunk under 650 KB | 3 ms |
| `performance-budget.spec.ts` › worker chunk under 80 KB | 3 ms |
| `route-navigation.spec.ts` › design and title survive route navigation | 11.6 s |
| `storage-migration.spec.ts` › version 1 record migrates in place | 21.5 s |
| `viewer-heavy.spec.ts` › 6x8 fine-quality regeneration | 14.9 s |
| `worker-smoke.spec.ts` › one worker survives rapid edits | 13.0 s |
| **Whole suite** (`npx playwright test`, includes `webServer` startup) | **1m 56s** (`real`; `user` 36s, `sys` 5s) |

Method: `npx playwright test` from a clean, already-built `dist`, one
Chromium project, `workers: 1`. Times are Playwright's own per-test reporter
output. Individual test times vary by 1-3 s between runs (see section 3.4,
the flake-count runs); the table above is one representative clean run.

### 3.2 Build-size and startup budget

| Measurement | Value | Budget | Source |
|---|---|---|---|
| First "Ready" | 1.9 s | < 5 s | `performance-budget.spec.ts`, timed from `page.goto` to the ready condition |
| Page chunk (`dist/client/assets/ProductApp-*.js`) | 587,804 bytes (≈574 KB) | < 650 KB (665,600 bytes) | Read directly from the build output |
| Worker chunk (`dist/client/assets/generation.worker-*.js`) | 53,852 bytes (≈52.6 KB) | < 80 KB (81,920 bytes) | Read directly from the build output |

Both chunk sizes match `12_WEB_WORKER_GENERATION_NOTES.md` section 3.3
almost exactly (574 KB and 53 KB there), confirming this sprint measures the
same two assets that sprint already reported on.

Found in review, two caveats on the "First Ready" figure above:

1. **It measures a warm server, not a cold one.** Playwright runs the suite
   in file order within one `webServer` process; `accessibility.spec.ts`
   is the first spec to run and already drives one full navigation and
   `generate()` call before `performance-budget.spec.ts` runs its own. The
   production server, the worker's kernel load, and the OS's file cache are
   all already warm by the time the timing test's `page.goto` fires. A
   true cold-start number (first request to a freshly started `vinext
   start`, nothing else having touched it) has not been measured
   separately. 1.9 s against a 5 s budget leaves real headroom, but the
   number to trust is whatever the CI job's first real run reports, not
   this local, warm-server figure.
2. **Revisit this once a real GitHub-hosted runner has measured it.** Open
   issue 2 already flags that this sprint could not run on GitHub-hosted
   hardware from this worktree. That first real run is also the first
   chance to confirm the "Ready" budget holds on unfamiliar, possibly
   slower, runner hardware and not only on this environment's own
   software-WebGL setup.

Also found in review: `playwright.config.ts`'s `webServer.reuseExistingServer`
is `true` locally (`!process.env.CI`). If a developer runs
`npm run test:browser` against a `webServer` Playwright itself left running
from an earlier invocation, and rebuilds `dist` in between without
restarting that server, the chunk-size tests read the fresh `dist` from
disk correctly (Decision D-1007: they read files directly, not through the
running server), but the "Ready" timing test and every other page-driving
spec would still be exercising the stale server process's already-loaded
bundle. This is a local-only trap: `reuseExistingServer` is `false` in CI
(`process.env.CI` is set), so every CI run starts its own server against
the `dist` that same job's `npm run build` step just produced, and cannot
observe this staleness. A developer who rebuilds locally between test runs
should restart `npm run start` (or let Playwright start a fresh one by not
leaving an old one running) rather than trust that a passing local run
reflects the latest build.

### 3.3 Deliberate break

Method: after a clean `npm run build`, renamed
`dist/client/assets/generation.worker-<hash>.js` to
`generation.worker-<hash>.js.disabled` (no other change), then ran
`npx playwright test tests/browser/worker-smoke.spec.ts` against that broken
build.

| Step | Result |
|---|---|
| Broken build, worker-smoke spec | Fails. `gotoReady` times out after 30 s: `TimeoutError: page.waitForFunction: Timeout 30000ms exceeded` waiting for the "Ready" status, because the worker script 404s and the app never produces a first preview. |
| File restored, same spec | Passes again, 16.3 s. |

This confirms the acceptance criterion: "a deliberate break, such as
removing the worker file, fails the browser job." In CI, `browser` rebuilds
its own `dist` (Decision D-1001), so the equivalent break there is deleting
or renaming `lib/generation/generation.worker.ts` before the build step, not
editing the built output directly; either way, the same worker-smoke (and,
before it even gets that far, `viewer-heavy`) spec fails the same way,
because no build with a missing worker source file produces a loadable
worker chunk.

### 3.4 Flake count, ten local runs

Method: `npx playwright test` (the full suite, all ten tests), run ten times
in sequence against a clean, unmodified `dist`, no code changes between
runs.

| Run | Result | Wall time |
|---|---|---|
| 1 | 10/10 passed | 1.7 m |
| 2 | 10/10 passed | 1.6 m |
| 3 | 10/10 passed | 1.6 m |
| 4 | 10/10 passed | 1.8 m |
| 5 | 10/10 passed | 1.5 m |
| 6 | 10/10 passed | 1.5 m |
| 7 | 10/10 passed | 1.7 m |
| 8 | 10/10 passed | 1.5 m |
| 9 | 10/10 passed | 1.6 m |
| 10 | 10/10 passed | 1.9 m |

Flake count: **0 of 10 runs** failed any test. All 100 individual test
executions (10 tests x 10 runs) passed. Suite wall time across the ten runs
ranged 1.5-1.9 minutes, averaging about 1.6 minutes.

---

## 4. Deviations from the spec

1. **Six scripts ported, not four.** The spec's own Scope section 2 names
   four scratch scripts (documents 12 to 14: worker smoke, rapid edits,
   design file, storage migration). The task that assigned this sprint
   explicitly named two more, from S01 and S02: `fit-test-smoke.js` and
   `route-smoke-s02.js`. Both are ported (`fit-test.spec.ts`,
   `route-navigation.spec.ts`), on the reasoning that a more specific,
   later instruction overrides an earlier document's smaller count, and
   that both scripts already existed, tested real product surface, and
   cost little extra to keep working under the same CI gate.
2. **`heavy.js`'s original assertions were observational, not pass/fail.**
   The scratch script logged `longTasks`, `frames`, and `stalls` as JSON for
   a person to read; it had no `expect`-equivalent. `viewer-heavy.spec.ts`
   keeps the same drive (6x8, 600 mm, fine quality, then a finger-scoop
   toggle) and the same `PerformanceObserver` longtask measurement, but
   asserts only that the app survives the load and settles back on the
   correct footprint, not a numeric threshold on task duration. A hard
   millisecond ceiling here would fail on CI hardware for reasons that have
   nothing to do with a real regression; `12_WEB_WORKER_GENERATION_NOTES.md`
   section 3.2 already found the software-WebGL frame cost, not the kernel,
   dominates this number.
3. **`design.js` and `migrate.js` write the planted or opened file through
   Playwright's `setInputFiles({ name, mimeType, buffer })`, not a temp file
   on disk.** The originals wrote to the scratch harness's own directory,
   which is a per-session path outside this repository (see
   `18_VIEWER_SCALE_NOTES.md` Decision D-714 for the same problem in a
   different script). `setInputFiles` accepts an in-memory buffer directly,
   so the ported specs need no scratch path at all, in this session or any
   other.
4. **One pre-existing accessibility defect fixed outside the geometry or
   product contract.** See Decision D-1006. This is a one-line CSS token
   swap in `app/globals.css`, not a change to any file the common brief's
   hard rules protect.

---

## 5. Open issues

1. **The WASM MIME type warning (12_WEB_WORKER_GENERATION_NOTES.md open
   issue 1) is filtered, not fixed.** Every browser-suite spec would
   otherwise fail on it. Fixing `vinext start`'s static file serving is
   outside this sprint's scope; Cloudflare Workers Assets is expected to
   serve the correct MIME type on the real deployed origin, per that same
   open issue.
2. **The `browser` CI job's first run pays the full Chromium download
   (cache miss).** Section 3 of the spec's Acceptance asks for the CI run
   to stay under 8 minutes; `timeout-minutes: 8` (Decision D-1011) now
   enforces that bar directly, so a run that overruns it fails the job
   instead of silently drifting past the budget. Whether it actually stays
   under that ceiling was not measurable in this environment (no access to
   GitHub-hosted runners from this worktree). The local suite runtime
   (section 3.1) plus a typical `playwright install --with-deps chromium`
   download (commonly on the order of one minute on GitHub-hosted runners,
   from public data on similar projects) suggests headroom under 8 minutes,
   but this is an estimate, not a measurement on the actual runner class.
   Record the first real run's actual duration here once it exists.
3. **Only one product exists.** `route-navigation.spec.ts` and
   `design-file.spec.ts` exercise the one registered product,
   `drawer-tray`. `17_PRODUCT_ROUTES_NOTES.md` open issue 2 already flags
   this same limit for its own route smoke test; it applies here
   unchanged.

---

## 6. Follow-ups

1. When a second product is registered, extend `route-navigation.spec.ts`
   to navigate between two different products' routes, not just the one
   product's route and `/`.
2. Confirm the WASM MIME type on the real deployed Cloudflare origin (S11);
   if it serves correctly there, the filter in Decision D-1003 could
   eventually be narrowed to a comment noting it is dev/local-only, though
   leaving it in place costs nothing either way.
3. Measure the `browser` CI job's actual wall-clock time on a real
   GitHub-hosted runner once this sprint's branch runs there, and record it
   against the 8-minute budget (see Open issue 2).
