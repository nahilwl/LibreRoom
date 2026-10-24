# Batch processing

- **OBSERVED** (`ev_5ba37676…`): a *Batch* sidebar entry exists, and the `batch.lazy` and `BatchAddImagesInsertViewContainer` chunks are loaded.
- **OBSERVED** (`ev_5ef0411e…`, menu): dedicated pages *Batch editing*, *Bulk resizing*, *Bulk background removal*, *Bulk positioning*, *Bulk converting*.
- **UNKNOWN**: the real journey (account required).

## Documented (photoroom.com/batch)

- **DOCUMENTED**: three steps:
  1. "Add all your product photos at once. Any size and any quantity works.";
  2. choose the edits, which are applied to every image;
  3. download the batch or save it to the account.
- **DOCUMENTED**: AI tools apply "on one image or up to 250 images at once".
- **DOCUMENTED**: batch operations include logo, effects, filters, reflections, text, watermark, adjustments, AI backgrounds, AI shadows, alignment, background removal, background colour and resize; JPG/PNG/WebP conversion.
- **UNKNOWN**: plan-based restrictions.

## LibreRoom requirements (0.2)

1. An image queue (drop several files or a folder).
2. An ordered recipe: cut-out → background → resize → format.
3. An output name template, e.g. `{name}-{n}.{ext}`.
4. A destination folder chosen through Tauri's native dialog.
5. Per-image and overall progress, with cancellation. An `AbortController` in the UI lets the worker finish the current image, then stop.
6. No quantity limit: sequential streaming, one decoded image in memory at a time. The AI worker is reused between images, then released when idle.
