import { invoke } from "@tauri-apps/api/core";
import { AppError, getLanguage } from "../i18n";
import type { MaskResult, SegmentRequest, SegmentResponse } from "../workers/segment.worker";
import { defaultEngine, type Engine } from "./platform";

/**
 * Idle time after which the worker is terminated. A WASM heap never shrinks, so this is the
 * only way to give the memory used during inference back to the system (measured, see
 * docs/performance.md). The native engine applies the same delay on its side.
 */
const IDLE_MS = 60_000;

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

export function releaseSegmenter() {
  worker?.terminate();
  worker = null;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function call<R extends SegmentResponse>(req: DistributiveOmit<SegmentRequest, "id" | "lang">, transfer: Transferable[]): Promise<R> {
  clearTimeout(idleTimer);
  worker ??= new Worker(new URL("../workers/segment.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = ++nextId;
  return new Promise<R>((resolve, reject) => {
    const done = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    // A worker that fails to load or crashes would otherwise leave the promise pending forever.
    const onError = (e: ErrorEvent) => {
      done();
      releaseSegmenter();
      reject(new AppError("error.engineCrashed", { message: e.message || new AppError("error.engineUnknown").message }));
    };
    const onMessage = (e: MessageEvent<SegmentResponse>) => {
      if (e.data.id !== id) return;
      done();
      idleTimer = setTimeout(releaseSegmenter, IDLE_MS);
      if (e.data.ok) resolve(e.data as R);
      else reject(new Error(e.data.error));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ ...req, id, lang: getLanguage() } as SegmentRequest, transfer);
  });
}

export type SegmentResult = MaskResult & { ms: number; backend: string };

/** Removes the background of `image` (consumed). Returns a per-pixel alpha mask at full size. */
export async function segment(modelId: string, image: ImageBitmap, engine: Engine = defaultEngine): Promise<SegmentResult> {
  if (engine === "browser") return call<Extract<SegmentResponse, { kind: "segment" }>>({ kind: "segment", modelId, image }, [image]);

  const prepared = await call<Extract<SegmentResponse, { kind: "prepare" }>>({ kind: "prepare", modelId, image }, [image]);
  const t0 = performance.now();
  // Raw bytes over IPC (no JSON): float32 little-endian, as every supported CPU is little-endian.
  const out = await invoke<ArrayBuffer>("run_model", new Uint8Array(prepared.tensor.buffer), { headers: { "model-id": modelId } });
  const ms = performance.now() - t0;
  const raw = new Float32Array(out);
  const result = await call<Extract<SegmentResponse, { kind: "finish" }>>(
    { kind: "finish", modelId, raw, width: prepared.width, height: prepared.height },
    [raw.buffer],
  );
  return { ...result, ms, backend: "CPU (native)" };
}
