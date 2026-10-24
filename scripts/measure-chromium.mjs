// Measures the web version's memory in Chromium (headless) during 5 background removals.
// Sums PSS over the whole Chromium process tree (/proc, Linux only), sampled every 200 ms.
//   npm run preview & CHROMIUM_PATH=/path/to/chrome node scripts/measure-chromium.mjs
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const url = process.env.LIBREROOM_URL ?? "http://localhost:4173";
const fixture = fileURLToPath(new URL("../tests/fixtures/sneakers-cc0.jpg", import.meta.url));
const port = 9333;
const proc = spawn(process.env.CHROMIUM_PATH, // --no-sandbox: Ubuntu 23.10+ blocks the sandbox for non-system Chromium builds (as Playwright does).
  ["--headless=new", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${tmpdir()}/libreroom-measure-${Date.now()}`, "about:blank"], { stdio: "ignore" });

function treePssKb(root) {
  const kids = {};
  for (const pid of readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
    try {
      const ppid = +readFileSync(`/proc/${pid}/stat`, "utf8").split(")").pop().trim().split(" ")[1];
      (kids[ppid] ??= []).push(+pid);
    } catch {}
  }
  let total = 0;
  for (const todo = [root]; todo.length; ) {
    const pid = todo.pop();
    try {
      total += +readFileSync(`/proc/${pid}/smaps_rollup`, "utf8").match(/^Pss:\s+(\d+)/m)[1];
    } catch {}
    todo.push(...(kids[pid] ?? []));
  }
  return total;
}

let peak = 0;
const sampler = setInterval(() => (peak = Math.max(peak, treePssKb(proc.pid))), 200);
const mb = (kb) => Math.round(kb / 1024);
let browser;
for (let i = 0; !browser && i < 50; i++) {
  await new Promise((r) => setTimeout(r, 200));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined);
}
const page = await browser.contexts()[0].newPage();
await page.goto(url);
await page.waitForTimeout(3000);
console.log("idle PSS:", mb(treePssKb(proc.pid)), "MB");
await page.locator('input[type=file][accept*=".libreroom"]').setInputFiles(fixture);
const removeBtn = page.getByRole("button", { name: "Remove background", exact: true });
if (!(await removeBtn.isVisible())) {
  await page.getByRole("button", { name: "Download the model" }).click();
  await removeBtn.waitFor({ timeout: 300_000 });
}
peak = 0;
for (let i = 1; i <= 5; i++) {
  const t0 = Date.now();
  await removeBtn.click();
  await page.getByRole("progressbar").waitFor({ state: "detached", timeout: 300_000 });
  console.log(`run ${i}: ${Date.now() - t0} ms, peak PSS so far ${mb(peak)} MB`);
}
await page.waitForTimeout(10_000);
console.log("10 s after the last run:", mb(treePssKb(proc.pid)), "MB");
clearInterval(sampler);
await browser.close();
proc.kill();
