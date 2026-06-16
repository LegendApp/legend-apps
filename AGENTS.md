# Repository Guidelines

## Project Structure & Module Organization

This is a Bun workspace for React Native desktop/mobile experiments. App entrypoints live in `apps/<app>/src`, and each app has an `app.manifest.ts` that declares bundle IDs, supported platforms, and native module links. Shared native modules live in `packages/<module>` with TypeScript specs in `src/`, plus platform implementations in `ios/`, `android/`, and sometimes `macos/`. The reusable host app is under `shell/`; generated native projects live in `shell/ios`, `shell/android`, and `shell/macos`. Build orchestration scripts are in `scripts/`.

## Build, Test, and Development Commands

Use Bun from the repo root.

- `bun install`: install workspace dependencies and apply `patchedDependencies`.
- `bun run music run macos`: prepare config, build, and run the `music` app on macOS. Replace `music` with `markdown` or `test-kitchen-sink`.
- `bun run music start`: start Metro/dev server for that app.
- `bun run music open`: open an already built macOS app.
- `bun run music build macos`: build a release app.
- `bun run music prebuild ios`: generate native iOS or Android projects when needed.
- `bun run verify:all`: verify generated config and package linking for all apps/platforms.
- `bun run typecheck`: run `tsc --noEmit` across `apps`, `packages`, `scripts`, and `shell`.

## Coding Style & Naming Conventions

TypeScript is strict, ESM-based, and uses React JSX (`react-jsx`). Follow the existing style: two-space indentation, double quotes, semicolons, and named exports for package APIs. Package names use `@legend-desktop/<kebab-name>`. Native module files follow the existing `Native<Name>.ts`, `RN<Name>.podspec`, and platform class naming patterns.

## Native View Lifecycle

Custom Fabric native view components that own native subviews, controllers, delegates, cached props, or other mutable native state should implement `prepareForRecycle` and reset that state before reuse. Keep the reset local to the component that owns the native state; TurboModules and stateless native views do not need this hook.

## Native Dependency Changes

When adding, removing, or relinking native modules, remember to refresh the native dependency graph before expecting the running app binary to expose those modules. For macOS, run `bun run <app> pods macos` after native package or `app.manifest.ts` native module changes, then rebuild/rerun the app. A Metro reload alone is not enough for new TurboModules or pod changes.

## Build Scope

Do not run release builds by default while iterating. Use `bun run typecheck`, targeted `verify` commands, and debug/dev builds unless the user explicitly asks for a release build or the change specifically requires release-build validation.

## Testing Guidelines

There is no dedicated test runner configured yet. Treat `bun run typecheck` and targeted app verification as the baseline before submitting changes. For native package work, run `bun run <app> verify <platform>` against an app that consumes the package, and prefer `test-kitchen-sink` for integration coverage.

## UI Verification With Agent Device

Use `agent-device` as the default runtime debugging and UI automation surface for React Native macOS apps in this repo. Prefer it for app UI inspection, action injection, screenshots, logs, Metro reloads, React DevTools checks, and repeatable verification flows before reaching for manual OS interaction or raw platform tools.

For macOS app screenshots and interaction, prefer an app-scoped session, which captures and targets the app window without foregrounding the app or disrupting the user's desktop:

- Open or bind a macOS app session with `agent-device open <app> --platform macos --surface app`.
- Capture app-window screenshots with `agent-device --session <name> screenshot <path>`.
- Use `--fullscreen` only when the whole desktop is intentionally needed.
- Prefer `agent-device snapshot`, `screenshot`, `diff`, `logs`, `network dump`, `perf`, `metro reload`, `react-native dismiss-overlay`, `react-devtools`, and session management over manual `open -a`, AppleScript foregrounding, raw screen captures, or ad hoc UI poking.
- For JS-only changes with Metro connected, prefer `agent-device metro reload --session <name>` instead of restarting the app.
- For LogBox or RedBox overlays, use `agent-device react-native dismiss-overlay --session <name>` before interacting with the covered UI.
- For debugging, keep evidence windows small: `agent-device logs clear --restart --session <name>`, `agent-device logs mark "before repro" --session <name>`, reproduce with `press`/`fill`/`type`/`scroll`/`wait`, then `agent-device logs mark "after repro" --session <name>` and `agent-device logs path --session <name>`.
- For first-time exploration, use one-at-a-time `agent-device snapshot -i --session <name>` and targeted commands so refs and UI state stay grounded after each mutation.
- When a repro or verification path is known, prefer an `agent-device batch --steps-file <path> --session <name>` flow over one-off commands. Keep batch steps stable with selectors, visible text waits, and app-defined e2e launch arguments rather than session-specific refs whenever possible.

### Runtime Logs With Agent Device

For React Native macOS app debugging, do not rely on Metro output for runtime logs. Metro often only shows bundling status, and JS `console.info` may be routed to React Native DevTools instead of the app log.

Use the normal `agent-device logs clear --restart` / `mark before` / repro / `mark after` / `logs path` loop above, with these extra checks when logs are empty or confusing:

- Verify there is exactly one current debug app process, and that it comes from `DerivedData/.../Build/Products/Debug/...`, not `shell/.legend/workspaces/release/...`.
- Prefer binding to the already-running frontmost app with `agent-device open --session <name> --platform macos --surface frontmost-app`; if binding by bundle id, re-check that it did not launch a duplicate instance.
- If `app.log` only contains `agent-device` markers, confirm `logs path` reports `active=true`, the debug prefix was emitted after `logs clear --restart`, and the session is bound to the correct app.
- For temporary instrumentation that must be visible in `agent-device logs` on macOS, prefer native unified logging with the app bundle id subsystem, for example `os_log_create("app.legend.markdown.macos", "debug-category")`. Plain `NSLog` can be missed by the app-scoped filter.
- If JS-side timing is required and app logs do not include it, try `agent-device react-devtools ...` before falling back to file-backed logging.

### macOS Dev App Pitfalls

For current-code testing, launch the app with the repo scripts before binding `agent-device`:

- `bun music run` for Music.
- `bun markdown run` for Markdown.

Before a native rebuild/relaunch, close the running app first. If the app is already running, the build/run script may only focus the old process, so the rebuilt native code will not be loaded.

Do not rely on `agent-device open <bundle-id>` as the primary way to launch current code. For generated macOS apps it can bind to a stale release build under `shell/.legend/workspaces/release/...`, which will not contain current JS/native changes. After launching, verify the running process when behavior or logs look stale:

- `ps -axo pid,lstart,command | rg "legendapp-shell-macos|Legend Markdown|Legend Music|app.legend.(music|markdown)"`
- Debug/current builds should run from Xcode `DerivedData/.../Build/Products/Debug/legendapp-shell-macos.app/...`.
- Stale release builds usually run from `shell/.legend/workspaces/release/<app>/macos/.../<Display Name>.app/...`.

The app-specific Metro ports are defined in `scripts/lib/apps.ts`; do not assume `8081`:

- Music: `19091`.
- Markdown: `19092`.
- Test Kitchen Sink: `19093`.

Before reloading JS, confirm the active port with `curl http://localhost:<port>/status` or `lsof -nP -iTCP -sTCP:LISTEN | rg "node|bun|metro|19091|19092|19093"`. Use the explicit port with agent-device:

- `agent-device metro reload --session <name> --platform macos --metro-port 19091` for Music.
- `agent-device metro reload --session <name> --platform macos --metro-port 19092` for Markdown.

If `agent-device logs path` returns an `app.log` that only contains the filter banner or stays tiny after a repro, do not conclude that runtime logs are absent. First verify the process path is the debug app, the log stream is active, and the session is bound to the correct running app. A sparse macOS snapshot with `0 nodes` is also not enough evidence by itself; use process path, screenshots, Metro status, and logs together.

## Commit & Pull Request Guidelines

Commit history uses concise Conventional Commit subjects, for example `feat: add window manager package` and `fix: render appkit split view`. Do not use scopes; write `type: subject`, not `type(scope): subject`. Do not add `Co-authored-by: Codex <noreply@openai.com>`.

PRs should describe the app/package touched, platforms affected (`macos`, `ios`, `android`), validation commands run, and any native project regeneration. Include screenshots or screen recordings for visible UI changes.
