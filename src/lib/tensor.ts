import type { SegmentationModel } from "./models";

/** RGBA pixels (already resized to the model input) -> planar float32 NCHW tensor data. */
export function rgbaToTensor(
  rgba: Uint8ClampedArray,
  m: Pick<SegmentationModel, "scale" | "mean" | "std">,
): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * n + i] = (rgba[i * 4 + c] * m.scale - m.mean[c]) / m.std[c];
    }
  }
  return out;
}

/** Raw model output -> 8-bit alpha mask. */
export function outputToMask(raw: Float32Array, activation: SegmentationModel["activation"]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(raw.length);
  if (activation === "sigmoid") {
    for (let i = 0; i < raw.length; i++) out[i] = 255 / (1 + Math.exp(-raw[i]));
    return out;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < raw.length; i++) out[i] = ((raw[i] - min) / range) * 255;
  return out;
}

/** Writes `mask` into the alpha channel of a copy of `rgba` (same pixel count). */
export function applyMask(rgba: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < mask.length; i++) out[i * 4 + 3] = (rgba[i * 4 + 3] * mask[i]) / 255;
  return out;
}
