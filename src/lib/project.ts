/**
 * LibreRoom project file (*.libreroom): a single self-contained JSON document.
 * Images are embedded as data URLs so a project can be moved or shared as one file.
 * Version 3 adds per-layer shadows and multiple selection; v2 (layers) and v1 (one image)
 * files are migrated on load.
 * shortcut: embedding duplicates large images in memory while saving; switch to a zip
 * container with external image files if projects with many large layers become common.
 */
import { AppError, t, type MessageKey } from "../i18n";

export const PROJECT_FORMAT = "libreroom";
export const PROJECT_VERSION = 3;

export type Background =
  | { type: "transparent" }
  | { type: "color"; color: string }
  | { type: "image"; dataUrl: string };

export interface ProjectShadow {
  color: string;
  opacity: number;
  blur: number;
  x: number;
  y: number;
}

interface LayerFields {
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  shadow: ProjectShadow | null;
}
export type ProjectLayer =
  | (LayerFields & { kind: "image"; source: string; mask: string | null; modelId: string | null })
  | (LayerFields & {
      kind: "text";
      text: string;
      font: "sans" | "serif" | "mono";
      size: number;
      bold: boolean;
      italic: boolean;
      color: string;
      align: "left" | "center" | "right";
    });

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: 3;
  name: string;
  width: number;
  height: number;
  background: Background;
  /** Bottom to top. */
  layers: ProjectLayer[];
  /** Indices of the selected layers. */
  selected: number[];
  savedAt: string;
}

const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_SIDE = 32_768;
const MAX_LAYERS = 500;
const MAX_TEXT = 10_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.slice(0, max) : fallback);
const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Validates untrusted JSON before it reaches the editor. Throws a user-readable error. */
export function parseProject(text: string): ProjectFile {
  let p: unknown;
  try {
    p = JSON.parse(text);
  } catch {
    throw new AppError("error.projectJson");
  }
  const fail = (why: MessageKey, params?: Record<string, string>): never => {
    throw new AppError("error.projectInvalid", { why: t(why, params) });
  };
  if (!isObj(p)) return fail("error.projectUnexpected");
  if (p.format !== PROJECT_FORMAT) fail("error.projectNotLibreRoom");
  if (typeof p.version !== "number" || p.version > PROJECT_VERSION) fail("error.projectVersion");
  for (const k of ["width", "height"] as const) {
    if (!Number.isInteger(p[k]) || !num(p[k], 1, MAX_SIDE)) fail("error.projectDimension", { key: k });
  }
  const width = p.width as number;
  const height = p.height as number;

  const bg = p.background;
  const bgOk =
    isObj(bg) &&
    (bg.type === "transparent" ||
      (bg.type === "color" && typeof bg.color === "string" && HEX.test(bg.color)) ||
      (bg.type === "image" && typeof bg.dataUrl === "string" && DATA_IMAGE.test(bg.dataUrl)));
  if (!bgOk) fail("error.projectBackground");

  // Version 1: one image filling the canvas.
  const rawLayers: unknown[] =
    p.version === 1
      ? [{ kind: "image", name: p.name, visible: true, opacity: 1, x: width / 2, y: height / 2, scale: 1, rotation: 0, shadow: null, source: p.source, mask: p.mask, modelId: p.modelId }]
      : Array.isArray(p.layers)
        ? p.layers
        : fail("error.projectLayers");
  if (rawLayers.length > MAX_LAYERS) fail("error.projectLayers");

  const layers = rawLayers.map((l): ProjectLayer => {
    if (!isObj(l)) return fail("error.projectLayers");
    const okTransform =
      num(l.opacity, 0, 1) && num(l.x, -1e6, 1e6) && num(l.y, -1e6, 1e6) && num(l.scale, 1e-4, 1e3) && num(l.rotation, -1e4, 1e4);
    if (!okTransform) fail("error.projectLayers");
    const sh = l.shadow;
    const shadowOk =
      sh === null || sh === undefined ||
      (isObj(sh) && typeof sh.color === "string" && HEX.test(sh.color) && num(sh.opacity, 0, 1) && num(sh.blur, 0, 1000) && num(sh.x, -1e4, 1e4) && num(sh.y, -1e4, 1e4));
    if (!shadowOk) fail("error.projectLayers");
    const fields: LayerFields = {
      name: str(l.name, 200, ""),
      visible: l.visible !== false,
      opacity: l.opacity as number,
      x: l.x as number,
      y: l.y as number,
      scale: l.scale as number,
      rotation: l.rotation as number,
      shadow: isObj(sh) ? { color: sh.color as string, opacity: sh.opacity as number, blur: sh.blur as number, x: sh.x as number, y: sh.y as number } : null,
    };
    if (l.kind === "image") {
      if (typeof l.source !== "string" || !DATA_IMAGE.test(l.source)) fail("error.projectSource");
      if (l.mask !== null && (typeof l.mask !== "string" || !DATA_IMAGE.test(l.mask))) fail("error.projectMask");
      return { ...fields, kind: "image", source: l.source as string, mask: l.mask as string | null, modelId: typeof l.modelId === "string" ? l.modelId : null };
    }
    if (l.kind === "text") {
      const ok =
        typeof l.text === "string" && l.text.length <= MAX_TEXT &&
        (l.font === "sans" || l.font === "serif" || l.font === "mono") &&
        num(l.size, 1, 4000) && typeof l.color === "string" && HEX.test(l.color) &&
        (l.align === "left" || l.align === "center" || l.align === "right");
      if (!ok) fail("error.projectLayers");
      return { ...fields, kind: "text", text: l.text as string, font: l.font as "sans", size: l.size as number, bold: l.bold === true, italic: l.italic === true, color: l.color as string, align: l.align as "left" };
    }
    return fail("error.projectLayers");
  });

  const validIndex = (i: unknown) => Number.isInteger(i) && num(i, 0, layers.length - 1);
  const rawSelected = Array.isArray(p.selected) ? p.selected : [p.selected]; // v2 stored one index
  const picked = [...new Set(rawSelected.filter(validIndex) as number[])];
  const selected = picked.length || !layers.length ? picked : [layers.length - 1];
  return {
    format: PROJECT_FORMAT,
    version: 3,
    name: str(p.name, 200, "").trim() || t("untitled"),
    width,
    height,
    background: bg as Background,
    layers,
    selected,
    savedAt: str(p.savedAt, 40, ""),
  };
}
