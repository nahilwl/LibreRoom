# AI features

No AI feature could be triggered (account required). Everything below is either:
- **DOCUMENTED**: public OpenAPI spec `image-api.photoroom.com/openapi` and the docs.photoroom.com home page;
- **OBSERVED** as menu labels (`ev_5ef0411e…`).

| PhotoRoom feature | Source | LibreRoom lead (license to re-check before integration) |
|---|---|---|
| Background removal | DOCUMENTED (`/v1/segment`, `removeBackground`) | ✅ ISNet (AGPL-3.0); BiRefNet-lite (MIT) with WebGPU |
| Object / text removal | DOCUMENTED (`textRemoval.mode`: `ai.artificial`, `ai.natural`, `ai.all`); OBSERVED ("Remove objects") | LaMa (Apache-2.0; ONNX export `Carve/LaMa-ONNX`, ~208 MB, CORS verified). Light mode: classic Telea inpainting. |
| Upscaling | DOCUMENTED (`upscale.mode`: `ai.fast` ≤ 1 MP input, `ai.slow` ≤ 0.26 MP; output up to ×4) | Real-ESRGAN (BSD-3-Clause) or Swin2SR (Apache-2.0) via ONNX |
| AI shadows | DOCUMENTED (`shadow.mode`: `ai.soft`, `ai.hard`, `ai.floating`; direction, intensity, softness, spread overrides) | 0.2: procedural drop shadow from the mask (blur + transform), no AI |
| Generated backgrounds | DOCUMENTED (`background.prompt`, `seed`, `guidance.imageUrl`, `blur.mode` `gaussian` / `bokeh`) | Procedural blur and bokeh first; diffusion-based generation optional and late (heavy) |
| Relighting | DOCUMENTED (`lighting.mode`) | UNKNOWN: no lightweight candidate identified yet |
| Beautifier | DOCUMENTED (`beautify.mode`: `auto`, `food`, `car`) | Classic automatic adjustments (levels, white balance) |
| Uncrop / expand | DOCUMENTED | LaMa inpainting on an enlarged canvas |
| Virtual model, try-on, flat lay, ghost mannequin | DOCUMENTED / OBSERVED | Out of scope (heavy generative models) |

## Inferred

- **INFERRED**: all of these run server-side. The API is billed per call: "One Image Editing API call counts as five Remove Background API calls".
- **OBSERVED**: the web app calls `ai-gateway.photoroom.com/v2/ai-tools/list-mini-apps` and `/v3/ai-tools/list-dynamic-apps`. **INFERRED**: the list of AI tools is remotely configured.

## Rule for LibreRoom

An AI tool is integrated only after three checks:
1. a license compatible with AGPL-3.0 and redistributable weights;
2. measured local execution on CPU;
3. a pinned download (commit + SHA-256) that is clearly announced.

See [../ai-models.md](../ai-models.md).
