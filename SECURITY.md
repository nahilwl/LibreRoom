# Security policy

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private **"Report a vulnerability"** feature (Security tab → Advisories) on this repository. You will get a first answer within 7 days.

## Scope and known attack surface

- **Files opened by the user**: images and `.libreroom` projects. Projects are validated before use (`src/lib/project.ts`): format, maximum dimensions, image data URLs only, never remote URLs.
- **Downloaded AI models**: URLs are pinned to a commit and the SHA-256 is verified before caching. A mismatching file is rejected.
- **Desktop shell**:
  - the UI is served through Tauri's internal protocol, with no local server and no listening port (tested);
  - the WebView may call only LibreRoom's own commands (install/run/remove a model), not even Tauri's core APIs;
  - the Rust side accepts only allow-listed models, re-verifies their size and SHA-256 before writing them, and checks every tensor size;
  - a strict Content-Security-Policy limits network access to the app itself and `huggingface.co`.
- **No server**: LibreRoom sends no data anywhere. Any network request other than an explicit model download is a security bug.

## Supported versions

Only the latest release receives fixes.
