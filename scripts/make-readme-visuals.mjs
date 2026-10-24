// Regenerates docs/assets/before-after.jpg from a real run of the app (no retouching):
// the CC0 fixture on the left, LibreRoom's actual export (background removed, new colour) on the right.
//   npm run preview & CHROMIUM_PATH=/path/to/chrome node scripts/make-readme-visuals.mjs
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = process.env.LIBREROOM_URL ?? "http://localhost:4173";
const fixture = fileURLToPath(new URL("../tests/fixtures/sneakers-cc0.jpg", import.meta.url));
const target = fileURLToPath(new URL("../docs/assets/before-after.jpg", import.meta.url));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
const button = (name) => page.getByRole("button", { name, exact: true });
await page.goto(url);
await page.locator('input[type=file][accept*=".libreroom"]').setInputFiles(fixture);
await button("Download the model").click();
await button("Remove background").waitFor({ timeout: 300_000 });
await button("Remove background").click();
await page.getByText(/Local AI:/).waitFor({ timeout: 300_000 });
await button("Background").click();
await button("Colour #e8eef5").click();
await button("Export").click();
await page.getByRole("radio", { name: "jpg" }).click();
const [dl] = await Promise.all([page.waitForEvent("download"), button("Export image").click()]);
const after = readFileSync(await dl.path()).toString("base64");
const before = readFileSync(fixture).toString("base64");

const jpeg = await page.evaluate(
  async ([before, after]) => {
    const load = async (b64) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const [a, b] = [await load(before), await load(after)];
    const w = 1280, h = Math.round((a.height / a.width) * (w / 2)), bar = 44;
    const c = new OffscreenCanvas(w, h + bar);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0f1211";
    ctx.fillRect(0, 0, w, h + bar);
    ctx.drawImage(a, 0, bar, w / 2, h);
    ctx.drawImage(b, w / 2, bar, w / 2, h);
    ctx.fillStyle = "#e9edeb";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Before", w / 4, 29);
    ctx.fillText("After — LibreRoom, 100% local", (3 * w) / 4, 29);
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  },
  [before, after],
);
writeFileSync(target, Buffer.from(jpeg, "base64"));
await browser.close();
console.log("wrote", target);
