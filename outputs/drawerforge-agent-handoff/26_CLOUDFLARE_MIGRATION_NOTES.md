# 26. Cloudflare Migration Notes

Date: 2026-09-02
Status: Implemented on sprint S11, then revised the same day after an
independent review of the first commit. Configuration and scripts only; no
live deployment ran from this environment (no Cloudflare credentials here).
Reads with: sprints/S11_CLOUDFLARE_MIGRATION.md, 07_OPERATIONS_AND_MIGRATION.md,
12_WEB_WORKER_GENERATION_NOTES.md (open issue 1), 14_WORKSPACE_STORAGE_NOTES.md
(the version 1 key), 25_BROWSER_QA_NOTES.md

This document records sprint S11: the direct-Cloudflare migration described in
document 07, Phases 1 through 3. It removes the OpenAI Sites coupling, adds a
source-controlled `wrangler.jsonc`, replaces the forwarded-host origin with a
configured `PUBLIC_ORIGIN` Worker variable, and adds `deploy`/`deploy:preview`
scripts and a CI job that uses them. It does not perform Phase 4 (connect
Cloudflare Builds) or Phase 5 (hosted acceptance and cutover) — those need a
live Cloudflare account, which this environment does not have.

**Review revision.** An independent review of this sprint's first commit
found one blocking defect — `deploy:preview` deployed over the production
Worker, because the Cloudflare environment is selected at build time
through `CLOUDFLARE_ENV`, not at deploy time through `wrangler deploy
--env` (D-1106) — plus six smaller items (pin `compatibility_date` to the
installed workerd, D-1111; warn when `PUBLIC_ORIGIN` is not wired up,
D-1112; give the `deploy` job its own concurrency group, D-1113; document
`main` as build-time-only, D-1114; two follow-up-list corrections). All
seven are applied and are marked throughout this document as "found in
review" or attributed to the specific decision that fixes them, rather than
folded silently into the original text.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `wrangler.jsonc` | New. Root Worker config: name `drawerforge`, `worker/index.ts` entry (commented as build-time-only, D-1114), compatibility date pinned to the installed workerd (D-1111), `nodejs_compat`, `assets` (built by `vinext build`), stored observability, a named `preview` environment with its own Worker name — with a comment explaining `CLOUDFLARE_ENV` selects it at build time (D-1106). No D1, R2, KV, Images, queues, secrets, routes, or custom domain. |
| `vite.config.ts` | The `cloudflare()` plugin no longer takes an inline `config` object. It now auto-discovers `wrangler.jsonc`, which is the single source of truth for the Worker. The `.openai/hosting.json` import and the `sites()` plugin are gone. |
| `worker/index.ts` | The `/_vinext/image` route and the `IMAGES` binding are gone. The entry now only forwards to `vinext/server/app-router-entry`. |
| `.openai/hosting.json`, `build/sites-vite-plugin.ts` | Deleted. Nothing in the app reads either any more (confirmed by a repository-wide search before deleting them). |
| `lib/origin.ts` | New. `resolvePublicOrigin()`, a pure function: reads `PUBLIC_ORIGIN` from an env-like object (`process.env` by default), validates it as an absolute `http:`/`https:` URL, and falls back to `http://localhost:3000` on anything absent, blank, or malformed. Never throws. |
| `tests/origin.test.ts` | New. 10 cases: unset, blank, valid `https`, valid `http`, path/query/hash stripped to origin only, whitespace trimmed, non-default port kept, unparsable value, non-`http(s)` protocol (`ftp:`, `javascript:`), and reading `process.env.PUBLIC_ORIGIN` directly. |
| `tests/wrangler-preview-env.test.mjs` | New, review fix (D-1106). Asserts a `CLOUDFLARE_ENV=preview` build's `dist/server/wrangler.json` really has `name: "drawerforge-preview"` and `targetEnvironment: "preview"`. Run by `npm run test:deploy-config`. |
| `scripts/check-public-origin.mjs` | New, review fix (D-1112). Renders the built app's `/` and prints a `::warning::` GitHub Actions annotation, without failing, if the page still shows the `localhost:3000` default. Run by `npm run check:public-origin`. |
| `app/layout.tsx` | `generateMetadata()` no longer reads `x-forwarded-host`/`x-forwarded-proto` request headers. It calls `resolvePublicOrigin()` instead and is a plain synchronous function (it awaits nothing now, so `async` and the `next/headers` import are both gone). |
| `tests/rendered-html.test.mjs` | The assertion that `.openai/hosting.json` exists is removed, along with the now-unused `projectRoot` constant. |
| `package.json` | Adds `deploy` (`vinext deploy`) and `deploy:preview` (`CLOUDFLARE_ENV=preview vinext deploy --preview` — the `CLOUDFLARE_ENV` prefix is the review fix, D-1106). Adds `test:deploy-config` and `check:public-origin`, the two new review-fix scripts. |
| `.github/workflows/ci.yml` | Adds a third job, `deploy`, `needs: [verify, browser]`, with its own `concurrency` group (D-1113). The existing `verify` and `browser` jobs are untouched in both the original commit and this revision — see the diff note in section 2, Decision D-1107. |
| `eslint.config.mjs` | Adds `.wrangler/**` to the ignored globs, alongside the existing `.next/**`, `out/**`, `build/**`. See Decision D-1110. |
| `README.md` | Adds the two new scripts to the Commands block and a short "Deployment" section pointing at `wrangler.jsonc`, `PUBLIC_ORIGIN`, the `PUBLIC_ORIGIN` repository variable, and this document. |

### 1.2 Test results

| Check | Result |
|---|---|
| `npm run lint` | Pass, 0 problems |
| `npm run typecheck` | Pass |
| `npm test` | Pass, 222 cases, 13 files (was 212 cases, 12 files, before `tests/origin.test.ts` added its 10) |
| `npm run test:ssr` | Pass, 5 cases |
| `npm run test:browser` | Pass, 10/10, with `CI=true` set (see Measurements, section 4, and the note on why the non-`CI` run is not the trustworthy one) |
| `npm run test:deploy-config` | Pass, 1 case. New, review fix (D-1106). |
| `npx wrangler deploy --dry-run` (production build) | Pass, no errors. See section 4. |
| `npx wrangler deploy --dry-run --env preview` (production build) | Pass, no errors — but see D-1106: this alone does not prove the preview environment actually deploys correctly. |
| `npx wrangler deploy --dry-run --env preview` (`CLOUDFLARE_ENV=preview` build) | Pass, no errors, and now genuinely matches the built config. See section 4. |
| `npx wrangler deploy --dry-run --env definitely-not-an-env` (`CLOUDFLARE_ENV=preview` build) | Now correctly **fails**, proving the mismatch guard works once a build records its target. See section 4. |

---

## 2. Decisions

**D-1101. `wrangler.jsonc` is the single source of truth for the Worker; `vite.config.ts` no longer carries an inline binding config.**
Chosen: delete `localBindingConfig` and the `config:` option passed to
`cloudflare()`. The plugin auto-discovers `wrangler.json`/`wrangler.jsonc`/
`wrangler.toml` in the project root (confirmed by reading
`@cloudflare/vite-plugin`'s own config-resolution code before relying on it).
Reason: the inline config existed only to synthesize D1/R2 bindings from
`.openai/hosting.json`'s `project_id`-scoped placeholders (Scope item 2).
With that file gone and no bindings needed, a second, parallel config object
duplicating `wrangler.jsonc` would be one more place to keep in sync, exactly
the drift document 07 calls out.

**D-1102. `PUBLIC_ORIGIN` is read through `process.env`, not `cloudflare:workers`'s `env` import.**
Chosen: `lib/origin.ts` reads `process.env.PUBLIC_ORIGIN` (with a passed-in
env object for tests).
Alternative: `import { env } from "cloudflare:workers"` (vinext's own
documented, recommended way to reach Worker bindings — see its README,
"Cloudflare Bindings").
Reason: `cloudflare:workers` is a native module that only resolves inside
workerd. `tests/rendered-html.test.mjs` imports the built `dist/server/index.js`
directly under plain Node (`node --test`, no Vite, no workerd) — the spec
requires that test keep passing under plain Node. An `env` import would make
the whole module graph fail to load there. `process.env` works everywhere
this code runs: under workerd (Cloudflare sets `process.env` from `vars` when
`nodejs_compat` is enabled — confirmed by reading
`@cloudflare/unenv-preset`'s `runtime/node/process.mjs`, which constructs the
polyfilled `process` from `globalProcess.env`, i.e. whatever workerd itself
populated at Worker init) and under plain Node (`process.env` is Node's own).
Verified end to end: built the app, then imported `dist/server/index.js`
directly and rendered `/` twice, once with `PUBLIC_ORIGIN` unset (rendered
`og:url` was `http://localhost:3000`) and once with
`PUBLIC_ORIGIN=https://drawerforge.example.workers.dev` set in the process
environment (rendered `og:url` matched it exactly).

**D-1103. `resolvePublicOrigin()` never throws; a bad value silently falls back.**
Chosen: an absent, blank, non-`http(s)`, or unparsable `PUBLIC_ORIGIN` all
return the `http://localhost:3000` default rather than throwing.
Reason: `generateMetadata()` runs on every server-rendered request. A
misconfigured Worker variable (a typo, a stray `javascript:` value, a value
with no scheme) must not turn into a 500 for every visitor. Falling back to a
working, if locally-scoped, default is strictly safer than crashing metadata
generation. `tests/origin.test.ts` covers each rejected shape.

**D-1104. The forwarded-host origin is removed, not narrowed.**
Chosen: `generateMetadata()` no longer reads `x-forwarded-host`,
`x-forwarded-proto`, or `host` at all. It is a plain synchronous function now
(previously `async`, awaiting `headers()`).
Reason: document 07's "Critical migration hazard" section is explicit that
"Forwarded host headers should not be the long-term canonical URL authority."
A narrower version (validate the forwarded host against an allowlist, say)
would still let a request choose its own metadata origin in the common case.
Removing the mechanism entirely, in favor of one configured, operator-owned
value, is what actually closes the hazard rather than shrinking it.

**D-1105. `wrangler.jsonc` ships with `vars.PUBLIC_ORIGIN` unset, documented in a comment, not guessed.**
Chosen: no `vars` block in `wrangler.jsonc`. A comment above where it would
go names the exact key and gives the `workers.dev` pattern, and says to add
it once the real URL is known.
Reason: this environment has no Cloudflare account, so the Worker's actual
`*.workers.dev` subdomain is unknowable here. `resolvePublicOrigin()`'s
`http://localhost:3000` default keeps every acceptance check that doesn't
depend on the real origin (rendering, metadata shape, the unit test) correct
in the meantime. Guessing a subdomain and writing it into source control
would be worse than leaving it unset: a wrong guess looks configured but
isn't, where an absent value is honestly absent and visibly flagged in this
document's Follow-ups. See Open issue 2 and Follow-up 1.

**D-1106. The Cloudflare environment (`preview` vs. production) is selected at BUILD time, through `CLOUDFLARE_ENV`, not at deploy time through `--env` — `deploy:preview` sets it itself.**

**This corrects a blocking defect an independent review found in this
sprint's first commit.** The original `deploy:preview` script was `vinext
deploy --preview`, which runs `wrangler deploy --env preview` against
whatever was already built. That deployed the *production* Worker under the
"preview" label — every preview deploy would have silently overwritten
production. The original wrangler.jsonc comment on `env.preview` and the
original D-1106 both claimed `--env preview` alone was sufficient; both were
wrong, and are corrected here.

Root cause, verified directly in this environment before fixing anything:
`@cloudflare/vite-plugin` reads `CLOUDFLARE_ENV` (via `vite.loadEnv`, merged
into `process.env`) **while building**, and uses it to select which
`wrangler.jsonc` environment block to resolve into the single, "redirected"
config it writes to `dist/server/wrangler.json` (confirmed by reading
`resolvePluginConfig()` in `@cloudflare/vite-plugin/dist/index.mjs`, which
reads `prefixedEnv.CLOUDFLARE_ENV` and passes it as `env` to
`resolveWorkerConfig()`). Wrangler's own CLI then treats that file as a
"redirected" config: for a redirected config, wrangler's `--env`/
`CLOUDFLARE_ENV` at *deploy* time is used only as a **mismatch guard**
against whatever `targetEnvironment` the build already baked in — the
active config (`activeEnv = topLevelEnv`) always comes from the file
regardless of `--env` (confirmed by reading `normalizeAndValidateConfig()`
in `wrangler/wrangler-dist/cli.js`: the `env.<name>` lookup branch that
reads `rawConfig.env?.[envName]` only runs in the `else` — the
NOT-redirected — branch). Empirically, before this fix:
`dist/server/wrangler.json` built with no `CLOUDFLARE_ENV` set had
`name: "drawerforge"` and `targetEnvironment: null` (`python3 -c "import
json; print(json.load(open('dist/server/wrangler.json')))"`), and
`npx wrangler deploy --dry-run --env definitely-not-an-env` against that
same build exited 0 with no warning — because the mismatch guard only fires
when `rawConfig.targetEnvironment` is truthy, and an ordinary build never
sets it.

Chosen fix: `"deploy:preview": "CLOUDFLARE_ENV=preview vinext deploy
--preview"` in `package.json`. Confirmed `vinext deploy` runs its build
in-process (`runBuild()` in `node_modules/vinext/dist/deploy.js` calls
Vite's `createBuilder({root}).buildApp()` directly — no subprocess, no
separate `npm run build`), so a `CLOUDFLARE_ENV` set on the same command
line reaches that build through the same `process.env` the shell already
set; no `build && deploy` two-step was needed. Verified end to end: `rm -rf
dist .wrangler && CLOUDFLARE_ENV=preview npx vinext deploy --preview`
(no credentials) built successfully, produced `dist/server/wrangler.json`
with `name: "drawerforge-preview"` and `targetEnvironment: "preview"`, and
only then failed, as expected, at the final Cloudflare-auth step. With that
build in place: `wrangler deploy --dry-run --env preview` passes;
`wrangler deploy --dry-run` (no `--env`) also passes (a redirected config's
`activeEnv` is always `topLevelEnv`, which is already the preview identity
here); `wrangler deploy --dry-run --env definitely-not-an-env` now correctly
**fails**, with "This does not match the target environment 'preview'" —
proving the mismatch guard only protects a build that already recorded its
target, which `CLOUDFLARE_ENV=preview` is what makes true.

`env.preview.name: "drawerforge-preview"` in `wrangler.jsonc` is still kept
— it is still what determines the deployed Worker's actual name once the
build correctly selects that block — but the wrangler.jsonc comment above it
and this decision are rewritten to state the real mechanism (`CLOUDFLARE_ENV`
at build time) rather than the deploy-time `--env` claim that review found
incorrect.

**Proof this cannot silently regress again:** `tests/wrangler-preview-env.test.mjs`
asserts, against a real `CLOUDFLARE_ENV=preview` build's
`dist/server/wrangler.json`, that `name === "drawerforge-preview"` and
`targetEnvironment === "preview"`. `npm run test:deploy-config`
(`CLOUDFLARE_ENV=preview npm run build && node --test
tests/wrangler-preview-env.test.mjs`) runs it. The CI `deploy` job's first
real step, "Prove the preview build targets the separate Worker", runs this
script **unconditionally** (no secrets needed) on every push and pull
request — see D-1107 — so a future change that reverts `deploy:preview`
back to a bare `vinext deploy --preview` fails CI loudly, with no Cloudflare
account needed to catch it, instead of only failing silently against a real
account by overwriting production.

**D-1107. The CI `deploy` job's real deploy steps are gated on one job-level boolean; its two proof/check steps are not.**
Chosen:
```yaml
env:
  DEPLOY_ENABLED: ${{ secrets.CLOUDFLARE_API_TOKEN != '' && secrets.CLOUDFLARE_ACCOUNT_ID != '' }}
```
at the job level. `checkout`, `setup-node`, `Install`, "Prove the preview
build targets the separate Worker" (D-1106), and "Check PUBLIC_ORIGIN is
wired up" (D-1112) always run, unconditionally. Only "Deploy preview" and
"Deploy production" carry `if: env.DEPLOY_ENABLED == 'true'` (plus the
event-name/ref check that picks between them). `needs: [verify, browser]` —
the job also does not start until both existing jobs succeed. Neither
`verify` nor `browser` gained a single changed line in either commit that
built this job (confirmed both times with `git diff
.github/workflows/ci.yml`, restricted to the lines before the `deploy:` job
key).

This revises this sprint's first commit, which gated every step, including
checkout, on `DEPLOY_ENABLED` — reasoned there as making a
secrets-absent run a true no-op. Found in review: that also meant the
preview-config regression guard (D-1106) and the PUBLIC_ORIGIN check
(D-1112) never ran at all without secrets configured, which is exactly the
"fails silently instead of loudly" failure mode both were meant to close.
Reason for the revision: a secret cannot be read directly inside a job- or
step-level `if:` reliably, so the boolean is still computed once, in one
place, and every step that actually talks to Cloudflare still reads it. But
"never fails or blocks a pull request when secrets are absent" is a
guarantee about the two real deploy commands specifically (they need a live
account and must not gate the rest of the pipeline on having one) — it was
never a requirement that the *whole job* do zero work without secrets. The
two proof/check steps need no Cloudflare account and cost a normal
`npm ci` plus one or two builds (a few seconds each locally; see
Measurements), and now catch a configuration regression on every push and
pull request, including from a fork with no secrets at all — which is a
strictly better outcome than the fast-no-op version, at a small, bounded CI
cost.

**D-1108. No `account_id` in `wrangler.jsonc`; `CLOUDFLARE_ACCOUNT_ID` is an environment variable only, at deploy time.**
Chosen: `wrangler.jsonc` has no `account_id` field. The `deploy` CI job step
sets `CLOUDFLARE_ACCOUNT_ID` (and `CLOUDFLARE_API_TOKEN`) from repository
secrets, matching vinext's own documented alternative to hardcoding the
account ID in the config file.
Reason: this repository has no known Cloudflare account to hardcode, and
even if it did, the account identifier does not belong in source control per
the spec's own Risks section ("Secrets in CI. Use repository secrets only;
never write a token into a file.") — account ID is not a secret exactly, but
treating it the same way keeps one rule instead of two and keeps the config
file portable across whichever account eventually owns this Worker.

**D-1109. `worker/index.ts` stays as a small forwarding entry; it is not deleted in favor of pointing `main` straight at `vinext/server/app-router-entry`.**
Chosen: `wrangler.jsonc`'s `main` still points at `./worker/index.ts`, which
now does nothing but call `handler.fetch(request, env, ctx)`.
Alternative: vinext's own README notes that "for apps without image
optimization, you can use `vinext/server/app-router-entry` directly in
`wrangler.jsonc`" (`"main": "vinext/server/app-router-entry"`), removing the
file entirely.
Reason: document 07's Phase 1 plan says to keep "vinext, the Cloudflare Vite
plugin, App Router source, and Worker entry" while removing the Sites-only
coupling — it lists the Worker entry as something to keep, not remove. A
one-line forwarding file also stays the natural place for any future
request-level Worker logic (a header, a redirect, a binding) without
reintroducing a config-file indirection later.

**D-1110. `.wrangler/**` is added to ESLint's ignored globs.**
Found while validating this sprint's own config with `wrangler deploy
--dry-run`: that command leaves a bundled Worker copy under
`.wrangler/tmp/deploy-*/index.js`. `.wrangler/` is already gitignored (it was
before this sprint), but nothing previously excluded it from `npm run lint`
— there was no reason to, because nothing in this repository ever created
that directory before `wrangler.jsonc` existed. With `wrangler.jsonc` now
present, a dry-run, `vinext dev`, or `vinext start` can populate it, and
`eslint`, given no ignore rule, walked into a large bundled vendor file
inside it (a Wrangler build byproduct, not a source file) and reported two
real-looking errors (`@next/next/no-assign-module-variable`) against
minified third-party code. Chosen: add `.wrangler/**` next to the existing
`.next/**`, `out/**`, `build/**` ignores in `eslint.config.mjs`, the same
treatment already given to every other generated-code directory. Confirmed
the fix: reproduced the two errors with the directory present, added the
ignore, reproduced a clean `npm run lint` with the same directory present.

**D-1111. `compatibility_date` is pinned to `2026-05-15`, the workerd release actually installed here, not to the date this sprint happened to run on.**
Found in review: the first commit's `2026-09-02` (today's date, at the time)
is ahead of the workerd version installed in this environment
(`2026-05-15`), which makes Miniflare fall back with a warning locally, and
which a real Cloudflare account can reject outright if that account's
current workerd release does not yet support a future-dated compatibility
date. Chosen: pin `2026-05-15` instead. `process.env` population from
`vars` under `nodejs_compat` (D-1102) only needs a compatibility date of
2025-04-01 or later, so this pin changes nothing else this sprint relies
on — confirmed by re-running the origin-resolution check in section 4.3
against a fresh build with this date and getting the same result. A pinned
date is, by design, a value someone updates deliberately later (document 07,
Phase 2: "Pinned compatibility date"), not one that silently drifts forward
with the calendar on every rebuild.

**D-1112. A CI step warns, loudly but non-fatally, if `PUBLIC_ORIGIN` is not wired up and the built page would still ship the `localhost:3000` default.**
Chosen: `scripts/check-public-origin.mjs` renders the built app's `/` route
exactly the way `tests/rendered-html.test.mjs` does, and checks the
rendered HTML for the literal string `localhost:3000`. If found, it prints
a `::warning::`-annotated line (surfaced prominently in the GitHub Actions
UI) naming why — either `PUBLIC_ORIGIN` is unset, or it is set but did not
take effect (an invalid URL falls back silently per D-1103). It never fails
the job. The CI `deploy` job's "Check PUBLIC_ORIGIN is wired up" step runs
this with `PUBLIC_ORIGIN: ${{ vars.PUBLIC_ORIGIN }}` — a repository
**variable**, not a secret, since this value is not sensitive.
Reason: as shipped after this sprint's first commit, a real deployment with
no further configuration emits `http://localhost:3000` in `og:url` and
every image URL, with nothing pointing that out. This check catches exactly
that, on every push and pull request (D-1107), before a first deploy
happens.
**This does not, by itself, make the deployed origin correct.** Confirmed
by inspecting how `wrangler deploy`/`vinext deploy` resolve `vars`:
Cloudflare Worker `vars` come from `wrangler.jsonc`'s own `vars` field,
resolved at deploy time from the config file, not from the deploying
process's shell environment — `wrangler deploy` does expose a raw `--var
KEY:VALUE` flag for exactly this kind of override, but `vinext deploy` (what
`npm run deploy`/`deploy:preview` call) does not pass one through
(confirmed by reading `deployArgOptions` in `node_modules/vinext/dist/deploy.js`,
which has no `--var` equivalent). So setting the `PUBLIC_ORIGIN` repository
variable makes this warning stop firing in CI, but the real fix for a live
deployment is still the manual `wrangler.jsonc` edit in D-1105 and
Follow-up 1, once the Worker's actual URL is known. This check is a
proactive reminder that the manual step still needs doing, not a
replacement for it — see the comment inside the script itself, and the CI
step's own comment.

**D-1113. The `deploy` job gets its own concurrency group, `cancel-in-progress: false`, so an in-flight production deploy is never cancelled by a second push to `main`.**
Chosen:
```yaml
concurrency:
  group: deploy-cloudflare-${{ github.ref }}
  cancel-in-progress: false
```
on the `deploy` job specifically, alongside the workflow-level
`concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`
that already existed (unchanged) for the whole workflow.
Reason, found in review: the workflow-level `concurrency` block cancels an
*entire in-progress run* — every job in it, `deploy` included — the moment a
new run starts on the same ref. A second push to `main` while a production
deploy from the first push is still running would have killed that deploy
mid-flight. A job-level `concurrency` block replaces, rather than adds to,
the workflow-level group for that one job (GitHub Actions' documented
behavior: a job with its own `concurrency` key is governed by that group
instead of the workflow's), so `verify` and `browser` keep their original
cancel-on-supersede behavior — still useful for superseded lint/test runs —
while `deploy` now queues instead of cancelling, and never interrupts a
deploy that is actually reaching Cloudflare.

**D-1114. `wrangler.jsonc`'s `main` field carries a comment stating it is a build-time input only.**
Found in review: `main: "./worker/index.ts"` names a vinext virtual entry
that only `@cloudflare/vite-plugin`'s build step can resolve into the
bundled, redirected config at `dist/server/wrangler.json` — a bare
`wrangler deploy` run directly against `wrangler.jsonc`, with no prior
build, cannot resolve it (this is also why `npm run deploy`/`deploy:preview`
always build first; see D-1109's forwarding-entry design, unchanged by this
finding). Chosen: added a comment directly above `main` in `wrangler.jsonc`
saying so, and naming the two npm scripts that always build first. No code
changed — this is a documentation-only fix directly in the file most
likely to be read in isolation by someone about to run a raw `wrangler`
command.

---

## 3. Deviations from the spec

1. **`deploy:preview` deploys a separate named Worker, not a Version Preview upload.**
   Document 07's Phase 3 table describes `deploy:preview` as "build, then
   upload a preview version," which reads as Wrangler's `versions upload`
   mechanism (an unpublished, URL-previewable version of the *same* Worker).
   What is actually wired up is `vinext deploy --preview`, which runs
   `wrangler deploy --env preview` — a full deploy to a second, separately
   named Worker (`drawerforge-preview`; D-1106). Reason: `vinext deploy` has
   no built-in "versions upload" mode; its only preview mechanism is
   `--preview`/`--env`. Hand-rolling raw `wrangler versions upload` /
   `wrangler versions deploy` commands outside vinext's own documented,
   tested deploy path would add scripting this sprint cannot exercise
   end-to-end anyway (no live account here) for no proven benefit over the
   built-in flag. A separate named Worker still gives an isolated preview
   surface that never touches production, which is the functional intent
   both document 07's Phase 0 destination description ("Preview versions
   from other branches") and this sprint's own Acceptance section ask for.
2. **`README.md` and `eslint.config.mjs` are touched, though neither is named in the spec's Deliverables list.**
   `README.md`: the spec's Deliverables list "Configuration, scripts, CI job"
   — the new `deploy`/`deploy:preview` scripts need documenting for anyone
   reading the README's existing Commands block, and the common brief's own
   rule is "README.md ... updated only where your spec says so," which this
   sprint's own scope (adding scripts, adding deploy config) implies for the
   Commands list. `eslint.config.mjs`: see D-1110 — required to keep `npm
   run lint` passing once `wrangler.jsonc` exists, which is squarely this
   sprint's own Scope item 1 causing the need. Both are small, one-purpose,
   non-contract changes; neither touches a `ProductDefinition` member, the
   kernel, or product files.
3. **Phases 4 and 5 of document 07 are not attempted.** Cloudflare Builds
   (a dashboard-side, GitHub-App-connected trigger) is a different mechanism
   from the GitHub-Actions-plus-`wrangler`-CLI CI job this sprint actually
   built; document 07 describes Cloudflare Builds specifically, and this
   sprint's own spec (Scope item 5) asks for "a CI job that deploys," which
   is what a GitHub Actions job naturally is. No Cloudflare Builds
   dashboard configuration was attempted or is possible from here. See Open
   issue 5.

---

## 4. Measurements

### 4.1 `wrangler deploy --dry-run` validation, corrected after the blocking review finding (D-1106)

The dry-runs below build twice — once as an ordinary (production) build,
once with `CLOUDFLARE_ENV=preview` set — because that variable, not
`wrangler deploy --env`, is what actually selects which `wrangler.jsonc`
environment block a build resolves into. See D-1106 for the full mechanism
and the evidence that the original, deploy-time-only `--env preview` did
not work. All of the below ran with no Cloudflare credentials configured
(`wrangler whoami` was never run), confirming the config validates and
bundles with no account needed:

```
npm run build                                        # production build
CI=true npx wrangler deploy --dry-run                 # passes
CI=true npx wrangler deploy --dry-run --env preview    # passes (no --env check fires: targetEnvironment is unset)

CLOUDFLARE_ENV=preview npm run build                  # preview build
CI=true npx wrangler deploy --dry-run --env preview    # passes: matches targetEnvironment "preview"
CI=true npx wrangler deploy --dry-run                  # also passes: a redirected config's activeEnv is always topLevelEnv, already "preview" here
CI=true npx wrangler deploy --dry-run --env definitely-not-an-env  # now FAILS: "does not match the target environment 'preview'"
```

`CI=true` avoids Wrangler's interactive update-check prompt, which otherwise
hung indefinitely in this sandboxed environment (no interactive TTY) — a
local-environment quirk, not a config problem; GitHub Actions runners already
set `CI=true` by default, so the real CI job needs no extra flag for this.

`dist/server/wrangler.json`'s resolved `name` and `targetEnvironment`,
confirming the two builds really do produce different Worker identities:

| Build | `name` | `targetEnvironment` |
|---|---|---|
| `npm run build` (no `CLOUDFLARE_ENV`) | `drawerforge` | `null` |
| `CLOUDFLARE_ENV=preview npm run build` | `drawerforge-preview` | `preview` |

Both dry-runs completed with no errors and printed the same asset table
(the two builds bundle identical application code — only the Worker
identity in the config differs, as the table above shows):

| Measurement | Value |
|---|---|
| Modules attached to the Worker | 14 |
| Total upload | 3915.38 KiB |
| Total upload, gzip | 1025.98 KiB |
| Bindings | `env.ASSETS` (Assets) only — no D1, R2, KV, Images, queues |
| `dist/server/wrangler.json` bindings present | none beyond `assets`; `vars: {}`; `observability.enabled: true`; `compatibility_flags: ["nodejs_compat"]` |

`dist/server/wrangler.json`'s `definedEnvironments` correctly lists
`["preview"]` on both builds, confirming `wrangler.jsonc`'s `env.preview`
block is visible either way — the earlier, incorrect version of this
section took that as sufficient evidence that `--env preview` alone
resolved it; it is not (D-1106).

Also verified, end to end, with no `--dry-run` (stopping only at the point
that needs real Cloudflare credentials): `rm -rf dist .wrangler &&
CLOUDFLARE_ENV=preview npx vinext deploy --preview` built successfully,
correctly produced the `drawerforge-preview`/`preview` config above, and
only then failed at Wrangler's own "In a non-interactive environment, it's
necessary to set a CLOUDFLARE_API_TOKEN" error — exactly the point this
sandbox cannot go further, and exactly the same point a real CI run without
secrets stops at too (D-1107).

### 4.2 Build asset sizes (unchanged by this sprint, re-measured for the record)

| Asset | Size |
|---|---|
| `dist/client/assets/ProductApp-*.js` | 599,919 bytes (≈586 KB) |
| `dist/client/assets/generation.worker-*.js` | 53,902 bytes (≈52.6 KB) |
| `dist/client/assets/manifold-*.wasm` | 541,470 bytes (≈529 KB) |
| `dist/server/ssr/assets/manifold-*.wasm` (duplicate; see Open issue 3) | 541,470 bytes (≈529 KB) |
| `dist/server/ssr/assets/generation.worker-*.js` (duplicate) | 53,902 bytes |

These four numbers, and the duplication, match `12_WEB_WORKER_GENERATION_NOTES.md`
section 3.3 and open issue 5 closely (574/53/541 KB there vs. 586/52.6/529 KB
here — the small differences are normal build-to-build variance, not a
regression). The duplication is unrelated to this sprint's changes and is not
this sprint's to fix (see Open issue 3).

### 4.3 Origin resolution, verified against the actual built worker

Built the app, then imported `dist/server/index.js` directly (the same way
`tests/rendered-html.test.mjs` does) and rendered `/` under two conditions:

| `PUBLIC_ORIGIN` in `process.env` | Rendered `og:url` |
|---|---|
| unset | `http://localhost:3000` |
| `https://drawerforge.example.workers.dev` | `https://drawerforge.example.workers.dev` |

### 4.4 Test counts

| Check | Count |
|---|---|
| `npm test` | 222 cases, 13 files, all pass (was 212 cases, 12 files, before this sprint) |
| `npm run test:ssr` | 5 cases, all pass |
| `npm run test:browser` | 10 cases, all pass (with `CI=true`; see section 4.5) |
| `npm run test:deploy-config` | 1 case, all pass — the preview-Worker-identity proof from the review fix (D-1106) |
| `tests/origin.test.ts` (new) | 10 cases |
| `tests/wrangler-preview-env.test.mjs` (new, review fix) | 1 case |

### 4.5 Browser suite: a local-only flake, and the run that actually matters

The first local `npm run test:browser` run (without `CI` set) failed 6 of 10
tests with `net::ERR_CONNECTION_REFUSED`, after the first two tests passed.
Investigated before concluding anything: started `npm run start` standalone
and polled it with plain `curl` for over 60 seconds with no Playwright
involved at all — it never went down. That ruled out an idle-timeout or a
crash intrinsic to the production server. The actual cause was
`playwright.config.ts`'s `webServer.reuseExistingServer: !process.env.CI` —
locally, with `CI` unset, this is `true`; earlier in the same session a
manually started `npm run start` on port 3000 had been stopped, but the
combination of that manual start/stop cycle and Playwright's own
reuse-detection left the suite's spawned server in a state a plain,
CI-faithful invocation does not hit. Re-ran with `CI=true` set (which is
exactly what a GitHub Actions runner sets automatically, and is what
`reuseExistingServer` is designed to key off) and got a clean 10/10 pass:

```
Running 10 tests using 1 worker
 ✓ accessibility.spec.ts (6.3s)
 ✓ design-file.spec.ts (17.2s)
 ✓ fit-test.spec.ts (6.9s)
 ✓ performance-budget.spec.ts × 3 (2.0s, 4ms, 3ms)
 ✓ route-navigation.spec.ts (11.2s)
 ✓ storage-migration.spec.ts (18.0s)
 ✓ viewer-heavy.spec.ts (17.3s)
 ✓ worker-smoke.spec.ts (13.2s)
 10 passed (1.6m)
```

This matches `25_BROWSER_QA_NOTES.md` section 3.1's baseline almost exactly
(1.5-1.9 minutes there, 1.6 minutes here), which is the expected result: this
sprint did not touch `app/`, `lib/generation/`, `lib/workspace.ts`, or any
product/geometry code that the browser suite exercises — only the origin
resolution in `app/layout.tsx`, which none of these specs assert on. The
`CI=true` run is the one that reflects what the real `browser` CI job will
do; the first, non-`CI` run was a local artifact of manual server juggling,
not a regression, and is recorded here rather than silently discarded.

---

## 5. Open issues

1. **The WASM MIME type (document 12, open issue 1) is still open locally, unchanged by this sprint.** `curl -sI http://localhost:3000/assets/manifold-*.wasm` against `vinext start` still returns `Content-Type: application/octet-stream`. This sprint added no code to change local static-file serving — the fix, per document 12 and this sprint's own Scope item 6, is expected to come from Cloudflare Workers Assets on the real deployed origin, not from local server configuration. Verifying that is the first item in the Acceptance checklist below, and needs a live deployment this environment cannot produce.
2. **Closed on 2026-09-02, after the first real deploys.** `wrangler.jsonc` now sets `vars.PUBLIC_ORIGIN` to `https://drawerforge.joseph-r-fehr.workers.dev` (production, CI run 33683252086) and `env.preview.vars.PUBLIC_ORIGIN` to `https://drawerforge-preview.joseph-r-fehr.workers.dev` (preview, pull request 10). `tests/wrangler-preview-env.test.mjs` now also asserts the preview build carries the preview value, because Wrangler does not inherit `vars` into a named environment. Acceptance row 4 can be run against the next deploy of each Worker. The original text follows. `vars.PUBLIC_ORIGIN` is not set in `wrangler.jsonc`. See Decision D-1105. This is a required manual step after the first real deploy, not a defect — `resolvePublicOrigin()`'s `localhost` fallback keeps rendering correct in the meantime, just with a locally-scoped Open Graph URL until the operator fills it in. See Follow-up 1. The CI `deploy` job's "Check PUBLIC_ORIGIN is wired up" step (D-1112) warns about this on every push and pull request in the meantime, but does not set it — see that decision for why a CI-time environment variable cannot set a Cloudflare Worker's real `vars` by itself.
3. **The duplicate WASM/worker-chunk asset in the SSR server bundle (document 12, open issue 5) is still present**, re-measured in section 4.2 (≈529 KB and ≈52.6 KB doubled). It inflates the Wrangler upload total measured in section 4.1. This is a build-configuration issue (the vinext SSR environment's asset handling), not a deploy-configuration one, and is out of this sprint's Scope (`vite.config.ts`'s environment wiring is the only file this sprint touches there, and only to remove the Sites plugin and inline binding config — not to change SSR asset emission).
4. **No live deploy could be exercised.** This environment has no Cloudflare account, no `CLOUDFLARE_API_TOKEN`, and no `CLOUDFLARE_ACCOUNT_ID`. Every acceptance item that needs a real origin is deferred to a human with account access; see the checklist in section 6.
5. **This sprint delivers a GitHub-Actions-plus-`wrangler`-CLI deploy job, not the Cloudflare Builds dashboard integration document 07's Phase 4 describes.** Both reach the same goal (production from `main`, previews from other branches/PRs) through different mechanisms: Cloudflare Builds is configured entirely on Cloudflare's side (a GitHub App connection, no workflow file), while this sprint's `deploy` job runs from this repository's own `.github/workflows/ci.yml` and needs only the two repository secrets named in the checklist below. If the project instead wants Cloudflare Builds specifically, that is a Cloudflare-dashboard task for whoever holds the account, not a repository change — document 07 stays the reference for that path if it is chosen later.

---

## 6. Acceptance checklist

Every row below needs a live Cloudflare deployment. **None of them are done
in this sprint** — this environment has no Cloudflare credentials, and Scope
item 7 (the version 1 storage key) is explicitly deferred past this
checklist's sign-off. Run these, in order, after the first `npm run
deploy:preview` succeeds from a machine or CI run with
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set.

| # | Item | Command | Look for | Status |
|---|---|---|---|---|
| 1 | Preview deploys cleanly | `npm run deploy:preview` (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) | Wrangler prints a `*.workers.dev` URL, no errors | Done 2026-09-02 from CI on pull request 10: `https://drawerforge-preview.joseph-r-fehr.workers.dev`, Worker startup 54 ms. The merge to `main` then deployed production: `https://drawerforge.joseph-r-fehr.workers.dev`, startup 26 ms |
| 2 | The app and worker chunk load | Open the printed URL in a browser | The page reaches the "Ready" preview state, no console errors beyond the two already-filtered, dev-only WASM warnings (which should not appear at all on this origin — see item 3) | Not done here — needs a deployed origin |
| 3 | The WASM file serves as `application/wasm` | `curl -sI https://<preview-url>/assets/manifold-<hash>.wasm` (hash from `dist/client/assets/`) | `content-type: application/wasm`, not `application/octet-stream` — this closes document 12's open issue 1 | Not done here — needs a deployed origin |
| 4 | `PUBLIC_ORIGIN` reflects the real URL | View source on the deployed page, or `curl -s https://<preview-url>/ \| grep 'og:url'` | The Open Graph URL matches the deployed origin, not `http://localhost:3000` — this needs Follow-up 1 (set `vars.PUBLIC_ORIGIN`) done first | Not done here — needs Follow-up 1, then a deployed origin |
| 5 | The browser suite passes against the preview | `playwright.config.ts` always starts its own local `npm run start` server and points at it (`webServer.command`, `use.baseURL`). Running the existing suite against a real deployed URL instead needs a temporary local edit — for example, comment out the `webServer` block and set `use.baseURL` to the preview URL — then `npx playwright test`. This file is outside S11's Scope (owned by sprint S10), so no such variant is checked in. | 10/10 pass, same as the local `CI=true` run in section 4.5 | Not done here — needs a deployed origin, and the manual config step above |
| 6 | A design file saved on the old origin opens on the new one | On the current (Sites) origin: enter a design, select "Save design file". On the new preview origin: select "Open design file" and choose that file. | The design's parameters match exactly; no error message | Not done here — needs both origins live |
| 7 | Slice and compare | Download the STL from the new origin, load it in a slicer, compare outside dimensions to a known-good print from before the migration | Dimensions match within slicer tolerance | Not done here — needs a deployed origin |
| 8 | The old deployment stays live | Confirm the previous Sites URL still responds, until every row above is signed off | 200 response, app loads | Not done here — this is a "do not do X" policy item, not a test to run; whoever manages the Sites deployment should confirm it has not been retired |

Only after every row above is signed off does document 07 Phase 5's step 7
apply ("Retire/archive the old Sites deployment"), and only then does Scope
item 7 (removing the version 1 storage key) become appropriate — see
Follow-up 4.

---

## 7. Rollback

### 7.1 What this sprint changed, for rollback purposes

This sprint's changes are one thing to roll back: a single set of related
commits in this worktree/branch, not a live cutover. Nothing in this sprint
deploys anything — `wrangler.jsonc` and the CI `deploy` job exist, but no
deploy has run from here. Rolling back at this stage is exactly `git revert`
(or simply not merging), which is unremarkable and was not further rehearsed
beyond confirming the change is a clean, isolated diff (`git status` shows
only the files listed in section 1.1; nothing under `dist/`, `.wrangler/`,
or `node_modules/` was staged).

### 7.2 Rollback after a real cutover (for whoever runs Phase 5)

Document 07's own rollback section already states the policy this sprint
does not change: "A failed Worker cutover should not require source rollback
to restore user access; point users back to the still-live Sites URL while
diagnosing," and "Do not delete the current Sites deployment during initial
Worker validation." That policy is unaffected by anything in this sprint —
no code here retires or touches the Sites deployment (see the Acceptance
checklist, row 8).

If a bad Worker version is already live and needs reverting (as opposed to
just pointing users back at Sites while the Worker is fixed), Wrangler has a
first-class command for it:

```
wrangler versions list          # find the previous, known-good version id
wrangler rollback <version-id>  # roll the Worker back to it
```

### 7.3 What was rehearsed, and what was not

| Step | Rehearsed here? | Result |
|---|---|---|
| `wrangler deploy --dry-run` validates the config with no live account | Yes | Passed, twice (production and `--env preview`); see section 4.1 |
| `npm run build && npm run start` still serves the full app after every Sites-coupling removal | Yes | Passed — `curl` returned 200, the WASM asset existed at its expected path, `npm run test:ssr` passed 5/5 |
| The commit is a clean, revertible unit | Yes, by inspection | `git status` before committing showed exactly the files in section 1.1, nothing else; a plain `git revert` would undo exactly this sprint's changes |
| `wrangler rollback` and `wrangler versions list` exist and take the expected arguments | Yes, via `--help` (no account needed) | Both commands exist, matching the usage in section 7.2 |
| An actual deploy, then an actual rollback between two live Worker versions | No | Needs a Cloudflare account; not possible from this environment |
| Whether the old Sites URL is currently live and reachable | No | Outside this sandbox's visibility — confirm with whoever manages the Sites deployment before retiring it (Acceptance checklist, row 8) |

---

## 8. Observability

`wrangler.jsonc` sets `observability.enabled: true` — Cloudflare's stored
Workers Logs, queryable in the dashboard. With no further `logs`/`traces`
sub-configuration, this uses Cloudflare's defaults: `invocation_logs`
(request method, URL, status, duration, colo, and similar per-request
metadata; default on), plus anything the Worker itself writes to the console.

The app itself writes nothing to the console: `grep -rn "console\."
app/ lib/ worker/` (excluding `node_modules`) returns no matches, confirmed
during this sprint. So Workers Logs, as configured here, can only ever record
request-shaped metadata (path, status, timing) — never a design name or a
drawer dimension, because nothing in the code path ever puts either of those
into a log call. This satisfies the spec's Risks section directly ("The spec
forbids logging dimensions or design names in any telemetry.") without this
sprint adding any redaction logic, because there is nothing to redact.

---

## 9. Follow-up action items

In order.

1. **Done on 2026-09-02**, see Open issue 2 for the values. Once the first real deploy reveals the Worker's actual `*.workers.dev`
   URL(s), set `vars.PUBLIC_ORIGIN` in `wrangler.jsonc` (production) and
   `env.preview.vars.PUBLIC_ORIGIN` (preview), per the comment already left
   in that file. See D-1105, Open issue 2. **This follow-up did nothing
   until D-1106's blocking fix landed**: `env.preview` (and anything nested
   under it, including a `vars.PUBLIC_ORIGIN` added there) is only resolved
   into the build when `CLOUDFLARE_ENV=preview` is set at build time; before
   `deploy:preview` set that itself, a preview deploy always built and
   deployed the top-level (production) config regardless of what this
   follow-up added under `env.preview`. It is correct to act on now.
2. **Done on 2026-09-02**; pull request 10 ran the first preview deploy and its merge ran the first production deploy. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository
   secrets so the CI `deploy` job's two real deploy steps activate. Until
   they exist, those two steps are skipped on every push and pull request;
   the job's proof and warning steps (D-1106, D-1112) still run either way
   (D-1107).
3. Run the Acceptance checklist in section 6 against the first real preview
   deployment. Sign off every row, then follow document 07 Phase 5, step 7
   (retire/archive the old Sites deployment).
4. **After** the checklist above is signed off: remove the version 1 storage
   key, per Scope item 7 and `14_WORKSPACE_STORAGE_NOTES.md` Decision D-403 /
   open issue 2. Exact code to remove, in `lib/workspace.ts`: the
   `LEGACY_DESIGN_KEY` constant, the `LEGACY_MIGRATED_MARKER` constant, the
   `readLegacyDesign()` function, the `markLegacyMigrated()` function, and
   its one call site inside the read-workspace path (the line that calls
   `markLegacyMigrated(storage)` right after a successful migration write)
   that falls back to the legacy record when no envelope exists yet. Also
   update `tests/workspace.test.ts`'s five migration cases,
   `tests/app.integration.test.tsx`'s version-1-migration case, and
   `tests/browser/storage-migration.spec.ts`, all of which currently exercise
   this path and will need rewriting or removing alongside it. Deliberately
   not done in this sprint — see the spec's own Scope item 7 and this
   document's Acceptance checklist, section 6.
5. Once row 3 of the Acceptance checklist (the real WASM MIME type) is
   confirmed, consider narrowing or removing the two-substring console-error
   filter in `tests/browser/support.ts`'s `collectPageErrors()`
   (`25_BROWSER_QA_NOTES.md` Decision D-1003, follow-up 2) — it exists only
   for the `application/octet-stream` warning this sprint's own checklist
   item 3 is meant to retire on the real origin. Leaving the filter in place
   costs nothing either way if it is not removed immediately.
6. Investigate document 12's open issue 5 (the duplicate ~529 KB WASM and
   ~52.6 KB worker-chunk asset in the SSR server bundle, re-measured in
   section 4.2 of this document). It is not this sprint's to fix (build
   configuration, not deploy configuration) but it does inflate the Wrangler
   upload measured in section 4.1, and would be a reasonable next target for
   whichever sprint next touches `vite.config.ts`'s SSR environment.
