import { describe, expect, it } from "vitest";
import { addLayer, hitTest, moveLayer, removeLayer, textLayer, toLayerLocal, updateLayer, type Doc, type ImageLayer } from "./document";

const fakeImage = (w: number, h: number) => ({ width: w, height: h }) as ImageBitmap;
const img = (id: string, w: number, h: number, x: number, y: number, mask: Uint8ClampedArray | null = null): ImageLayer => ({
  id, name: id, visible: true, opacity: 1, x, y, scale: 1, rotation: 0,
  kind: "image", sourceBlob: new Blob(), image: fakeImage(w, h), mask, aiMask: null, modelId: null,
});
const measure = () => ({ width: 100, height: 20 });
const doc = (...layers: Doc["layers"]): Doc => ({ name: "d", width: 200, height: 200, background: { type: "transparent" }, layers, selectedId: null });

describe("layer stack", () => {
  it("adds on top and selects the new layer", () => {
    const d = addLayer(doc(img("a", 10, 10, 5, 5)), img("b", 10, 10, 5, 5));
    expect(d.layers.map((l) => l.id)).toEqual(["a", "b"]);
    expect(d.selectedId).toBe("b");
  });
  it("moves layers within bounds", () => {
    const d = doc(img("a", 1, 1, 0, 0), img("b", 1, 1, 0, 0), img("c", 1, 1, 0, 0));
    expect(moveLayer(d, "a", 1).layers.map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(moveLayer(d, "c", 1)).toBe(d);
    expect(moveLayer(d, "a", -1)).toBe(d);
  });
  it("removes a layer and re-selects the top one", () => {
    const d = { ...doc(img("a", 1, 1, 0, 0), img("b", 1, 1, 0, 0)), selectedId: "b" };
    expect(removeLayer(d, "b")).toMatchObject({ selectedId: "a", layers: [{ id: "a" }] });
  });
  it("updates immutably and shares untouched layers", () => {
    const a = img("a", 1, 1, 0, 0);
    const d = doc(a, img("b", 1, 1, 0, 0));
    const next = updateLayer(d, "b", { opacity: 0.5 });
    expect(next.layers[0]).toBe(a);
    expect(d.layers[1].opacity).toBe(1);
    expect(next.layers[1].opacity).toBe(0.5);
  });
});

describe("geometry", () => {
  it("maps canvas points into rotated, scaled layers", () => {
    const l = { ...img("a", 100, 50, 100, 100), rotation: 90, scale: 2 };
    // Rotated 90° clockwise, the layer's left side points up: 20 canvas px above the centre is 10 layer px left of it (scale 2).
    const p = toLayerLocal(l, { width: 100, height: 50 }, 100, 100);
    expect(p).toEqual({ x: 50, y: 25 });
    const q = toLayerLocal(l, { width: 100, height: 50 }, 100, 80);
    expect(q.x).toBeCloseTo(40);
    expect(q.y).toBeCloseTo(25);
  });
  it("hits the topmost visible layer, ignoring transparent mask pixels", () => {
    const mask = new Uint8ClampedArray(10 * 10); // fully transparent
    const bottom = img("bottom", 100, 100, 50, 50);
    const masked = img("masked", 10, 10, 50, 50, mask);
    const d = doc(bottom, masked);
    expect(hitTest(d, 50, 50, measure)?.id).toBe("bottom");
    mask.fill(255);
    expect(hitTest(d, 50, 50, measure)?.id).toBe("masked");
    expect(hitTest(doc({ ...bottom, visible: false }), 50, 50, measure)).toBeNull();
    expect(hitTest(d, 150, 150, measure)).toBeNull();
  });
  it("hits text layers on their measured box", () => {
    const t = textLayer("t", "Hi", 100, 100, 20);
    expect(hitTest(doc(t), 140, 105, measure)?.id).toBe(t.id);
    expect(hitTest(doc(t), 160, 105, measure)).toBeNull();
  });
});
