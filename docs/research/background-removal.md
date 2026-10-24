# Background removal

## Observed

- **OBSERVED** (`ev_04f0c5e2…`): `photoroom.com/tools/background-remover` offers "Start from a photo", "Or drop an image here" and four sample images. A Cloudflare "Verify you are human" widget appears before any use (12 requests to `challenges.cloudflare.com`). It was not bypassed.
- **OBSERVED**: the page states "Photoroom uses your camera and photos to provide its editing services".
- **OBSERVED** (`ev_5ba37676…`): no file resembling a model (`.onnx`, `.tflite`, weights) is loaded when the web app starts. Only `libphotoroom_engine_webgl-*.wasm` and `blob:` workers are.
- **UNKNOWN**: the actual import, processing, result display and manual touch-up flows (account and human check required).

## Documented

From the public OpenAPI spec (`https://image-api.photoroom.com/openapi`):

- **DOCUMENTED**: `POST /v1/segment` (multipart `image_file`). Parameters:
  - `format`: `png` (default), `jpg` or `webp`;
  - `channels`: `rgba` or `alpha` (mask only);
  - `bg_color`;
  - `size`: `preview` 0.25 MP, `medium` 1.5 MP, `hd` 4 MP, `full` 36 MP;
  - `crop` (crop to subject);
  - `despill` (green-screen spill removal).
- **DOCUMENTED**: the response header `x-uncertainty-score` (0–1, -1 for humans) signals the cut-out confidence.
- **DOCUMENTED**: in the web editor, removal is automatic on import.

## Inferred

- **INFERRED**: segmentation runs server-side. The API is a server service, no model is seen on the client, and the WebGL/WASM module looks like a rendering engine rather than an inference engine. Not verified.
- **INFERRED**: the uncertainty score lets the UI flag difficult images.

## Requirements for LibreRoom

| Requirement | Inspiration | LibreRoom implementation |
|---|---|---|
| No-server cut-out | Project rule | ONNX Runtime Web in a Web Worker; local model. |
| RGBA or mask-only output | `channels` | Separate alpha mask; transparent PNG export. |
| Full resolution | `size=full` | The 1024×1024 mask is resampled to the original size; tested up to 48 MP. |
| Manual correction | `MaskEditor` (inferred) | Erase/Restore brush, reset to the AI result, undo/redo. |
| Crop to subject, despill, uncertainty score | API | Later (0.2+). |
