# Architecture

## Principle

**One UI codebase** (React, TypeScript, Vite, Tailwind CSS) runs in any modern browser and inside a **Tauri 2** desktop shell. AI runs **locally**:
- **desktop**: native ONNX Runtime in the Rust process;
- **web**: ONNX Runtime Web (WASM/WebGPU) in a Web Worker.

No server is involved, ever.

```
┌─────────────────────────────── UI thread (WebView / browser) ───────────────────────────────┐
│ App.tsx        immutable Doc state, undo/redo (History<Doc>), shortcuts, saving             │
│  ├ Header, Workspace (canvas: zoom/pan, selection, handles, snapping guides, mask brush)    │
│  ├ BatchView   batch queue (replaces the canvas in Batch mode)                              │
│  └ panels/     Remove BG · Refine · Layers · Text · Background · Export · Batch             │
│ lib/document   Doc / Layer model (image & text layers), pure edit functions, hit-testing    │
│ lib/render     layer compositing for screen and export; text measuring; mask canvas cache  │
│ lib/files      import/decoding, .libreroom v3 files (validated), Doc ⇄ blobs                │
│ lib/batch      sequential batch pipeline, naming; lib/zip: stored ZIP writer                │
│ hooks/         useAutosave (IndexedDB), usePreferences (theme, language)                    │
│ i18n/          English (default) and French                                                 │
└──────────────┬───────────────────────────────────────────────────────────────────────────────┘
               │ postMessage (ImageBitmap / tensors / masks, all transferred)
┌──────────────▼──────────────── AI worker (segment.worker.ts) ────────────────────────────────┐
│ "prepare": resize to 1024² → normalised NCHW tensor        (shared by both engines)         │
│ "finish":  raw output → mask → bilinear resample to the image size (shared)                 │
│ "segment": prepare → ONNX Runtime Web (WebGPU or WASM ≤ 4 threads) → finish   (web only)    │
└──────────────┬───────────────────────────────────────────────────────────────────────────────┘
               │ desktop only: invoke("run_model", raw float32 bytes)  ← Tauri IPC, no JSON
┌──────────────▼──────────────── Rust (src-tauri) ─────────────────────────────────────────────┐
│ inference.rs  allow-listed models (id, size, SHA-256), install (verify + atomic write),     │
│               ONNX Runtime session (4 threads, memory pattern off), dropped after 15 s idle │
│               + malloc_trim; runs on a blocking thread                                       │
│ lib.rs        window, commands, debug-only self-test hooks                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Decisions

### 1. Native inference on desktop, WebAssembly on the web

The two engines were compared on the same images ([performance.md](performance.md#native-vs-webassembly-on-desktop)):
- **native** is ~1.8× faster warm (~3.5× cold), with a lower memory peak that does not grow across runs, and 4–9× less CPU time;
- **masks are equivalent**: overlap ≥ 99.87 %, at most 15/255 difference on edge pixels.

Only `session.run` differs. Pre- and post-processing are the same TypeScript code for both engines, which guarantees consistent results.

The `ort` crate (2.0.0-rc.15) **links ONNX Runtime 1.31 statically**: no extra library to install. The prebuilt library is downloaded at build time by `ort-sys` from its maintainers (pyke.io). Alternative if that supply chain is not wanted: the `load-dynamic` feature with the distribution's `libonnxruntime` (Ubuntu ships 1.23).

### 2. No local server, no network port

v0.1 served the UI from `http://127.0.0.1:41917`. WebKitGTK only isolates http(s) origins, and isolation was needed for multi-threaded WASM. With native inference, the WebView no longer needs `SharedArrayBuffer`. The app is therefore back on Tauri's internal `tauri://` protocol. It **opens no listening socket**, so a busy port can no longer prevent startup. Both points are verified by `npm run test:tauri`: the port test holds 41917 and checks the app's sockets with `ss`.

### 3. Minimal permissions and strict origins

- The WebView can call **only** LibreRoom's own commands (`capabilities/default.json`): `model_installed`, `install_model`, `remove_model`, `run_model`. The two self-test commands exist in debug builds only. Not even `core:default` is granted.
- IPC is accepted from the app's own origin only: no `remote` URLs.
- **Strict CSP**: scripts from the app itself only (plus `wasm-unsafe-eval` for the web engine); network limited to IPC and `huggingface.co` for explicit model downloads.
- The native side never trusts the UI:
  - model ids come from a Rust allow-list;
  - downloads are re-verified (exact size and SHA-256) before an atomic write into the app data directory;
  - tensor sizes are checked before inference.
- A Rust unit test checks that the Rust allow-list and `src/lib/models.ts` agree.

### 4. ONNX Runtime Web: served locally, non-bundled (web)

ORT's WASM threads load the glue `.mjs` themselves, and with the bundled build inference hung (observed). Vite therefore aliases `onnxruntime-web/webgpu` to `ort.webgpu.min.mjs`, and `wasmPaths` points to our own files: never a CDN. Vite's dev and preview servers send COOP/COEP for multi-threading. See [web-deployment.md](web-deployment.md) for static hosting.

### 5. Immutable document with layers

`Doc` = canvas size, background, stack of layers (bottom → top), selected layers.

- Layers are **image** layers (original file + bitmap + optional mask + AI mask) or **text** layers (text, font family, size, weight, style, colour, alignment).
- Every layer has `x, y` (centre, canvas px), `scale`, `rotation`, `opacity` and `visible`.
- Edits are pure functions (`updateLayer`, `addLayer`, `moveLayer`, `removeLayer`) that return a new `Doc` sharing everything unchanged. Bitmaps, blobs and mask arrays are never mutated.
- **Undo/redo** stores whole previous documents. The memory budget (256 MB, 50 steps) counts each mask array once, however many versions reference it.
- Rapid repeated edits with the same key collapse into one step: a drag, typing in a text, a slider.
- **Masks** are `Uint8ClampedArray` (one byte per pixel). Their canvas form is cached by identity (`WeakMap`).
- A brush stroke paints on a temporary copy, and the new mask is committed once, at the end of the stroke.
- **Hit-testing** follows rotation and scale, and ignores transparent pixels of cut-out subjects, so you can click "through" an empty area.

### 6. Canvas interactions

`Workspace` translates pointer gestures into document patches. The maths lives in `lib/document.ts` and is unit-tested.

- **Selection**: click (topmost opaque pixel), Shift/Ctrl-click to toggle, or a marquee from an empty area (selects layers fully inside it). `Doc.selectedIds`, where the last id is the primary layer shown in the panels.
- **Move**: all selected layers together. **Snapping**: the moving group's bounding box (rotation included) snaps its edges and centre to the canvas and to other visible layers within 6 screen px. Guides are drawn while snapping, and Alt disables it.
- **Resize**: corner handles, uniform scale with the opposite corner fixed. The pointer is projected on the layer's diagonal, so this works on rotated layers. **Rotate**: a knob above the layer, with a gentle snap to right angles (or 15° steps with Shift).
- Each gesture is one undo step: `onTransform(patches, gesture)` merges updates with the same gesture id.
- **Align**: one layer to the canvas, several to their common bounds.
- **Shadows**: Canvas 2D `shadow*` set per layer. They are scaled by the view, because canvas shadows ignore the transform. Masked layers are composited first, so the shadow follows the cut-out.

### 7. Batch processing

`lib/batch.ts` runs a queue strictly **sequentially**: decode one image → (AI mask with the shared engine) → background → `exportImage` → release the bitmap. Only one model is ever loaded (the engines keep a single session and free the previous one when the model changes), and only one source image is decoded at a time. Measured: memory is flat over 10 images (see [performance.md](performance.md#batch-processing-desktop-native-engine)).

- Cancelling aborts before the next image; an inference that is running cannot be interrupted, so it finishes.
- Errors are recorded per image and do not stop the batch.
- Results are new blobs named `<name>-libreroom.<ext>`, unique and case-insensitive. Originals are never touched.
- The ZIP writer (`lib/zip.ts`) uses the "stored" method: the images are already compressed. It is validated against Python's `zipfile`.

### 8. Rendering

`lib/render.ts` draws background, then each visible layer with its transform. Masked image layers are composited on a reusable scratch canvas (`destination-in`). The same function renders the screen, at display resolution, and the export, at any resolution. Content outside the canvas is clipped and never exported.

### 9. Autosave, crash recovery, project format

- **Autosave**: 1.5 s after each change while there are unsaved changes, the document goes to IndexedDB as blobs. The record is versioned, and older versions are ignored. It is deleted on save or discard, so a record found at startup means unsaved work.
- **`.libreroom` v3**: a self-contained JSON file (layers, shadows, multiple selection). Images are data URLs (originals byte-for-byte), and masks are PNG. Everything is validated (`lib/project.ts`, unit-tested), including:
  - dimensions, transforms, opacity, colours (hex only), fonts (enum);
  - text length and number of layers;
  - images as data URLs only, never a remote URL.
- **v1 files migrate** to one full-canvas image layer. **v2 files** gain empty shadows, and their single selected index becomes a list.

### 10. Internationalisation

Typed dictionaries in `src/i18n`: `en` is the reference, and TypeScript enforces that `fr` has every key. Libraries throw `AppError(key, params)`.

## Testing

| Layer | How |
|---|---|
| Model, geometry, history, project validation | Vitest (`npm test`) |
| Rust allow-list ⇄ frontend registry | `cargo test` |
| Real model on a synthetic image | `LIBREROOM_MODEL_DIR=… npm test` |
| Real user flows in Chromium: import, AI, brush, undo/redo, layers and text, **resize/rotate handles** (+ undo), **multiple selection, alignment, marquee**, **shadow**, duplicate, nudge, export, project save/reopen, crash recovery, **multi-image drop**, **batch** (broken file, ZIP checked by Python, cancel), formats up to 48 MP, privacy (allowed origins) | `npm run test:e2e` |
| Real desktop WebView: native engine, download/install, inference, export, project, **port conflict**, no listening socket, **offline** (CSP blocks every remote origin), optional engine comparison | `npm run test:tauri` (debug self-test page, `selftest` builds only) |

WebKitWebDriver is not packaged for Ubuntu 26.04, so click-level automation inside the desktop window is not available. UI flows are covered in Chromium.

## Platforms

| Platform | Status |
|---|---|
| Linux (Ubuntu 26.04, x86_64) | ✅ built and tested; `.deb`, `.rpm`, AppImage produced |
| Web (Chromium) | ✅ tested |
| Web (Firefox, Safari) | ⚠️ not tested |
| Windows, macOS | ⚠️ configuration prepared (bundle targets, CI matrix). The `ort` crate documents prebuilt ONNX Runtime binaries for both (not verified here). **Not built or tested.** |

## Upcoming features: how they fit

Planned in this order, one at a time.

| Feature | Design |
|---|---|
| **Canvas resizing** | `doc.width/height` changes with an anchor (layers keep their positions relative to it), plus presets (square, 4:5, 16:9, marketplace sizes). |
| **"Save as" on desktop** | `tauri-plugin-dialog` for the destination, plus a narrowly scoped Rust command that writes the chosen file. Batch can then write to a folder instead of a ZIP. |
| **Object removal (local AI)** | An inpainting model (candidate: LaMa, Apache-2.0, ~208 MB, to be measured). The native engine generalises `run_model` to named inputs (image + mask). The user paints the area with the existing brush code. A crop around the area is inpainted at model resolution, then blended back into a **new image layer**, so the original stays intact. A light non-AI fallback (Telea inpainting) is planned for low-end machines. |

## Directory layout

```
src/
  App.tsx                  state and wiring
  components/              Header, Workspace, Icon, Progress, panels/*
  hooks/                   useAutosave, usePreferences
  i18n/                    en.ts, fr.ts, index.ts
  lib/                     document, render, files, project, history, autosave, models,
                           modelStore, segmenter, tensor, compose, platform
  selftest/                in-app self-test (selftest builds only)
  workers/segment.worker.ts
src-tauri/                 Rust: lib.rs (app), inference.rs (native AI), capabilities, icons
scripts/                   tauri-selftest.sh, measure.py, measure-chromium.mjs, make-readme-visuals.mjs
tests/                     model integration test, e2e flow, CC0 fixture
docs/                      documentation, research/, assets/
```
