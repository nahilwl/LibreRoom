import { isDesktop } from "./platform";

const RELOAD_FLAG = "libreroom-coi-reload";

/**
 * Web build: registers coi-sw.js, which keeps the app usable offline and, on static hosts
 * without COOP/COEP headers (GitHub Pages), adds them. If the page is not yet cross-origin
 * isolated it reloads once, then runs multi-threaded. If anything fails, the app simply keeps
 * running single-threaded. Never runs on desktop or in development.
 */
export function enableCrossOriginIsolation() {
  if (isDesktop || !import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  if (crossOriginIsolated) {
    // Already isolated (the server sends the headers, or the worker is active): keep the
    // worker registered for offline use, without reloading.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}coi-sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
    return;
  }
  const reloadOnce = () => {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried: stay single-threaded
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      return; // no sessionStorage: cannot guard against reload loops
    }
    location.reload();
  };
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}coi-sw.js`, { scope: import.meta.env.BASE_URL })
    .then(() => {
      // Controlled but still not isolated (e.g. first load after an update): reload once.
      if (navigator.serviceWorker.controller) reloadOnce();
      else navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, { once: true });
    })
    .catch(() => {
      /* single-threaded fallback */
    });
}

/** Clears the reload guard once isolation works, so a later SW update can reload again. */
export function markIsolationState() {
  try {
    if (crossOriginIsolated) sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}
