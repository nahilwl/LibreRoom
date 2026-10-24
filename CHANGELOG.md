# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased] — 0.1.0

### Added

**Layers and text**
- Image and text layers: add, select on the canvas (transparent areas of cut-outs are clicked through), drag to move, size, rotation, opacity, visibility, reorder, delete (Delete key).
- Text: multi-line, sans/serif/monospace, size, bold, italic, colour, alignment; double-click a text to edit it.
- Project format v2 (layers); v1 files are migrated automatically.

**Native AI on desktop**
- ONNX Runtime 1.31 in the Rust process. Compared with WASM in WebKitGTK, it is ~1.8× faster, has a lower and stable memory peak and uses 4–9× less CPU time, with equivalent masks (measured).
- Models installed by the UI are re-verified (size, SHA-256) against a Rust allow-list and written atomically.
- The engine is released after 15 s idle and its memory returned to the system.

**Editing**
- Import PNG, JPEG and WebP by file picker, drag and drop or paste.
- Local AI background removal: ONNX Runtime Web in a Web Worker, WebGPU or multi-threaded WASM. Explicit model download with SHA-256 verification and an offline cache.
- Refine brush (erase/restore), reset to the AI result, back to the original, hold-to-compare.
- Transparent, colour or image backgrounds.
- PNG, JPEG and WebP export with adjustable width and quality.

**Reliability**
- Undo/redo with a bounded memory budget.
- Autosave to IndexedDB and crash recovery.
- `.libreroom` project files: save, open, strict validation.

**Desktop**
- Linux desktop app with Tauri 2 (`.deb`, `.rpm`, AppImage):
  - no local server and no listening port;
  - the WebView may only call LibreRoom's own commands;
  - strict CSP.

**Interface**
- English and French interface, light and dark themes, three-step start screen.

**Testing and tooling**
- Unit, model-integration, browser end-to-end and in-app desktop self-tests (online and offline).
- Measurement scripts for startup, memory and CPU.

**Documentation**
- Research notes, architecture, user and developer guides.

## Roadmap

- **0.2**: customisable shadows; resizing (canvas presets, transform handles); batch processing; colour adjustments; Windows and macOS builds.
- **0.3**: object removal (inpainting), upscaling ×2/×4, advanced touch-ups.
- **0.4**: optimisation, installers, community translations.
