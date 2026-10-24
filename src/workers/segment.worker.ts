/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/webgpu";
// Served from our own origin: no runtime file is ever fetched from a CDN. The glue .mjs is kept
// separate (not bundled) because ORT's WASM threads load it themselves; bundled, they hang.
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import { AppError, setLanguage, type Language } from "../i18n";
import { getModel } from "../lib/models";
import { loadModelBytes } from "../lib/modelStore";
import { outputToMask, rgbaToTensor } from "../lib/tensor";

/**
 * Image work for background removal, off the UI thread:
 *  - "segment": the whole pipeline with ONNX Runtime Web (browser engine);
 *  - "prepare" + "finish": pre/post-processing only, when the desktop app runs the model natively.
 * Both paths share the exact same pre- and post-processing code.
 */
export type SegmentRequest = { id: number; lang: Language; modelId: string } & (
  | { kind: "segment"; image: ImageBitmap }
  | { kind: "prepare"; image: ImageBitmap }
  | { kind: "finish"; raw: Float32Array; width: number; height: number }
);
export type MaskResult = { mask: Uint8ClampedArray; width: number; height: number };
export type SegmentResponse =
  | ({ id: number; ok: true; kind: "segment"; ms: number; backend: string } & MaskResult)
  | { id: number; ok: true; kind: "prepare"; tensor: Float32Array; width: number; height: number }
  | ({ id: number; ok: true; kind: "finish" } & MaskResult)
  | { id: number; ok: false; error: string };

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

type GPULike = { requestAdapter(): Promise<unknown> };

let loaded: { modelId: string; session: ort.InferenceSession; backend: string } | null = null;

async function getSession(modelId: string) {
  if (loaded?.modelId === modelId) return loaded;
  await loaded?.session.release();
  loaded = null;
  const model = getModel(modelId);
  const bytes = await loadModelBytes(model);
  // WebGPU when the browser exposes it, otherwise multi-threaded CPU (WASM).
  // navigator.gpu can exist without a usable adapter (e.g. headless, blocklisted drivers).
  const adapter = "gpu" in navigator ? await (navigator as Navigator & { gpu: GPULike }).gpu.requestAdapter().catch(() => null) : null;
  if (adapter) {
    try {
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"] });
      return (loaded = { modelId, session, backend: "GPU (WebGPU)" });
    } catch (err) {
      if (model.gpuOnly) throw new AppError("error.webgpuFailed", { message: (err as Error).message });
    }
  }
  if (model.gpuOnly) throw new AppError("error.webgpuRequired");
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
  return (loaded = { modelId, session, backend: `CPU (${ort.env.wasm.numThreads} thread(s))` });
}

/** Resizes to the model input and normalises into an NCHW tensor. */
function prepare(modelId: string, image: ImageBitmap) {
  const model = getModel(modelId);
  const s = model.inputSize;
  const { width, height } = image;
  const small = new OffscreenCanvas(s, s).getContext("2d", { willReadFrequently: true })!;
  small.drawImage(image, 0, 0, s, s);
  image.close();
  return { tensor: rgbaToTensor(small.getImageData(0, 0, s, s).data, model), width, height };
}

/** Turns the raw model output into a mask at the original image size (bilinear upscale). */
function finish(modelId: string, raw: Float32Array, width: number, height: number): MaskResult {
  const model = getModel(modelId);
  const s = model.inputSize;
  const alpha = outputToMask(raw, model.activation);
  const lowRes = new ImageData(s, s);
  for (let i = 0; i < alpha.length; i++) lowRes.data[i * 4 + 3] = alpha[i];
  const small = new OffscreenCanvas(s, s).getContext("2d")!;
  small.putImageData(lowRes, 0, 0);
  const full = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
  full.imageSmoothingQuality = "high";
  full.drawImage(small.canvas, 0, 0, width, height);
  const px = full.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3];
  return { mask, width, height };
}

async function segment(modelId: string, image: ImageBitmap) {
  const { tensor, width, height } = prepare(modelId, image);
  const s = getModel(modelId).inputSize;
  const t0 = performance.now();
  const { session, backend } = await getSession(modelId);
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, s, s]) });
  const ms = performance.now() - t0;
  const raw = (await out[session.outputNames[0]].getData()) as Float32Array;
  return { ...finish(modelId, raw, width, height), ms, backend };
}

self.onmessage = async (e: MessageEvent<SegmentRequest>) => {
  const req = e.data;
  setLanguage(req.lang);
  try {
    if (req.kind === "segment") {
      const r = await segment(req.modelId, req.image);
      self.postMessage({ id: req.id, ok: true, kind: "segment", ...r } satisfies SegmentResponse, [r.mask.buffer]);
    } else if (req.kind === "prepare") {
      const r = prepare(req.modelId, req.image);
      self.postMessage({ id: req.id, ok: true, kind: "prepare", ...r } satisfies SegmentResponse, [r.tensor.buffer]);
    } else {
      const r = finish(req.modelId, req.raw, req.width, req.height);
      self.postMessage({ id: req.id, ok: true, kind: "finish", ...r } satisfies SegmentResponse, [r.mask.buffer]);
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: String((err as Error).message ?? err) } satisfies SegmentResponse);
  }
};
