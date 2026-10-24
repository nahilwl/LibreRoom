# PhotoRoom research — overview

Analysis date: 2026-10-24. Tooling: Claude Code with REA (`rea-agents@6.7.0`, MCP server connected).

LibreRoom is an independent project. This research describes **observable behaviour and public documentation** only, so that equivalent features can be designed from scratch. No proprietary code, model, asset or private API was retrieved or used.

## Evidence labels

| Label | Meaning |
|---|---|
| **OBSERVED** | Seen directly through REA captures (DOM, accessibility tree, screenshots, network URLs). |
| **DOCUMENTED** | Stated in PhotoRoom's public documentation (help center, API docs, public OpenAPI spec). |
| **INFERRED** | A reasonable technical hypothesis that has not been verified. |
| **UNKNOWN** | Not accessible or not confirmed. |

## Method

| Means | Use |
|---|---|
| REA `capture_browser_scenario` (launch mode, headless Chromium 141) | Public pages: accessibility tree, screenshots, network log (URLs only, no bodies). |
| Public documentation | Features described by the vendor. |
| Reasoning | Hypotheses, always labelled **INFERRED**. |

Rules followed:
- no account was created;
- no authentication, Cloudflare challenge or paywall was bypassed;
- no PhotoRoom API was called;
- no proprietary code or model was downloaded.

JavaScript file names quoted below are URLs visible in the network log, not code.

## REA evidence

| Evidence ID | Target | Result |
|---|---|---|
| `ev_5ef0411e22c02461f4b0781225d7dda77461dc93c01234876c867ee1d626490a` | `https://www.photoroom.com/` | Marketing page, 559 network events. |
| `ev_5ba37676a3fd7e467eed6c6787de46786c3d12737fc61ae767e9fa6ddb291ba1` | `https://app.photoroom.com/` → `/create` | Web editor: mandatory sign-in dialog. |
| `ev_efb81ea2284d307bfe360ccfc40fb4c83f3d4606b353b89ff26b3d01bc94f50a` | `/create` + Escape key | The sign-in dialog stays open. |
| `ev_04f0c5e26059617742e968a9a891176e74a882c9f50b84b91e858253242acbd2` | `https://www.photoroom.com/tools/background-remover` | Public tool gated by a Cloudflare "Verify you are human" challenge. |

## Summary

- **OBSERVED**: the editor (`app.photoroom.com/create`) shows a dialog: "Create and edit your designs for free — Log in or sign up…" (Google, Facebook, Apple, e-mail). Escape does not close it, so the editor cannot be used without an account.
- **OBSERVED**: the public background-removal tool shows a Cloudflare challenge before any use. It was not bypassed, so no image processing was observed.
- **OBSERVED**: the web app loads a `libphotoroom_engine_webgl-*.wasm` module and creates 3 web workers at startup.
- **OBSERVED**: many third-party trackers load on first visit (see [technical-limitations.md](technical-limitations.md#trackers-observed)). This motivates LibreRoom's zero-telemetry rule.
- **DOCUMENTED**: background removal runs automatically on import in the web editor. The public API offers server-side processing (`POST /v1/segment`, `/v2/edit`).

## Files

- [interface-analysis.md](interface-analysis.md): layout and user journeys
- [background-removal.md](background-removal.md)
- [image-editor.md](image-editor.md)
- [ai-features.md](ai-features.md)
- [batch-processing.md](batch-processing.md)
- [technical-limitations.md](technical-limitations.md): limits of this analysis

## Going further (with the maintainer's consent)

The maintainer creates a test account and signs in **manually**, solving any human verification themselves. REA then **observes passively** (`list_browser_targets`, `observe_web_session`, `inspect_web_page`) while the human uses the editor. Credentials never go through the analysis tooling, and PhotoRoom's terms of service still apply.

### A browser with its sandbox enabled

On Ubuntu 23.10+, AppArmor restricts unprivileged user namespaces. A Chromium downloaded outside the distribution (e.g. Playwright's) therefore cannot start its sandbox, and only runs with `--no-sandbox`.

Ubuntu ships AppArmor profiles that grant the sandbox to the **distribution's** browsers (`/etc/apparmor.d/chromium`, `/etc/apparmor.d/chrome`). So no system security setting needs to change: use one of those builds.

> Status: the profiles were checked on the analysis machine. The steps below have not been run yet, because the Chromium snap is not installed there.

1. Install Chromium from Canonical's snap: `sudo snap install chromium`. The snap's confinement keeps the browser sandboxed.
2. Start it with a **dedicated, throw-away profile** and remote debugging bound to the local machine:
   ```bash
   chromium --remote-debugging-port=9222 --user-data-dir="$HOME/snap/chromium/common/pr-research"
   ```
   Recent Chromium versions refuse remote debugging on the default profile, which is another reason for a dedicated one.
3. In that window, sign in to the test account and solve any human check.
4. Tell the analyst. REA connects to `http://127.0.0.1:9222` and only observes.
5. When done, close the browser. The debugging port lets local programs control that browser while it runs, so never browse anything else in that profile, and delete the profile folder afterwards.
