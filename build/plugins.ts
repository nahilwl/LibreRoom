/**
 * Build plugins for the web version (skipped for the desktop build, which Tauri marks with
 * TAURI_ENV_PLATFORM).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const isWebBuild = () => !process.env.TAURI_ENV_PLATFORM;
const ROOT = new URL("..", import.meta.url).pathname;

/** Packages bundled into the main page and the AI worker (shared between plugin instances). */
const bundled = new Set<string>();

function collect(bundle: Record<string, { type: string; moduleIds?: string[] }>) {
  for (const out of Object.values(bundle)) {
    for (const id of out.moduleIds ?? []) {
      const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.replaceAll("\\", "/"));
      if (m) bundled.add(m[1]);
    }
  }
}

function licenseText(pkg: string) {
  const dir = join(ROOT, "node_modules", pkg);
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const license = typeof meta.license === "object" ? meta.license.type : meta.license;
  return { header: `${pkg}@${meta.version} — ${license ?? "see below"}`, text: file ? readFileSync(join(dir, file), "utf8").trim() : `License: ${license}` };
}

/**
 * Writes THIRD-PARTY-NOTICES.txt next to the site: the copyright and license text of every
 * npm package included in the bundles (minification strips license comments), plus ONNX
 * Runtime's notices for the native libraries compiled into its WebAssembly.
 * `emit: false` instances only collect (used for the worker build).
 */
export function thirdPartyNotices({ emit }: { emit: boolean }): Plugin {
  return {
    name: "libreroom-third-party-notices",
    apply: "build",
    generateBundle(_, bundle) {
      if (!isWebBuild()) return;
      collect(bundle as never);
      if (!emit) return;
      const parts = [...bundled].sort().map(licenseText);
      const ort = readFileSync(join(ROOT, "licenses/onnxruntime-ThirdPartyNotices.txt"), "utf8");
      const text = [
        "LibreRoom — third-party software notices",
        "",
        "LibreRoom is free software under the GNU AGPL-3.0-or-later. Source code: https://github.com/nahilwl/LibreRoom",
        "The web version includes the following third-party software.",
        "",
        ...parts.flatMap((p) => ["=".repeat(78), p.header, "=".repeat(78), p.text, ""]),
        "=".repeat(78),
        "ONNX Runtime (WebAssembly build) — third-party notices, from microsoft/onnxruntime v1.30.0",
        "=".repeat(78),
        ort,
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source: text });
    },
  };
}

/**
 * Versions the service worker: a cache name per build (old caches are deleted on activation)
 * and a pre-cache list of the app shell, so the app opens offline right after the first visit.
 * The AI runtime (.wasm) is left out of the pre-cache: it is large, and it is cached on first
 * use instead.
 */
export function versionServiceWorker(): Plugin {
  let outDir = "dist";
  let shell: string[] = [];
  return {
    name: "libreroom-service-worker-version",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_, bundle) {
      shell = Object.keys(bundle).filter((f) => !f.endsWith(".wasm") && !f.endsWith(".map"));
    },
    closeBundle() {
      const sw = join(ROOT, outDir, "coi-sw.js");
      if (!isWebBuild() || !existsSync(sw)) return;
      const files = ["./", "theme.js", "logo.svg", ...shell.filter((f) => f !== "THIRD-PARTY-NOTICES.txt")];
      const build = createHash("sha256").update(files.sort().join("\n")).digest("hex").slice(0, 12);
      const source = readFileSync(sw, "utf8")
        .replace('"__LIBREROOM_BUILD__"', JSON.stringify(build))
        .replace("/*__LIBREROOM_PRECACHE__*/ []", JSON.stringify(files));
      writeFileSync(sw, source);
    },
  };
}
