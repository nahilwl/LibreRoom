# Web deployment (GitHub Pages)

> Status: **prepared, not deployed.** Nothing is published until the maintainer decides to.

LibreRoom's web version is a static site: HTML, JS, CSS, one WASM file. It needs no backend, so it can be hosted on GitHub Pages.

## What was verified

A production build with `--base=/libreroom/` was served by a plain static server with **no special headers**, as GitHub Pages does:

- the app loads, and all assets and the worker resolve under the sub-path;
- the model downloads from Hugging Face (CORS OK) and is cached;
- background removal works, on **1 thread: 4.8 s** instead of 2.4 s with 4 threads, because the page is not cross-origin isolated.

## Constraints

| Topic | Situation on GitHub Pages |
|---|---|
| Custom HTTP headers (COOP/COEP) | ❌ Not supported, so no `SharedArrayBuffer`, so single-threaded WASM (about 2× slower). |
| WebAssembly | ✅ Served as `application/wasm`. The file is 27 MB (6.7 MB gzip), under the 100 MB file limit. |
| Web Workers (module) | ✅ |
| WebGPU | ✅ where the browser supports it (HTTPS is a secure context) |
| Model download | ✅ From huggingface.co (CORS `*`). Models are **not** hosted on Pages (site size limit 1 GB). |
| Cache Storage / IndexedDB | ✅ (HTTPS) |
| Content-Security-Policy | Only via `<meta http-equiv>`; no header-only directives |

## Recommended options to restore multi-threading

1. **COI service worker** (e.g. the MIT-licensed `coi-serviceworker`). A small service worker re-serves the site's own responses with COOP/COEP headers, so the page becomes cross-origin isolated after one automatic reload. It keeps GitHub Pages and has no backend. To check: first-visit reload UX, and compatibility with the Hugging Face download (CORS responses are allowed under `require-corp`).
2. **A host that supports headers**: Cloudflare Pages or Netlify, through a `_headers` file. Equally static and free.
3. **Accept single-thread**: it works today, just slower.

Recommendation: option 1, evaluated in a branch with the e2e suite before going live.

## How to deploy later

1. Create the GitHub repository (with the maintainer's approval).
2. Enable Pages with "GitHub Actions" as the source.
3. Run the **Deploy web version** workflow manually (`.github/workflows/pages.yml`, `workflow_dispatch` only: it never runs on push).

Local equivalent: `npm run build:pages`, then serve `dist/` under `/libreroom/`.
