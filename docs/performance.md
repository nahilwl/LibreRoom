# Measured performance

Every number on this page comes from a run on the machine below, with the scripts listed. Nothing is estimated. Where something was not measured, it says so.

**Machine**: AMD Ryzen AI 7 350 (8 cores / 16 threads), 14 GB RAM, Ubuntu 26.04, no GPU acceleration (WebGPU is not exposed by the tested engines). Desktop runs use the Tauri app on Linux (WebKitGTK 2.52.6) under **Xvfb** (headless X server); figures on a real display may differ slightly. Dates: 2026-10-24/25.

## Summary (v0.1 desktop, native engine)

| | Desktop (Tauri, native AI) | Web (Chromium 141, WASM AI) |
|---|---|---|
| Startup to UI loaded (release) | **0.30–0.40 s** | not measured |
| Memory at idle (all processes, PSS) | **240–245 MB** | 329 MB (whole browser) |
| CPU at idle | **0.1 %** | not measured |
| Background removal, first / next (1280×742 photo) | **1.4–1.8 s / 1.2–1.4 s** | 2.3–2.9 s / 1.8–1.9 s |
| Memory peak during AI | **1.27–1.35 GB**, stable across runs | 1.5 GB |
| After AI | engine released after 15 s idle; process back to ~280 MB | worker released after 60 s idle |
| Batch, 10 photos (0.2–9 MP) | **1.2–1.9 s per image**, peak 1.35–1.47 GB, flat | 4 images incl. one broken: 6.4 s |
| Release binary / `.deb` | 35 MB / 15.5 MiB | JS 97.5 KB gzip |

## Native vs WebAssembly on desktop

The desktop app can run the model either natively (ONNX Runtime 1.31 in the Rust process, through the `ort` crate) or in the WebView (ONNX Runtime Web, WASM). Both use **the same pre- and post-processing code** (`src/workers/segment.worker.ts`); only `session.run` differs.

### Same images, same process: speed and mask agreement

Command: `npm run test:tauri -- --compare`, i.e. self-test mode `compare`. Each engine runs 3 times per image; times are model execution only (including IPC for native).

Run with the WASM engine on 4 threads (v0.1 architecture, UI served from a local http origin):

| Image | Native (ms) | WASM, 4 threads (ms) | Mean abs. mask difference (0–255) | Max difference | IoU (alpha ≥ 128) |
|---|---|---|---|---|---|
| 1280×742 | 1381, 1266, 1241 | 4888, 2408, 1987 | 0.012 | 6 | 0.99983 |
| 640×371 | 1667, 1799, 1703 | 2097, 2031, 2023 | 0.049 | 15 | 0.99868 |
| 4000×2319 | 1783, 1768, 1605 | 1919, 1897, 1733 | 0.018 | 8 | 0.99976 |

Run with the current architecture (`tauri://` origin, where WASM is single-threaded):

| Image | Native (ms) | WASM, 1 thread (ms) |
|---|---|---|
| 1280×742 | 1442, 1216, 1237 | 7346, 4875, 4570 |
| 640×371 | 1774, 1476, 1482 | 4616, 4364, 4354 |
| 4000×2319 | 1459, 1474, 1484 | 4360, 4345, 4396 |

**Results are equivalent**: masks differ by at most 15/255 on a few edge pixels (float rounding between two int8 runtimes), and overlap ≥ 99.87 %.

### Separate processes: time, memory, CPU

Command: `python3 scripts/measure.py src-tauri/target/debug/libreroom 200 LIBREROOM_SELFTEST=stress LIBREROOM_ENGINE=<engine>`. One process per engine; 5 consecutive removals + full-size PNG exports of the 1280×742 photo. The whole app is sampled every 200 ms (PSS, CPU).

| | Native | WASM, 4 threads |
|---|---|---|
| Time per run, 1→5 (ms) | 1807, 1344, 1370, 1346, 1335 | 5403, 2482, 2254, 2450, 2179 |
| Peak memory per run (MB) | 1265, 1351, 1339, 1345, 1337 | 1926, 2039, 2154, 2406, 2419 |
| Average CPU during a run | 255–335 % | 752–864 % |
| CPU time per run | 3.1–4.6 s | 14.7–40.1 s |

**Decision**: the native engine is faster (≈ 1.3 s vs ≈ 2.3 s warm, 1.8 s vs 5.4 s cold), uses ~0.6–1 GB less memory without growth across runs, and consumes **4–9× less CPU time** (battery, heat). It replaced WASM on desktop. The web version keeps ONNX Runtime Web.

### Releasing memory after processing

| Variant | Average in the 70 s after the runs | At the end |
|---|---|---|
| Native, session dropped after 60 s | 1114 MB | 364 MB (`libreroom` process: 219 MB) |
| Native, dropped after **15 s** + `malloc_trim` (shipped) | **509 MB** | **281 MB** (`libreroom`: 143 MB) |
| WASM worker, terminated after 60 s | 872 MB | 256 MB |

Reloading the native model costs ≈ 0.5 s (first run 1.8 s vs 1.3 s), so a short idle delay is cheap.

### Native options (throw-away prototype, ISNet int8, 1024², `/usr/bin/time` max RSS)

| Threads | Memory pattern | Time per run | Max RSS |
|---|---|---|---|
| 4 | on | 1.05–1.34 s | 1.47 GB |
| 4 | **off (shipped)** | 1.11–1.19 s | **0.94 GB** |
| 8 | on | 1.02–1.06 s | 1.47 GB |
| 8 | off | 0.97–1.11 s | 0.94 GB |

Four threads are kept, to leave cores to the UI and the system (8 threads gain 5–10 %).

BiRefNet-lite (fp32) natively on CPU: 4.8–6.0 s per image and **7.7 GB** max RSS. That is too heavy for the target machines, so it stays GPU-only.

## Batch processing (desktop, native engine)

Command: `python3 scripts/measure.py src-tauri/target/debug/libreroom 300 LIBREROOM_SELFTEST=batch`. 10 JPEG photos (1280×742, 2560×1484, 640×371 and 4000×2319, repeated), background removed, full-size PNG export.

| | Result |
|---|---|
| Time per image | 1476, 1543, 1261, 1856, 1285, 1502, 1218, 1795, 1342, 1532 ms |
| Peak memory while each image is processed | 1254, 1375, 1395, 1444, 1394, 1351, 1396, 1470, 1404, 1361 MB |
| Average CPU | 258–341 % |
| After the batch | engine released after 15 s idle; app at 390 MB, including the 10 results kept for download |

Memory stays flat: one model and one decoded image at a time, whatever the batch length.

## Desktop startup and idle (release build)

Command: `python3 scripts/measure.py src-tauri/target/release/libreroom 30 LIBREROOM_STARTUP_REPORT=1`. Startup is measured from process start to the WebView's "page load finished".

Current version (layers, handles, shadows, batch):

| Run | Startup | Idle PSS (last 10 s) | Idle CPU |
|---|---|---|---|
| 1 | 299 ms | 239.7 MB | 0.1 % |
| 2 | 404 ms | 239.5 MB | 0.1 % |
| 3 | 398 ms | 244.5 MB | 0.1 % |

Previous version (before the editor features), for comparison:

| Run | Startup | Idle PSS (last 10 s) | Idle CPU | Breakdown at end |
|---|---|---|---|---|
| 1 | 276 ms | 247.4 MB | 0.2 % | WebKitWebProcess 127.8, libreroom 91.4, network 19.2, glycin-svg 8.6 |
| 2 | 405 ms | 182.3 MB | 0.0 % | 89.4 / 70.2 / 14.0 / 8.2 |
| 3 | 420 ms | 160.4 MB | 0.3 % | 76.5 / 63.2 / 12.1 / 8.2 |

Idle memory varies between runs (WebKit's garbage collector); the ranges overlap.

## Web version (Chromium)

- Inference: `npm run test:e2e`.
- Memory: `node scripts/measure-chromium.mjs`.

| Case | Result |
|---|---|
| 1280×742 photo, 4 threads | 2.4–2.6 s inference, 2.8–2.9 s end to end |
| Same, 1 thread | 4.7 s |
| GitHub-Pages-like hosting (no COOP/COEP, so 1 thread) | 4.8 s |
| 4000×3000 (12 MP) JPEG | removal 2.9–3.4 s, full-size PNG export 0.9–1.0 s |
| 8000×6000 (48 MP) PNG | removal 2.5–3.0 s, full-size PNG export 2.4–3.0 s |
| Memory, 5 consecutive removals | idle 329 MB → peak 1500 MB (stable), 1316 MB 10 s later |
| Model download + SHA-256 check (44 MB) | 2.3–5.3 s (network-dependent) |

## Choices made to save resources

- **Native inference on desktop**, with ONNX Runtime's memory pattern disabled (−36 % peak).
- AI engines load on first use and are released when idle: native after 15 s, followed by `malloc_trim`; the web worker after 60 s (a WASM heap never shrinks).
- Images and tensors cross threads and IPC as transferables or raw bytes (no JSON, no copies where avoidable).
- The canvas renders at display size; full resolution is only used for export. Export buffers are released immediately.
- Documents are immutable and share data, so undo history costs only the masks that actually changed (budget 256 MB, 50 steps).

Tried without effect (measured, reverted): disabling ONNX Runtime Web's memory arena and memory pattern in WASM.

## Not measured yet

- WebGPU on a real graphics card; Windows and macOS.
- A low-end machine (2 cores, 4 GB RAM). With a ~1.3 GB native peak, 4 GB machines should cope, but this is untested.
- The memory of the release build *during* AI processing. The self-test that triggers AI exists only in debug builds; ONNX Runtime itself is the same prebuilt optimised library in both.
- Startup time of the web version.
