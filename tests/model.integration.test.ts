/**
 * Runs a real model on a synthetic image (red disc on white). Opt-in because it needs the model file:
 *   LIBREROOM_MODEL_DIR=/path/with/<model-id>.onnx npm test
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vitest";
import { MODELS } from "../src/lib/models";
import { outputToMask, rgbaToTensor } from "../src/lib/tensor";

const dir = process.env.LIBREROOM_MODEL_DIR;

for (const model of MODELS) {
  const file = dir ? join(dir, `${model.id}.onnx`) : "";
  // Node runs ONNX on CPU (WASM), so GPU-only models cannot be checked here.
  describe.skipIf(!dir || !existsSync(file) || model.gpuOnly)(`model ${model.id}`, () => {
    it("separates a disc from a plain background", { timeout: 300_000 }, async () => {
      const s = model.inputSize;
      const rgba = new Uint8ClampedArray(s * s * 4).fill(255);
      const inDisc = (x: number, y: number) => (x - s / 2) ** 2 + (y - s / 2) ** 2 < (s / 4) ** 2;
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++)
          if (inDisc(x, y)) rgba.set([220, 30, 30, 255], (y * s + x) * 4);

      const session = await ort.InferenceSession.create(readFileSync(file));
      const input = new ort.Tensor("float32", rgbaToTensor(rgba, model), [1, 3, s, s]);
      const t0 = performance.now();
      const out = await session.run({ [session.inputNames[0]]: input });
      console.log(`${model.id}: ${(performance.now() - t0).toFixed(0)} ms (CPU wasm, Node)`);
      const mask = outputToMask(out[session.outputNames[0]].data as Float32Array, model.activation);

      expect(mask.length).toBe(s * s);
      expect(mask[(s / 2) * s + s / 2]).toBeGreaterThan(200); // centre of disc kept
      expect(mask[10 * s + 10]).toBeLessThan(50); // corner removed
    });
  });
}
