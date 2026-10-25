import { AppError } from "../i18n";
import { maskFromAlpha, newCanvas, type BackgroundState } from "./compose";
import { FONT_STACKS, LINE_HEIGHT, intrinsicSize, type Doc, type Layer, type Shadow, type TextLayer } from "./document";

const measureCtx = newCanvas(1, 1).getContext("2d")!;

export const fontOf = (l: TextLayer) => `${l.italic ? "italic " : ""}${l.bold ? 700 : 400} ${l.size}px ${FONT_STACKS[l.font]}`;
const lines = (l: TextLayer) => l.text.split("\n");

/** Intrinsic (unscaled) box of a text layer. */
export function measureText(l: TextLayer) {
  measureCtx.font = fontOf(l);
  const width = Math.max(1, ...lines(l).map((s) => measureCtx.measureText(s).width));
  return { width: Math.ceil(width), height: Math.ceil(lines(l).length * l.size * LINE_HEIGHT) };
}

export const sizeOf = (l: Layer) => intrinsicSize(l, measureText);

// Mask arrays are immutable, so their canvas form can be cached by identity.
const maskCanvases = new WeakMap<Uint8ClampedArray, HTMLCanvasElement>();
export function maskCanvas(mask: Uint8ClampedArray, width: number, height: number) {
  let c = maskCanvases.get(mask);
  if (!c) maskCanvases.set(mask, (c = maskFromAlpha(mask, width, height)));
  return c;
}

/** Draws `src` so it covers the rect (like CSS object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, src: ImageBitmap, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / src.width, h / src.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
}

export function drawBackground(ctx: CanvasRenderingContext2D, bg: BackgroundState, x: number, y: number, w: number, h: number) {
  if (bg.type === "color") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(x, y, w, h);
  } else if (bg.type === "image") {
    drawCover(ctx, bg.bitmap, x, y, w, h);
  }
}

export interface View {
  /** Canvas pixels → target pixels. */
  scale: number;
  /** Target position of the canvas origin. */
  dx: number;
  dy: number;
}

/** Sets `ctx` so that (0,0) is the layer's top-left corner in intrinsic pixels. */
function applyLayerTransform(ctx: CanvasRenderingContext2D, view: View, layer: Layer, size: { width: number; height: number }) {
  ctx.setTransform(view.scale, 0, 0, view.scale, view.dx, view.dy);
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scale, layer.scale);
  ctx.translate(-size.width / 2, -size.height / 2);
}

function drawText(ctx: CanvasRenderingContext2D, l: TextLayer, width: number) {
  ctx.font = fontOf(l);
  ctx.fillStyle = l.color;
  ctx.textBaseline = "top";
  ctx.textAlign = l.align;
  const x = l.align === "left" ? 0 : l.align === "center" ? width / 2 : width;
  lines(l).forEach((s, i) => ctx.fillText(s, x, i * l.size * LINE_HEIGHT + (l.size * (LINE_HEIGHT - 1)) / 2));
}

const rgba = (hex: string, alpha: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

/** Canvas shadows ignore the transform (they are in target pixels), hence the view scale. */
function setShadow(ctx: CanvasRenderingContext2D, shadow: Shadow | null, scale: number) {
  ctx.shadowColor = shadow ? rgba(shadow.color, shadow.opacity) : "transparent";
  ctx.shadowBlur = shadow ? shadow.blur * scale : 0;
  ctx.shadowOffsetX = shadow ? shadow.x * scale : 0;
  ctx.shadowOffsetY = shadow ? shadow.y * scale : 0;
}

export interface RenderOptions {
  /** Mask being painted right now (brush stroke in progress), drawn instead of the layer's mask. */
  liveMask?: { layerId: string; canvas: HTMLCanvasElement };
  /** Hold-to-compare: draw image layers without their masks. */
  ignoreMasks?: boolean;
}

/**
 * Renders the document into `ctx` (whose pixel size is the target). `scratch` is a canvas of
 * the same size, reused between frames to composite masked layers without allocations.
 */
export function renderDoc(ctx: CanvasRenderingContext2D, doc: Doc, view: View, scratch: HTMLCanvasElement, opts: RenderOptions = {}) {
  ctx.save();
  drawBackground(ctx, doc.background, view.dx, view.dy, doc.width * view.scale, doc.height * view.scale);
  // Content outside the canvas is not part of the document (and is not exported).
  ctx.beginPath();
  ctx.rect(view.dx, view.dy, doc.width * view.scale, doc.height * view.scale);
  ctx.clip();
  const s = scratch.getContext("2d")!;
  s.imageSmoothingQuality = ctx.imageSmoothingQuality;
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const size = sizeOf(layer);
    ctx.globalAlpha = layer.opacity;
    setShadow(ctx, layer.shadow, view.scale);
    if (layer.kind === "text") {
      applyLayerTransform(ctx, view, layer, size);
      drawText(ctx, layer, size.width);
      continue;
    }
    const mask = opts.ignoreMasks
      ? null
      : opts.liveMask?.layerId === layer.id
        ? opts.liveMask.canvas
        : layer.mask && maskCanvas(layer.mask, size.width, size.height);
    if (!mask) {
      applyLayerTransform(ctx, view, layer, size);
      ctx.drawImage(layer.image, 0, 0);
      continue;
    }
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, scratch.width, scratch.height);
    applyLayerTransform(s, view, layer, size);
    s.drawImage(layer.image, 0, 0);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(mask, 0, 0, size.width, size.height);
    s.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch, 0, 0);
  }
  ctx.restore();
}

export type ExportFormat = "png" | "jpeg" | "webp";

export async function exportImage(doc: Doc, width: number, format: ExportFormat, quality: number) {
  const scale = width / doc.width;
  const height = Math.max(1, Math.round(doc.height * scale));
  const c = newCanvas(width, height);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // JPEG has no alpha channel: flatten transparency onto white instead of black.
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  const scratch = newCanvas(width, height);
  renderDoc(ctx, doc, { scale, dx: 0, dy: 0 }, scratch);
  scratch.width = scratch.height = 0;
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, `image/${format}`, quality));
  // Release the pixel buffers now: WebKit keeps canvas memory until GC otherwise.
  c.width = c.height = 0;
  if (!blob) throw new AppError("error.encodeFailed");
  return blob;
}
