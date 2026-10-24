import { invoke } from "@tauri-apps/api/core";
import { AppError } from "../i18n";
import { modelLabel, type SegmentationModel } from "./models";
import { defaultEngine, type Engine } from "./platform";

/**
 * Where installed models live:
 *  - "browser": Cache Storage (persistent, offline, readable from the AI worker);
 *  - "native": the desktop app's data directory, written and re-verified by the Rust side.
 */
const CACHE = "libreroom-models-v1";

export async function isDownloaded(m: SegmentationModel, store: Engine = defaultEngine): Promise<boolean> {
  if (store === "native") return invoke<boolean>("model_installed", { id: m.id });
  const cache = await caches.open(CACHE);
  return (await cache.match(m.url)) !== undefined;
}

/** Browser engine only. */
export async function loadModelBytes(m: SegmentationModel): Promise<ArrayBuffer> {
  const res = await (await caches.open(CACHE)).match(m.url);
  if (!res) throw new AppError("error.modelNotDownloaded", { label: modelLabel(m) });
  return res.arrayBuffer();
}

export async function removeModel(m: SegmentationModel, store: Engine = defaultEngine): Promise<void> {
  if (store === "native") return invoke("remove_model", { id: m.id });
  await (await caches.open(CACHE)).delete(m.url);
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Downloads only on explicit user action; rejects any file whose SHA-256 differs from the pinned one. */
export async function downloadModel(
  m: SegmentationModel,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
  store: Engine = defaultEngine,
): Promise<void> {
  const res = await fetch(m.url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok || !res.body) throw new AppError("error.downloadHttp", { status: res.status });
  const total = Number(res.headers.get("content-length")) || m.bytes;
  const buf = new Uint8Array(total);
  const reader = res.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > buf.length) throw new AppError("error.downloadTooLarge");
    buf.set(value, loaded);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = buf.slice(0, loaded).buffer;
  const hash = await sha256Hex(bytes);
  if (hash !== m.sha256) throw new AppError("error.downloadHash", { hash: hash.slice(0, 12) });
  if (store === "native") {
    // The Rust side checks size and SHA-256 again against its own allow-list before writing.
    await invoke("install_model", new Uint8Array(bytes), { headers: { "model-id": m.id } });
    return;
  }
  const cache = await caches.open(CACHE);
  await cache.put(m.url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
}
