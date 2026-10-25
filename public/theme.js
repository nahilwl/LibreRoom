// Applies the saved (or system) theme before first paint, to avoid a light flash in dark mode.
// A separate file rather than an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
  const t = localStorage.getItem("libreroom-theme");
  if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch {
  /* storage unavailable: system theme only */
}
