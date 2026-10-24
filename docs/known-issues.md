# Known issues

| Issue | Impact | Workaround / plan |
|---|---|---|
| Faint halos or leftover patches with the Fast model (e.g. around socks or legs next to the subject; visible in the README before/after image) | Cut-out not perfect on complex scenes | Refine with the Erase brush, or use the Precise model where WebGPU is available (web). |
| Peak memory during AI: ~1.3 GB on desktop (native), ~1.5 GB in Chromium | May be tight on 4 GB machines (untested) | Desktop releases it after 15 s idle, the web version after 60 s. |
| Precise model needs WebGPU (web only) | Not available on desktop (natively it would need ~7.7 GB of RAM) or without a GPU | Use Fast. |
| WebKitWebDriver is unavailable on Ubuntu 26.04 | No UI automation inside the desktop window | The in-app self-test covers the engine. UI flows are tested in Chromium. |
| Windows and macOS untested | Unknown behaviour | Help wanted! |
| Web version on GitHub Pages runs single-threaded | About 2× slower | See [web-deployment.md](web-deployment.md). |
| Layer handles (corner resize, rotation) are not on the canvas yet | Use the Layers panel sliders | Planned with the resizing feature. |
| The `.deb` package is named `libre-room` (derived by Tauri from the product name) | Cosmetic | Rename before the first release. |
| A brush stroke on a very large image (48 MP) copies the mask once at stroke start and reads it back at the end | Short pause at both ends | Region-based mask updates later. |
| EXIF orientation is applied by the browser decoder, but not covered by a test | — | Add a rotated fixture. |
