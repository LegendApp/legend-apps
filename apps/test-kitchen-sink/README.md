# Legend Test Kitchen Sink

Legend Test Kitchen Sink is the interactive integration harness for shared Legend Desktop packages. It presents package examples in isolated windows so native linking, React Native views, TurboModules, events, and cross-window behavior can be checked without adding test-only UI to a product app.

## Current scope

The launcher currently exposes examples for:

- AI and command execution
- app exit and auto-updater events
- AppKit split views, sidebars, window controls, and window management
- audio playback
- context menus, native menus, global hotkeys, and focused keyboard events
- drag and drop, file dialogs, file scanning, document scanning, and file watching
- glass effects and SF Symbols
- Markdown parsing
- media-library scanning and media tags
- native search fields

Each example opens in a separate React root hosted by its own native window where the platform supports that behavior. The manifest enables macOS, iOS, and Android, but the exact package set differs by platform and several examples are intentionally desktop-specific.

## Run

macOS development from the repository root:

```sh
bun run test-kitchen-sink start macos
bun run test-kitchen-sink run macos
```

Mobile development uses the shared prebuild flow:

```sh
bun run test-kitchen-sink prebuild ios
bun run test-kitchen-sink run ios

bun run test-kitchen-sink prebuild android
bun run test-kitchen-sink run android
```

The Test Kitchen Sink dev server uses port `19093` by default.

## Validate

Verify every supported native graph when changing a cross-platform package:

```sh
bun run test-kitchen-sink verify macos
bun run test-kitchen-sink verify ios
bun run test-kitchen-sink verify android
bun run typecheck
```

There is no single automated Kitchen Sink test suite. Use the launcher for targeted manual integration checks, and run any package-specific unit or native test suite alongside it.

## Add or update an example

1. Add the package and test metadata in `src/packageTests.ts`.
2. Add or update the implementation under `src/examples/`.
3. Route the package in `renderKitchenSinkTest` in `src/App.tsx`.
4. Add the package dependency to `package.json`.
5. Add the native module to the relevant platform lists in `app.manifest.ts`.
6. Refresh CocoaPods or prebuild the mobile project, then verify the affected platform.

Custom Fabric views that retain native state must also reset owned subviews, delegates, cached props, and other mutable state in `prepareForRecycle`.
