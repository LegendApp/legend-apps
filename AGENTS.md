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

TypeScript is strict, ESM-based, and uses React JSX (`react-jsx`). Follow the existing style: two-space indentation, double quotes, semicolons, and named exports for package APIs. Package names use `@legend-apps/<kebab-name>`. Native module files follow the existing `Native<Name>.ts`, `RN<Name>.podspec`, and platform class naming patterns.

## UI Styling

Prefer Uniwind `className` for static layout, spacing, borders, colors, typography, and app chrome. Use `StyleSheet` or inline style objects when they are clearer or more appropriate for hot render paths, highly dynamic values, native/platform-specific behavior, measured layout, `StyleSheet.hairlineWidth`, or APIs that require stable style objects.

When converting existing `StyleSheet` values to Uniwind, favor whole-number Tailwind spacing steps and standard text sizes. Do not preserve odd pixel values by moving them to fractional classes unless there is a specific visual, native, or measured-layout reason.

## Native View Lifecycle

Custom Fabric native view components that own native subviews, controllers, delegates, cached props, or other mutable native state should implement `prepareForRecycle` and reset that state before reuse. Keep the reset local to the component that owns the native state; TurboModules and stateless native views do not need this hook.

## Native Dependency Changes

When adding, removing, or relinking native modules, remember to refresh the native dependency graph before expecting the running app binary to expose those modules. For macOS, run `bun run <app> pods macos` after native package or `app.manifest.ts` native module changes, then rebuild/rerun the app. A Metro reload alone is not enough for new TurboModules or pod changes.

## Build Scope

Do not run release builds by default while iterating. Use `bun run typecheck`, targeted `verify` commands, and debug/dev builds unless the user explicitly asks for a release build or the change specifically requires release-build validation.

## Testing Guidelines

Use the affected app/package’s test scripts from `package.json`, including `test:diff`, `test:music`, and the markdown suites. Run focused tests, `bun run typecheck`, and relevant app verification; reuse checks when their inputs have not changed. For native package work, run `bun run <app> verify <platform>` against an app that consumes the package, and prefer `test-kitchen-sink` for integration coverage.

## Runtime Verification

For requested app inspection, runtime debugging, screenshots, or UI verification, read [the runtime runbook](docs/agent-runtime.md). Follow existing authorization and keep inspection app-scoped. For source-only changes, use focused tests and typecheck.

## Commit & Pull Request Guidelines

Commit history uses concise Conventional Commit subjects, for example `feat: add window manager package` and `fix: render appkit split view`. Do not use scopes; write `type: subject`, not `type(scope): subject`. Do not add `Co-authored-by: Codex <noreply@openai.com>`.

PRs should describe the app/package touched, platforms affected (`macos`, `ios`, `android`), validation commands run, and any native project regeneration. Include screenshots or screen recordings for visible UI changes.
