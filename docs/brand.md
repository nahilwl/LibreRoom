# Brand

LibreRoom has its own visual identity. It deliberately avoids the purple tones, logo shapes and imagery of commercial photo-editing products.

## Logo

[`public/logo.svg`](../public/logo.svg): a rounded teal square holding an open white frame. Its lower-right corner dissolves into a transparency checkerboard: *the subject is freed from its background*.

- Use it on light or dark backgrounds, unmodified.
- Minimum size: 16 px (favicon).
- App icons in every size (`src-tauri/icons/`) are generated from the SVG with `npx tauri icon public/logo.svg`.

## Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#0d8a76` | `#3cc5a9` | Primary actions, selection, logo |
| `--accent-ink` | `#ffffff` | `#06201a` | Text on accent |
| `--bg` | `#eef0ec` | `#0f1211` | App background |
| `--panel` | `#ffffff` | `#171b19` | Panels, header |
| `--raised` | `#f6f7f4` | `#1f2421` | Buttons, fields |
| `--line` | `#dfe2dc` | `#2b312e` | Borders |
| `--ink` | `#1b1f1d` | `#e9edeb` | Text |
| `--muted` | `#5d6661` | `#9aa49f` | Secondary text |
| `--danger` | `#c0392b` | `#ff7a6b` | Errors |
| `--checker` | `#e4e6e2` | `#2a2f2c` | Transparency grid |

Defined in [`src/index.css`](../src/index.css). The neutrals are slightly green-tinted, to sit with the teal accent.

## Typography

The **system UI font** of each platform (`ui-sans-serif, system-ui, Segoe UI, Roboto, Noto Sans, Cantarell…`). It needs no font download, which matters for privacy and offline use, and it looks native everywhere.

## Voice

Plain, friendly and honest:
- say what happens ("The model is downloaded once, then works offline");
- never promise what is not measured.

## Screenshots

README images are real captures of the app (`docs/assets/`), regenerated with `scripts/make-readme-visuals.mjs` and the e2e suite. They are never mock-ups.
