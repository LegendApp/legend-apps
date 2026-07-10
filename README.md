# Legend Desktop

Legend Desktop is a Bun workspace for a family of React Native apps and the native packages they share. The apps use one reusable host under `shell/`; each app supplies its own JavaScript entrypoint, identity, supported platforms, native-module graph, and release metadata through `apps/<app>/app.manifest.ts`.

## Apps

| App | Current role | Platforms |
| --- | --- | --- |
| [Legend Code](apps/code/README.md) | Read-only, virtualized TypeScript and TSX viewer | macOS |
| [Legend Diff](apps/diff/README.md) | Native-backed diff viewer for repositories, files, patches, and GitHub diffs | macOS |
| [Legend Markdown](apps/markdown/README.md) | Local-first block Markdown editor | macOS |
| [Legend Music](apps/music/README.md) | Local music library, playlists, queue, and playback | macOS, iOS, Android |
| [Test Kitchen Sink](apps/test-kitchen-sink/README.md) | Interactive integration harness for shared packages | macOS, iOS, Android |

The platform lists above come from the app manifests. Desktop-specific features and native packages can still be more complete on macOS; see each app README for its current scope.

## Requirements

- [Bun](https://bun.sh/) for workspace installation, scripts, and tests
- Xcode and CocoaPods for macOS and iOS native builds
- Android Studio and an Android SDK for Android builds

Install workspace dependencies from the repository root:

```sh
bun install
```

## Run an app

All app commands use the same shape:

```sh
bun run <app> <action> [platform] [options]
```

The platform defaults to `macos`. For example, start Music's Metro server and run its macOS app from separate terminals:

```sh
bun run music start macos
bun run music run macos
```

Common actions:

| Action | Purpose |
| --- | --- |
| `start` | Start Metro for macOS or Expo dev server for iOS/Android |
| `run` | Prepare native configuration, build, and launch a development app |
| `open` | Open an already-built macOS development app |
| `verify` | Verify generated configuration, identity, and native package linking |
| `pods` | Install CocoaPods for a macOS or iOS app |
| `prebuild` | Generate the Expo iOS or Android native project |
| `build` | Create a release build |
| `package` | Package, sign, notarize, and generate an appcast for a macOS release |
| `githubrelease` | Publish an already-packaged macOS build as a GitHub release |

Only use actions and platforms supported by the selected app. Running `bun run <app>` without an action prints the complete command help. Each app has a dedicated Metro port, assigned in `scripts/lib/apps.ts`, so multiple app servers do not collide.

When an app manifest or native package link changes, refresh CocoaPods before rebuilding macOS:

```sh
bun run <app> pods macos
```

For iOS or Android, generate the native project before the first run when it is not already present:

```sh
bun run music prebuild ios
bun run music run ios
```

## Validate changes

The baseline repository checks are:

```sh
bun run typecheck
bun run verify:all
bun run verify:react-compiler
```

Focused test suites are available for the apps and packages that currently have automated coverage:

```sh
bun run test:music --runInBand
bun run test:diff:fast
bun run test:markdown-editing
```

Runtime E2E scripts are intentionally separate because they build or control apps:

```sh
bun run test:diff-e2e
bun run test:markdown-e2e
```

## Workspace layout

- `apps/` contains app manifests, app package metadata, UI, state, and app-specific tests.
- `packages/` contains shared TypeScript libraries and React Native native modules.
- `shell/` is the reusable Expo/React Native host and owns the generated iOS, Android, and macOS projects.
- `scripts/` contains app selection, native config generation, verification, build, package, and release tooling.
- `patches/` contains Bun `patchedDependencies` applied during install.
- `themes/` contains shared display, syntax, and document themes.
- `updates/` contains per-app Sparkle feeds for macOS releases.

Generated per-app native workspaces and configuration live under `shell/.legend/` and should be treated as build output rather than app source.

## Release builds

Release builds are opt-in and are not part of the normal iteration loop:

```sh
bun run diff build macos
bun run diff package macos all
bun run diff githubrelease macos all
```

macOS packaging supports architecture-specific or combined output and requires the signing, notarization, Sparkle, and GitHub credentials expected by the release scripts. App versions come from `apps/<app>/package.json`; build and Sparkle metadata come from the app manifest. Appcast details are documented in [updates/README.md](updates/README.md).
