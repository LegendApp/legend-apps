# Spark host migration

The shared adapter is `scripts/lib/sparkWorkspaces.ts`; app identity and native
module ownership remain in `apps/*/app.manifest.ts`. Generated macOS consumers
live in `shell/.legend/spark/<app>`. The local SDK defaults to the sibling
`../legend-framework` checkout, overridable with `LEGEND_SPARK_ROOT`.

## Development workflow

Pack Spark after changing its source:

```sh
cd ../legend-framework
npm run build:cli
npm run pack:local
```

From this repository:

```sh
bun run spark hello-world install
bun run spark hello-world build
bun run spark hello-world analyze
bun run spark hello-world start
```

`build` is a debug build. `analyze` bundles production JavaScript and checks the
native selection without producing a release binary. `start` uses the existing
app-specific Metro port. Install after repacking Spark or changing dependencies.
Generated native projects, node_modules, build outputs and lockfiles are disposable
local artifacts, not source to commit. Installing uses Bun's hoisted linker because
its isolated linker fails when multiple local workspace edges resolve Legend List.

## Compatibility boundary

Spark owns native generation, CocoaPods, React bootstrap, Metro compatibility,
and build selection. A native subclass temporarily preserves the existing shell's
window presentation, restoration, sidebar startup, close/reopen handling, and
quit guards. Its bundle URL methods are omitted so Spark supplies the correct
entry URL. Its source hash participates in configuration to invalidate native
builds when the compatibility implementation changes.

This is an incremental adoption seam. It does not yet replace those legacy
behaviors with portable Spark APIs. App-owned lifecycle overrides continue to use
the existing packages rather than Spark's corresponding JS event/guard contracts.
File-open behavior, native restoration, overlays, and release/update identity need
runtime acceptance before the larger applications switch their default commands.

All manifests can use this opt-in entry point. Native runtime acceptance starts
with Hello World and Code before switching the default commands for larger apps.
The wrapper runs the sibling checkout’s CLI; native SDK changes require repacking
and reinstalling the generated consumer.
The existing `bun run <app> ...` paths, mobile workflows, and release scripts remain
unchanged while acceptance is in progress.

## Environment

React 19.1.4, React Native 0.81.6, React Native macOS 0.81.7, Node 24.19.0,
and Bun 1.3.14. Spark selects its pinned Expo Desktop SDK; the generated consumers
are isolated from the existing shell's installed dependency graph. Metro forces
React, React Native, Nitro, and Uniwind imports through the consumer to avoid duplicate
renderers when source files reside in the parent workspace.

## Validation checkpoint

- Hello World: debug native build and production bundle analysis passed; the native
  window renders “Hello, world!” through Spark with the existing shared styles.
- Code: dependency install, production bundle/native selection analysis, and
  debug native build passed. File Open displays a real TypeScript source file
  with native syntax highlighting using the matching development signing team.
  CocoaPods now resolves React Native macOS independently and uses a relative
  package path, supporting Bun’s physical dependency layout.
- Identity: Spark restores canonical configured plist values after Expo Desktop
  template renaming and preserves the original generated app.json transport.
- Eleven manifest/host/launch-argument tests and the apps TypeScript check pass.
  Spark’s 280 tests pass, including metadata, development signing, and concurrent
  source CLI rebuild regressions.
- Code and Hello World ran concurrently in compatible Spark development sessions.
- Default app commands have not switched to Spark; migration is incomplete.
  Other apps, Intel runtime testing, release packaging, and before/after performance
  measurements remain outside this validation checkpoint.

Ignored generated consumers currently occupy approximately 4.9 GB for Hello World
and 6.0 GB for Code (including dependencies and native build artifacts).

## Local development signing

Code’s downloadable grammars require the app and grammar libraries to be signed
by the same team. Spark now supports an opt-in `macOSDevelopmentIdentity` in the
generated consumer’s `.spark/settings.json`. Set it to the matching installed
certificate name or fingerprint, then run `bun run spark code build`. The setting
is local and is preserved by both preparation and Spark’s development session.
Unsigned apps retain Spark’s default ad-hoc signing. Release signing is separate.

The shared shell strips the internal `-RCT_jsLocation` option and its value before
passing launch arguments to apps, so Code cannot mistake the Metro address for a
file. Other arguments and secondary-window document paths are retained.
