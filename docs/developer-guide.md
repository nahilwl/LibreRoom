# Developer guide

## Prerequisites

- Node.js ≥ 22 and npm
- For the desktop app: Rust (stable, via [rustup](https://rustup.rs)) and the [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/). On Ubuntu/Debian:

  ```bash
  sudo apt-get install libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config build-essential
  ```

## Everyday commands

```bash
npm install
npm run dev            # web app with hot reload: http://localhost:5173
npm run tauri dev      # desktop app (uses the dev server)
npm run typecheck
npm test               # unit tests
npm run build          # production web build in dist/
npm run tauri build    # desktop bundles (deb, rpm, AppImage on Linux)
```

## Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Document model (layers, geometry, hit-testing), tensor maths, project validation and migration, history | — |
| `LIBREROOM_MODEL_DIR=/dir npm test` | The real ISNet model on a synthetic image | `/dir/isnet-int8.onnx` |
| `npm run preview & CHROMIUM_PATH=… npm run test:e2e` | Full user flows in Chromium, including privacy (allowed origins, CSP) | A Chromium/Chrome binary, network for the model |
| `npm run build:pages && node scripts/serve-pages.mjs &` then `LIBREROOM_URL=http://127.0.0.1:4174/LibreRoom/ npm run test:e2e` | The same suite on a GitHub Pages simulation (sub-path, no COOP/COEP), including **offline**. `LIBREROOM_SW=block` tests the single-threaded fallback; `LIBREROOM_BROWSER=firefox FIREFOX_PATH=…` runs it in Firefox | As above |
| `npm run build:pages && npm run serve:pages &` then `npm run test:sw` | Service worker lifecycle: isolation, pre-cache, update (old cache deleted, model cache kept), offline after update | Chromium |
| `cd src-tauri && cargo test` | The Rust model allow-list matches `src/lib/models.ts` | Rust |
| `npm run test:tauri` | The real desktop app (Linux): native AI online, with port 41917 taken (and no listening socket), then offline. Add `-- --compare` to compare the native and browser engines on the same images | Rust, Tauri deps, `xvfb-run`, `ss` |

Measurement scripts are described in [performance.md](performance.md).

## Code map

See [architecture.md](architecture.md). The short version:
- `src/App.tsx` owns the document and wires panels;
- `src/lib/*` is framework-free logic;
- `src/lib/document.ts` is the immutable document model (layers), with pure edit functions;
- `src/lib/render.ts` draws documents (screen and export);
- `src/workers/segment.worker.ts` does AI pre/post-processing (and inference on the web);
- `src-tauri/src/inference.rs` runs the model natively on desktop.

## Conventions

- TypeScript strict; functional React components; Tailwind CSS with the tokens in `src/index.css`.
- Every user-visible string goes through `t()` (`src/i18n`). Add the key to `en.ts` first; TypeScript then requires it in `fr.ts`.
- Errors shown to users are `AppError(key, params)`.
- Small files, one responsibility each. Comments explain *why*, not what.
- A deliberate limitation is marked `shortcut: <limit>, <when to upgrade>`.
- No network access except explicit, user-initiated model downloads. Any new origin must be added to the CSP (`src-tauri/tauri.conf.json`) **and** to the allow-list in `tests/e2e/flow.mjs`.

## Adding a model

1. Check the license (redistributable, AGPL-3.0 compatible) and record it in [ai-models.md](ai-models.md).
2. Pin the URL to a commit (`/resolve/<commit>/…`) and compute its SHA-256.
3. Add it to `src/lib/models.ts` with its preprocessing (`scale`, `mean`, `std`, `activation`), plus label and description keys in `src/i18n`. For desktop, also add it to the allow-list in `src-tauri/src/inference.rs` (`cargo test` checks that both agree).
4. Run `LIBREROOM_MODEL_DIR=… npm test` with the file named `<id>.onnx`.
