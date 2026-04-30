# Build Sequence

## Purpose

Use this as the execution checklist for the first full build. Each phase should leave the app/build working and should end with validation and a milestone commit.

Do not let failures accumulate across phases. If validation fails, fix it before committing unless the failure is proven unrelated and pre-existing.

## Phase 1: Menu And Open Plumbing

- [x] Inspect the existing native-menu package and kitchen-sink example.
- [x] Inspect file-dialog usage and supported file type filters.
- [x] Verify how `apps/markdown` can register File -> Open, Save, Undo, Redo, Bold, Italic, and Link menu commands.
- [x] Check whether `process.argv` exposes markdown launch file paths in the app runtime.
- [x] Implement startup open behavior:
  - [x] open first `.md`-family launch argument when present
  - [x] open file dialog immediately when no launch file is present
  - [x] keep app process open with no document window if startup dialog is canceled, best effort
  - [x] on startup load failure, show error and reopen file dialog
- [x] Implement File -> Open command.
- [x] Implement basic command enabled/disabled state if supported by the menu API.
- [x] Keep fallback behavior limited to dialog fallback for missing argv; do not ship header buttons because menu wiring should be fixed if broken.
- [x] Validate `bun run typecheck`.
- [x] Validate `bun run markdown run macos` reaches the expected open-file flow.
- [x] Commit with a `type: subject` message.

## Phase 2: Parser Snapshot Upgrade

- [ ] Extend `@legend-desktop/markdown-parser` TypeScript spec with richer document/block snapshots.
- [ ] Add native document session ID.
- [ ] Add opaque native block IDs.
- [ ] Add source UTF-8 byte ranges.
- [ ] Add content UTF-8 byte ranges when available.
- [ ] Add text revision metadata.
- [ ] Preserve existing `getRenderBlocks(start, count)` compatibility or update all current callsites.
- [ ] Update C++ implementation.
- [ ] Run Nitro/codegen workflow and include generated files.
- [ ] Keep the test-kitchen-sink markdown-parser example working.
- [ ] Validate `bun run typecheck`.
- [ ] Validate kitchen-sink markdown parser still loads/renders a file if practical.
- [ ] Commit with a `type: subject` message.

## Phase 3: MarkdownDocument Package

- [ ] Create `packages/markdown-document`.
- [ ] Add `package.json` following workspace conventions.
- [ ] Add `src/index.ts`.
- [ ] Add public types.
- [ ] Add native adapter wrapping `@legend-desktop/markdown-parser`.
- [ ] Add `MarkdownDocument.tsx`.
- [ ] Add default native-document-app styling.
- [ ] Export `defaultMarkdownStyle`.
- [ ] Expose style/content/markdown style props without hardcoding chrome.
- [ ] Expose command/state API shape needed by app menus and future custom toolbars.
- [ ] Add short README with basic usage and API notes.
- [ ] Ensure package has no `@legendapp/state` dependency.
- [ ] Validate `bun run typecheck`.
- [ ] Commit with a `type: subject` message.

## Phase 4: Read-Only Markdown App Shell

- [ ] Add `@legend-desktop/markdown-document` to `apps/markdown`.
- [ ] Replace placeholder app UI with `MarkdownDocument`.
- [ ] Wire selected/open filename into the component.
- [ ] Keep app shell chrome outside `MarkdownDocument`.
- [ ] Add subtle status surface for filename, loading, saving, dirty, and errors.
- [ ] Persist app metadata with `@legendapp/state`.
- [ ] Persist recent files in a JSON-backed store.
- [ ] Keep at most 20 recent files.
- [ ] Remove missing recent files after showing an error.
- [ ] Expose recent files in native menu if dynamic menu support is straightforward.
- [ ] Do not build an empty-state recent-files list.
- [ ] Validate `bun run typecheck`.
- [ ] Validate `bun run markdown run macos` opens and renders a markdown file.
- [ ] Commit with a `type: subject` message.

## Phase 5: Hydration And Performance

- [ ] Request 64 initial blocks for first paint.
- [ ] Render list rows keyed by opaque block ID.
- [ ] Keep `MarkdownDocument` as owner of `blockIds` and `blocksById`.
- [ ] Hydrate all remaining blocks after first paint / `LegendList` loaded signal.
- [ ] Hydrate in chunks of 512.
- [ ] Cancel hydration on document replacement/unmount.
- [ ] Keep DEV-only timing/block/hydration diagnostics available.
- [ ] Do not show benchmark-style diagnostics in normal app UI.
- [ ] Validate `bun run typecheck`.
- [ ] Validate 10k-20k block markdown file renders and scrolls without hydration gaps.
- [ ] Commit with a `type: subject` message.

## Phase 6: Native Editing Transactions

- [ ] Extend parser/native document with current source storage as a simple native string/buffer.
- [ ] Add `applyTransaction` to the native spec.
- [ ] Implement `updateBlockMarkdown`.
- [ ] Preserve block ID for block-local edits.
- [ ] Return range patches:
  - [ ] revision
  - [ ] source length
  - [ ] start block index
  - [ ] delete count
  - [ ] inserted block IDs
  - [ ] changed block snapshots
  - [ ] retired block IDs
- [ ] Add dirty-region parse fallback when a block markdown update changes structure unexpectedly.
- [ ] Keep full-document reparse out of the normal edit path.
- [ ] Add native save method.
- [ ] Save UTF-8.
- [ ] Preserve dominant line endings when practical.
- [ ] Save with atomic replace.
- [ ] Run Nitro/codegen workflow and include generated files.
- [ ] Keep kitchen-sink markdown-parser example working.
- [ ] Validate `bun run typecheck`.
- [ ] Validate app still opens/renders after parser changes.
- [ ] Commit with a `type: subject` message.

## Phase 7: Active Block Editing

- [ ] Click/tap rendered block to activate editor.
- [ ] Use `EnrichedMarkdownTextInput` for active block editing.
- [ ] Use current enriched APIs first:
  - [ ] `onChangeMarkdown`
  - [ ] `onChangeSelection`
  - [ ] `onChangeState`
  - [ ] focus/blur
  - [ ] inline formatting commands
  - [ ] link commands
  - [ ] `getMarkdown`
  - [ ] caret rect APIs
- [ ] Best effort: place cursor near click position; fall back to end.
- [ ] Commit active block edits with 300ms debounce.
- [ ] Mark dirty immediately on editor change.
- [ ] Flush pending edit on block switch.
- [ ] Flush pending edit on blur.
- [ ] Flush pending edit on Escape.
- [ ] Flush pending edit on Save.
- [ ] Blur returns block to rendered mode.
- [ ] Escape commits and blurs.
- [ ] Keep empty active block as empty paragraph.
- [ ] Implement Enter split:
  - [ ] left/original block keeps original ID
  - [ ] new/right block gets new ID
  - [ ] focus moves to new/right block
  - [ ] use newline-detection workaround if Enter interception is unavailable
  - [ ] list continuation is best effort
- [ ] Leave Backspace-at-start on enriched input default first.
- [ ] Leave paste on enriched input default first.
- [ ] Validate `bun run typecheck`.
- [ ] Validate editing a paragraph updates rendered markdown after blur.
- [ ] Validate Enter splits a block.
- [ ] Validate Save flushes pending edit.
- [ ] Commit with a `type: subject` message.

## Phase 8: Save, Autosave, Undo, And Commands

- [ ] Add `savePolicy` prop.
- [ ] Autosave default enabled.
- [ ] Autosave debounce is configurable and no more than 2000ms by default.
- [ ] Save/autosave failures keep document dirty.
- [ ] Autosave failure pauses retries until next edit or explicit Save.
- [ ] Manual Save flushes pending editor state before writing.
- [ ] Track saved document revision.
- [ ] Dirty becomes false when current revision equals saved revision.
- [ ] Preserve undo history across saves.
- [ ] Implement JS undo/redo stack.
- [ ] Group continuous typing in the same block.
- [ ] Split typing groups after 1000ms pause.
- [ ] Split groups on blur, selection jump, formatting command, or structural command.
- [ ] Implement Undo command.
- [ ] Implement Redo command.
- [ ] Wire Cmd+O, Cmd+S, Cmd+Z, Shift+Cmd+Z, Cmd+B, Cmd+I, Cmd+K.
- [ ] Disable Save when clean or no document is open.
- [ ] Disable Undo/Redo when unavailable.
- [ ] Route formatting commands to active enriched editor when available.
- [ ] Prompt Save / Discard / Cancel when opening another file while dirty.
- [ ] If prompt-save fails, show error and stay on current document.
- [ ] Prompt Save / Discard / Cancel when closing a dirty document window.
- [ ] If close-save fails, show error and keep window open.
- [ ] Validate `bun run typecheck`.
- [ ] Validate manual save, autosave, undo, redo, and dirty-state transitions.
- [ ] Commit with a `type: subject` message.

## Phase 9: Final Cleanup And Documentation

- [ ] Review public exports and remove accidental internals.
- [ ] Review app shell to confirm chrome stays outside `MarkdownDocument`.
- [ ] Confirm markdown/document styles are externally configurable.
- [ ] Confirm no fixed toolbar/button layout is baked into `MarkdownDocument`.
- [ ] Confirm `@legend-desktop/markdown-document` has no `@legendapp/state` dependency.
- [ ] Confirm DEV-only diagnostics are not visible in normal UI.
- [ ] Update README/API notes if implementation differs from plan.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run markdown run macos`.
- [ ] Validate open, render, edit, split, save, autosave, undo, redo on a real markdown file.
- [ ] Validate a 10k-20k block markdown file renders and scrolls acceptably.
- [ ] Commit with a `type: subject` message.

## Deferred

- [ ] Save As.
- [ ] Multi-window document behavior.
- [ ] External file watching.
- [ ] External merge/conflict handling.
- [ ] Whole-block selection UI.
- [ ] Whole-block clipboard.
- [ ] Visible formatting toolbar.
- [ ] Custom toolbar configuration UI.
- [ ] Full markdown source mode.
- [ ] Web adapter.
- [ ] iOS/Android validation.
