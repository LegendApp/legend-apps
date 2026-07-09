# Diff Native-Owned Split View Startup Plan

## Status

Postpone this work until Diff startup quality is no longer good enough with the current React-owned split view.

The current baseline is commit `ff193e1` (`fix: reduce Diff startup sidebar shift`). That change made source-backed Diff windows create hidden, wait for usable split-view metrics, then order the window front. It also made the AppKit split-view component emit estimated first metrics earlier. This removed the visible sidebar/titlebar shift that made startup feel unstable.

## Current Problems

The remaining question is whether startup can get meaningfully faster or cleaner by moving split-view shell ownership from React to native AppKit.

Known startup stages:

1. Native window is created.
2. React root mounts.
3. React renders `SidebarSplitView`.
4. AppKit split view lays out sidebar and content panes.
5. Split metrics reach JS.
6. Diff content/list can render into a known content size.
7. First real rows paint.

The fixed shift was caused by the window being visible before the real split-view geometry was stable. The current deferred-show fix hides that unstable phase for source-backed Diff windows.

Remaining potential inefficiencies:

- The split view still cannot exist until the React root renders it.
- Content sizing for the list still depends on split-view layout/resize callbacks.
- Shell readiness and content readiness are coupled in one React root.
- Any future startup regression could reintroduce visible partial shell phases.

The important measurement target is first real diff content paint, not empty shell paint.

## Native-Owned Split View Concept

Native AppKit would permanently own the Diff window shell:

- `NSWindow`
- `NSSplitViewController`
- sidebar pane container
- content pane container
- collapse/expand state
- divider/sidebar width
- titlebar material and toolbar geometry

React would render pane contents into native-owned pane containers:

- one React root/surface for sidebar content
- one React root/surface for main diff content
- both roots receive the same `windowIdentifier`
- both roots read/write the same per-window Legend State model

Native shell ownership should be permanent. Avoid a temporary bootstrap split view that React later replaces; that approach already caused multiple split views, flashing, and ending in an invalid shell state.

## Pros

- Native can create the split shell before the window is shown.
- The titlebar/sidebar button can start in the correct position.
- Content pane size can be known before React renders the list.
- Sidebar and content can mount independently.
- The architecture matches the platform: AppKit owns window/chrome/layout; React owns content.
- It may reduce shell/layout churn and make startup visually calmer.
- It could become a reusable pattern for other native-shell windows.

## Cons

- Two React roots do not share React context.
- Providers, effects, controllers, file watchers, menu handlers, and toolbar listeners can accidentally run twice.
- Shared behavior must move into a per-window model, not parent React props or cross-root context.
- Native lifecycle becomes more complex: create roots, attach/detach pane views, update props, dispose roots, handle close/reuse.
- Cross-pane interactions become explicit state updates rather than parent-child callbacks.
- Two RN roots may add some surface setup overhead.
- First real data paint may not improve if the remaining bottleneck is diff loading, JS model work, list mount/layout, or row paint rather than split-view shell timing.

## Why It Might Not Improve Startup Much

The current fix already removes the visible sidebar shift. Native-owned split view would mostly improve the shell path unless measurements show that React-owned split-view creation is still delaying first real rows.

The first real content path still requires:

- JS runtime/root work
- source/diff load state
- diff model derivation
- content root render
- list mount
- list layout
- row paint

If those dominate after the current fix, native shell ownership is architecture polish rather than a startup optimization.

## Decision Rule

Do not productize native-owned split view unless a prototype shows at least one of these:

- first real diff row paint improves meaningfully
- stable visible shell improves with no measurable first-content regression
- the architecture removes enough ongoing complexity to justify the migration independently of startup time

If it only makes an empty shell appear earlier, do not migrate for startup.

## Narrow Prototype

Build a disposable, opt-in prototype behind a flag. Do not migrate the production Diff window first.

Candidate flag:

```ts
nativeOwnedSplitShell: true
```

Prototype responsibilities:

1. Add a native window-manager option that creates an `NSSplitViewController` as the window content shell.
2. Create two native pane containers: sidebar and content.
3. Mount a sidebar React root into the sidebar container.
4. Mount a content React root into the content container.
5. Pass the same `windowIdentifier` and minimal initial props to both roots.
6. Keep one per-window Legend State model as the source of truth.
7. Keep data loading, menu handling, toolbar wiring, file watching, and window close handling owned by exactly one coordinator.
8. Render enough real Diff UI to exercise the startup path:
   - sidebar file list
   - main diff list
   - selected file state
   - collapse state

Avoid in the prototype:

- full settings migration
- complete toolbar/search parity
- broad API cleanup
- permanent abstractions before measurement
- fallback visual-only placeholder behavior

## Instrumentation

Measure current baseline and prototype with the same marks.

Native marks:

- window open requested
- native window allocated
- native split shell allocated
- sidebar pane attached
- content pane attached
- window ordered front
- first native split layout
- first native split metrics emitted

React marks:

- coordinator/root module evaluated
- sidebar root render start
- sidebar root committed
- content root render start
- content root committed
- first received split metrics
- diff load started
- diff load first payload
- model derived
- list mounted
- first list layout
- first real row rendered
- first real data paint

Compare:

- window order-front time
- stable shell time
- sidebar visible time
- content root ready time
- list mount time
- first list layout time
- first real row paint time
- total startup CPU/load impact

## Implementation Sketch

Native:

1. Extend `WindowOptions` with an experimental native-owned split shell option.
2. In `RNWindowManager`, create a specialized split-shell content view when the option is set.
3. Create and retain two `RCTRootView` or Fabric-compatible surfaces for the pane roots.
4. Size pane roots from native split-view layout immediately.
5. Emit split metrics from native without waiting for a React-owned split-view component.
6. Dispose pane roots and split controller on window close or module mismatch.

React:

1. Split Diff into a thin window coordinator and pane components.
2. Move cross-pane state into a per-window Legend State store.
3. Ensure only the coordinator owns side effects.
4. Make sidebar/content roots subscribe to narrow state slices.
5. Keep root props small and stable: `windowIdentifier`, `source`, and role (`sidebar` or `content`).

Validation:

1. Run `bun run typecheck`.
2. Run `bun run diff verify macos`.
3. Rebuild macOS debug after native API changes.
4. Measure current baseline.
5. Measure prototype.
6. Compare first real row paint and stable shell timing.

## Risks To Watch

- Duplicate data loads from two roots.
- Duplicate window/menu/toolbar listeners.
- Context dependencies hidden inside current components.
- Root disposal leaks when a window is reopened or source changes.
- Split metrics arriving before JS subscribers exist.
- Sidebar collapse state diverging between native and JS.
- Content root mounting later despite native size being available.
- More surface setup overhead than the saved split-view timing.

## Recommended Next Step When Resumed

Start with a read-only component/state audit:

1. Identify everything in `DiffViewerWindow` that is a coordinator effect.
2. Identify everything that is sidebar-only.
3. Identify everything that is content-only.
4. Identify React context dependencies that would not cross roots.
5. Decide the minimal per-window Legend State model needed for the prototype.

Only after that audit should the native split-shell prototype be added.
