# 13. Design File Notes

Date: 2026-09-02
Status: Implemented on branch `claude/parametric-stl-expansion-emhw33`.
Reads with: 08_EXPANSION_ROADMAP.md Phase A, 09_NEXT_AGENT_BRIEF.md section A, 10_MULTI_PRODUCT_EXPANSION_PLAN.md

This document records roadmap Phase A: a portable design file, non-destructive
import, and a design name that reaches the file names. The storage envelope
migration is refactor step 9 and follows in its own change.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/design-file.ts` | The `DesignFileV1` type, `createDesignFile()`, `serializeDesignFile()`, `parseDesignFile()`, `designFilename()`, `namedMeshFilename()`, name helpers. |
| `app/components/ProductApp.tsx` | Design name field, "Save design file" and "Open design file" actions, the message line, name persistence, STL filename prefix. |
| `app/globals.css` | Styles for the design section. |
| `tests/design-file.test.ts` | 19 cases: export shape, filename rules, round trip, every rejection path, poisoned values, geometry version warnings. |
| `tests/app.integration.test.tsx` | 3 new cases: save then clear storage then open, invalid file leaves the design unchanged, rename persists without a geometry edit. |

### 1.2 The file

```json
{
  "format": "drawerforge-design",
  "version": 1,
  "name": "Left bench",
  "units": "mm",
  "productId": "drawer-tray",
  "geometryVersion": 1,
  "createdAt": "2026-09-02T12:00:00.000Z",
  "parameters": { "drawerWidth": 300, "...": "..." }
}
```

Filename: `left-bench-drawer-tray-<hash>.drawerforge.json`. The hash is the same six characters the STL name carries, so a design file and its STL match by eye.

### 1.3 Import rules

Import checks in this order and stops at the first failure. No app state changes before every check passes.

1. The text is JSON and an object.
2. `format` is `drawerforge-design`.
3. `version` is 1.
4. `units` is `mm`.
5. `productId` names a registered product.
6. `parameters` is an object.
7. Every key in the product's specs is present. A missing key is an error, not a default.
8. The normalized parameters pass the product's validation.
9. The product matches the page. A file for another product is refused with both names.

Unknown top-level fields and unknown parameter keys are ignored. A `geometryVersion` that differs from the app's produces a warning, not an error, and the design still loads.

### 1.4 Test results

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Pass |
| `npm test` | Pass, 89 cases (was 67) |
| `npm run test:ssr` | Pass |
| Real Chromium smoke | See section 3 |

---

## 2. Decisions

**D-301. The file carries `productId` and `geometryVersion`.**
The brief's `DrawerForgeDesignV1` had neither, because one product existed. Both are required now. `geometryVersion` lets a later app warn that the mesh may differ from the one the user printed.

**D-302. A missing parameter is an error.**
Alternative: fill the default. The brief says required fields must be present and valid. A silent default could change a printed part without the user knowing.

**D-303. Unknown fields are ignored.**
A newer app may add optional fields. An older app must still read the file. Only `version` is the breaking signal.

**D-304. The file never carries printer data.**
Roadmap Phase B keeps machine corrections in a local printer profile. A design file must give the same part on any printer after that printer's own correction.

**D-305. The name lives in app state and in the saved record.**
The version 1 record gains an optional `name` field, as it gained `productId` earlier. A record without it restores with an empty name. The full envelope waits for step 9.

**D-306. A rename saves at once.**
The generation effect saves the record only after a successful mesh. A rename alone would be lost on reload. A small effect writes the name into the existing record when it changes. It never creates a record and never touches parameters.

**D-307. File names get the design name as a prefix.**
`left-bench-drawerforge-drawer-tray-299x244x50-2x3-<hash>.stl`. The product's own filename is unchanged, so the golden test and the product contract stand. The name is optional; an empty or symbol-only name adds nothing.

**D-308. Files are read with `FileReader`.**
`Blob.text()` is absent in jsdom. `FileReader` works in every browser and in the tests, so one code path serves both.

**D-309. A file for another product is refused, not redirected.**
One page builds one product today. When the per-product route exists, this branch can navigate instead.

**D-310. `parseDesignFile()` never throws.**
Found in review: a crafted JSON value such as `{"valueOf":1,"toString":2}` makes `String()` and `Number()` throw. The parser now wraps its body and returns one error for anything unexpected. Values in messages are rendered with `JSON.stringify`, which does not call the value's methods.

**D-311. The rename save is debounced and guarded.**
The name effect waits 300 ms after the last keystroke, then writes only into a record with the current version and this product's id. It can no longer overwrite another product's record or write an empty name over a record that restore skipped.

**D-312. One always-present live region for file messages.**
The message paragraph exists at all times with `role="status"` and `aria-live="polite"`. Its text changes; the node does not appear and disappear. A successful import with a geometry warning uses a third tone, "warning", not "error".

---

## 3. Real-browser smoke

Method: production build served by `vinext start`, driven by Playwright in headless Chromium. One script, one pass.

| Step | Observed |
|---|---|
| Set depth 245 and name "Left bench", wait for Ready | Saved record contains `"name":"Left bench"` |
| Save design file | `left-bench-drawer-tray-08d29d.drawerforge.json`, format and version correct, depth 245 inside |
| Download STL | `left-bench-drawerforge-drawer-tray-299x244x50-2x3-08d29d.stl`, same hash as the design file |
| Clear storage and reload | Depth back to 200, the default |
| Open the saved file | Depth 245, name restored, message "Loaded "Left bench" from …" |
| Open a version 9 file | Message "Design file version 9 is not supported. This app reads version 1." Depth still 245. |
| Page errors | None |

---

## 4. Acceptance against the roadmap

| Roadmap acceptance | Result |
|---|---|
| Export, clear storage, import reproduces the same signature and STL bounds | Pass. The integration test compares the viewer model key, which is the signature. The STL bounds follow from the signature through the golden test. |
| Unknown format or version fails without changing state | Pass. Unit and integration tests. |
| A file exported on Sites imports on the new Worker origin | Not testable yet. The format has no origin dependency. |
| Existing `drawerforge-design-v1` data restores after the schema update | Pass. The record shape only gained optional fields. |

---

## 5. Review record

An independent review of the diff ran before the commit. It found no blockers and five should-fix items. All were applied: the never-throw parser contract, the guarded and debounced name save, the warning tone, the fixed live region, and a size limit before reading a file. Eight nits were also applied: diacritics fold into ASCII in slugs, the slug cannot end in a dash, the section has its own heading and the input its own label, the save button exposes its disabled reason, `readFileText` moved into `lib/design-file.ts`, the test download mock is one helper that restores itself, and the reset test covers the name and message. One nit was not applied: a fully non-Latin name still gives an empty slug, so the file name falls back to the product name. That is correct behavior, not a defect.

## 6. Open issues

1. **Storage envelope.** Step 9 remains. The record is still one key with `version: 1`.
2. **No file-type hint for the OS picker on iOS.** `accept=".json,application/json"` is honored on desktop browsers. iOS Safari may show all files.
3. **A design file opened for the wrong product is refused.** See D-309.
4. **Name is not shown in the page title or the viewer.** Add it with the per-product route.

---

## 7. Follow-up action items

1. Step 9: storage migration to a per-product, versioned envelope. Include the name.
2. Fit-test coupon export.
3. Per-product route, product metadata in `product.copy`, favicon.
4. Show the design name in the viewer status and the document title.

---

## 8. Ideas noted, not scheduled

- Drag and drop a design file onto the page.
- A "recent designs" list in the workspace envelope once step 9 lands.
- A share link that encodes the design file in the URL fragment. It needs no backend and fits the browser-only rule.
