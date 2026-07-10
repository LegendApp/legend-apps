# Legend Diff

Legend Diff is a macOS diff viewer built around native parsing and virtualized rendering. It can inspect local repository changes, compare refs or files, open patch files, load GitHub pull requests and commits, and help resolve working-tree merge conflicts.

## Current scope

- open a Git folder and compare the working tree or another local/remote ref
- compare two individual files
- open `.diff` and `.patch` files
- open GitHub pull-request and commit URLs
- accept folders, files, and URLs through dialogs, drag and drop, paste, launch arguments, and the `legend-diff://` URL scheme
- keep filtered recent sources for folders, files, pull requests, and commits
- browse changed files in a sidebar and render unified or block-oriented diff views
- search the whole diff with keyboard navigation and active-match centering
- toggle syntax highlighting, full-file context, statistics, font settings, and window restoration
- detect merge-conflict files, choose ours/theirs/both per conflict, preserve drafts, and save resolved files
- install an `ldiff` shell command from Settings for opening Git diff arguments in the installed app
- update release builds through the shared Sparkle updater

Legend Diff currently supports macOS only. Local repository comparisons require Git, and GitHub URL loading requires network access to the public `.diff` endpoint.

## Run

From the repository root:

```sh
bun run diff start macos
bun run diff run macos
```

Open an existing development build without rebuilding:

```sh
bun run diff open macos
```

The Diff Metro server uses port `19095` by default.

## Validate

The fast validation command covers the Diff app, both parser packages, native diff-parser tests, package linking, and TypeScript:

```sh
bun run test:diff:fast
```

Individual checks are also available:

```sh
bun run test:diff --runInBand
bun run test:diff-parser --runInBand
bun run test:syntax-parser --runInBand
bun run test:diff-parser:native
bun run diff verify macos
bun run typecheck
```

The runtime E2E harness is separate:

```sh
bun run test:diff-e2e
```

## Release

Diff has convenience aliases for macOS packaging and GitHub release publication:

```sh
bun run diff:package:arm
bun run diff:package:x86
bun run diff:package:all
bun run diff:release:github
```

Release notes come from `CHANGELOG.md`. Packaging is credentialed release work and is not needed for ordinary development.

## Key files

- `app.manifest.ts` declares macOS identity, URL handling, native modules, and Sparkle metadata.
- `src/App.tsx` owns startup, menus, recents, source opening, and viewer-window orchestration.
- `src/start-screen/` contains the launcher and recent-source experience.
- `src/DiffViewerWindow.tsx` is the main loaded-document, search, merge, and rendering surface.
- `src/viewer/` contains loaded-document models, rows, search, and controller helpers.
- `src/diffFiles.ts`, `src/diffCompareTargets.ts`, and `src/diffMerge.ts` define the supported source and merge workflows.
