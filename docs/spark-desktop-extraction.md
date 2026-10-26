# Standard desktop extraction

The strongest candidates now live behind public `@legendapp/spark` APIs. The
mapping is `scripts/lib/sparkDesktopCapabilities.json`. All app source imports
and macOS native manifests use Spark for these capabilities. A regression check
rejects new app imports or macOS links to the retired package names.

## Ownership

Spark owns managed windows/chrome/navigation, native split views/sidebar,
document/recent-file lifecycle, routed shortcuts, native UI primitives,
file scanning/watching and settings windows. Legend Apps keeps its synchronous
observable persistence in `@legend-apps/storage`.

Existing Spark providers now also serve menus, dialogs, context menus, command
execution, global hotkeys, secure storage and updates. Managed and standard
windows share their native registry. Both macOS select APIs share one control.
Document and settings UI helpers remain optional; importing basic lifecycle
functionality does not require them. Quit and close guards remain opt-in.

App-specific Kitchen Sink navigation menus remain in the test app. Music credentials use Spark's project-scoped secure storage.
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

Pack the sibling SDK with `npm run pack:local` in legend-spark when changing
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

Local SDK archives remain retained. After the all-app validation below, the user
approved removing verified macOS arm64 DerivedData directories. The runnable
products, dependencies, native projects, and validation logs remain retained.


## All-app validation follow-up — September 26, 2026

- Workspace typecheck, the 14 Spark adapter/launch tests, and `verify:all` passed.
- Production JavaScript/native dependency analysis passed for all eight apps:
  Music, Markdown, Code, Diff, Chat History, Hello World, Slides, and Kitchen Sink.
- macOS arm64 debug build checks passed for all eight apps. Music, Markdown,
  and Diff reused products whose native fingerprints were current; Code,
  Chat History, Hello World, Slides, and Kitchen Sink compiled successfully.
- App tests passed: Code 22, Diff 170, Music 104, Markdown 96, Chat History 28,
  and all 92 Slides test files in the final rerun. Hello World and Kitchen Sink have no standalone
  app unit suite; their bundle/native checks are separate from interactive coverage.
- Chat History's test mock now supplies macOS Platform and expects the current
  system window background. No application behavior was changed for that failure.
- Slides explicitly declares Legend List for Spark's settings window. Its actual
  generated native selection and CocoaPods lockfile both include Spark UI.
- The source audit found no old standard desktop API imports in app source or
  the non-extracted shared packages. Mobile declarations still use the mobile host.

Kitchen Sink initially failed to link a Markdown keyboard-handoff implementation
added by concurrent work after dependency installation. Rerunning the normal
Spark build refreshed the local package and CocoaPods graph; the build then
passed without source changes or a workaround. The user-approved cleanup removed
the eight verified `.spark/DerivedData/macos-arm64` directories and preserved all
runnable products. Native changes will regenerate those intermediates.

These checks do not establish interactive runtime or performance parity for all
apps, nor Intel, release-distribution, Windows, or mobile runtime validation.

## Interactive follow-up — September 26, 2026

The runtime pass found and fixed two development-startup issues:

- Generated Metro configuration now excludes other Spark consumers and retired
  shell workspaces. Their dependency installs previously raced Metro's crawl,
  producing missing-directory warnings and unnecessary scanning. Regression
  coverage preserves the active consumer's dependencies and shared app source.
- Spark signals readiness immediately after Metro starts, before Expo's online
  dependency validation. Previously a working server could be killed by the
  supervisor's startup timeout while that validation waited on the network.
  The test executes the patched Expo startup and verifies readiness ordering,
  including no ready signal when the server itself fails.

Both repositories passed typecheck; the Apps Spark tests passed 15 cases and
Spark's Expo integration suite passed 5 cases. The Spark CLI fix is used by the
checkout-based app launcher and will be included in the next SDK package build.

Observed runtime evidence:

| App | Checks |
| --- | --- |
| Hello World | Visible greeting and native quit. |
| Code | Fixture document rendering and editing; unsaved quit prompt, Cancel, repeated quit, and Don't Save termination. |
| Diff | Restored fixture patch, native unified/side-by-side toolbar switching, and native quit. |
| Chat History | Native split view and conversation rendering, close/reopen, and termination through Spark's native quit API. Automated menu/keyboard termination was inconclusive. |
| Music | Library and Settings windows, settings navigation, JavaScript reload preserving native windows in the same process, and native quit. |
| Markdown | Reused the completed concurrent release-readiness task's live Spark checks for headings, lists, code, editing transitions, and saving; 370 document tests and 96 app tests passed there. |
| Kitchen Sink | Rebuilt after the concurrent Markdown native changes; rendered integration screens, mock command result, test-window close, native child-window open/close, and native quit. |
| Slides | Presenter and native toolbar render; basic Spark subprocess execution passes. Deck compilation remains blocked by Documents-folder authorization for the new debug binary. |

Slides' compiler succeeds from the terminal but stalls opening its script from
the app. macOS TCC logs report that the existing Documents authorization's code
requirement does not match this debug binary. Resetting and approving that
app-specific permission is pending user approval; no privacy bypass was added.

Expo's online dependency checker separately failed with `Body has already been
read` / `fetch failed`. The final Music, Slides, and Kitchen runtime checks use
Expo's supported `--offline` option. This is an outstanding online-development
limitation, not a claim that the online startup path now passes. Existing React
Native deep-import and Legend List measurement warnings remain visible.

Intel hardware/runtime, signed release distribution, and measured performance
parity remain unverified. The runtime pass is not a blanket release-readiness
claim for every app or for concurrent app-specific changes.

The follow-up Kitchen rebuild regenerated about 3.55 GiB of disposable
`.spark/DerivedData/macos-arm64` intermediates. They remain retained alongside
the runnable product; the earlier approved cleanup had removed the previous
build intermediates.

## API redesign migration — September 30, 2026

All app consumers use Spark's consolidated public paths. Window options group
geometry and macOS chrome; menus and context menus use typed item trees and
action results; dialogs return explicit cancellation results. Process execution
uses `runCommand` with a target and byte output. Slides downloads its pinned
compiler helper on first use and caches it in Application Support; it is no
longer embedded in the app.

Async native resources retain an owner during setup and teardown. Components
release listeners, watchers, and shortcuts on unmount, including registrations
that finish after unmount. Diff menu commands and state follow the focused
viewer. Changing Music and Photos library paths retires removed watches.

AI invocation and Codex execution now come from Spark's `/ai` and `/ai/codex`
exports. App-specific prompts and playlists remain in Music. Spark's secure
storage owns credentials; the app's `crypto` package supplies PKCE randomness.

This migration is checked with application TypeScript, app tests, registration
lifetime tests, and every declared app/platform configuration graph. Generated
consumers point at the current immutable SDK archive. Earlier native/runtime
acceptance above predates the API redesign; native builds and interactive
acceptance must be repeated with this SDK.
