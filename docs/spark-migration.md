# Spark host migration

The default macOS app commands use the Spark SDK selected in the workspace
catalog and generate consumers under
`shell/.legend/spark/<app>`. The `bun run spark <app> ...` commands expose the same
build and analysis workflow directly. See [desktop extraction](spark-desktop-extraction.md)
for the current API mapping and validation scope.

The root and every app/package resolve Spark through the workspace catalog. Update
its archive path after packing the sibling SDK, then run `bun install`. Do not add a relative file override: Bun resolves those
incorrectly for workspace consumers. All consumers must use the same SDK.
Generated consumers use the archive selected in the root catalog, its bundled
CLI, and its template. Packing another SDK
does not change that selection. Verification uses the installed SDK as well.

App icon catalogs under `apps/<app>/macos/legendapp-shell-macos/Assets.xcassets`
or `apps/<app>/AppIcon.appiconset` are copied into Spark's generated native
project during prebuild. Their contents participate in the native build cache key.
Application-menu contributions use the app's display name because publishing
a label on the native app root replaces the host's initial title.

Local keyboard listeners are observational. Commands that consume keys use native
registrations through `useRoutedHotkeys` or `router.register`, scoped to their window
and explicitly enabled only while the UI owns the keys. Handler return values
control Spark routing only. Photos stores portable bindings and uses Spark capture;
Markdown leaves AppKit's Shift+Arrow selection unregistered and only claims Escape
while its active block can commit and blur. Native document selections keep Escape
to collapse the selection. Rebuild native hosts
after the SDK update; Metro reload alone cannot load the new keyboard contract.

After changing Spark's native SDK, run `npm run pack:local` there, then:

```sh
bun run spark code install
bun run spark code build
bun run spark code start
```

`build` makes a debug app. `analyze` checks the production JavaScript/native graph
without a native release build. `install` uses Bun's hoisted linker. The wrapper
runs Spark's source CLI; repack and reinstall after native SDK changes.

## Lifecycle ownership

All generated consumers use Spark's ordinary AppDelegate. No legacy AppDelegate
is copied, rewritten, or subclassed. App-specific native window choices are in
`sparkConfig`: hidden hosts, close/reopen policy, geometry, startup background,
glass, toolbar style, and existing frame-autosave names.

Spark owns native quit, reopen, and file/URL dispatch. Packages retain their public
APIs while integrating with that dispatcher:

- `app-exit` registers a native Spark quit handler only while JS listeners exist.
  Spark's own optional JS guard participates in the same approval decision. No
  listeners means no guard. Invalidation cancels a pending quit safely.
- `window-manager` observes Spark reopen/close events and uses an explicitly
  configured startup plugin for early restoration and sidebar root attachment.
  Its existing persisted window records remain owned by that package.
- `recent-documents` uses Spark's queued file events and routes Open Recent into
  the same pipeline. It installs no competing Apple-event handler under Spark.
- `host-links` uses React Native in the existing shell and Spark's links API in a
  Spark consumer. Diff uses it for incoming URLs; outgoing RN links are unchanged.

Only selected packages opt into startup hooks. Hello World has no native startup
plugins. Native hooks cannot replace Spark's quit/reopen/file dispatch. Generic
API documentation lives in Spark's `docs/host-migration.md`.

Mobile shell builds retain their existing native implementation. macOS apps
import the standard desktop capabilities from Spark and use its native providers.
Shared shell launch-argument normalization removes the internal Metro address
before passing arguments to app components.

## Validation scope

Run `bun run test:spark` to validate every app manifest against the sibling Spark
checkout, including native lifecycle policy and module selection.

Native lifecycle tests cover opt-in quit, multiple handlers, refusal, duplicate
and stale replies, removal, and timeout. Configuration tests cover all manifests
and reject invalid native policy. The historical acceptance results below cover the initial host migration;
current extraction validation is recorded in the desktop extraction document.

The lifecycle migration passed Spark's 291 tests, both repository typechecks,
11 adapter/launch tests, Code's 22 tests, and Diff's 168 tests. The subsequent
bootstrap/autolinking continuation passed all 292 Spark tests, 170 Diff tests,
and both repository typechecks. Code and Hello World
debug builds and runtime fingerprint checks passed. Live Code acceptance covered
cold and warm file delivery, editing, canceling Quit, saving on close and Quit,
two close/reopen cycles, and Open Recent. The final build quit without the earlier
React bridge shutdown warning. Hello World rendered, reopened, and quit without
a guard. Code restores window geometry but opens a blank document on ordinary
relaunch; restoring document contents is not part of its existing startup policy.
Code and Diff production bundle/native graph analysis also passed.

Music's debug build and manifest verification passed. Its main player and media
library loaded; Close hid the main window, reopening restored it in the same
process, and Quit exited normally. Playback/background continuity still needs
verification. A list-height warning appeared while its library initialized.

Diff's `LegendLibGit2` podspec belongs to `packages/diff-parser`, alongside a
macOS config plugin that registers its pinned native dependency. The Spark
workspace enables that plugin only when the manifest selects `diff-parser`;
the old shell references the same podspec. Spark does not need the old shell's
post-install header cleanup. Diff's arm64 Spark debug build, production bundle/native
graph analysis, manifest verification,
adapter tests, and repository typecheck passed; its libgit2 archive includes both
arm64 and x86_64 slices. Diff's live acceptance now covers cold and warm URL delivery, native toolbar
controls, closing main/secondary windows, reopening to Welcome, and normal Quit.
The toolbar-family crash and `Window not found` / startup-chrome errors no longer
reproduce on React reload. Native window state now lives in an application-lifetime
registry, matching React Native’s retained Fabric surfaces. Replacement modules
rebind native delegates and chrome callbacks; invalidation retires only runtime
observers and event delivery. This avoids destroying surfaces while React Native
is restarting them. Three consecutive multiwindow reloads retained the same process
and produced no lifecycle errors. Toolbar mode changes, search expansion, and
window close/reopen also passed. A native regression test verifies that runtime
replacement retains surfaces and closing releases them. Existing React Native
deep-import and Legend List sizing warnings remain separate follow-up work.
Generated entrypoints use Expo's standard `registerRootComponent` bootstrap,
including its URL implementation. Diff uses Spark's queued `onOpen` API so opens
received before React subscribes are delivered. The legacy host-links adapter
subscribes before reading the initial URL.

Markdown's Spark arm64 debug build and manifest verification passed. Live checks
covered launch, opening a Markdown file through macOS, native heading/list/code
rendering with TypeScript highlighting, close/reopen, and normal Quit. Its consumer
retains the repository's enriched-markdown feature configuration. Spark applies a
version-checked Expo autolinking fix for symlinked podspec files in Bun `file:`
dependencies; regression tests cover file links, broken links, directory links,
idempotence, and preserving package-cache hardlinks.

The window manager obtains the host window from the application delegate rather
than AppKit's unordered window list. Each independently controlled toolbar has a
unique native identifier, with its logical window target stored separately.
`finishWindowRestoration()` closes unclaimed startup placeholders after the app
finishes adopting its restored windows, without deleting persisted records.
Diff invokes it after initial opening/restoration. Per-window Diff observables
are discarded with their provider; unmount only releases native resources and
cancels pending work, avoiding toolbar updates during teardown.

Intel, mobile, release packaging and before/after performance measurements are
separate validation work.

Code's downloaded grammars require matching development signing. Configure
`macOSDevelopmentIdentity` in its generated `.spark/settings.json`, then rebuild.
Generated dependency and native build trees are ignored, disposable local artifacts.
This validation left approximately 7.3 GiB of SDK archives and 17 GiB of native
DerivedData across Code, Hello World, Music, Diff, and Markdown. Keep or remove those deliberately;
they are not source changes.

## Acceptance before changing default commands

Use a temporary document and the generated Spark binary, with one automation
owner at a time. Recheck the runtime fingerprint after native changes.

- Code: open a file through macOS, edit it, cancel native Quit, then save on
  window close. Reopen twice after closing all document windows, exercise Open
  Recent, and quit/relaunch with a document open to check restoration.
- Hello World: close/reopen and quit without registering any guard.
- Diff: deliver its URL scheme while running and at launch, close the main
  window, and reopen without revealing an empty host.
- Music: close hides the window, reopen restores it, and playback/background
  behavior matches the existing shell.

The shared source tree must be Metro's server root. Spark maps its fixed host
entry URLs into that root, so lazy imports from shared packages remain reachable.
Do not disable lazy imports or copy shared app sources into generated consumers.

Runtime acceptance caught two integration failures that the static graph checks
could not detect: workspace lazy imports escaped Metro's server root, and the
window manager removed its native lifecycle observers during JS subscription
churn. Spark now preserves a configured workspace server root, and the window
manager keeps native observers until module destruction. The standard host also
uses the configured app name in its application and Help menus.
Diff additionally exposed the desktop backend's broken handling of URL scheme
arrays. Spark now materializes its native URL associations before backend mods.
The analyzer passes an absolute entry path so production exports also resolve
correctly when Metro uses the containing workspace as its server root.

## Identity audit — October 3, 2026

Restored icon catalogs for Slides, Code, Diff, Markdown, and Chat History.
Photos keeps its existing icon through the same prebuild plugin. Code, Diff,
Markdown, and Slides publish their app display names on the native menu root.
Generated hosts, the launcher CLI, templates, and configuration verification
use the workspace-selected Spark SDK.

The audit compared legacy host setup with migrated window/lifecycle policies,
document and URL registrations, permission strings, update feeds, and release
helper packaging. No additional confirmed omission was found in those settings.

Validation: 30 Spark/launch tests, all declared app/platform configuration graphs,
TypeScript, all 92 Slides test files, 22 Code viewer tests, 9 Diff CLI/restoration
tests, and 92 Markdown app tests passed. Apple's asset compiler produced valid
icons and bundle metadata for all six app catalogs.

Slides was rebuilt as an arm64 macOS development app. Its bundle contains
`AppIcon.icns`, `Assets.car`, and both icon plist keys. The running app loaded
`showcase.mdx`, and its accessibility menu tree showed `Legend Slides`. Other
apps were checked through source, configuration, tests, and icon compilation;
their existing native binaries still need rebuilding to acquire these changes.
This pass does not cover signed releases, Intel builds, or mobile UI acceptance.
