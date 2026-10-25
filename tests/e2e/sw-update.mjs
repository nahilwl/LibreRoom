// Service worker lifecycle on the GitHub Pages simulation (web build only):
//  1. first visit → cross-origin isolated, app shell pre-cached;
//  2. a new deployment (a different coi-sw.js) → its own cache; the previous app cache is
//     deleted and NOT re-created; the AI model cache is kept;
//  3. the app still opens offline after the update.
//   npm run build:pages && node scripts/serve-pages.mjs &
//   CHROMIUM_PATH=/path/to/chrome node tests/e2e/sw-update.mjs
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const url = process.env.LIBREROOM_URL ?? "http://127.0.0.1:4174/LibreRoom/";
const swPath = fileURLToPath(new URL("../../dist/coi-sw.js", import.meta.url));
const original = readFileSync(swPath, "utf8");
const buildA = /const BUILD = "([^"]+)"/.exec(original)?.[1];
assert(buildA && buildA !== "__LIBREROOM_BUILD__", "dist/coi-sw.js must come from `npm run build:pages`");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext();
const page = await context.newPage();
const cacheNames = () => page.evaluate(async () => (await caches.keys()).sort());
try {
  await page.goto(url);
  await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 15_000 });
  // Stand-in for an installed model: updates must never delete it.
  await page.evaluate(() => caches.open("libreroom-models-v1").then((c) => c.put("https://huggingface.co/model", new Response("model"))));
  await page.waitForFunction((name) => caches.has(name), `libreroom-app-${buildA}`);
  const shell = await page.evaluate((name) => caches.open(name).then((c) => c.keys()).then((k) => k.length), `libreroom-app-${buildA}`);
  assert(shell >= 5, "app shell pre-cached");
  console.log(`build A: ${JSON.stringify(await cacheNames())}, ${shell} files pre-cached`);

  writeFileSync(swPath, original.replace(/const BUILD = "[^"]+"/, 'const BUILD = "update-test"'));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForFunction(async (old) => {
    const keys = await caches.keys();
    return keys.includes("libreroom-app-update-test") && !keys.includes(old);
  }, `libreroom-app-${buildA}`, { timeout: 15_000 });
  await page.reload();
  await page.waitForTimeout(1500); // give a retired worker the chance to (wrongly) re-create its cache
  const after = await cacheNames();
  console.log(`build B: ${JSON.stringify(after)}`);
  assert.deepEqual(after, ["libreroom-app-update-test", "libreroom-models-v1"], "old app cache deleted, model cache kept");

  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto(url);
  await offline.getByText("Drop an image here").waitFor({ timeout: 10_000 });
  assert(await offline.evaluate(() => crossOriginIsolated), "isolated offline too");
  console.log("offline after update: OK");
  console.log("SW UPDATE OK");
} finally {
  writeFileSync(swPath, original);
  await browser.close();
}
