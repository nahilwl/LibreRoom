// End-to-end checks of real user flows in Chromium, against `npm run preview`:
//  1. import -> download model -> remove background -> background colour -> brush -> undo/redo
//     -> export PNG -> save / reopen project -> dark mode
//  2. crash recovery: unsaved work is restored after the page dies
//  3. formats and resolutions: PNG/JPEG/WebP from 1×1 to 48 MP
// Also asserts that no origin other than the app and the model host is contacted.
//   CHROMIUM_PATH=/path/to/chrome npm run test:e2e
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = process.env.LIBREROOM_URL ?? "http://localhost:4173";
const img = fileURLToPath(new URL("../fixtures/sneakers-cc0.jpg", import.meta.url));
const out = fileURLToPath(new URL("../../test-results/e2e", import.meta.url));
mkdirSync(out, { recursive: true });
assert(process.env.CHROMIUM_PATH, "Set CHROMIUM_PATH to a Chromium/Chrome executable");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
const origins = new Set();
context.on("request", (r) => origins.add(new URL(r.url()).origin));

async function newPage() {
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("console error:", m.text()));
  page.on("pageerror", (e) => console.log("page error:", e.message));
  page.on("dialog", (d) => d.accept()); // "discard unsaved changes?" when importing over an edited image
  await page.goto(url);
  return page;
}
const fileInput = (page) => page.locator('input[type=file][accept*=".libreroom"]');
const button = (page, name) => page.getByRole("button", { name, exact: true });

/**
 * Exports a PNG through the UI and returns alpha values at the given image points, plus the
 * number and mean position of strongly red pixels (the colour used for the test text).
 */
async function exportAlpha(page, points) {
  await button(page, "Export").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), button(page, "Export image").click()]);
  const path = `${out}/${dl.suggestedFilename()}`;
  await dl.saveAs(path);
  return page.evaluate(
    async ([b64, pts]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
      c.drawImage(bmp, 0, 0);
      const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
      let red = 0, sy = 0, minX = Infinity, darkTop = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [x, y] = [(i / 4) % bmp.width, Math.floor(i / 4 / bmp.width)];
        if (d[i + 3] > 200 && d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) {
          red++;
          sy += y;
          minX = Math.min(minX, x);
        }
        // Shadow pixels: dark, semi-transparent or opaque, in the empty upper part of the photo.
        if (y < 260 && d[i + 3] > 30 && Math.max(d[i], d[i + 1], d[i + 2]) < 70) darkTop++;
      }
      return { w: bmp.width, h: bmp.height, alpha: pts.map(([x, y]) => d[(y * bmp.width + x) * 4 + 3]), red, redY: red ? Math.round(sy / red) : null, redMinX: red ? minX : null, darkTop };
    },
    [readFileSync(path).toString("base64"), points],
  );
}

// ---------- 1. main flow ----------
let page = await newPage();
await page.screenshot({ path: `${out}/01-empty.png` });
await fileInput(page).setInputFiles(img);
await page.getByText("1280 × 742 px").waitFor();
await button(page, "Download the model").click();
let t0 = Date.now();
await button(page, "Remove background").waitFor({ timeout: 300_000 });
console.log("model download + verify:", Date.now() - t0, "ms");

t0 = Date.now();
await button(page, "Remove background").click();
await page.getByText(/Local AI:/).waitFor({ timeout: 300_000 });
console.log("remove background:", Date.now() - t0, "ms wall;", await page.getByText(/Local AI:/).textContent());
await page.screenshot({ path: `${out}/02-removed.png` });

await button(page, "Background").click();
await button(page, "Colour #e8eef5").click();
await page.screenshot({ path: `${out}/03-background.png` });
await button(page, "Transparent").click();

// Brush: erase a horizontal stroke through the right shoe (fit zoom ≈ 76 %, image origin ≈ (112,179)).
await button(page, "Refine").click();
const toPage = (ix, iy) => [112 + ix * 0.7625, 179 + iy * 0.7625];
await page.mouse.move(...toPage(600, 520));
await page.mouse.down();
await page.mouse.move(...toPage(800, 520), { steps: 10 });
await page.mouse.up();
await page.screenshot({ path: `${out}/04-brush.png` });

const probe = [[20, 700], [700, 520], [700, 600]]; // background, brushed, untouched shoe
let r = await exportAlpha(page, probe);
console.log("after brush:", JSON.stringify(r));
assert.deepEqual([r.w, r.h], [1280, 742]);
assert.equal(r.alpha[0], 0, "background must be transparent");
assert.equal(r.alpha[1], 0, "brushed area must be erased");
assert(r.alpha[2] > 240, "untouched shoe must stay opaque");

await page.keyboard.press("Control+z");
r = await exportAlpha(page, probe);
assert(r.alpha[1] > 240, "undo must restore the brushed area");
await page.keyboard.press("Control+Shift+z");
r = await exportAlpha(page, probe);
assert.equal(r.alpha[1], 0, "redo must erase it again");
console.log("undo/redo OK");

// Layers and text: add a red text, move it by dragging, hide/show it, delete it and undo.
await button(page, "Text").click();
await button(page, "Add text").first().click();
await page.getByRole("textbox", { name: "Text" }).fill("SALE");
await button(page, "Colour #c0392b").click();
r = await exportAlpha(page, probe);
console.log("text added:", r.red, "red px, mean y", r.redY);
assert(r.red > 300 && Math.abs(r.redY - 371) < 40, "red text drawn at the canvas centre");
await page.mouse.move(...toPage(640, 371));
await page.mouse.down();
await page.mouse.move(...toPage(640, 120), { steps: 8 });
await page.mouse.up();
await page.screenshot({ path: `${out}/04b-text.png` });
r = await exportAlpha(page, probe);
console.log("text dragged:", r.red, "red px, mean y", r.redY);
assert(Math.abs(r.redY - 120) < 40, "dragging moves the text");
const redCount = r.red;
await button(page, "Layers").click();
await page.getByRole("button", { name: "Hide layer" }).first().click();
assert.equal((await exportAlpha(page, probe)).red, 0, "hidden layer is not exported");
await button(page, "Layers").click();
await page.getByRole("button", { name: "Show layer" }).click();
await page.mouse.click(...toPage(640, 120)); // select the text on the canvas
await page.keyboard.press("Delete");
assert.equal((await exportAlpha(page, probe)).red, 0, "Delete removes the selected layer");
await page.keyboard.press("Control+z");
r = await exportAlpha(page, probe);
assert.equal(r.red, redCount, "undo brings the layer back");
assert.equal(r.alpha[1], 0, "the image mask is unchanged");
console.log("layers and text OK");

// Transform handles on the canvas (the text is selected, centred at (640, 120), font size 74).
await button(page, "Layers").click();
const box = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("2d");
  c.font = '700 74px ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif';
  return { w: Math.ceil(c.measureText("SALE").width), h: Math.ceil(74 * 1.2) };
});
const tl = [640 - box.w / 2, 120 - box.h / 2];
await page.mouse.move(...toPage(tl[0] + box.w, tl[1] + box.h)); // bottom-right handle
await page.mouse.down();
await page.mouse.move(...toPage(tl[0] + 1.5 * box.w, tl[1] + 1.5 * box.h), { steps: 6 });
await page.mouse.up();
await page.getByText("Size: 150 %").waitFor();
r = await exportAlpha(page, probe);
assert(r.red > 1.8 * redCount, "resized text is bigger");
const centre = [tl[0] + 0.75 * box.w, tl[1] + 0.75 * box.h];
const [kx, ky] = toPage(centre[0], centre[1] - 0.75 * box.h);
await page.mouse.move(kx, ky - 28); // rotation knob, 28 px above the top edge
await page.mouse.down();
await page.mouse.move(...toPage(centre[0] + 300, centre[1]), { steps: 6 });
await page.mouse.up();
await button(page, "Layers").click(); // the export check above switched the panel
await page.getByText("Rotation: 90°").waitFor();
await page.screenshot({ path: `${out}/04c-handles.png` });
await page.keyboard.press("Control+z"); // undo rotation (one drag = one step)
await page.getByText("Rotation: 0°").waitFor();
await page.keyboard.press("Control+z"); // undo resize
await page.getByText("Size: 100 %").waitFor();
console.log("resize and rotate handles OK");

// Multiple selection and alignment.
await page.keyboard.press("Control+a");
await page.getByText("2 layers selected").waitFor();
await button(page, "Align left").click();
r = await exportAlpha(page, probe);
assert(r.redMinX < 15, `text aligned to the left edge (min x ${r.redMinX})`);
await page.keyboard.press("Control+z");
r = await exportAlpha(page, probe);
assert(r.redMinX > 500, "undo restores the position");
await button(page, "Layers").click();
await page.keyboard.press("Escape");
assert.equal(await page.getByText("Selected layer", { exact: true }).count(), 0, "Esc clears the selection");
// Marquee from an empty (transparent) area around the text selects only the text.
await page.mouse.move(...toPage(380, 15));
await page.mouse.down();
await page.mouse.move(...toPage(900, 250), { steps: 6 });
await page.mouse.up();
await page.getByText("Selected layer", { exact: true }).waitFor();
assert.equal(await page.getByRole("button", { name: "SALE", pressed: true }).count(), 1, "marquee selected the text layer");
console.log("multiple selection, alignment, marquee OK");

// Shadow, duplicate, nudge.
const before = (await exportAlpha(page, probe)).darkTop;
await button(page, "Layers").click();
await page.getByRole("checkbox", { name: "Drop shadow" }).check();
r = await exportAlpha(page, probe);
console.log("shadow: dark pixels", before, "→", r.darkTop);
assert(r.darkTop > before + 500, "the shadow is drawn and exported");
const shadowDark = r.darkTop;
const redWithShadow = r.red; // the shadow under anti-aliased glyph edges changes a few pixels
await button(page, "Layers").click();
await page.keyboard.press("Control+d");
assert.equal(await page.getByRole("list", { name: "Layer list" }).getByRole("listitem").count(), 3, "Ctrl+D duplicates");
r = await exportAlpha(page, probe);
assert(r.red > 1.3 * redCount, "the copy is drawn");
const yBefore = r.redY;
await page.keyboard.press("Shift+ArrowDown");
await page.keyboard.press("Shift+ArrowDown");
r = await exportAlpha(page, probe);
assert(r.redY > yBefore + 5, "arrow keys nudge the selection");
await page.keyboard.press("Delete");
assert.equal((await exportAlpha(page, probe)).red, redWithShadow, "the copy is deleted");
console.log("shadow, duplicate, nudge OK");

const [proj] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
const projPath = `${out}/${proj.suggestedFilename()}`;
await proj.saveAs(projPath);
console.log("project saved:", proj.suggestedFilename(), Math.round(readFileSync(projPath).length / 1024), "KiB");
await page.reload();
await fileInput(page).setInputFiles(projPath);
await page.getByText("1280 × 742 px").waitFor();
r = await exportAlpha(page, probe);
assert.deepEqual(r.alpha.slice(0, 2), [0, 0], "reopened project keeps the mask");
assert.equal(r.red, redWithShadow, "reopened project keeps the text layer");
assert.equal(r.darkTop, shadowDark, "reopened project keeps the shadow");
console.log("project reopened OK");

await button(page, "Switch to dark mode").click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/05-dark.png` });
await button(page, "Switch to light mode").click();

// ---------- 2. crash recovery ----------
await button(page, "Layers").click();
await page.getByRole("button", { name: "sneakers-cc0" }).click(); // the reopened project had the text selected
await button(page, "Remove BG").click();
await button(page, "Back to the original image").click(); // unsaved change
await page.waitForTimeout(2500); // autosave delay is 1.5 s
await page.close({ runBeforeUnload: false }); // simulates a crash: no save, no prompt
page = await newPage();
await page.getByText("Unsaved work was recovered").waitFor();
await page.screenshot({ path: `${out}/06-recovery.png` });
await button(page, "Restore").click();
await page.getByText("1280 × 742 px").waitFor();
r = await exportAlpha(page, probe);
assert.equal(r.alpha[0], 255, "recovered state is the last change (original image, no mask)");
await page.keyboard.press("Control+s"); // saving clears the recovery record
await page.waitForTimeout(500);
await page.close({ runBeforeUnload: false });
page = await newPage();
await page.waitForTimeout(1000);
assert.equal(await page.getByText("Unsaved work was recovered").count(), 0, "no recovery after a save");
console.log("crash recovery OK");

// Dropping several images onto an empty editor: the first opens, the others become layers.
await page.evaluate(async () => {
  const make = async (color) => {
    const c = new OffscreenCanvas(320, 200);
    const x = c.getContext("2d");
    x.fillStyle = color;
    x.fillRect(0, 0, 320, 200);
    return new File([await c.convertToBlob({ type: "image/png" })], `${color.slice(1)}.png`, { type: "image/png" });
  };
  const dt = new DataTransfer();
  dt.items.add(await make("#3366cc"));
  dt.items.add(await make("#cc3366"));
  document.querySelector("main > div").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.getByText("320 × 200 px").waitFor();
await button(page, "Layers").click();
assert.equal(await page.getByRole("list", { name: "Layer list" }).getByRole("listitem").count(), 2, "two dropped images, two layers");
console.log("multi-image drop OK");

// ---------- batch ----------
const pngOf = (color, w, h) =>
  page.evaluate(
    async ([color, w, h]) => {
      const c = new OffscreenCanvas(w, h);
      const x = c.getContext("2d");
      x.fillStyle = "#f2f2f2";
      x.fillRect(0, 0, w, h);
      x.fillStyle = color;
      x.beginPath();
      x.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, 7);
      x.fill();
      const b = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
      let s = "";
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [color, w, h],
  ).then((b64) => Buffer.from(b64, "base64"));
await button(page, "Batch").click();
const batchInput = page.locator('input[type=file][multiple]').first();
await batchInput.setInputFiles([
  { name: "sneakers-cc0.jpg", mimeType: "image/jpeg", buffer: readFileSync(img) },
  { name: "red.png", mimeType: "image/png", buffer: await pngOf("#c0392b", 900, 600) },
  { name: "blue.png", mimeType: "image/png", buffer: await pngOf("#2f6fdf", 600, 900) },
  { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not a png") },
]);
t0 = Date.now();
await button(page, "Process 4 images").click();
await page.getByText("3 done · 1 failed · 0 cancelled").waitFor({ timeout: 300_000 });
console.log("batch of 4 (1 broken):", Date.now() - t0, "ms");
await page.screenshot({ path: `${out}/07-batch.png` });
const [zip] = await Promise.all([page.waitForEvent("download"), button(page, "Download all (ZIP)").click()]);
const zipPath = `${out}/${zip.suggestedFilename()}`;
await zip.saveAs(zipPath);
const { execFileSync } = await import("node:child_process");
const listing = JSON.parse(
  execFileSync("python3", ["-I", "-c", "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(sorted(z.namelist())))", zipPath], { encoding: "utf8" }),
);
assert.deepEqual(listing, ["blue-libreroom.png", "red-libreroom.png", "sneakers-cc0-libreroom.png"], "ZIP holds the 3 results");
// Cancel: queue 6 more, stop after the first finishes.
await batchInput.setInputFiles(await Promise.all([1, 2, 3, 4, 5, 6].map(async (n) => ({ name: `more-${n}.png`, mimeType: "image/png", buffer: await pngOf("#0d8a76", 1200, 800) }))));
await button(page, "Process 7 images").click(); // 6 new + the broken one, re-queued
await page.getByText("Done").nth(3).waitFor({ timeout: 300_000 });
await button(page, "Cancel").click();
await page.getByText(/· \d+ cancelled/).waitFor({ timeout: 300_000 });
const summary = await page.getByText(/done · \d+ failed/).textContent();
console.log("after cancel:", summary);
assert(/ [1-9]\d* cancelled/.test(summary), "remaining images are cancelled");
console.log("batch OK");

// ---------- 3. formats and resolutions ----------
const cases = [
  ["png", 1, 1],
  ["webp", 37, 2000],
  ["jpeg", 4000, 3000],
  ["png", 8000, 6000],
];
for (const [format, w, h] of cases) {
  const b64 = await page.evaluate(
    async ([format, w, h]) => {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2);
      ctx.fill();
      const blob = await c.convertToBlob({ type: `image/${format}`, quality: 0.9 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [format, w, h],
  );
  await fileInput(page).setInputFiles({ name: `test-${w}x${h}.${format === "jpeg" ? "jpg" : format}`, mimeType: `image/${format}`, buffer: Buffer.from(b64, "base64") });
  await page.getByText(`${w} × ${h} px`).waitFor();
  if (w * h >= 12e6) {
    t0 = Date.now();
    await button(page, "Remove background").click();
    await page.getByText(/Local AI:/).waitFor({ timeout: 300_000 });
    const segMs = Date.now() - t0;
    t0 = Date.now();
    r = await exportAlpha(page, [[5, 5], [Math.floor(w / 2), Math.floor(h / 2)]]);
    console.log(`${format} ${w}x${h}: remove bg ${segMs} ms, export + pixel check ${Date.now() - t0} ms, alpha`, r.alpha);
    assert.deepEqual([r.w, r.h], [w, h]);
    assert(r.alpha[0] < 16 && r.alpha[1] > 240, "disc kept, corner removed");
    await button(page, "Remove BG").click();
  } else {
    console.log(`${format} ${w}x${h}: imported`);
  }
}

console.log("origins contacted:", [...origins].join(", "));
writeFileSync(`${out}/origins.json`, JSON.stringify([...origins]));
const allowed = [new URL(url).origin, "https://huggingface.co", "https://cdn-lfs.hf.co", "https://us.aws.cdn.hf.co", "https://cas-bridge.xethub.hf.co"];
const unexpected = [...origins].filter((o) => !allowed.includes(o) && !o.startsWith("blob:") && o !== "null");
assert.deepEqual(unexpected, [], "no other origin may be contacted");
await browser.close();
console.log("E2E OK");
