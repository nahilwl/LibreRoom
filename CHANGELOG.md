# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased] — 0.1.0

### Added

**Layers and text**
- Image and text layers: add, select on the canvas (transparent areas of cut-outs are clicked through), drag to move, size, rotation, opacity, visibility, reorder, delete (Delete key).
- Text: multi-line, sans/serif/monospace, size, bold, italic, colour, alignment; double-click a text to edit it.
- Project format v3 (layers, shadows, multiple selection); v1 and v2 files are migrated automatically.

**Editor**
- Corner handles to resize (opposite corner fixed) and a handle to rotate, with snapping to right angles (15° steps with Shift).
- Smart snapping with visual guides to the canvas and other layers while moving (Alt to disable).
- Multiple selection: Shift/Ctrl-click, rectangle selection, Ctrl+A; move, align, duplicate, opacity and delete together.
- Align left/centre/right/top/middle/bottom (to the canvas, or to each other).
- Customisable drop shadows per layer (softness, offset, strength, colour).
- Keyboard shortcuts: arrows to nudge, Ctrl+D, Ctrl+]/[, Esc, ? for the shortcut list.
- Drop or paste several images at once.

**Batch processing**
- Queue any number of images; remove backgrounds, set a background, format, quality and maximum size.
- Sequential processing (one model, one image in memory at a time), progress, cancellation, per-file and ZIP download; originals are never modified.

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

- **0.2**: native "Save as" dialog on desktop; canvas resizing and presets; colour adjustments; Windows and macOS builds.
- **0.3**: object removal (inpainting), upscaling ×2/×4, advanced touch-ups.
- **0.4**: optimisation, installers, community translations.
