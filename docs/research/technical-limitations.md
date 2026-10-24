# Limits of this analysis

## Blockers met

| Blocker | Effect | Workaround? |
|---|---|---|
| Mandatory sign-in at `app.photoroom.com/create`; Escape has no effect (`ev_efb81ea2…`) | Editor, cut-out, batch and AI not observable | Only with a test account created and signed in by a human (see [overview](overview.md#going-further-with-the-maintainers-consent)). |
| Cloudflare challenge on the public tool | No processing observable | No, by principle. A human may solve it during passive observation. |
| REA's `capture_browser_scenario` has no "upload a file" action | Even with access, an image import could not be scripted | Passive observation while the human acts (`observe_web_session`). |
| No system Chromium; Playwright has no build for Ubuntu 26.04 | — | Playwright's Chromium 141 downloaded to `~/.cache/ms-playwright` (forced `ubuntu24.04-x64`); it works. |

## Out of scope by design

PhotoRoom's JavaScript bundles and WASM module were not downloaded or statically analysed: that would mean retrieving proprietary code. Only URL **names** are quoted.

## Trackers observed

Third-party origins contacted while loading `app.photoroom.com` (`ev_5ba37676…`), without any interaction or explicit consent on our side:

- googletagmanager.com, google-analytics.com, pagead2.googlesyndication.com
- connect.facebook.net, analytics.tiktok.com, bat.bing.net
- px.ads.linkedin.com, clarity.ms
- Amplitude (cdn, sr-client-cfg, amplitude-experiments), RudderStack, Braze
- ZoomInfo (`ws.zoominfo.com`, `js.zi-scripts.com`), Snitcher, Referly, HubSpot
- Intercom, Adjust, Courier, bzrcdn.openai.com

**INFERRED**: some scripts may depend on the consent banner (`sdk.privacy-center.org`). Their behaviour after refusal was not checked.

**Resulting LibreRoom rule**: the only allowed network origin is the explicit model download. The end-to-end test enforces this: the origins contacted are only the app itself, `huggingface.co` and its CDN, and only after "Download the model" is clicked.
