# User interface

Labels: **OBSERVED** · **DOCUMENTED** · **INFERRED** · **UNKNOWN** (see [overview](overview.md)).

## Web app layout

Source: screenshot and accessibility tree, `ev_5ba37676…`, 1440×900 viewport. The sign-in dialog covers the page, so only the elements visible behind it are described.

- **OBSERVED**: a fixed left sidebar (~255 px) containing:
  - the logo;
  - a "Search" field with a displayed `CTRL+K` shortcut;
  - *Home*, *Explore*, *Batch* and *Video Ad Maker*;
  - a *Content* section: *Shopify Products*, *Designs*, *Brand Library*, *Templates*;
  - at the bottom: *Usage*, *Preferences* and an *Upgrade to Pro* button.
- **OBSERVED**: the "Home" main area contains:
  - a grid of tool tiles: *Start from a photo*, *Background Remover*, *AI Fashion Models*, *Product Staging*, *Ghost Mannequin*, *Batch*, *See all tools…*;
  - below it, *Get started*, *Classic* (*White*, *Black*, *Transparent*, *Original Image* thumbnails) and *Studio* sections.
- **OBSERVED**: a *Sign in* button at the top right and a "?" help button at the bottom right.
- **UNKNOWN**: the editor layout itself (canvas, panels, toolbars). It is not reachable without an account.

## Hints from code splitting (file names only)

**OBSERVED**: the network log contains lazily loaded JavaScript chunks named:
- `MaskEditor`, `EditorUndoRedo`, `UndoRedoStore`;
- `DropZone`, `DropZoneFullscreen`, `Uploader`, `BatchAddImagesInsertViewContainer`, `batch.lazy`;
- `MagicRetouch`, `TemplateExporter`, `Presets`, `BrandKitTextLayers`;
- `InlineColorPicker`, `Slider`.

**INFERRED**: the editor has a mask editor, an undo/redo store, a full-screen drop zone for drag and drop, and a template exporter. This rests on names only and was not verified functionally.

## Documented journeys

- **DOCUMENTED** ([Start a new design (Web App)](https://help.photoroom.com/en/articles/13130121-start-a-new-design-web-app)), step by step:
  1. log in, then pick a *Space*;
  2. *Select photos*, then upload;
  3. "Photoroom automatically removes its background and then opens your design in the editor";
  4. *Download* (choose the name and the format);
  5. "Photoroom saves your design when you navigate away from the editor".
- **DOCUMENTED** ([Undo and Redo (Web App)](https://help.photoroom.com/en/articles/13868242-undo-and-redo-an-action-web-app)): undo/redo are "available from the menu at the top of the editor".
- **DOCUMENTED**: placement guides help position elements.
- **UNKNOWN**: the editor's keyboard shortcuts. An *Advanced Shortcuts* article is listed, but its Web App content was not verified.

## UX ideas reused (independent implementation)

| Idea | Status at PhotoRoom | LibreRoom |
|---|---|---|
| Import leads straight to the next logical step (cut-out) | DOCUMENTED (automatic) | One explicit "Remove background" click: downloading a model must stay a conscious choice. |
| Full-screen drag and drop | INFERRED | Yes, plus paste (Ctrl+V). |
| Preset backgrounds (white, black, transparent) | OBSERVED (*Classic*) | Colour swatches, transparent, image. |
| Mask editor | INFERRED (`MaskEditor`) | Erase/Restore brush. |
| Implicit saving | DOCUMENTED | Explicit `.libreroom` files, plus autosave with crash recovery. |
| Undo/redo in the top bar | DOCUMENTED | Same place, Ctrl+Z / Ctrl+Shift+Z. |

No PhotoRoom graphic element, icon, text or logo is reused. LibreRoom's palette, logo and icons are original (see [../brand.md](../brand.md)).
