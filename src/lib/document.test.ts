import { describe, expect, it } from "vitest";
import {
  addLayer,
  align,
  boundsOf,
  duplicateLayers,
  hitTest,
  layerCorners,
  layersInRect,
  moveLayer,
  removeLayers,
  resizeFromCorner,
  rotationFromPointer,
  snap,
  textLayer,
  toLayerLocal,
  toggleSelected,
  updateLayer,
  type Doc,
  type ImageLayer,
} from "./document";

const fakeImage = (w: number, h: number) => ({ width: w, height: h }) as ImageBitmap;
const img = (id: string, w: number, h: number, x: number, y: number, mask: Uint8ClampedArray | null = null): ImageLayer => ({
  id, name: id, visible: true, opacity: 1, x, y, scale: 1, rotation: 0, shadow: null,
  kind: "image", sourceBlob: new Blob(), image: fakeImage(w, h), mask, aiMask: null, modelId: null,
});
const measure = () => ({ width: 100, height: 20 });
const doc = (...layers: Doc["layers"]): Doc => ({ name: "d", width: 200, height: 200, background: { type: "transparent" }, layers, selectedIds: [] });
const ids = (d: Doc) => d.layers.map((l) => l.id);

describe("layer stack", () => {
  it("adds on top and selects the new layer", () => {
    const d = addLayer(doc(img("a", 10, 10, 5, 5)), img("b", 10, 10, 5, 5));
    expect(ids(d)).toEqual(["a", "b"]);
    expect(d.selectedIds).toEqual(["b"]);
  });
  it("moves layers within bounds", () => {
    const d = doc(img("a", 1, 1, 0, 0), img("b", 1, 1, 0, 0), img("c", 1, 1, 0, 0));
    expect(ids(moveLayer(d, "a", 1))).toEqual(["b", "a", "c"]);
    expect(moveLayer(d, "c", 1)).toBe(d);
    expect(moveLayer(d, "a", -1)).toBe(d);
  });
  it("removes several layers and keeps a selection", () => {
    const d = { ...doc(img("a", 1, 1, 0, 0), img("b", 1, 1, 0, 0), img("c", 1, 1, 0, 0)), selectedIds: ["b", "c"] };
    expect(removeLayers(d, ["b", "c"])).toMatchObject({ selectedIds: ["a"], layers: [{ id: "a" }] });
  });
  it("updates immutably and shares untouched layers", () => {
    const a = img("a", 1, 1, 0, 0);
    const d = doc(a, img("b", 1, 1, 0, 0));
    const next = updateLayer(d, "b", { opacity: 0.5 });
    expect(next.layers[0]).toBe(a);
    expect(d.layers[1].opacity).toBe(1);
    expect(next.layers[1].opacity).toBe(0.5);
  });
  it("duplicates above the topmost original, offset, and selects the copies", () => {
    const d = duplicateLayers(doc(img("a", 1, 1, 10, 10), img("b", 1, 1, 0, 0), img("c", 1, 1, 0, 0)), ["a", "b"]);
    expect(d.layers.map((l) => l.name)).toEqual(["a", "b", "a", "b", "c"]);
    expect(d.layers[2]).toMatchObject({ x: 30, y: 30 });
    expect(d.selectedIds).toEqual([d.layers[2].id, d.layers[3].id]);
  });
  it("toggles layers in a multiple selection", () => {
    let d = { ...doc(img("a", 1, 1, 0, 0), img("b", 1, 1, 0, 0)), selectedIds: ["a"] };
    d = toggleSelected(d, "b");
    expect(d.selectedIds).toEqual(["a", "b"]);
    expect(toggleSelected(d, "a").selectedIds).toEqual(["b"]);
  });
});

describe("geometry", () => {
  it("maps canvas points into rotated, scaled layers", () => {
    const l = { ...img("a", 100, 50, 100, 100), rotation: 90, scale: 2 };
    // Rotated 90° clockwise, the layer's left side points up: 20 canvas px above the centre is 10 layer px left of it (scale 2).
    expect(toLayerLocal(l, { width: 100, height: 50 }, 100, 100)).toEqual({ x: 50, y: 25 });
    const q = toLayerLocal(l, { width: 100, height: 50 }, 100, 80);
    expect(q.x).toBeCloseTo(40);
    expect(q.y).toBeCloseTo(25);
  });
  it("hits the topmost visible layer, ignoring transparent mask pixels", () => {
    const mask = new Uint8ClampedArray(10 * 10); // fully transparent
    const bottom = img("bottom", 100, 100, 50, 50);
    const d = doc(bottom, img("masked", 10, 10, 50, 50, mask));
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
  it("computes rotated bounds", () => {
    const b = boundsOf([{ ...img("a", 100, 50, 100, 100), rotation: 90 }], measure)!;
    expect(b.left).toBeCloseTo(75);
    expect(b.right).toBeCloseTo(125);
    expect(b.top).toBeCloseTo(50);
    expect(b.bottom).toBeCloseTo(150);
  });
  it("selects layers entirely inside a marquee", () => {
    const d = doc(img("a", 10, 10, 20, 20), img("b", 10, 10, 100, 100), img("big", 200, 200, 100, 100));
    expect(layersInRect(d, { left: 0, top: 0, right: 30, bottom: 30 }, measure).map((l) => l.id)).toEqual(["a"]);
    expect(layersInRect(d, { left: 0, top: 0, right: 110, bottom: 110 }, measure).map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("transform handles", () => {
  it("resizes from a corner, keeping the opposite corner fixed", () => {
    const l = img("a", 100, 100, 100, 100); // corners (50,50) … (150,150)
    const r = resizeFromCorner(l, { width: 100, height: 100 }, 2, 250, 250); // drag bottom-right to (250,250)
    expect(r.scale).toBeCloseTo(2);
    expect(r.x).toBeCloseTo(150);
    expect(r.y).toBeCloseTo(150);
    const moved = layerCorners({ ...l, ...r }, { width: 100, height: 100 });
    expect(moved[0].x).toBeCloseTo(50);
    expect(moved[0].y).toBeCloseTo(50);
  });
  it("resizes rotated layers along their own diagonal and never inverts", () => {
    const l = { ...img("a", 100, 100, 100, 100), rotation: 45 };
    const size = { width: 100, height: 100 };
    const c = layerCorners(l, size);
    const r = resizeFromCorner(l, size, 1, c[1].x, c[1].y);
    expect(r.scale).toBeCloseTo(1);
    expect(resizeFromCorner(l, size, 1, c[3].x, c[3].y).scale).toBeGreaterThan(0);
  });
  it("rotates from the pointer, snapping to right angles and to 15° steps with Shift", () => {
    const l = img("a", 10, 10, 100, 100);
    expect(rotationFromPointer(l, 100, 0, false)).toBe(0); // straight above
    expect(rotationFromPointer(l, 200, 100, false)).toBe(90); // right
    expect(rotationFromPointer(l, 100, 200, false)).toBe(-180); // below
    expect(rotationFromPointer(l, 200, 99, false)).toBe(90); // within 3° of 90
    expect(rotationFromPointer(l, 200, 60, true)).toBe(75); // 68.2° snaps to the nearest 15° step
  });
});

describe("alignment and snapping", () => {
  it("aligns a single layer to the canvas", () => {
    const d = doc(img("a", 20, 20, 50, 70));
    expect(align(d, ["a"], "left", measure).get("a")).toEqual({ x: 10, y: 70 });
    expect(align(d, ["a"], "bottom", measure).get("a")).toEqual({ x: 50, y: 190 });
    expect(align(d, ["a"], "center", measure).get("a")).toEqual({ x: 100, y: 70 });
  });
  it("aligns several layers to their common bounds", () => {
    const d = doc(img("a", 20, 20, 30, 30), img("b", 40, 40, 100, 100));
    const p = align(d, ["a", "b"], "right", measure);
    expect(p.get("a")).toEqual({ x: 110, y: 30 });
    expect(p.get("b")).toEqual({ x: 100, y: 100 });
  });
  it("snaps edges and centres within the threshold, and shows guides", () => {
    const canvas = { width: 200, height: 200 };
    const s = snap({ left: 93, top: 10, right: 103, bottom: 20 }, [], canvas, 6); // centre x 98 → 100
    expect(s.dx).toBe(2);
    expect(s.dy).toBe(0); // top edge 10 is more than 6 px from the canvas top: no vertical snap
    expect(s.guides).toEqual([{ axis: "x", at: 100 }]);
    const t = snap({ left: 40, top: 40, right: 60, bottom: 60 }, [{ left: 62, top: 0, right: 80, bottom: 10 }], canvas, 6);
    expect(t.dx).toBe(2); // right edge 60 → other layer's left edge 62
    expect(snap({ left: 40, top: 40, right: 60, bottom: 60 }, [], canvas, 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
