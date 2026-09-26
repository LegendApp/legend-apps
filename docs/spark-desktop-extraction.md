# Standard desktop extraction

The strongest candidates now live behind public `@legendapp/spark` APIs. The
mapping is `scripts/lib/sparkDesktopCapabilities.json`. All app source imports
and macOS native manifests use Spark for these capabilities. A regression check
rejects new app imports or macOS links to the retired package names.

## Ownership

Spark owns managed windows/chrome/navigation, native split views/sidebar,
document/recent-file lifecycle, routed shortcuts, native UI primitives,
file scanning/watching, observable preferences and settings windows.

Existing Spark providers now also serve menus, dialogs, context menus, command
execution, global hotkeys, secure storage and updates. Managed and standard
windows share their native registry. Both macOS select APIs share one control.
Document and settings UI helpers remain optional; importing basic lifecycle
functionality does not require them. Quit and close guards remain opt-in.

App-specific Kitchen Sink navigation menus remain in the test app. Music's
existing Keychain service is explicitly declared, preserving credential access.
Music imports the AI package's pure output parser without loading its process
execution API. The native document/media scanners depend on Spark's file-system
pod on macOS and retain separate iOS podspecs for the existing mobile backend.

The old local packages remain for mobile/legacy scaffolding, but are excluded
from the macOS native graph and unused by app desktop imports. Editor, rendering,
media, authentication and other second-tier libraries remain in legend-apps.

## Commands

- `bun run <app> run macos` installs the generated consumer, builds Spark in
  debug mode, and starts its development session.
- `bun run <app> start` runs Spark's dev server without automatically opening.
- `bun run <app> build macos --dev` builds the Spark debug app.
- `bun run <app> open macos` opens its recorded Spark debug product.
- macOS `pods` and `prebuild` refresh dependencies through Spark's debug build;
  Spark owns native project generation and CocoaPods installation together.
- Release builds and packaging consume Spark release products. Architecture
  selection, Slides compiler packaging, existing archive naming, signing,
  notarization and appcast generation remain in the app scripts. Update feeds
  and keys are translated to Spark's release configuration.

Pack the sibling SDK with `npm run pack:local` in legend-framework when changing
Spark. The root consumer uses the immutable local archive named in package.json;
regenerate its lockfile when changing archives if Bun retains a stale file
archive override. Generated app consumers use the SDK package manifest.

## Validation — September 26, 2026

- Spark typecheck and 312 tests in 62 files passed; the later CLI launch-argument
  addition also passed its five-test suite, including the migrated
  hotkey parsing/persistence/routing and keyboard window-scope suites.
- Native window-registry lifetime and optional sidebar linking/ThinLTO tests passed.
- Apps typecheck, 14 Spark adapter/launch tests, all declared app/platform graph
  checks, and seven release helper tests passed.
- Diff: 170 tests; Code: 22; Music: 104; Markdown: 96 passed.
- Slides: all 88 test files passed.
- Diff and Music Spark arm64 debug builds passed with the packed SDK.
- Diff production dependency analysis completed and selected Spark providers.
- Diff startup, restored fixture rendering, toolbar mode/sidebar actions,
  repeated JS reloads in the same native process, and restored-window close passed.
- Music startup, settings navigation, scroll-driven section selection, JS reload,
  and settings close passed. The standard Spark window registry included its
  managed library/settings windows.
- Shared process execution returned the expected output and exit status.
- Secure random generation and a temporary Keychain set/get/remove roundtrip
  passed. No existing credential values were inspected.
- Spark native file scanning found four fixture files with no errors.

No performance, release-distribution, Intel-native, Windows or mobile-runtime
parity claim is made from these checks. Release routing is source/configuration
validated; no release build, signing, notarization or publication was performed.
Remaining development warnings observed: the existing source-viewer React Native
deep import and Music's initial zero-height track-list measurement. They are not
suppressed by this migration.

Local archives currently occupy about 9.5 GiB; Diff and Music's generated debug
DerivedData occupy about 7.3 GiB together. These are disposable after validation,
but were retained rather than deleted.


## All-app validation follow-up — September 26, 2026

- Workspace typecheck, the 14 Spark adapter/launch tests, and `verify:all` passed.
- Production JavaScript/native dependency analysis passed for all eight apps:
  Music, Markdown, Code, Diff, Chat History, Hello World, Slides, and Kitchen Sink.
- macOS arm64 debug build checks passed for Music, Markdown, Code, Diff,
  Chat History, Hello World, and Slides. Music, Markdown, and Diff reused products
  whose native fingerprints were current; the other four compiled successfully.
- App tests passed: Code 22, Diff 170, Music 104, Markdown 96, Chat History 28,
  and all 88 Slides test files. Hello World and Kitchen Sink have no standalone
  app unit suite; their bundle/native checks are separate from interactive coverage.
- Chat History's test mock now supplies macOS Platform and expects the current
  system window background. No application behavior was changed for that failure.
- Slides explicitly declares Legend List for Spark's settings window. Its actual
  generated native selection and CocoaPods lockfile both include Spark UI.
- The source audit found no old standard desktop API imports in app source or
  the non-extracted shared packages. Mobile declarations still use the mobile host.

Kitchen Sink's native build remains pending: completing the other builds left
about 53 GB available, insufficient headroom for another fresh build while
preserving the required 50 GB reserve. Cleanup of verified build intermediates
was requested but has not been authorized. Runnable products remain retained.
These checks do not establish interactive runtime or performance parity for all
apps, nor Intel, release-distribution, Windows, or mobile runtime validation.
