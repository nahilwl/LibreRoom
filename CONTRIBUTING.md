# Contributing to LibreRoom

Thanks for your interest! LibreRoom is a free, private, local-first photo editor, and every contribution helps: code, bug reports, testing on your platform, translations, design and documentation.

## Ground rules

These are non-negotiable and checked in review:

1. **Privacy**: no telemetry, analytics, trackers or implicit network calls. Every download is triggered by the user, announced (size, source) and verified by SHA-256.
2. **No proprietary material**: never copy code, assets, models or text from closed products.
3. **AI models**: the license must allow redistribution and be AGPL-3.0 compatible. Pin the source to a commit and record the SHA-256 (see [docs/developer-guide.md](docs/developer-guide.md#adding-a-model)).
4. **Real features only**: no placeholder buttons and no mock-ups presented as features.
5. **Measure claims**: any performance statement needs a reproducible measurement ([docs/performance.md](docs/performance.md)).
6. **English** for code, comments, docs, commit messages and issues. UI text goes through `src/i18n`.

## Getting started

See the [developer guide](docs/developer-guide.md) for setup. Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

If you touched user flows, also run the e2e suite (`npm run test:e2e`). If you touched the desktop shell, run `npm run test:tauri`.

Add a test for any non-trivial new logic: parsing, image maths, anything security-related.

## Reporting bugs and proposing features

Use the issue templates: **Bug report** or **Feature request**. For security issues, follow [SECURITY.md](SECURITY.md) instead.

## Translations

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts` and translate the values.
2. Register the language in `src/i18n/index.ts`.

TypeScript will tell you if a key is missing.

## Pull requests

- Keep them focused; explain *why* in the description.
- Follow the existing style: TypeScript strict, small files, comments for the *why*.
- By contributing, you agree that your contribution is licensed under AGPL-3.0-or-later.

## Code of conduct

Be kind, assume good intent, and keep discussions about the work. Harassment or discrimination of any kind is not tolerated. Maintainers may remove content or contributors that break this rule. We follow the spirit of the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
