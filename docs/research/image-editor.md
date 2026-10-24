# Image editor

- **UNKNOWN**: the editor's interactive behaviour (moving, resizing, rotating, handles). It is not reachable without an account (see [overview](overview.md)).

## Documented (help.photoroom.com: *Basic editing* collection and introduction article)

- **DOCUMENTED**: layers can be re-stacked, moved, duplicated and deleted.
- **DOCUMENTED**: "Remove parts of an image" and "Restore previously removed parts of an image" (cut-out touch-up).
- **DOCUMENTED**: text and graphics; *Brand Kit* (brand colours and content).
- **DOCUMENTED**: backgrounds; layer effects (blur, filters); brightness, hue, contrast.
- **DOCUMENTED**: design resizing and export to other apps.
- **DOCUMENTED**: undo/redo in the editor's top menu.
- **DOCUMENTED**: toggleable placement guides.
- **DOCUMENTED** (API `/v2/edit`):
  - positioning: `padding*`, `margin*`, `horizontalAlignment` / `verticalAlignment`, `scaling` (`fit` / `fill`), `outputSize` (`auto`, `WxH`, `originalImage`, `croppedSubject`);
  - outline: `outline.color`, `outline.width`, `outline.blurRadius`;
  - export: `export.format` (`png`, `jpeg`, `webp`, `avif`; default quality 80 for JPEG, 90 for WebP/AVIF) and `export.dpi` (72–1200).

## Indirectly observed

- **OBSERVED** (JS chunk names): `EditorUndoRedo`, `UndoRedoStore`, `InlineColorPicker`, `Slider`, `BrandKitTextLayers`, `TemplateExporter`.
- **INFERRED**: undo history is a dedicated store, separate from the UI.

## LibreRoom requirements

| Feature | Version |
|---|---|
| Cursor-centred wheel zoom, pan (Space, middle button, drag in move mode), "fit" | 0.1 ✅ |
| Colour, transparent or image background (cover fit) | 0.1 ✅ |
| Undo/redo (dedicated store, memory-bounded mask snapshots) | 0.1 ✅ |
| Hold-to-compare with the original | 0.1 ✅ |
| Layers, text, shapes, rotation, resize handles | 0.2 |
| Shadows, brightness, contrast, saturation | 0.2 |
| Placement guides, alignment, margins | 0.2 |
