/** True inside the Tauri desktop app (its IPC bridge is injected before any script runs). */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** "native": ONNX Runtime in the desktop app's Rust process. "browser": ONNX Runtime Web (WASM/WebGPU). */
export type Engine = "native" | "browser";
export const defaultEngine: Engine = isDesktop ? "native" : "browser";
