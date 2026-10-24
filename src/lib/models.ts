import { t } from "../i18n";

/**
 * Local background-removal models. Every entry is pinned to an immutable Hugging Face commit
 * and verified by SHA-256 after download, so users get exactly the reviewed file.
 * Licenses were checked on 2026-10-24 (see docs/architecture.md#ai-models).
 */
export interface SegmentationModel {
  /** Also selects the translated label/description (`model.<id>.label`). */
  id: "isnet-int8" | "birefnet-lite";
  url: string;
  sha256: string;
  bytes: number;
  license: string;
  source: string;
  inputSize: number;
  /** Pixel normalisation: value = (pixel * scale - mean) / std, per RGB channel. */
  scale: number;
  mean: [number, number, number];
  std: [number, number, number];
  /** How raw output becomes a 0..1 alpha: ISNet emits probabilities, BiRefNet emits logits. */
  activation: "minmax" | "sigmoid";
  /** Too large for the 4 GB WebAssembly heap on CPU (std::bad_alloc, measured): WebGPU only. */
  gpuOnly?: boolean;
}

export const MODELS: SegmentationModel[] = [
  {
    id: "isnet-int8",
    url: "https://huggingface.co/onnx-community/ISNet-ONNX/resolve/3fe6e3db3e32c69aadde61fe388ddb1a0574440c/onnx/model_quantized.onnx",
    sha256: "9f5c5fa3ccc771612d5290a648f055f94a4fa4ce289c6b3df7258e7e10e87a42",
    bytes: 44_348_381,
    license: "AGPL-3.0",
    source: "https://huggingface.co/onnx-community/ISNet-ONNX",
    inputSize: 1024,
    scale: 1,
    mean: [128, 128, 128],
    std: [256, 256, 256],
    activation: "minmax",
  },
  {
    id: "birefnet-lite",
    url: "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx",
    sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
    bytes: 224_005_088,
    license: "MIT",
    source: "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX",
    inputSize: 1024,
    scale: 1 / 255,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    activation: "sigmoid",
    gpuOnly: true,
  },
];

export const getModel = (id: string) => MODELS.find((m) => m.id === id) ?? MODELS[0];
export const modelLabel = (m: SegmentationModel) => t(`model.${m.id}.label`);
export const modelDescription = (m: SegmentationModel) => t(`model.${m.id}.description`);
