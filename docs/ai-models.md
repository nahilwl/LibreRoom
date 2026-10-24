# AI models

LibreRoom only uses models that:

1. have a license compatible with AGPL-3.0 and allow redistribution of the weights;
2. run locally;
3. are downloaded from a **pinned commit** with a **SHA-256** check, only when the user clicks *Download the model*.

Downloaded models are kept in the app's Cache Storage and work offline. *Delete this model from disk* removes them.

## Background removal

| | Fast (default) | Precise |
|---|---|---|
| Model | ISNet (DIS), int8 quantized | BiRefNet-lite, fp32 |
| File | `onnx-community/ISNet-ONNX@3fe6e3d…/onnx/model_quantized.onnx` | `onnx-community/BiRefNet_lite-ONNX@de15b22…/onnx/model.onnx` |
| Size | 44 MB | 224 MB |
| SHA-256 | `9f5c5fa3…e87a42` | `56000243…f03333` |
| License | AGPL-3.0 (model card) | MIT |
| Input | 1024×1024 (fixed) | 1024×1024 (fixed) |
| Runs on | Desktop: native CPU. Web: WASM or WebGPU | **WebGPU only** (web) |
| Status | ✅ tested (CPU) | ⚠️ not tested: no WebGPU on the test machine |

Why BiRefNet is GPU-only (all measured):
- on the CPU WASM backend, both the fp32 and fp16 variants fail with `std::bad_alloc`: the 4 GB WASM memory limit;
- natively on CPU it runs, but needs **7.7 GB of RAM** (4.8–6.0 s per image), far beyond the target machines.

On desktop, the Fast model runs natively: ONNX Runtime 1.31, verified again by SHA-256 by the Rust side, and stored in the app data directory. On the web, it runs in ONNX Runtime Web, cached in Cache Storage. Both engines produce equivalent masks (IoU ≥ 99.87 %, see [performance.md](performance.md)).

Full hashes and URLs are in [`src/lib/models.ts`](../src/lib/models.ts).

## Rejected candidates

| Candidate | Reason |
|---|---|
| BRIA RMBG-1.4 / 2.0 | Non-commercial license: incompatible with free software. |
| rembg models on GitHub Releases | No CORS headers, so they cannot be downloaded from the browser. |
| Personal Hugging Face mirrors (u2netp…) | Weaker provenance. |

## Candidates for future features (license to re-check before integration)

| Feature | Candidate | License |
|---|---|---|
| Object removal / inpainting | LaMa (`Carve/LaMa-ONNX`, ~208 MB, CORS OK) | Apache-2.0 |
| Upscaling ×2/×4 | Real-ESRGAN / Swin2SR | BSD-3-Clause / Apache-2.0 |
| Portrait matting | MODNet (`Xenova/modnet`) | Apache-2.0 |
