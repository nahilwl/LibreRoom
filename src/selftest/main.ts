/**
 * In-app self-test, built only with `vite build --mode selftest` and run inside the real Tauri
 * WebView (see scripts/tauri-selftest.sh). It exercises the production modules end to end and
 * reports a JSON result to the Rust side, which prints it and exits.
 *   ?mode=online  : download + install the model, then remove a background, export, save/reopen
 *   ?mode=offline : the model must already be installed; the network must be unreachable
 *   ?mode=compare : both engines (native, browser) on the same images: time and mask agreement
 *   ?mode=stress  : 5 consecutive removals + exports, with phase markers for memory sampling
 *   ?mode=batch   : the batch pipeline on 10 images (marks per image), for memory sampling
 *   &engine=native|browser selects the engine (default: the platform's).
 */
import { invoke } from "@tauri-apps/api/core";
import fixtureUrl from "../../tests/fixtures/sneakers-cc0.jpg?url";
import { DEFAULT_SHADOW, docFromImage, textLayer, addLayer, updateLayer, type ImageLayer } from "../lib/document";
import { exportImage } from "../lib/render";
import { decodeImage, openProject, saveBlob, serializeProject } from "../lib/files";
import { MODELS } from "../lib/models";
import { downloadModel, isDownloaded } from "../lib/modelStore";
import { defaultEngine, type Engine } from "../lib/platform";
import { releaseSegmenter, segment } from "../lib/segmenter";
import { runBatch, type BatchItem } from "../lib/batch";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "online";
const engine = (params.get("engine") || defaultEngine) as Engine;
const model = MODELS[0];
const report: Record<string, unknown> = { mode, engine };
const checks: Record<string, boolean> = {};
const mark = (label: string) => invoke("selftest_mark", { label });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fixture() {
  const blob = await (await fetch(fixtureUrl)).blob();
  return { blob, image: await decodeImage(new File([blob], "sneakers.jpg", { type: "image/jpeg" })) };
}

/** Same photo at another size, as a real (re-encoded) JPEG file. */
async function resized(image: ImageBitmap, w: number, h: number) {
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d")!.drawImage(image, 0, 0, w, h);
  return createImageBitmap(await c.convertToBlob({ type: "image/jpeg", quality: 0.92 }));
}

async function basic() {
  report.origin = location.origin;
  report.userAgent = navigator.userAgent;
  report.crossOriginIsolated = crossOriginIsolated;
  if (mode === "online") {
    const t = performance.now();
    await downloadModel(model, () => {}, new AbortController().signal, engine);
    report.downloadMs = Math.round(performance.now() - t);
  } else {
    // Proves the network is really unreachable in this run.
    checks.networkBlocked = await fetch("https://huggingface.co/", { mode: "no-cors" }).then(() => false, () => true);
  }
  checks.modelInstalled = await isDownloaded(model, engine);

  const { blob, image } = await fixture();
  const t0 = performance.now();
  const res = await segment(model.id, await createImageBitmap(image), engine);
  report.segmentWallMs = Math.round(performance.now() - t0);
  report.inferenceMs = Math.round(res.ms);
  report.backend = res.backend;
  const at = (x: number, y: number) => res.mask[y * res.width + x];
  checks.maskBackgroundTransparent = at(20, 700) < 16;
  checks.maskSubjectOpaque = at(700, 600) > 240;

  let doc = docFromImage("selftest", blob, image);
  doc = updateLayer<ImageLayer>(doc, doc.layers[0].id, { mask: res.mask, aiMask: res.mask, modelId: model.id });
  doc = addLayer(doc, { ...textLayer("Title", "LibreRoom", 640, 100, 80), shadow: DEFAULT_SHADOW, rotation: -8 });
  doc = { ...doc, selectedIds: doc.layers.map((l) => l.id) };
  const png = await exportImage(doc, 640, "png", 1);
  checks.exportPng = png.type === "image/png" && png.size > 1000;
  const reopened = await openProject(await (await serializeProject(doc)).text());
  const [img, txt] = reopened.layers;
  checks.projectRoundTrip =
    reopened.width === 1280 && img?.kind === "image" && !!img.mask && img.mask.length === res.mask.length &&
    txt?.kind === "text" && txt.text === "LibreRoom" && txt.rotation === -8 && txt.shadow?.blur === DEFAULT_SHADOW.blur &&
    reopened.selectedIds.length === 2;
}

/** Runs both engines on the same images and compares the masks pixel by pixel. */
async function compare() {
  checks.nativeInstalled = await isDownloaded(model, "native");
  checks.browserInstalled = await isDownloaded(model, "browser");
  const { image } = await fixture();
  const images: [string, ImageBitmap][] = [
    ["1280x742", image],
    ["640x371", await resized(image, 640, 371)],
    ["4000x2319", await resized(image, 4000, 2319)],
  ];
  const results: Record<string, unknown> = {};
  for (const [name, img] of images) {
    const runs: Record<string, { mask: Uint8ClampedArray; ms: number[] }> = {};
    for (const e of ["native", "browser"] as const) {
      const ms: number[] = [];
      let mask: Uint8ClampedArray = new Uint8ClampedArray();
      for (let i = 0; i < 3; i++) {
        const r = await segment(model.id, await createImageBitmap(img), e);
        ms.push(Math.round(r.ms));
        mask = r.mask;
      }
      runs[e] = { mask, ms };
    }
    const [a, b] = [runs.native.mask, runs.browser.mask];
    let sum = 0, max = 0, inter = 0, union = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      sum += d;
      if (d > max) max = d;
      const [fa, fb] = [a[i] >= 128, b[i] >= 128];
      if (fa && fb) inter++;
      if (fa || fb) union++;
    }
    results[name] = {
      inferenceMs: { native: runs.native.ms, browser: runs.browser.ms },
      meanAbsDiff: +(sum / a.length).toFixed(4),
      maxAbsDiff: max,
      iou: +(inter / union).toFixed(6),
    };
    // Thresholds: differences only come from float rounding between the two int8 runtimes.
    checks[`masksAgree_${name}`] = sum / a.length < 1 && inter / union > 0.995;
  }
  report.compare = results;
  releaseSegmenter();
}

async function stress() {
  checks.modelInstalled = await isDownloaded(model, engine);
  const { blob } = await fixture();
  await mark("idle-start");
  await pause(5000);
  const times: number[] = [];
  for (let i = 1; i <= 5; i++) {
    await mark(`run-${i}`);
    const image = await decodeImage(new File([blob], "s.jpg", { type: "image/jpeg" }));
    const t0 = performance.now();
    const res = await segment(model.id, await createImageBitmap(image), engine);
    const doc = docFromImage("s", blob, image);
    await exportImage(updateLayer<ImageLayer>(doc, doc.layers[0].id, { mask: res.mask }), image.width, "png", 1);
    times.push(Math.round(performance.now() - t0));
    image.close();
  }
  report.iterationMs = times;
  await mark("idle-after-runs");
  releaseSegmenter();
  await pause(70_000); // past the idle release of both engines (native 15 s, browser 60 s)
  await mark("end");
}

/** Triggers a real UI download, as the Export and Save buttons do; the script checks the file. */
async function download() {
  saveBlob(new Blob([`libreroom-download-${Date.now()}`], { type: "text/plain" }), "libreroom-download-test.txt");
  await pause(3000);
  checks.triggered = true;
}

/** Batch pipeline on 10 photos of mixed sizes; one mark per finished image. */
async function batch() {
  checks.modelInstalled = await isDownloaded(model, engine);
  const { blob, image } = await fixture();
  const sizes = [[1280, 742], [2560, 1484], [640, 371], [4000, 2319], [1280, 742], [2560, 1484], [640, 371], [4000, 2319], [1280, 742], [2560, 1484]];
  const items: BatchItem[] = [];
  for (const [i, [w, h]] of sizes.entries()) {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.drawImage(image, 0, 0, w, h);
    items.push({ id: `b${i}`, file: new File([await c.convertToBlob({ type: "image/jpeg", quality: 0.9 })], `p${i}.jpg`, { type: "image/jpeg" }), status: "queued" });
  }
  void blob;
  await mark("batch-start");
  const results: BatchItem[] = [];
  let n = 0;
  await runBatch(items, { removeBackground: true, modelId: model.id, background: null, format: "png", quality: 1, maxSide: null }, new AbortController().signal, (id, patch) => {
    if (patch.status === "done" || patch.status === "error") {
      results.push({ ...items.find((i) => i.id === id)!, ...patch });
      void mark(`image-${++n}`);
    }
  });
  checks.allDone = results.length === 10 && results.every((r) => r.status === "done" && r.result!.blob.size > 1000);
  report.batchMs = results.map((r) => r.ms);
  await mark("batch-end");
  await pause(20_000); // past the native engine's 15 s idle release
  await mark("end");
}

const run = mode === "compare" ? compare : mode === "stress" ? stress : mode === "download" ? download : mode === "batch" ? batch : basic;
run()
  .catch((e) => {
    report.error = String((e as Error)?.stack ?? e);
  })
  .finally(async () => {
    report.checks = checks;
    report.ok = !report.error && Object.values(checks).every(Boolean);
    document.getElementById("log")!.textContent = JSON.stringify(report, null, 2);
    await invoke("selftest_report", { report: JSON.stringify(report) });
  });
