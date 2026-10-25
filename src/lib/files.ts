import { AppError, t } from "../i18n";
import { maskAlpha, newCanvas } from "./compose";
import { newId, type Doc, type Layer } from "./document";
import { PROJECT_FORMAT, PROJECT_VERSION, parseProject, type ProjectFile, type ProjectLayer } from "./project";
import { maskCanvas } from "./render";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
// shortcut: browser canvas limits (~16k px per side in practice); native image I/O could lift this.
const MAX_SIDE = 16_384;

export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  if (!IMAGE_TYPES.includes(blob.type)) throw new AppError("error.unsupportedFormat");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new AppError("error.unreadableImage");
  }
  if (bmp.width > MAX_SIDE || bmp.height > MAX_SIDE) {
    bmp.close();
    throw new AppError("error.imageTooLarge", { max: MAX_SIDE });
  }
  return bmp;
}

export function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || t("untitled");
}

export function saveBlob(blob: Blob, fileName: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

const canvasToPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new AppError("error.pngFailed"))), "image/png"));

/** Document content as plain blobs and values: shared by project files and autosave. */
type LayerFields = Pick<Layer, "name" | "visible" | "opacity" | "x" | "y" | "scale" | "rotation" | "shadow">;
export type LayerBlobs =
  | (LayerFields & { kind: "image"; sourceBlob: Blob; maskBlob: Blob | null; modelId: string | null })
  | (Extract<ProjectLayer, { kind: "text" }> & LayerFields);
export interface DocBlobs {
  name: string;
  width: number;
  height: number;
  background: { type: "transparent" } | { type: "color"; color: string } | { type: "image"; blob: Blob };
  layers: LayerBlobs[];
  /** Indices of the selected layers. */
  selected: number[];
}

const fieldsOf = (l: Layer): LayerFields => ({ name: l.name, visible: l.visible, opacity: l.opacity, x: l.x, y: l.y, scale: l.scale, rotation: l.rotation, shadow: l.shadow });

export async function docToBlobs(doc: Doc): Promise<DocBlobs> {
  const bg = doc.background;
  const layers = await Promise.all(
    doc.layers.map(async (l): Promise<LayerBlobs> => {
      if (l.kind === "text") {
        const { id: _id, ...text } = l;
        return text;
      }
      const maskBlob = l.mask ? await canvasToPng(maskCanvas(l.mask, l.image.width, l.image.height)) : null;
      return { ...fieldsOf(l), kind: "image", sourceBlob: l.sourceBlob, maskBlob, modelId: l.modelId };
    }),
  );
  return {
    name: doc.name,
    width: doc.width,
    height: doc.height,
    background: bg.type === "image" ? { type: "image", blob: bg.blob } : bg,
    layers,
    selected: doc.layers.flatMap((l, i) => (doc.selectedIds.includes(l.id) ? [i] : [])),
  };
}

export async function docFromBlobs(b: DocBlobs): Promise<Doc> {
  const layers: Layer[] = [];
  try {
    for (const l of b.layers) {
      if (l.kind === "text") {
        layers.push({ ...l, id: newId() });
        continue;
      }
      const image = await decodeImage(l.sourceBlob);
      let mask: Uint8ClampedArray | null = null;
      if (l.maskBlob) {
        const m = await createImageBitmap(l.maskBlob);
        if (m.width !== image.width || m.height !== image.height) {
          m.close();
          image.close();
          throw new AppError("error.projectInconsistent");
        }
        const c = newCanvas(image.width, image.height);
        c.getContext("2d")!.drawImage(m, 0, 0);
        m.close();
        mask = maskAlpha(c);
      }
      layers.push({ ...l, id: newId(), kind: "image", image, mask, aiMask: null });
    }
  } catch (e) {
    for (const l of layers) if (l.kind === "image") l.image.close();
    throw e;
  }
  const bg = b.background;
  const background = bg.type === "image" ? { type: "image" as const, blob: bg.blob, bitmap: await decodeImage(bg.blob) } : bg;
  const selectedIds = b.selected.map((i) => layers[i]?.id).filter((id): id is string => !!id);
  return { name: b.name, width: b.width, height: b.height, background, layers, selectedIds };
}

export async function serializeProject(doc: Doc): Promise<Blob> {
  const b = await docToBlobs(doc);
  const bg = b.background;
  const p: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: b.name,
    width: b.width,
    height: b.height,
    background: bg.type === "image" ? { type: "image", dataUrl: await toDataUrl(bg.blob) } : bg,
    layers: await Promise.all(
      b.layers.map(async (l): Promise<ProjectLayer> => {
        if (l.kind === "text") return l;
        const { sourceBlob, maskBlob, ...rest } = l;
        return { ...rest, source: await toDataUrl(sourceBlob), mask: maskBlob ? await toDataUrl(maskBlob) : null };
      }),
    ),
    selected: b.selected,
    savedAt: new Date().toISOString(),
  };
  return new Blob([JSON.stringify(p)], { type: "application/json" });
}

export async function openProject(text: string): Promise<Doc> {
  const p = parseProject(text);
  const bg = p.background;
  return docFromBlobs({
    name: p.name,
    width: p.width,
    height: p.height,
    background: bg.type === "image" ? { type: "image", blob: await dataUrlToBlob(bg.dataUrl) } : bg,
    layers: await Promise.all(
      p.layers.map(async (l): Promise<LayerBlobs> => {
        if (l.kind === "text") return l;
        const { source, mask, ...rest } = l;
        return { ...rest, sourceBlob: await dataUrlToBlob(source), maskBlob: mask ? await dataUrlToBlob(mask) : null };
      }),
    ),
    selected: p.selected,
  });
}
