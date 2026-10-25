/**
 * Editor document model. Documents are immutable values: every edit creates a new document
 * that shares unchanged parts (bitmaps, blobs, masks) with the previous one. Undo/redo can
 * therefore keep whole documents cheaply, and React re-renders on identity changes.
 */
import type { BackgroundState } from "./compose";

/** Drop shadow, in canvas pixels. It follows the layer's visible pixels (cut-out or text). */
export interface Shadow {
  color: string;
  /** 0..1 */
  opacity: number;
  blur: number;
  x: number;
  y: number;
}
export const DEFAULT_SHADOW: Shadow = { color: "#000000", opacity: 0.35, blur: 24, x: 0, y: 16 };

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
  shadow: Shadow | null;
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
  /** Selected layer ids; the last one is the "primary" selection shown in panels. */
  selectedIds: string[];
}

export const LINE_HEIGHT = 1.2;

let counter = 0;
export const newId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

const base = (name: string, x: number, y: number): LayerBase => ({
  id: newId(), name, visible: true, opacity: 1, x, y, scale: 1, rotation: 0, shadow: null,
});

export function imageLayer(name: string, sourceBlob: Blob, image: ImageBitmap, x: number, y: number, scale = 1): ImageLayer {
  return { ...base(name, x, y), scale, kind: "image", sourceBlob, image, mask: null, aiMask: null, modelId: null };
}

export function textLayer(name: string, text: string, x: number, y: number, size: number): TextLayer {
  return { ...base(name, x, y), kind: "text", text, font: "sans", size, bold: true, italic: false, color: "#1b1f1d", align: "center" };
}

/** A new document whose canvas has the size of its first image. */
export function docFromImage(name: string, sourceBlob: Blob, image: ImageBitmap): Doc {
  const layer = imageLayer(name, sourceBlob, image, image.width / 2, image.height / 2);
  return { name, width: image.width, height: image.height, background: { type: "transparent" }, layers: [layer], selectedIds: [layer.id] };
}

// ---------- selection ----------

export const findLayer = (doc: Doc, id: string | null) => doc.layers.find((l) => l.id === id) ?? null;
/** The primary selected layer (shown in the property panels). */
export const selectedLayer = (doc: Doc) => findLayer(doc, doc.selectedIds.at(-1) ?? null);
export const selectedLayers = (doc: Doc) => doc.layers.filter((l) => doc.selectedIds.includes(l.id));

export function select(doc: Doc, ids: string[]): Doc {
  return { ...doc, selectedIds: ids.filter((id) => findLayer(doc, id)) };
}

/** Shift/Ctrl-click: adds the layer to the selection, or removes it if already selected. */
export function toggleSelected(doc: Doc, id: string): Doc {
  const ids = doc.selectedIds.includes(id) ? doc.selectedIds.filter((x) => x !== id) : [...doc.selectedIds, id];
  return { ...doc, selectedIds: ids };
}

// ---------- edits ----------

export function updateLayer<L extends Layer>(doc: Doc, id: string, patch: Partial<L>): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function updateLayers(doc: Doc, patches: Map<string, Partial<Layer>>): Doc {
  return { ...doc, layers: doc.layers.map((l) => (patches.has(l.id) ? ({ ...l, ...patches.get(l.id) } as Layer) : l)) };
}

export function addLayer(doc: Doc, layer: Layer): Doc {
  return { ...doc, layers: [...doc.layers, layer], selectedIds: [layer.id] };
}

export function removeLayers(doc: Doc, ids: string[]): Doc {
  const layers = doc.layers.filter((l) => !ids.includes(l.id));
  const selectedIds = doc.selectedIds.filter((id) => !ids.includes(id));
  return { ...doc, layers, selectedIds: selectedIds.length || !layers.length ? selectedIds : [layers.at(-1)!.id] };
}

/** Copies of the given layers, offset a little and placed just above the topmost original. */
export function duplicateLayers(doc: Doc, ids: string[], offset = 20): Doc {
  const copies = doc.layers.filter((l) => ids.includes(l.id)).map((l) => ({ ...l, id: newId(), x: l.x + offset, y: l.y + offset }));
  if (!copies.length) return doc;
  const top = Math.max(...doc.layers.map((l, i) => (ids.includes(l.id) ? i : -1)));
  const layers = [...doc.layers.slice(0, top + 1), ...copies, ...doc.layers.slice(top + 1)];
  return { ...doc, layers, selectedIds: copies.map((c) => c.id) };
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

// ---------- geometry ----------

export type Measure = (layer: TextLayer) => { width: number; height: number };
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Unscaled, unrotated size of a layer. */
export function intrinsicSize(layer: Layer, measure: Measure) {
  return layer.kind === "image" ? { width: layer.image.width, height: layer.image.height } : measure(layer);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The four corners of a layer in canvas coordinates: top-left, top-right, bottom-right, bottom-left. */
export function layerCorners(layer: Layer, size: { width: number; height: number }) {
  const [c, s] = [Math.cos(rad(layer.rotation)), Math.sin(rad(layer.rotation))];
  const [hw, hh] = [(size.width * layer.scale) / 2, (size.height * layer.scale) / 2];
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const).map(([x, y]) => ({ x: layer.x + x * c - y * s, y: layer.y + x * s + y * c }));
}

/** Axis-aligned bounding box (canvas pixels) of layers, rotation included. */
export function boundsOf(layers: Layer[], measure: Measure): Box | null {
  if (!layers.length) return null;
  const pts = layers.flatMap((l) => layerCorners(l, intrinsicSize(l, measure)));
  return {
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
}

/** Canvas → layer-local coordinates (origin at the layer's top-left corner, intrinsic pixels). */
export function toLayerLocal(layer: Layer, size: { width: number; height: number }, px: number, py: number) {
  const r = rad(-layer.rotation);
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

/**
 * Visible layers entirely inside the rectangle (marquee selection). Containment, not overlap:
 * otherwise a full-canvas photo would be selected by every marquee.
 */
export function layersInRect(doc: Doc, r: Box, measure: Measure): Layer[] {
  return doc.layers.filter((l) => {
    if (!l.visible) return false;
    const b = boundsOf([l], measure)!;
    return b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom;
  });
}

/**
 * Corner-handle resize: the corner opposite to the dragged one stays fixed and the scale
 * follows the pointer's projection on the layer diagonal (works for rotated layers).
 */
export function resizeFromCorner(start: Layer, size: { width: number; height: number }, corner: 0 | 1 | 2 | 3, px: number, py: number, minScale = 0.02) {
  const corners = layerCorners(start, size);
  const fixed = corners[(corner + 2) % 4];
  const moving = corners[corner];
  const [dx, dy] = [moving.x - fixed.x, moving.y - fixed.y];
  const t = Math.max(minScale / start.scale, ((px - fixed.x) * dx + (py - fixed.y) * dy) / (dx * dx + dy * dy));
  return { scale: start.scale * t, x: fixed.x + (dx * t) / 2, y: fixed.y + (dy * t) / 2 };
}

/** Rotation handle: angle of the pointer around the layer centre (handle sits above the layer). */
export function rotationFromPointer(layer: Layer, px: number, py: number, snap: boolean) {
  let deg = (Math.atan2(py - layer.y, px - layer.x) * 180) / Math.PI + 90;
  deg = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (snap) return Math.round(deg / 15) * 15;
  const nearest = Math.round(deg / 90) * 90;
  return Math.abs(deg - nearest) < 3 ? nearest : Math.round(deg * 10) / 10; // gentle snap to right angles
}

// ---------- alignment and snapping ----------

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * Aligns layers. One layer aligns to the canvas; several align to their common bounding box.
 * Returns the position patch for each layer (bounds include rotation).
 */
export function align(doc: Doc, ids: string[], how: Alignment, measure: Measure): Map<string, Partial<Layer>> {
  const layers = doc.layers.filter((l) => ids.includes(l.id));
  const target: Box = layers.length === 1 ? { left: 0, top: 0, right: doc.width, bottom: doc.height } : boundsOf(layers, measure)!;
  const patches = new Map<string, Partial<Layer>>();
  for (const l of layers) {
    const b = boundsOf([l], measure)!;
    const dx = how === "left" ? target.left - b.left : how === "right" ? target.right - b.right : how === "center" ? (target.left + target.right - b.left - b.right) / 2 : 0;
    const dy = how === "top" ? target.top - b.top : how === "bottom" ? target.bottom - b.bottom : how === "middle" ? (target.top + target.bottom - b.top - b.bottom) / 2 : 0;
    patches.set(l.id, { x: Math.round(l.x + dx), y: Math.round(l.y + dy) });
  }
  return patches;
}

export interface Guide {
  axis: "x" | "y";
  /** Canvas coordinate of the guide line. */
  at: number;
}

/**
 * Smart snapping while moving: if an edge or the centre of `moving` comes within `threshold`
 * of the canvas edges/centre or of another layer's edges/centre, returns the offset that
 * aligns them and the guides to draw.
 */
export function snap(moving: Box, others: Box[], canvas: { width: number; height: number }, threshold: number) {
  const targets = [{ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, ...others];
  const lines = (b: Box, axis: "x" | "y") => (axis === "x" ? [b.left, (b.left + b.right) / 2, b.right] : [b.top, (b.top + b.bottom) / 2, b.bottom]);
  const result = { dx: 0, dy: 0, guides: [] as Guide[] };
  for (const axis of ["x", "y"] as const) {
    let best: { delta: number; at: number } | null = null;
    for (const t of targets)
      for (const at of lines(t, axis))
        for (const own of lines(moving, axis)) {
          const delta = at - own;
          if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at };
        }
    if (best) {
      if (axis === "x") result.dx = best.delta;
      else result.dy = best.delta;
      result.guides.push({ axis, at: best.at });
    }
  }
  return result;
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
