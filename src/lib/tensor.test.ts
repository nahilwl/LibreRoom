import { describe, expect, it } from "vitest";
import { applyMask, outputToMask, rgbaToTensor } from "./tensor";

describe("rgbaToTensor", () => {
  it("writes planar channels with normalisation", () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255]);
    const t = rgbaToTensor(rgba, { scale: 1, mean: [128, 128, 128], std: [256, 256, 256] });
    expect(Array.from(t)).toEqual([127 / 256, -128 / 256, -128 / 256, 127 / 256, 0, -128 / 256]);
  });
});

describe("outputToMask", () => {
  it("min-max stretches probabilities", () => {
    expect(Array.from(outputToMask(new Float32Array([0.2, 0.6, 1]), "minmax"))).toEqual([0, 128, 255]);
  });
  it("applies a sigmoid to logits", () => {
    expect(Array.from(outputToMask(new Float32Array([-20, 0, 20]), "sigmoid"))).toEqual([0, 128, 255]);
  });
  it("does not divide by zero on a flat output", () => {
    expect(Array.from(outputToMask(new Float32Array([0.5, 0.5]), "minmax"))).toEqual([0, 0]);
  });
});

describe("applyMask", () => {
  it("multiplies existing alpha by the mask", () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]);
    expect(Array.from(applyMask(rgba, new Uint8ClampedArray([0, 255])))).toEqual([1, 2, 3, 0, 4, 5, 6, 128]);
  });
});
