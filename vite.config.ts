import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Cross-origin isolation enables SharedArrayBuffer, so onnxruntime-web can use several CPU threads.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // The in-app self-test page is only built on request, never shipped in normal builds.
  build: mode === "selftest" ? { rollupOptions: { input: ["index.html", "selftest.html"] } } : {},
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: "es" },
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
