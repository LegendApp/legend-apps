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
- customize the viewer and start screen with prompts, reversible previews, and saved change stacks

Legend Diff currently supports macOS only. Local repository comparisons require Git, and GitHub URL loading requires network access to the public `.diff` endpoint.

## Customize App

Settings → Customize App uses an installed, signed-in Codex or Claude CLI to turn a prompt into changes to the viewer and start screen. Generation produces a separate preview window with a sample diff. Keep activates the exact compiled preview; Revert leaves the current app unchanged. The optional automatic keep setting activates a preview after it renders successfully.

Each kept version records the prompts, ordered edits, and compiled code. Add prompts to stack changes, or edit, disable, and delete an earlier change. Later edits replay against the revised stack; a dependency conflict stops the preview and leaves the current version intact. Saved versions can be previewed and restored without calling AI again. Restore Original App clears the active stack while retaining saved versions.

Settings and the Keep/Revert controls remain outside customized code. Activation checks unsaved merge drafts, and render failures return to the original viewer. Preview file operations use the sample diff and block host mutation APIs, but generated JavaScript is trusted customization code rather than a security sandbox. Customizations use existing JavaScript and native capabilities; adding a native module requires a normal app build. Versions from an incompatible source baseline remain in history but cannot be activated.

Development uses `scripts/diff-customization.mjs`; macOS packaging embeds the baseline and compiler in a signed helper. When adding imports to editable source files, regenerate the shared host map:

```sh
bun scripts/diff-customization.mjs --hosts
bun test scripts/diff-customization.test.mjs
```

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
- `src/customization/` owns prompt generation, strict stack replay, compiled snapshots, preview recovery, and settings.
