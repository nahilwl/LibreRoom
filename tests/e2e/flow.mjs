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
      let red = 0, sy = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] > 200 && d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) {
          red++;
          sy += Math.floor(i / 4 / bmp.width);
        }
      return { w: bmp.width, h: bmp.height, alpha: pts.map(([x, y]) => d[(y * bmp.width + x) * 4 + 3]), red, redY: red ? Math.round(sy / red) : null };
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

const [proj] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
const projPath = `${out}/${proj.suggestedFilename()}`;
await proj.saveAs(projPath);
console.log("project saved:", proj.suggestedFilename(), Math.round(readFileSync(projPath).length / 1024), "KiB");
await page.reload();
await fileInput(page).setInputFiles(projPath);
await page.getByText("1280 × 742 px").waitFor();
r = await exportAlpha(page, probe);
assert.deepEqual(r.alpha.slice(0, 2), [0, 0], "reopened project keeps the mask");
assert.equal(r.red, redCount, "reopened project keeps the text layer");
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
    console.log(`${format} ${w}x${h}: remove bg ${segMs} ms, export PNG ${Date.now() - t0} ms, alpha`, r.alpha);
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
