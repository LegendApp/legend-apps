# Legend Apps

Legend Apps is a collection of focused, local-first apps for working with code,
documents, and media. The apps are designed around files you control, native
platform behavior, and responsive handling of large libraries and documents.

## Apps

### [Legend Diff](apps/diff/README.md)

Legend Diff is a native macOS viewer for reviewing changes across repositories,
files, patches, GitHub pull requests, and commits. It can:

- compare a Git working tree, branches, tags, commits, or other refs
- compare two files or open existing `.diff` and `.patch` files
- load GitHub pull request and commit URLs
- browse changed files, search across a diff, and switch between unified and
  block-oriented views
- detect merge conflicts, choose ours, theirs, or both for each conflict, and
  save the resolved file

Files, folders, and URLs can be opened through dialogs, drag and drop, paste,
launch arguments, or the optional `ldiff` command-line helper. Appearance,
syntax highlighting, context, and window restoration are configurable. Legend
Diff requires macOS 14 or later. Local repository comparisons require Git.

### [Legend Markdown](apps/markdown/README.md) ![Pre-release][pre-release-badge]

Legend Markdown is a local-first block Markdown editor for macOS. It edits the
Markdown file directly while presenting inactive blocks as rendered content and
turning the active block into an editor.

It supports new and existing Markdown documents, Save and Save As, optional
autosave, recent documents, external file changes, undo and redo, keyboard
navigation, and native formatting menus and toolbars. Themes, typography,
content width, document density, toolbar placement, toolbar contents, and
hotkeys are customizable. The current app supports one document window at a
time and does not expose a separate raw-source mode.

### [Legend Music](apps/music/README.md) ![Pre-release][pre-release-badge]

Legend Music is a local music player built around folders and audio files you
own. It scans one or more library folders, reads track metadata and artwork, and
lets you browse by library, album, artist, or playlist.

Playback includes a persistent queue, next and previous controls, shuffle,
repeat, volume, seeking, media keys, and configurable global hotkeys. Local
`.m3u` playlists can be created, edited, imported, and exported. The macOS app
also supports drag and drop, a configurable now-playing overlay, multiple
utility windows, themes, and customizable playback controls. iOS and Android
development targets exist, but the full experience is currently macOS-first.

### [Legend Code](apps/code/README.md) ![Pre-release][pre-release-badge] ![Demo App][demo-app-badge]

Legend Code is a read-only TypeScript and TSX viewer for macOS. It uses native
parsing, incremental syntax highlighting, and virtualized rendering to keep
large source files responsive.

Files can be opened from Finder, the native Open dialog, launch arguments, or
recent documents. The viewer reloads files after external changes and provides
font, size, syntax-theme, and highlighting settings. Legend Code intentionally
does not modify source files.

### Legend Chat History ![Demo App][demo-app-badge]

Legend Chat History is a macOS demo for browsing recent local Codex and Claude
transcripts. It discovers sessions on the Mac, groups them by provider, and
renders the selected conversation in a virtualized transcript view.

The composer is an interaction and performance demo: it streams a simulated
response in memory, sends nothing to a model, and does not persist the generated
messages.

## Availability

Legend Diff is currently packaged for Apple silicon and Intel Macs through the
repository's [GitHub Releases](https://github.com/LegendApp/legend-apps/releases).
The repository is private, so public downloads are not yet available. Other app
statuses are marked above.

## For developers and contributors

This repository is a Bun workspace built around React Native and a reusable
native host under `shell/`. Each app supplies its JavaScript entrypoint,
identity, supported platforms, native-module graph, and release metadata through
`apps/<app>/app.manifest.ts`.

### Developer integration app

- **Legend Test Kitchen Sink** is the integration harness for shared packages
  across macOS, iOS, and Android.

### Requirements

- [Bun](https://bun.sh/) for workspace installation, scripts, and tests
- Xcode and CocoaPods for macOS and iOS native builds
- Android Studio and an Android SDK for Android builds

Install workspace dependencies from the repository root:

```sh
bun install
```

### Run an app

All app commands use the same shape:

```sh
bun run <app> <action> [platform] [options]
```

The platform defaults to `macos`. For example, start Music's Metro server and
run its macOS app from separate terminals:

```sh
bun run music start macos
bun run music run macos
```

Common actions:

| Action | Purpose |
| --- | --- |
| `start` | Start Metro for macOS or the Expo dev server for iOS and Android |
| `run` | Prepare native configuration, build, and launch a development app |
| `open` | Open an already-built macOS development app |
| `verify` | Verify generated configuration, identity, and native package linking |
| `pods` | Install CocoaPods for a macOS or iOS app |
| `prebuild` | Generate the Expo iOS or Android native project |
| `build` | Create a release build |
| `package` | Package, sign, notarize, and generate appcasts for a macOS release |
| `githubrelease` | Publish an already-packaged macOS build as a GitHub release |

Only use actions and platforms supported by the selected app. Running
`bun run <app>` without an action prints the complete command help. Dedicated
Metro ports in `scripts/lib/apps.ts` allow multiple app servers to run without
colliding.

When an app manifest or native package link changes, refresh CocoaPods before
rebuilding macOS:

```sh
bun run <app> pods macos
```

For iOS or Android, generate the native project before the first run when it is
not already present:

```sh
bun run music prebuild ios
bun run music run ios
```

### Validate changes

The baseline repository checks are:

```sh
bun run typecheck
bun run verify:all
bun run verify:react-compiler
```

Focused suites cover the main app and package workflows:

```sh
bun run test:music --runInBand
bun run test:diff:fast
bun run test:markdown-editing
```

Runtime E2E scripts are separate because they build or control apps:

```sh
bun run test:diff-e2e
bun run test:markdown-e2e
```

### Workspace layout

- `apps/` contains app manifests, package metadata, UI, state, and app-specific
  tests.
- `packages/` contains shared TypeScript libraries and React Native native
  modules.
- `shell/` is the reusable Expo and React Native host and owns generated native
  projects.
- `scripts/` contains app selection, configuration generation, verification,
  build, package, and release tooling.
- `patches/` contains Bun `patchedDependencies` applied during installation.
- `themes/` contains shared display, syntax, and document themes.
- `updates/` contains architecture-specific Sparkle feeds for macOS releases.

Generated per-app native workspaces and configuration live under
`shell/.legend/` and are build output rather than app source.

### Release builds

Release builds are opt-in and are not part of the normal iteration loop:

```sh
bun run diff build macos
bun run diff package macos all
bun run diff githubrelease macos all
```

macOS packaging supports architecture-specific or combined output and requires
the signing, notarization, Sparkle, and GitHub credentials expected by the
release scripts. App versions come from `apps/<app>/package.json`; build and
Sparkle metadata come from the app manifest. See [RELEASING.md](RELEASING.md)
for the complete release workflow.

[pre-release-badge]: https://img.shields.io/badge/status-PRE--RELEASE-E6A23C?style=flat-square
[demo-app-badge]: https://img.shields.io/badge/type-DEMO%20APP-6F42C1?style=flat-square
