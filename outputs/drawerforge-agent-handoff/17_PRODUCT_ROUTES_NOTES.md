# 17. Product Routes Notes

Date: 2026-09-02
Status: Implemented on this branch. Revised after the independent review of
commit 472bdb1; see the "Revision" rows in the file table and section 2 for
what changed.
Sprint: S02, per document 15_SPRINT_PLAN.md and sprints/S02_PRODUCT_ROUTES.md.
Reads with: 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 1.3, 12_WEB_WORKER_GENERATION_NOTES.md section 4 item 2.

This document records the per-product route, the not-found page, the
favicon, the product switcher, and the header move out of `ProductApp`.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/products/types.ts` | Added `title` and `description` to `ProductCopy`. |
| `lib/products/drawer-tray/copy.ts` | **New in the revision.** Kernel-free: `DRAWER_TRAY_ID` and the whole `DRAWER_TRAY_COPY` object, with no geometry or kernel imports. Split out of `index.ts` so a plain-Node test can import it directly. See D-603. |
| `lib/products/drawer-tray/index.ts` | Now imports `DRAWER_TRAY_ID` and `DRAWER_TRAY_COPY` from `./copy` and re-exports both, instead of declaring the id and the copy object inline. |
| `lib/products/registry.ts` | **New in the revision.** Added `findProduct(id): AnyProduct \| undefined`. `getProduct` now calls it instead of repeating the same `.find()`. |
| `app/products/[id]/page.tsx` | Reads the `id` route param, resolves the product with `findProduct` from the registry (no local copy of that lookup), renders `ProductApp`. Calls `notFound()` for an unknown id. `generateMetadata` reads `product.copy.title` and `product.copy.description`. |
| `app/not-found.tsx` | Lists a link to every registered product. Rendered for `/products/<unknown>` and for any unmatched path. **Revision:** `metadata` is now typed `Metadata`, with a comment pointing at section 5.1 below, since it does not currently reach the response. |
| `app/favicon.ico` | A 32x32 icon: a rounded ink square holding two rounded cells, amber and copper, standing for a tray with a divider. No text. |
| `app/components/ProductSwitcher.tsx` | Client component. Lists every registered product as a link to its route, from the registry. Highlights the current route with `usePathname()`. |
| `app/layout.tsx` | Carries the header now: the brand lockup (a link to `/`) and the product switcher. |
| `app/page.tsx` | `/` still renders the drawer tray. Its metadata now reads `getProduct(DEFAULT_PRODUCT_ID).copy` instead of a literal title and description. |
| `app/components/ProductApp.tsx` | Header brand markup removed. The save-state indicator and the reset-defaults button moved into a `panel-toolbar` row inside the parameter panel, so the component renders only product content. **Revision:** the document-title effect now sets `product.copy.title` directly on every run instead of capturing `document.title` once; see D-605. |
| `app/globals.css` | Removed the header's brand-only styles from `.drawerforge-app`; added `.panel-toolbar`, `.product-switcher-list`, `.product-switcher-item`, `.not-found-page`, `.not-found-card`, `.not-found-list`. Fixed a mobile rule that would have hidden the save-state indicator now that it lives outside the header. **Revision:** added `a:focus-visible` to the focus-ring selector, so the brand link, the switcher links, and the 404 links all get it; added a `--header-height` custom property (72px at `:root`, 58px under the existing `max-width: 639px` query) and pointed `.app-header`, `.configurator-shell`, and `.not-found-page` at it instead of each repeating the literal header height. |
| `tests/rendered-html.test.mjs` | SSR test. Routes covered: `/`, `/products/drawer-tray`, `/products/<unknown>`, `/favicon.ico`. **Revision:** the title and description assertions now `import()` `lib/products/drawer-tray/copy.ts` directly, rather than reading and pattern-matching `index.ts` as text; see D-603. The 404 test's product-id list still reads source text, for the reason given there. |
| `tests/app.integration.test.tsx` | One case: the document title carries the design name while a name is set, and reverts when the name is cleared. **Revision:** the test now sets `document.title` to an unrelated value before rendering, so the restore assertion is not vacuously true against jsdom's default `""`. |
| `tests/products.test.ts` | **New in the revision.** One case per registered product: `copy.title` and `copy.description` are non-empty strings. |

### 1.2 Route map

| Path | Renders | Status |
|---|---|---|
| `/` | The drawer tray, `ProductApp` keyed on `drawer-tray` | 200 |
| `/products/drawer-tray` | The same drawer tray build | 200 |
| `/products/<unknown>` | `app/not-found.tsx`, with a link to every product | 404 |
| `/favicon.ico` | The icon file | 200 |

### 1.3 Test results

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass, 113 cases (was 111 before this sprint; 112 before the review fixes) |
| `npm run test:ssr` | Pass, 5 cases (was 2 before this sprint) |
| Real Chromium smoke | See section 4 |

---

## 2. Decisions

**D-601. `ProductCopy.title` and `ProductCopy.description` carry the page metadata.**
The spec asks for this directly. `generateMetadata` on the product route, and
the static `metadata` export on `/`, both read these two fields instead of a
literal string, so a second product's route needs no page-shell change.

**D-602. One `app/not-found.tsx` boundary serves every not-found case.**
`app/products/[id]/page.tsx` calls `notFound()` for an unknown id. A path
that matches no route at all also renders this same file, through vinext's
`/_not-found` fallback. One file, one test, one place that lists every
product.

**D-603. The drawer tray's id and copy live in a kernel-free `copy.ts`, so the SSR test can `import` them directly. (Revised.)**
`tests/rendered-html.test.mjs` runs under plain Node (`node --test`), not
Vite or Vitest. `lib/products/drawer-tray/index.ts` imports the geometry
kernel, which imports `manifold-3d` with a Vite-only `?url` asset import
(`manifold.wasm?url`). Plain Node cannot resolve that import, with or
without TypeScript stripped, so `index.ts` cannot be imported directly in
this file — that part of the original decision still holds.
The original build of this sprint worked around it by reading `index.ts`
as text and pulling `title` and `description` out of the `copy: { ... }`
block with a scoped regular expression. The review called this out: Node
22 strips a `.ts` file's types unflagged, and a specifier that already
names its extension resolves fine under plain Node's default ESM
resolution, so the real fix is to give the drawer tray's id and copy their
own file with no geometry or kernel import to fail on, and import that
file for real. `lib/products/drawer-tray/copy.ts` now holds
`DRAWER_TRAY_ID` and the whole `DRAWER_TRAY_COPY` object; `index.ts`
imports both from there and re-exports them, so every existing import of
`DRAWER_TRAY_ID` from `lib/products/drawer-tray` still works. The test
does `await import(new URL("../lib/products/drawer-tray/copy.ts",
import.meta.url).href)` and reads `DRAWER_TRAY_COPY.title` and
`.description` off the real object.
The 404 test's product-id list is different: it needs the id of every
product the registry lists, not just the drawer tray, and `registry.ts`
itself still transitively imports the kernel (through `index.ts`), so it
still cannot be imported directly either. `readProductIds` now checks
each product folder for a `copy.ts` first and imports it for real when one
exists (as it does for `drawer-tray`); a product folder without one falls
back to reading `index.ts` as text, the same technique as before. This
keeps the test correct for a second product that has not been split into
a kernel-free copy file yet, while using the real import wherever
possible today.
A loader-based fix (a custom ESM resolve hook that appends `.ts` to
extensionless specifiers) was tried for the original version of this
decision; it clears the extension problem but not the WASM-import problem
in `index.ts`, so it would not have helped there either. It is not needed
now that `copy.ts` has no import for it to trip on.

**D-604. The switcher shows one item today, and still renders when there is one product.**
The spec asks for this explicitly ("With one product it shows one item").
The alternative is to hide the switcher entirely below two products, so a
solo product does not carry a one-item menu. This build keeps it visible: a
visible, if trivial, switcher confirms which product a page builds, which
matters more once a not-found page or an open design file names a product
by its label. Hiding it below a product count is a one-line change in
`ProductSwitcher.tsx` if a later sprint prefers it.

**D-605. The design name reaches `document.title` on the client, not through `generateMetadata`, and the effect reads `product.copy.title` fresh on every run rather than capturing `document.title` once. (Revised.)**
The design name lives in `localStorage`, read after mount. `generateMetadata`
runs on the server, before any client storage is readable, so it cannot
know the name.
The original build had a `useEffect` in `ProductApp` capture
`document.title` into a ref the first time it ran, and used that captured
value whenever the name was cleared. The review found the break: the
product switcher renders a `next/link` `Link`, so clicking it is a soft
navigation — no full page load, so the effect does not re-mount and the
ref keeps its old value. With a design name already set, following the
switcher to a different product would restore the *previous* product's
title once the name was cleared, not the new page's own title. (There is
only one product today, so this could not yet be reproduced end to end
with two different titles; the fix removes the capture on its own merits,
and a soft-navigation smoke run — section 4.3 — confirms the effect still
runs cleanly across it.)
The fix drops the ref. The effect now reads `product.copy.title` directly
every time it runs, with `product` in its dependency array alongside
`designName`: `document.title = trimmedName ? `${trimmedName} ·
DrawerForge` : product.copy.title;`. A plain page load, a save, a rename,
a clear, and a soft navigation between products (once a second product
exists) all reach the right title, because the effect never trusts a
value it saw on some earlier run.

**D-606. Only the brand lockup moved to the layout; the save-state indicator and the reset button stayed with the product.**
The spec says "move the header brand copy" into the layout. The save-state
indicator and reset-defaults button are not brand copy: they read and act on
the product's own state (`saveMessage`, `resetDefaults`). Moving them to a
server-rendered layout would need to thread client state up through it, for
no gain. They now sit in a `panel-toolbar` row at the top of the parameter
panel instead, inside `ProductApp`, which still satisfies "the component
renders only product content" since nothing here is brand chrome.

**D-607. `findProduct` lives in the registry; `app/products/[id]/page.tsx` does not repeat the lookup.**
The route file originally declared its own local `findProduct(id)`
wrapping `PRODUCTS.find(...)`, duplicating what `getProduct` already did
minus the throw. The registry now exports `findProduct(id): AnyProduct |
undefined` next to `getProduct`, and `getProduct` calls it instead of
repeating the same `.find()`. The route file imports `findProduct` from
the registry. One lookup, one place.

**D-608. The header height is one custom property, not a literal repeated in three places.**
`.app-header`'s height, `.configurator-shell`'s `calc(100dvh - <height>)`,
and (once `.not-found-page` was added) its own `calc(100dvh - <height>)`
each hardcoded `72px`, and only `.app-header` was updated to `58px` under
the existing `max-width: 639px` query — so `.not-found-page` overshot the
viewport by 14px on a narrow phone. `--header-height` is now set once on
`:root` (72px) and reassigned once inside the existing mobile query
(58px); all three rules read `var(--header-height)`. A later change to
either header height now only happens in one place.

---

## 3. Deviations from the spec

None found. Everything in Scope, Acceptance, and Tests is implemented as
written. D-603 above is a testing technique, not a scope change: the SSR
test still asserts the title and description "from `product.copy`, not
literals," as required; it now does so by importing the real object from
`lib/products/drawer-tray/copy.ts`.

---

## 4. Measurements

### 4.1 Build classification (the sprint's Risk item)

```
Route (app)
 ? /
 f /products/:id

f Dynamic  ? Unknown
```

`/products/:id` classifies as dynamic, as expected for a route with a
dynamic segment. `/` classifies as "Unknown" — vinext's static analysis does
not resolve that the root layout's `generateMetadata` calls `headers()`
(the layout is shared by every route, `/` included). This is informational,
not a build failure; `npm run build` completes and `/` serves correctly in
`npm run start`. Recorded so a later sprint does not treat "Unknown" as a
build error.

### 4.2 Local production server, `npm run build && npm run start`, then `curl`

| Path | Status | Content-Type |
|---|---|---|
| `/` | 200 | text/html |
| `/products/drawer-tray` | 200 | text/html |
| `/products/unknown` | 404 | text/html |
| `/favicon.ico` | 200 | image/x-icon |
| `/og.png` | 200 | (unchanged) |

Verified in this order, before the SSR tests were written, per the sprint's
Risk item.

### 4.3 Real Chromium smoke

Script: adapted from the shared Playwright harness, saved at
`/tmp/claude-0/-home-user-doma-forge/37456e99-0604-50e8-bff7-ba681087dedd/scratchpad/S02/route-smoke.js`. Steps: load `/`, wait for the first ready
preview, set the design name to "Left bench", confirm the title updates,
navigate to `/products/drawer-tray` (a full navigation), confirm the design
name and the title both carried over, navigate back to `/`, confirm the
design name is still there.

Result:

```json
{
  "titleOnRoot": "DrawerForge — Parametric Drawer Organizer",
  "titleAfterName": "Left bench · DrawerForge",
  "restoredName": "Left bench",
  "titleOnProductRoute": "Left bench · DrawerForge",
  "restoredNameOnRoot": "Left bench",
  "switcherCountOnRoot": 1,
  "switcherCountOnProductRoute": 1,
  "errors": [
    "wasm streaming compile failed ... falling back to ArrayBuffer instantiation"
  ]
}
```

The design restores on both routes, by name and by the parameters behind
it (the workspace record is keyed by product id, and `/` and
`/products/drawer-tray` render the same product id, so they read the same
`localStorage` entry). The switcher shows exactly one item on both routes,
each marked active for its own route. No page errors. The WASM
streaming-compile warning is the pre-existing issue recorded in document 12,
section 4, item 1 (wrong MIME type from `vinext start`); it is not new here.
Re-run after the review fixes (same server, same script): identical result.

**Soft-navigation check, added for D-605.** A second script,
`/tmp/claude-0/-home-user-doma-forge/37456e99-0604-50e8-bff7-ba681087dedd/scratchpad/S02/soft-nav-smoke.js`,
loads `/`, sets the design name to "Left bench", then clicks the switcher's
own `<a>` (a `next/link` `Link` — a soft navigation, not `page.goto`)
instead of navigating directly, and waits for the preview to be ready
again:

```json
{
  "titleBeforeSoftNav": "Left bench · DrawerForge",
  "titleAfterSoftNav": "Left bench · DrawerForge",
  "nameAfterSoftNav": "Left bench"
}
```

The title effect re-runs across the soft navigation without error and the
title stays correct. This confirms the fix does not regress the one
product that exists today; it does not yet exercise the specific failure
the review found (restoring the *previous* route's title), since that
needs two products with two different `product.copy.title` values to
show a visible difference. See Follow-ups item 2.

### 4.4 Test counts

| Suite | Before this sprint | After the first pass | After the review fixes |
|---|---|---|---|
| `npm test` | 111 | 112 | 113 |
| `npm run test:ssr` | 2 | 5 | 5 |

---

## 5. Open issues

### 5.1 The not-found page's own `metadata` export does not reach the response

`app/not-found.tsx` exports `metadata: Metadata = { title: { absolute:
"Page not found · DrawerForge" }, ... }`. The rendered `/products/unknown`
response still carries the root layout's default title, "DrawerForge", not
this one. The page content, the 404 status, and the product links all
render correctly; only the boundary file's own metadata is not merged.
This looks like a vinext limitation around metadata on boundary files
(`not-found.tsx`, and likely `forbidden.tsx` and `unauthorized.tsx` by the
same mechanism) rather than anything in this app. Not required by the
spec's Acceptance list. `app/not-found.tsx` now types the export as
`Metadata` and comments it with a pointer back to this section, so a
reader lands here instead of assuming the field is unused. Worth a small
follow-up once vinext's metadata merging for boundary files is confirmed
or fixed upstream.

### 5.2 `manifold-3d`'s WASM MIME type under `vinext start`

Unchanged from document 12, section 4, item 1. Seen again in the browser
smoke here. Not part of this sprint's scope.

### 5.3 This worktree needed `npm install` before its test suites would run

`npm test`, `npm run test:integration`, and the browser smoke all depend
on `node_modules` holding the real packages, not just the hoisted ones
visible through Node's parent-directory module resolution. Before this
sprint's `npm install`, Vite's dev-server file-system guard denied reading
`node_modules/manifold-3d/manifold.wasm` because that file resolved
outside the worktree's own root. This is an environment fact about the
multi-worktree setup, not a code change; recorded here in case another
sprint agent hits the same failure.

## 6. Follow-ups

1. Fix, or file upstream against vinext, the not-found boundary's own
   metadata not reaching the response (open issue 5.1).
2. When a second product ships, confirm the switcher reads well with more
   than one item; D-604 covers the choice to keep it visible at one. Also
   confirm the soft-navigation title fix (D-605) end to end with two
   different `product.copy.title` values — today there is only one product,
   so the smoke in section 4.3 exercises the navigation and the effect
   re-run, but not a visible before/after title difference.
3. Per-product Open Graph images, tabled by this sprint's Out of scope.
4. `ProductApp`'s title effect appends `" · DrawerForge"` to the design
   name; the root layout's `metadata.title.template` already reads `"%s ·
   DrawerForge"`. The two are not wired together — the effect does not run
   the template, it repeats its pattern by hand — so a change to the
   separator or the site name has to be made in both places today. Flagged
   by the review as a follow-up only, not a fix for this sprint.

## Notes to record

**How the worker returns 404 for an unknown product.**
`app/products/[id]/page.tsx` and its `generateMetadata` both call
`notFound()` (from `next/navigation`, resolved by vinext to its own shim)
when the id does not match a registered product. The framework catches
that call, renders the nearest `not-found.tsx` boundary — here, the one
root-level file — and sets the response status to 404. The same file and
status also cover a path that matches no route at all, through vinext's
`/_not-found` fallback route. Confirmed by direct `curl` against
`npm run start` before the SSR tests were written (section 4.2), and by
the SSR test suite (section 4.4).

**Whether the switcher should hide with one product.**
It does not; see D-604. It shows one item today, as the spec asks
("With one product it shows one item"). The alternative — hide the
switcher below two products — was considered and set aside: a visible
switcher, even a one-item one, tells the reader which product a page
builds, which pays for itself once `app/not-found.tsx` or the design-file
error path is naming products by their label anyway. Hiding it below a
product count is a one-line guard (`if (PRODUCTS.length < 2) return null;`)
in `ProductSwitcher.tsx` if wanted later.
