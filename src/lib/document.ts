/**
 * Editor document model. Documents are immutable values: every edit creates a new document
 * that shares unchanged parts (bitmaps, blobs, masks) with the previous one. Undo/redo can
 * therefore keep whole documents cheaply, and React re-renders on identity changes.
 */
import type { BackgroundState } from "./compose";

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  /** 0..1 */
  opacity: number;
  /** Centre of the layer, in canvas pixels. */
  x: number;
  y: number;
  /** Uniform scale factor applied to the layer's intrinsic size. */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  /** Original imported file, kept byte-for-byte for saving. */
  sourceBlob: Blob;
  image: ImageBitmap;
  /** Subject mask, one alpha byte per image pixel; null = whole image visible. Never mutated. */
  mask: Uint8ClampedArray | null;
  /** AI result, so manual touch-ups can be discarded. Never mutated. */
  aiMask: Uint8ClampedArray | null;
  modelId: string | null;
}

export type FontFamily = "sans" | "serif" | "mono";
export const FONT_STACKS: Record<FontFamily, string> = {
  sans: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", "Noto Serif", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono", monospace',
};

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  font: FontFamily;
  /** Font size in canvas pixels (before `scale`). */
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
}

export type Layer = ImageLayer | TextLayer;

export interface Doc {
  name: string;
  /** Canvas (artboard) size in pixels. */
  width: number;
  height: number;
  background: BackgroundState;
  /** Bottom to top. */
  layers: Layer[];
  selectedId: string | null;
}

export const LINE_HEIGHT = 1.2;

let counter = 0;
export const newId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

const base = (name: string, x: number, y: number): LayerBase => ({ id: newId(), name, visible: true, opacity: 1, x, y, scale: 1, rotation: 0 });

export function imageLayer(name: string, sourceBlob: Blob, image: ImageBitmap, x: number, y: number, scale = 1): ImageLayer {
  return { ...base(name, x, y), scale, kind: "image", sourceBlob, image, mask: null, aiMask: null, modelId: null };
}

export function textLayer(name: string, text: string, x: number, y: number, size: number): TextLayer {
  return { ...base(name, x, y), kind: "text", text, font: "sans", size, bold: true, italic: false, color: "#1b1f1d", align: "center" };
}

/** A new document whose canvas has the size of its first image. */
export function docFromImage(name: string, sourceBlob: Blob, image: ImageBitmap): Doc {
  const layer = imageLayer(name, sourceBlob, image, image.width / 2, image.height / 2);
  return { name, width: image.width, height: image.height, background: { type: "transparent" }, layers: [layer], selectedId: layer.id };
}

export const findLayer = (doc: Doc, id: string | null) => doc.layers.find((l) => l.id === id) ?? null;
export const selectedLayer = (doc: Doc) => findLayer(doc, doc.selectedId);

export function updateLayer<L extends Layer>(doc: Doc, id: string, patch: Partial<L>): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function addLayer(doc: Doc, layer: Layer): Doc {
  return { ...doc, layers: [...doc.layers, layer], selectedId: layer.id };
}

export function removeLayer(doc: Doc, id: string): Doc {
  const layers = doc.layers.filter((l) => l.id !== id);
  return { ...doc, layers, selectedId: doc.selectedId === id ? (layers.at(-1)?.id ?? null) : doc.selectedId };
}

/** Moves a layer up (+1, towards the top) or down (-1) in the stack. */
export function moveLayer(doc: Doc, id: string, delta: 1 | -1): Doc {
  const i = doc.layers.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.layers.length) return doc;
  const layers = [...doc.layers];
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...doc, layers };
}

export type Measure = (layer: TextLayer) => { width: number; height: number };

/** Unscaled, unrotated size of a layer. */
export function intrinsicSize(layer: Layer, measure: Measure) {
  return layer.kind === "image" ? { width: layer.image.width, height: layer.image.height } : measure(layer);
}

/** Canvas → layer-local coordinates (origin at the layer's top-left corner, intrinsic pixels). */
export function toLayerLocal(layer: Layer, size: { width: number; height: number }, px: number, py: number) {
  const r = (-layer.rotation * Math.PI) / 180;
  const dx = px - layer.x;
  const dy = py - layer.y;
  const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / layer.scale;
  const ly = (dx * Math.sin(r) + dy * Math.cos(r)) / layer.scale;
  return { x: lx + size.width / 2, y: ly + size.height / 2 };
}

/** Topmost visible layer under a canvas point. Image layers are hit on their opaque (masked) pixels. */
export function hitTest(doc: Doc, px: number, py: number, measure: Measure): Layer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    const size = intrinsicSize(layer, measure);
    const p = toLayerLocal(layer, size, px, py);
    if (p.x < 0 || p.y < 0 || p.x >= size.width || p.y >= size.height) continue;
    if (layer.kind === "image" && layer.mask && layer.mask[Math.floor(p.y) * size.width + Math.floor(p.x)] < 32) continue;
    return layer;
  }
  return null;
}

/** Bytes held by masks, counting each (immutable, shared) array once: for the undo budget. */
export function maskBytes(docs: Doc[]) {
  const seen = new Set<Uint8ClampedArray>();
  for (const d of docs)
    for (const l of d.layers)
      if (l.kind === "image") for (const m of [l.mask, l.aiMask]) if (m) seen.add(m);
  let n = 0;
  for (const m of seen) n += m.length;
  return n;
}
