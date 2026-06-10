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

Use `agent-device` for app UI inspection and verification whenever it fits the task better than manual OS interaction. For macOS app screenshots, prefer an app-scoped session and `agent-device screenshot`, which captures the app window without foregrounding the app or disrupting the user's desktop:

- Open or bind a macOS app session with `agent-device open <app> --platform macos --surface app`.
- Capture app-window screenshots with `agent-device --session <name> screenshot <path>`.
- Use `--fullscreen` only when the whole desktop is intentionally needed.
- Prefer `agent-device snapshot`, `screenshot`, `diff`, `metro reload`, and session management over manual `open -a`, AppleScript foregrounding, raw screen captures, or ad hoc UI poking.

## Commit & Pull Request Guidelines

Commit history uses concise Conventional Commit subjects, for example `feat: add window manager package` and `fix: render appkit split view`. Do not use scopes; write `type: subject`, not `type(scope): subject`. Do not add `Co-authored-by: Codex <noreply@openai.com>`.

PRs should describe the app/package touched, platforms affected (`macos`, `ios`, `android`), validation commands run, and any native project regeneration. Include screenshots or screen recordings for visible UI changes.
