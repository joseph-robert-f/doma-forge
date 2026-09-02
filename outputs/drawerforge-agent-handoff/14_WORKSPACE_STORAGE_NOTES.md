# 14. Workspace Storage Notes

Date: 2026-09-02
Status: Implemented on branch `claude/parametric-stl-expansion-emhw33`.
Reads with: 08_EXPANSION_ROADMAP.md Phase A, 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 1.4 step 9, 13_DESIGN_FILE_NOTES.md

This document records refactor step 9: the saved design moves from one record
under one key to a versioned workspace envelope with one current design per
product. It completes roadmap Phase A.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/workspace.ts` | The `WorkspaceV2` envelope, read and write with a `StorageLike` interface, the version 1 migration, and `readDesign`, `writeDesign`, `writeDesignName`. |
| `app/components/ProductApp.tsx` | Calls the three workspace functions. No storage key or record shape remains in the component. |
| `tests/workspace.test.ts` | 20 cases against a fake storage: round trip, rename, two products, invalid entry, corrupt envelope, newer envelope, transient read failure, unchanged skip, odd product ids, and five migration cases. |
| `tests/app.integration.test.tsx` | 3 new cases: a version 1 record migrates on first load and is marked in place; a corrupt envelope gives defaults; an entry filed under one product that names another is ignored. Existing cases now read the new key and check that another product's entry survives a save. |

### 1.2 The envelope

Key: `drawerforge-workspace-v2`

```json
{
  "format": "drawerforge-workspace",
  "version": 2,
  "updatedAt": "2026-09-02T12:00:00.000Z",
  "designs": {
    "drawer-tray": {
      "productId": "drawer-tray",
      "geometryVersion": 1,
      "name": "Left bench",
      "parameters": { "...": "..." },
      "updatedAt": "2026-09-02T12:00:00.000Z"
    }
  }
}
```

### 1.3 Migration

On the first load that finds no envelope, the app reads `drawerforge-design-v1`.
A valid record becomes the drawer tray's current design and the envelope is
written. The version 1 record then gets one extra field, `migratedTo`, and
keeps every field it had, so an older build still reads it. A marked record is
never migrated again. A record without a product id belongs to the drawer tray.
An invalid, corrupt, or foreign record is ignored and no envelope is written.
The version 1 key is not removed by this build.

### 1.4 Test results

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Pass |
| `npm test` | Pass, 111 cases (was 89) |
| `npm run test:ssr` | Pass |
| Real Chromium smoke | See section 3 |

---

## 2. Decisions

**D-401. One envelope, one key, one current design per product.**
Alternative: one key per product.
Reason: one key gives one place to version, one migration, and one read for a future "recent designs" list. A per-product key would need a key registry of its own.

**D-402. The envelope carries `format` and `version`, like the design file.**
The same two fields gate both formats. A reader rejects a wrong version and never guesses.

**D-403. The version 1 record stays in place, marked.**
The roadmap's operations rule is to keep the previous state until acceptance. A user who opens an older build after a rollback still finds their design. After a successful migration the record gains `migratedTo: "drawerforge-workspace-v2"` and keeps all its fields. A marked record is never read again, so it cannot bring back an old design if the envelope is lost later. Remove the key one release after the new origin is accepted.

**D-404. Storage is an interface.**
Every function takes a `StorageLike` with `getItem`, `setItem`, and `removeItem`. Tests use a fake with a quota switch and a throwing variant. The component passes `window.localStorage`.

**D-405. Every read validates through the product.**
A stored entry is normalized and validated by its product before it is returned. A bad entry gives null, not an exception, and other products' entries are not affected.

**D-406. A refused write is reported, not thrown.**
`writeDesign` returns false on a quota error. The component shows "Local save unavailable", as before.

**D-407. A corrupt envelope is removed. A newer one is not.**
Unreadable JSON, or a foreign format under our key, has no data to keep and would block every later save. It is removed and the app starts from defaults. An envelope with our format and a higher version belongs to a newer build. It is left untouched, the app starts from defaults, and every write is refused with "Local save unavailable". Rolling back the app never destroys the newer build's data.

**D-409. A read has four states, and only two allow a write.**
Found in review: a transient read failure looked like "nothing stored", so the next save wrote an empty envelope over real data and could re-run the migration over the current design. `readWorkspace()` now returns `ok`, `absent`, `unreadable`, or `newer`. `writeDesign()` and `writeDesignName()` refuse to write after `unreadable` or `newer` and return false. A test proves another product's design and the current design survive a read failure.

**D-410. An unchanged design is not rewritten.**
Opening the app used to rewrite the entry with a fresh timestamp. `writeDesign()` compares the name and parameters with the stored entry and skips the write when equal, so `updatedAt` means last edited.

**D-411. Product ids are stored as own properties.**
An id such as `__proto__` is written with `Object.defineProperty` and read with an own-property check. The registry controls ids today; this closes the door for later.

**D-408. Each stored design records its geometry version.**
The value is not yet acted on. A later build can tell the user that a restored design was saved under an older algorithm.

---

## 3. Real-browser smoke

Method: production build served by `vinext start`, driven by Playwright in headless Chromium. The script plants a version 1 record exactly as the previous release wrote it, then reloads.

| Step | Observed |
|---|---|
| Reload with only the version 1 record present | Depth 260, columns 4, name "From v1" restored. Status "Saved on this device". |
| Storage keys after load | `drawerforge-design-v1` and `drawerforge-workspace-v2`. The version 1 record keeps its fields and gains `migratedTo`. |
| Envelope content | Format `drawerforge-workspace`, version 2, one design: `drawer-tray`. |
| Edit rows to 3, rename to "Renamed", reload | Rows 3 and name "Renamed" restored from the envelope. |
| Page errors | None |

---

## 4. Acceptance against the roadmap

| Roadmap acceptance | Result |
|---|---|
| Existing valid `drawerforge-design-v1` data restores after the local schema update | Pass. Unit, integration, and browser tests. |
| Export, clear storage, import reproduces the same signature | Still passes with the new key. |

Roadmap Phase A is complete except for the origin move, which is an operations task.

---

## 5. Review record

An independent review of the diff ran before the commit. It found one should-fix item that would become a blocker with a second product: a transient read failure could erase another product's design or resurrect the old version 1 design. It is fixed by D-409 and covered by a test. The other findings were also applied: the migrated marker (D-403), the newer-version guard (D-407), the unchanged-write skip (D-410), own-property ids (D-411), a rename that validates the stored entry first, the drawer tray id taken from the product module, a never-throw guard in `validateStoredDesign()`, and the integration test that now proves another product's entry survives a save.

## 6. Open issues

1. **Two tabs on one origin.** Each write reads the envelope first and the read-modify-write is synchronous, so a write from one tab keeps the other tab's product entry. Two tabs on the same product last-write-wins. Acceptable for one current design per product.
2. **The version 1 key lingers.** It is marked, never read again, and safe. Remove it one release after the new origin is accepted.
3. **No "recent designs" list.** The envelope has room for one. See ideas.

---

## 7. Follow-up action items

1. Fit-test coupon export.
2. Per-product route, product metadata in `product.copy`, favicon.
3. Show the design name in the viewer status and the document title.
4. Remove the version 1 key after the origin move is accepted.

---

## 8. Ideas noted, not scheduled

- A `recent` array per product in the envelope, capped at ten, filled on each save. This gives undo across reloads for the price of a few kilobytes.
- Show a note when a restored design's `geometryVersion` is older than the app's.
