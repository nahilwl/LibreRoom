# FAQ

**Is LibreRoom really free?**
Yes. No subscription, no paid tier, no watermark, no export limit, no account. The code is AGPL-3.0.

**Are my photos uploaded anywhere?**
No. Everything runs on your computer. The only network request LibreRoom makes is the model download you trigger yourself, from Hugging Face, checked by SHA-256. The automated tests fail if any other server is contacted.

**Does it work offline?**
Yes, once the model is downloaded. The desktop app is tested with every remote connection blocked.

**Why is the model not included in the installer?**
It keeps the download small, and you choose which model to install. A bundled-model option may come later.

**Why is the first removal slower?**
The first run loads the model: about 0.5 s extra on desktop, and about 1–3 s in the browser, where the model is also compiled. To free memory, the model is unloaded when idle: after 15 s on desktop, 60 s in the browser.

**How much memory does it need?**
Desktop app: about 160–250 MB at rest. Removing a background peaks around 1.3 GB for about a second, then the memory is released. In Chromium, the peak is about 1.5 GB. Details: [performance.md](performance.md).

**Is this affiliated with PhotoRoom?**
No. LibreRoom is an independent project. It studied publicly observable behaviour and public documentation (see [research](research/overview.md)) and contains no PhotoRoom code, model or asset.

**Which platforms are supported?**
Linux and the web (Chromium) are built and tested. Windows and macOS builds are prepared but not tested yet.

**Can I use the results commercially?**
LibreRoom puts no restriction on your images. The default model's license (AGPL-3.0) concerns the software and the model, not the photos you process. This is not legal advice.
