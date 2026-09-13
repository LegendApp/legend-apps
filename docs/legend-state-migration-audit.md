# Legend State migration audit and implementation

Audited and implemented September 13, 2026 across all eight apps and the shared packages identified in the audit. The active-code migrations were completed in priority order, with separate commits for each app/package. The workspace uses `@legendapp/state` 3.0.0-beta.47 through its existing catalog.

The implementation follows the supplied [Legend State skill](/Users/jay/Documents/code/legendapp/legend-skills/legend-state-best-practices/SKILL.md): one observable owner, imperative `.peek()` reads in commands, narrow rendered subscriptions, atomic related updates, and deliberate handling of callable data and native resources.

There are now **no authored `useSyncExternalStore` calls in app/package TypeScript**. LegendList data sources retain their mutation subscriptions and native projection contracts.

## Completed migrations

| Priority | App/package | Result | Commit |
| --- | --- | --- | --- |
| 1 | Slides | Replaced the shared snapshot/listener store with `slidesState$`; split presenter status, notes, toolbar, and preview subscriptions. Preserved slide/step epochs and stored compiled component functions in an opaque envelope. | `248bda3` |
| 2 | Markdown document | Active editor, draft text, block selection, and activation mode now have observable ownership. Removed React/ref mirrors; moved active editor text reads into the native overlay boundary. | `53d36ca` |
| 3 | Chat History | Added a window session for catalog, selection, and transcript lifecycle. Each sidebar row observes its selected boolean. Preserved catalog/open generation guards, cancellation, and native document release. | `aa999ef` |
| 4 | Diff | Extended the viewer model for search, compare, and sidebar state. Native row configuration observes search highlights; the prompt and sidebar own their reads. Removed duplicate merge-resolution refs and replaced the React data-source bridge with an observable revision signal. | `0d7ad12` |
| 5–6 | Music | Playback ticks update the fill leaf; submenu state is derived directly. Scan counters, toolbar search/save, and playlist draft inputs have separate subscription boundaries. Save reads the queue when invoked. | `a7a8e21` |
| 7 | Hotkeys | Replaced the global capture listener store with an observable ID and per-control boolean selectors. Preserved cancellation ordering and native keyboard routing. | `be2e842` |
| 8 | Slides | Migrated presenter-local controls/layout and the native elapsed timer. Added an observable effect clock; isolated shader uniforms and FrameBudget cursors/playheads/frame cells. Consolidated preferences through shared observable persistence. | `0ea5341` |
| 9 | Virtualized document | Each document snapshot owns observable style/timing metadata. Removed the rows React/ref mirror. Kept stable index arrays and dataset invalidation, with disposed-session request guards. Updated the Code consumer to the explicit `styles$`/`timing$` API. | `69a8891`, `61090d2` |
| 9 | Code | Added observable document-session ownership, native-title reactions, and separate watcher/content/timing/row consumers. Native documents use opaque envelopes; late loads cannot replace newer sessions. | `eb0d9f8` |

The second virtualized-document commit fixes a compiler incompatibility found during final validation. Session versions are allocation identifiers; skipped version numbers are harmless. Disposal bookkeeping stays outside rendered state.

## Coverage and retained boundaries

- **Hello World:** static UI; no state migration needed.
- **Test Kitchen Sink:** isolated demonstration controls/results remain local React state, as recommended by the audit.
- Native document handles, cancellation tokens, timers, event history, and list mutation protocols remain imperative where they are not rendered state.
- Small local inputs, hover/drag controls, measured geometry, and lazy native-object allocations remain where moving storage would not narrow updates.
- Slides' other fully animated deck figures retain the scalar `useEffectTime` API, now backed by the observable clock. They still render when their animated output changes. FrameBudget demonstrates passing the clock to smaller visual consumers.
- The unused `deckEditorSession` helper and public `presentation.useStep` API remain the audit's conditional follow-ups. No active app/deck consumers were found; they were not proposed as necessary current migrations.

## Validation

**808 tests passed** across the affected suites (278 Diff/Slides/presentation tests rerun after the compiler fixes; the unaffected suites retain their earlier results):

| Suite | Tests |
| --- | ---: |
| Slides and presentation | 112 |
| Markdown document | 329 |
| Markdown app/toolbar | 70 |
| Chat History | 28 |
| Diff, including shared hotkey capture | 166 |
| Music | 98 |
| Code and shared document rows | 5 |

Focused regressions cover selected-row isolation, playback-fill isolation, capture switching/cancellation, search ownership, document replacement, stale request rejection, stable list reuse, current-queue saves, and legacy preference normalization/persistence. FrameBudget's deterministic clock test verifies that ticks leave the figure and row owners idle, and that frame cells update only when the active frame changes. Existing editor suites cover selection, IME, native overlay state, and structural edits.

Typecheck passed. macOS app verification passed for Slides, Markdown, Chat History, Diff, Music, and Code. No native dependencies were added, so native projects were not regenerated.

Strict React Compiler verification now passes for **all 453 app/package TypeScript source files**, with compiled React output in 179 files. The original three failing files and three additional failures found by the repository-wide check have been fixed:

| App/package | Fix | Commit |
| --- | --- | --- |
| Diff | Merge rows subscribe directly to opaque per-file render models. Document allocators and native data sources have explicit document-owned state, preserving identity across edits and collapse changes without render-time ref reads or incomplete memo dependencies. | `588adf1` |
| Slides | Resize responders retain native handlers and receive committed callbacks; speaker-note error formatting avoids a compiler capture bug. Step animations retain their interpolation origin across unrelated renders. GPU setup/frame callbacks have a separate imperative lifecycle, avoiding unsupported compiler try/catch syntax without changing cleanup behavior. | `5cbb736` |
| Presentation | Focus surfaces expose native root/layout setters, and the root callback remains stable across motion updates. | `e1010b9` |

New regressions cover compiled merge-row isolation and removal, initial collapsed projections and document disposal, resize direction/callback changes, forward/reverse step animation, and GPU setup failure, render failure, and late resource cleanup. Focus tests also check root identity, layout publication, and unmount cleanup. Typecheck and Diff/Slides macOS app verification were rerun successfully.

Bun's filesystem access stalled in the original Documents checkout. Tests and app verification therefore ran against a synchronized source/dependency copy at `/tmp/legend-state-validation-20260913`; typecheck and targeted compiler checks ran against the original checkout, and full repository compiler verification ran against the synchronized copy. Chat History uses its Jest configuration; a mistaken direct Bun-test invocation could not load React Native's Flow source and was replaced by the successful Jest run.

This was source-level validation with deterministic render tests. No native UI profiling, device flows, release builds, or measured device speedups are claimed.

Pre-existing Chat History layout/configuration changes, `scripts/lib/macosWorkspaces.ts`, and `artifacts/` were preserved and excluded from the migration commits.
