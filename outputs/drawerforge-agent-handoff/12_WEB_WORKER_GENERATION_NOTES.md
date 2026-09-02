# 12. Web Worker Generation Notes

Date: 2026-09-02
Status: Implemented on branch `claude/parametric-stl-expansion-emhw33`.
Reads with: 10_MULTI_PRODUCT_EXPANSION_PLAN.md section 1.4 step 8, 11_PRODUCT_REGISTRY_REFACTOR_NOTES.md

This document records refactor step 8: mesh generation moved off the main thread
into a dedicated Web Worker. It lists the design, the decisions, the measurements,
the open issues, and the follow-up work.

---

## 1. What changed

### 1.1 Files

| File | Role |
|---|---|
| `lib/generation/protocol.ts` | Request and response message types. `handleGenerationRequest()` is the whole worker body as a pure function. `transferablesOf()` lists the buffers to move. |
| `lib/generation/generation.worker.ts` | The worker entry. Nine lines. It receives a request, calls the handler, and posts the reply with the buffers transferred. |
| `lib/generation/client.ts` | `WorkerGenerationClient` with latest-wins semantics. `InlineGenerationClient` for runtimes without workers. `createGenerationClient()` picks one. |
| `app/components/ProductApp.tsx` | Calls the client instead of `product.generate()`. Cancels the in-flight request when a newer edit supersedes it. Disposes the client on unmount. |
| `tests/generation.test.ts` | 13 cases. A worker double runs the real protocol handler and lets tests hold replies back. |
| `tests/app.integration.test.tsx` | One new case: five rapid edits settle on the last value with no error. |
| `.github/workflows/ci.yml` | `actions/checkout` and `actions/setup-node` moved to v5 to clear the Node 20 warning. |

The product contract did not change. `product.generate()` now runs inside the worker.

### 1.2 Message flow

1. The page debounces edits for 140 ms, as before.
2. The page posts `{ type: "generate", id, productId, parameters }`.
3. The worker looks up the product in the registry and calls `product.generate()`.
4. The worker posts `{ type: "result", id, model }` and transfers the two mesh buffers. On failure it posts `{ type: "error", id, message }`.
5. The page keeps only the newest id. An older reply is dropped.
6. The page converts the mesh to a Three.js geometry, runs the safety check, and updates the viewer. This part still runs on the main thread.

### 1.3 Test results

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Pass |
| `npm test` | Pass, 67 cases (was 53) |
| `npm run test:ssr` | Pass. The build emits `generation.worker-*.js` and `manifold-*.wasm` as separate assets. |
| Real Chromium smoke | Pass. See section 3. |

---

## 2. Decisions

**D-201. One worker, one request in flight, latest wins.**
Alternative: a queue that runs every request.
Reason: the user only wants the newest preview. A queue would burn time on edits the user already replaced.

**D-202. A superseded request is cancelled two ways.**
If the request has run for less than one second, the client lets it finish and drops the reply. If it has run longer, the client terminates the worker and the next request starts a fresh one.
Reason: WebAssembly code cannot be interrupted. Termination is the only true cancel, but it discards the warm kernel and costs a reload. A short request finishes sooner than a reload. The threshold is a constructor option so a product with slow geometry can tune it.

**D-203. The worker body is a pure function.**
`handleGenerationRequest()` takes a request and returns a response. The worker entry and the inline fallback both call it. Tests drive it through a worker double.
Reason: jsdom has no `Worker`. Without this split, the worker code would have zero test coverage.

**D-204. The inline client is the fallback, not a mock.**
`createGenerationClient()` returns `InlineGenerationClient` when `Worker` is undefined. This happens in server rendering and in jsdom.
Reason: the app never needs a test-only code path. The integration tests exercise the same client selection the browser would.

**D-205. Mesh buffers are transferred, not copied.**
`transferablesOf()` returns the `ArrayBuffer` of each typed array, deduplicated.
Reason: a fine-quality tray is a few hundred kilobytes. Transfer is constant time. After transfer the worker no longer owns the buffers, which is correct because it never reads them again.

**D-206. The page cancels in the effect cleanup.**
When the signature changes, the effect cleanup increments the request id and calls `client.cancel()`. The rejected promise carries `GenerationCancelledError`, which the catch block ignores.
Reason: the request id guard already ignored stale results. The cancel call adds real cancellation for long jobs and keeps the two mechanisms consistent.

**D-207. Geometry conversion stays on the main thread.**
`modelToBufferGeometry()` and `analyzeBufferGeometry()` still run on the page.
Reason: Three.js buffer attributes must be created on the thread that owns the WebGL context. The conversion is a linear pass and is much cheaper than the Boolean work. Moving it is a later optimization if measurements show a need.

---

## 3. Measurements

Method: production build served by `vinext start`, driven by Playwright in headless Chromium with software WebGL. The script loads the page, makes five rapid depth edits, then switches mesh quality to Fine and records the longest `longtask` entry during the next 2.5 seconds. Three runs each.

### 3.1 Kernel time, measured in Node with the same WebAssembly build

Seven runs each after a warm-up. This is the time that no longer runs on the page thread.

| Configuration | Triangles | Median | Min | Max |
|---|---|---|---|---|
| Default 2 x 3, standard | 362 | 11 ms | 10 ms | 17 ms |
| Default 2 x 3, fine | 602 | 13 ms | 13 ms | 15 ms |
| 6 x 8, 600 x 600 mm, fine | 1308 | 36 ms | 35 ms | 37 ms |

The kernel load on first use costs more than any single tray: about 100 to 300 ms to fetch and instantiate 540 KB of WebAssembly. That load now happens in the worker.

### 3.2 Page-thread stalls in headless Chromium, main versus worker branch

| Branch | Longest task, default tray, three runs | Longest task, 6 x 8 fine, three runs |
|---|---|---|
| main | 203, 177, 176 ms | 207, 186, 197 ms |
| worker | 167, 174, 173 ms | 193, 195, 248 ms |

These numbers are the same within noise. The harness could not isolate the kernel: headless Chromium renders with software WebGL, and each frame of the 3D viewer took about 100 ms in both branches. Section 3.1 gives the real kernel cost. For the drawer tray it is small. The worker earns its place with the kernel load, with future products whose Boolean count is large, and with the guarantee that a slow generation can never freeze the controls.

### 3.3 Bundle facts

| Asset | Size |
|---|---|
| `ProductApp-*.js` (page chunk, mostly Three.js) | 574 KB, was 625 KB |
| `generation.worker-*.js` | 53 KB |
| `manifold-*.wasm` | 541 KB, fetched by the worker only |

The protocol module is imported lazily by the inline fallback, so the kernel glue and product geometry left the page chunk.

Other smoke results on the worker branch: exactly one worker URL observed across all edits, no worker respawn during rapid edits, the download produced a valid 30 KB STL with the expected filename, and no page errors.

---

## 4. Open issues

1. **WebAssembly MIME type under `vinext start`.** The local production server serves `.wasm` as `application/octet-stream`. Chromium logs a streaming-compile warning and falls back to array-buffer instantiation, which works but is slower. Pre-existing; the main-thread loader hit the same path. Cloudflare Workers Assets serves `application/wasm`. Verify on the deployed origin.
2. **Missing favicon.** The page requests `/favicon.ico` and receives a 404. Pre-existing and cosmetic. Add an icon with the per-product route work.
3. **No progress or cancel control in the UI.** A long job now runs off-thread, so the page stays responsive, but the user has no indicator beyond the status text. UX doc gap, unchanged.
4. **Worker startup cost is paid once per page load and again after a termination.** The kernel loads in about 100 to 300 ms. A product with very slow geometry could trigger repeated terminations during fast slider drags. The threshold in D-202 is the control.
5. **Duplicate worker asset in the server bundle.** The build emits `generation.worker-*.js` and a second `manifold-*.wasm` under `dist/server/ssr/assets/`. Nothing references them. They add about 600 KB to whatever Wrangler uploads. Investigate the vinext SSR environment config.
6. **Geometry conversion still on the page thread.** Per D-207. Measure again when a product produces more than about 20,000 triangles.

---

## 5. Follow-up action items

In order.

1. Roadmap Phase A: design-file export and import.
2. Refactor step 9: storage migration to a per-product, versioned envelope.
3. Fit-test coupon export.
4. Per-product route, product metadata in `product.copy`, and a favicon.
5. Scale the viewer scene furniture from mesh bounds.
6. Cutter-array module and the socket tray.

---

## 6. Review record

An independent review of the diff ran before the commit. It found no blockers and seven should-fix items. All were applied:

- A late error from a replaced worker no longer rejects the new worker's request.
- The worker entry catches every failure and posts an error reply. An unhandled rejection surfaces as a worker error event.
- The client listens for `messageerror`.
- A 30-second watchdog terminates a silent worker and rejects the request. A test covers it with a short timeout.
- The worker double in tests waits for an explicit reply count, which removes a latent flake.
- The rapid-edit integration test pauses longer than the debounce, so a generation is in flight when the next edit lands.
- The inline fallback imports the protocol module lazily, which keeps the kernel out of the page chunk.

Two nits were also applied: the inline client refuses work after dispose, and the worker comment no longer claims strict serialization.

## 7. Ideas noted, not scheduled

- Preload the worker and kernel on page load, before the first edit, so the first preview appears sooner.
- Move `modelToBufferGeometry()` into the worker and transfer the position and normal arrays. This is the remaining main-thread cost.
- Report a progress heartbeat from the worker for products whose Boolean count is known in advance.
- Keep a second warm worker so a termination does not pay the kernel reload.
