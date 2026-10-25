# Web version and GitHub Pages deployment

> Target: **https://nahilwl.github.io/LibreRoom/**. Status: **ready, not deployed.** Nothing is published until the maintainer runs the workflow.

LibreRoom's web version is a static site: HTML, JS, CSS, one WebAssembly file, a small service worker. AI runs in the visitor's browser and there is no backend.

## How the web build works

| Concern | Solution |
|---|---|
| Sub-path `/LibreRoom/` (case-sensitive on GitHub Pages) | `npm run build:pages` builds with `--base=/LibreRoom/`; all assets, the worker, the WASM runtime and the service worker resolve under it. |
| Multi-threaded AI needs COOP/COEP headers, which GitHub Pages cannot send | `public/coi-sw.js`, a service worker on our own origin, re-serves the site's own files with those headers. On the first visit the page reloads once and becomes cross-origin isolated (4 threads). If service workers are unavailable, the app runs single-threaded. |
| Offline use | The same service worker pre-caches the app shell at install and is **network first** (updates arrive immediately), with a fallback to its local copy. Each build has its own cache, and older builds' caches are deleted on update. The model is kept separately in Cache Storage (`libreroom-models-v1`), which updates never delete. |
| Licenses | Minification strips license comments, so the build writes `THIRD-PARTY-NOTICES.txt` next to the site: the license text of every npm package actually bundled, plus ONNX Runtime's notices for the native libraries compiled into its WebAssembly (`licenses/onnxruntime-ThirdPartyNotices.txt`, from microsoft/onnxruntime v1.30.0). |
| Privacy | A Content-Security-Policy `<meta>` is added to web builds: scripts from the site only, network limited to the site and `huggingface.co` (model download). The browser itself blocks any other server. There are no analytics and no trackers. |
| Model download | From Hugging Face, pinned commit, CORS `*`, SHA-256 verified, then cached for offline use. Models are **not** hosted on Pages. |
| Static hosting limits | Largest file: the WASM runtime, 27 MB (6.7 MB gzip), well under GitHub Pages' 100 MB per file. |

## Test results

Measured on 2026-10-25. Machine: AMD Ryzen AI 7 350, 14 GB RAM, Ubuntu 26.04.

### Realistic GitHub Pages simulation

`scripts/serve-pages.mjs` reproduces GitHub Pages:
- only `/LibreRoom/` exists, case-sensitive (`/libreroom/` → 404); `/LibreRoom` → 301;
- standard MIME types, `Cache-Control: max-age=600`;
- **no COOP/COEP headers**.

The full end-to-end suite (`tests/e2e/flow.mjs`) ran against `http://127.0.0.1:4174/LibreRoom/`, built with `npm run build:pages`.

| Browser and mode | Result | Removal (1280×742) | Batch of 4 (one broken file) |
|---|---|---|---|
| Chromium 141, service worker active | ✅ all checks pass, including **offline** | 2.4 s (4 threads) | 5.9–6.4 s |
| Chromium 141, service workers **blocked** (fallback) | ✅ all checks pass | 4.7 s (1 thread) | 13.4 s |
| Firefox (Playwright build), service worker active | ✅ all checks pass | 2.5 s (4 threads) | 6.5 s |
| Safari / WebKit | ⚠️ **not tested**: Playwright's WebKit needs ICU 74, missing on Ubuntu 26.04 | — | — |

Each run covers:
- the AI model downloaded from Hugging Face, SHA-256 checked, cached;
- background removal (no backend), the refine brush, undo/redo;
- layers and text, resize/rotate handles, multiple selection, alignment, marquee, shadows, duplicate, nudge;
- export, project save/reopen;
- **crash recovery** (autosave in IndexedDB, page killed, then restored);
- multi-image drop;
- **batch** with a broken file, the **ZIP** verified by Python's `zipfile`, and cancellation;
- formats from 1×1 to 48 MP;
- **offline** (network cut, page reloaded, removal still works).

### Service worker lifecycle

`npm run test:sw` (Chromium, Pages simulation) checks four things:
- the first visit becomes isolated and pre-caches the app shell (7 files);
- a new deployment gets its own cache;
- the previous app cache is deleted and **not re-created** by the retired worker (a race that this test caught and that was fixed);
- the model cache survives, and the app still opens offline after the update.

### Nothing leaves the browser

- In every run, the only origins contacted were the site itself, `huggingface.co` and its CDN (`us.aws.cdn.hf.co`), and the latter two only after **Download the model** was clicked. The test fails on any other origin.
- The page tries to reach `https://example.com/` and the request is **blocked by the CSP** (checked in every run).
- Images are only ever read with local browser APIs. No code path uploads them; the CSP would block it anyway.

### Load

| | Chromium, Pages simulation |
|---|---|
| First visit, until the start screen is usable | 332 KiB transferred (uncompressed here; GitHub Pages also gzips), 277 ms locally, including the one-time isolation reload |
| Repeat visit | served from the browser cache, 47 ms |
| First background removal | + WASM runtime (27 MB, about 6.7 MB gzip) + model (44 MB, once, on explicit click) |

Network latency is not simulated: on a real connection, the first visit depends on its speed.

### Single-thread performance

When multi-threading is unavailable (service workers blocked, or very old browsers), a removal takes about **4.7–5.0 s** instead of 2.4 s. All features keep working. 12 MP and 48 MP photos take 4.4–4.9 s, because the model always works at 1024×1024.

### Continuous integration

- From a clean copy without `node_modules`, the workflow's steps succeed: `npm ci`, `npm test` (40 tests), `npm run build:pages`, then the static-site checks (sub-path, CSP, service worker, no test page in the output).
- All workflow and issue-template YAML files are valid.

## How to deploy (when you decide to)

1. Push the repository to GitHub (`git push -u origin main`).
2. Under **Settings → Pages → Build and deployment**, set the source to **GitHub Actions**.
3. Under **Actions → Deploy web version → Run workflow**, run the workflow: it tests, builds, checks and deploys `dist/`.
4. Open https://nahilwl.github.io/LibreRoom/. The first visit reloads once (isolation); after that, the app works offline too.

The workflow is **manual only** (`workflow_dispatch`): pushing code never deploys by itself.

## Known limits of the web version

- Safari (macOS and iOS) is not tested yet.
- Mobile layouts are not optimised: the editor needs a wide screen.
- The first background removal downloads about 50 MB in total (runtime and model). Later visits use the cache.
- Updates arrive on the next visit with a connection (network first); an open tab keeps the version it loaded.
