import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { thirdPartyNotices, versionServiceWorker } from "./build/plugins";

// Cross-origin isolation enables SharedArrayBuffer, so onnxruntime-web can use several CPU threads.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/**
 * Web builds get a strict Content-Security-Policy <meta>: the browser itself blocks any request
 * to a server other than the site and the model host. The desktop build (Tauri sets
 * TAURI_ENV_PLATFORM) is left alone, as Tauri injects its own CSP.
 */
const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' data: blob: https://huggingface.co https://*.hf.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");
const webCsp = (): Plugin => ({
  name: "libreroom-web-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    process.env.TAURI_ENV_PLATFORM ? html : html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${WEB_CSP}" />`),
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), webCsp(), thirdPartyNotices({ emit: true }), versionServiceWorker()],
  // The in-app self-test page is only built on request, never shipped in normal builds.
  build: mode === "selftest" ? { rollupOptions: { input: ["index.html", "selftest.html"] } } : {},
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: "es", plugins: () => [thirdPartyNotices({ emit: false })] },
  // Non-bundled ORT build, see src/workers/segment.worker.ts.
  resolve: {
    alias: [
      {
        find: /^onnxruntime-web\/webgpu$/,
        replacement: fileURLToPath(new URL("node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs", import.meta.url)),
      },
    ],
  },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
}));
