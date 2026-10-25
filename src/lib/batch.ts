import { docFromImage, updateLayer, type Doc, type ImageLayer } from "./document";
import { baseName, decodeImage } from "./files";
import { exportImage, type ExportFormat } from "./render";
import { segment } from "./segmenter";

export interface BatchOptions {
  removeBackground: boolean;
  modelId: string;
  /** null = transparent. */
  background: string | null;
  format: ExportFormat;
  /** 0..1, for JPEG/WebP. */
  quality: number;
  /** Longest side limit in pixels; null = keep the original size (never upscaled). */
  maxSide: number | null;
}

export type BatchStatus = "queued" | "processing" | "done" | "error" | "cancelled";
export interface BatchItem {
  id: string;
  file: File;
  status: BatchStatus;
  /** Output file (the original `file` is never modified). */
  result?: { name: string; blob: Blob };
  error?: string;
  ms?: number;
}

export const extensionOf = (f: ExportFormat) => (f === "jpeg" ? "jpg" : f);

/** `photo.jpg` → `photo-libreroom.png`, made unique among names already used (case-insensitive). */
export function outputName(inputName: string, format: ExportFormat, used: Set<string>) {
  const stem = `${inputName.replace(/\.[^.]+$/, "") || "image"}-libreroom`;
  let name = `${stem}.${extensionOf(format)}`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem}-${n}.${extensionOf(format)}`;
  used.add(name.toLowerCase());
  return name;
}

/** Output width so that the longest side is at most `maxSide` (never upscaled). */
export function outputWidth(width: number, height: number, maxSide: number | null) {
  if (!maxSide || Math.max(width, height) <= maxSide) return width;
  return Math.max(1, Math.round((width * maxSide) / Math.max(width, height)));
}

/** Processes one image: decode → (remove background) → background → export. */
async function processOne(file: File, o: BatchOptions): Promise<Blob> {
  const image = await decodeImage(file);
  try {
    let doc: Doc = docFromImage(baseName(file.name), file, image);
    if (o.removeBackground) {
      const r = await segment(o.modelId, await createImageBitmap(image));
      doc = updateLayer<ImageLayer>(doc, doc.layers[0].id, { mask: r.mask });
    }
    if (o.background) doc = { ...doc, background: { type: "color", color: o.background } };
    return await exportImage(doc, outputWidth(doc.width, doc.height, o.maxSide), o.format, o.quality);
  } finally {
    image.close();
  }
}

/**
 * Processes the queued items one by one: a single image is decoded at a time and the AI engine
 * keeps a single model loaded. Cancelling stops before the next image (the current one, which
 * cannot be interrupted mid-inference, finishes). Errors are recorded per item.
 */
export async function runBatch(items: BatchItem[], o: BatchOptions, signal: AbortSignal, update: (id: string, patch: Partial<BatchItem>) => void) {
  const used = new Set(items.flatMap((i) => (i.result ? [i.result.name.toLowerCase()] : [])));
  for (const item of items) {
    if (item.status !== "queued") continue;
    if (signal.aborted) {
      update(item.id, { status: "cancelled" });
      continue;
    }
    update(item.id, { status: "processing" });
    const t0 = performance.now();
    try {
      const blob = await processOne(item.file, o);
      update(item.id, { status: "done", result: { name: outputName(item.file.name, o.format, used), blob }, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      update(item.id, { status: "error", error: (e as Error).message });
    }
  }
}
