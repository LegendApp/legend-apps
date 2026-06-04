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

- [x] Extend `@legend-desktop/markdown-parser` TypeScript spec with richer document/block snapshots.
- [x] Add native document session ID.
- [x] Add opaque native block IDs.
- [x] Add source UTF-8 byte ranges.
- [x] Add content UTF-8 byte ranges when available.
- [x] Add text revision metadata.
- [x] Preserve existing `getRenderBlocks(start, count)` compatibility or update all current callsites.
- [x] Update C++ implementation.
- [x] Run Nitro/codegen workflow and include generated files.
- [x] Keep the test-kitchen-sink markdown-parser example working.
- [x] Validate `bun run typecheck`.
- [ ] Validate kitchen-sink markdown parser still loads/renders a file if practical.
- [x] Commit with a `type: subject` message.

## Phase 3: MarkdownDocument Package

- [x] Create `packages/markdown-document`.
- [x] Add `package.json` following workspace conventions.
- [x] Add `src/index.ts`.
- [x] Add public types.
- [x] Add native adapter wrapping `@legend-desktop/markdown-parser`.
- [x] Add `MarkdownDocument.tsx`.
- [x] Add default native-document-app styling.
- [x] Export `defaultMarkdownStyle`.
- [x] Expose style/content/markdown style props without hardcoding chrome.
- [x] Expose command/state API shape needed by app menus and future custom toolbars.
- [x] Add short README with basic usage and API notes.
- [x] Ensure package has no `@legendapp/state` dependency.
- [x] Validate `bun run typecheck`.
- [x] Commit with a `type: subject` message.

## Phase 4: Read-Only Markdown App Shell

- [x] Add `@legend-desktop/markdown-document` to `apps/markdown`.
- [x] Replace placeholder app UI with `MarkdownDocument`.
- [x] Wire selected/open filename into the component.
- [x] Keep app shell chrome outside `MarkdownDocument`.
- [x] Add subtle status surface for filename, loading, saving, dirty, and errors.
- [x] Persist app metadata with `@legendapp/state`.
- [x] Persist recent files in a JSON-backed store.
- [x] Keep at most 20 recent files.
- [x] Remove missing recent files after showing an error.
- [x] Expose recent files in native menu if dynamic menu support is straightforward.
- [x] Do not build an empty-state recent-files list.
- [x] Validate `bun run typecheck`.
- [x] Validate `bun run markdown run macos` opens and renders a markdown file.
- [x] Commit with a `type: subject` message.

## Phase 5: Hydration And Performance

- [x] Request 64 initial blocks for first paint.
- [x] Render list rows keyed by opaque block ID.
- [x] Keep `MarkdownDocument` as owner of `blockIds` and `blocksById`.
- [x] Hydrate all remaining blocks after first paint / `LegendList` loaded signal.
- [x] Hydrate in chunks of 512.
- [x] Cancel hydration on document replacement/unmount.
- [x] Keep DEV-only timing/block/hydration diagnostics available.
- [x] Do not show benchmark-style diagnostics in normal app UI.
- [x] Validate `bun run typecheck`.
- [ ] Validate 10k-20k block markdown file renders and scrolls without hydration gaps.
- [x] Commit with a `type: subject` message.

## Phase 6: Native Editing Transactions

- [x] Extend parser/native document with current source storage as a simple native string/buffer.
- [x] Add `applyTransaction` to the native spec.
- [x] Implement `updateBlockMarkdown`.
- [x] Preserve block ID for block-local edits.
- [x] Return range patches:
  - [x] revision
  - [x] source length
  - [x] start block index
  - [x] delete count
  - [x] inserted block IDs
  - [x] changed block snapshots
  - [x] retired block IDs
- [ ] Add dirty-region parse fallback when a block markdown update changes structure unexpectedly.
- [x] Keep full-document reparse out of the normal edit path.
- [x] Add native save method.
- [x] Save UTF-8.
- [x] Preserve dominant line endings when practical.
- [x] Save with atomic replace.
- [x] Run Nitro/codegen workflow and include generated files.
- [x] Keep kitchen-sink markdown-parser example working at compile/typecheck level.
- [x] Validate `bun run typecheck`.
- [x] Validate app still opens/renders after parser changes.
- [x] Commit with a `type: subject` message.

## Phase 7: Active Block Editing

- [x] Click/tap rendered block to activate editor.
- [x] Use `EnrichedMarkdownTextInput` for active block editing.
- [ ] Use current enriched APIs first:
  - [x] `onChangeMarkdown`
  - [x] `onChangeSelection`
  - [ ] `onChangeState`
  - [x] focus/blur
  - [x] inline formatting commands
  - [x] link commands
  - [ ] `getMarkdown`
  - [x] caret rect APIs
- [x] Best effort: place cursor near click position; fall back to end.
- [x] Commit active block edits with 300ms debounce.
- [x] Mark dirty immediately on editor change.
- [x] Flush pending edit on block switch.
- [x] Flush pending edit on blur.
- [x] Flush pending edit on Escape.
- [x] Flush pending edit on Save.
- [x] Blur returns block to rendered mode.
- [x] Escape commits and blurs.
- [x] Keep empty active block as empty paragraph.
- [x] Implement Enter split:
  - [x] left/original block keeps original ID
  - [x] new/right block gets new ID
  - [x] focus moves to new/right block
  - [x] use newline-detection workaround if Enter interception is unavailable
  - [x] list continuation is best effort
- [x] Leave Backspace-at-start on enriched input default first.
- [x] Leave paste on enriched input default first.
- [x] Validate `bun run typecheck`.
- [ ] Validate editing a paragraph updates rendered markdown after blur.
- [ ] Validate Enter splits a block.
- [ ] Validate Save flushes pending edit.
- [x] Commit with a `type: subject` message.

## Phase 8: Save, Autosave, Undo, And Commands

- [x] Add `savePolicy` prop.
- [x] Autosave default enabled.
- [x] Autosave debounce is configurable and no more than 2000ms by default.
- [x] Save/autosave failures keep document dirty.
- [x] Autosave failure pauses retries until next edit or explicit Save.
- [x] Manual Save flushes pending editor state before writing.
- [x] Track saved document revision.
- [x] Dirty becomes false when current revision equals saved revision.
- [x] Preserve undo history across saves.
- [x] Implement JS undo/redo stack.
- [x] Group continuous typing in the same block.
- [x] Split typing groups after 1000ms pause.
- [x] Split groups on blur, selection jump, formatting command, or structural command.
- [x] Implement Undo command.
- [x] Implement Redo command.
- [x] Wire Cmd+O, Cmd+S, Cmd+Z, Shift+Cmd+Z, Cmd+B, Cmd+I, Cmd+K.
- [x] Disable Save when clean or no document is open.
- [x] Disable Undo/Redo when unavailable.
- [x] Route formatting commands to active enriched editor when available.
- [x] Prompt Save / Discard / Cancel when opening another file while dirty.
- [x] If prompt-save fails, show error and stay on current document.
- [ ] Prompt Save / Discard / Cancel when closing a dirty document window.
- [ ] If close-save fails, show error and keep window open.
- [x] Validate `bun run typecheck`.
- [ ] Validate manual save, autosave, undo, redo, and dirty-state transitions.
- [x] Commit with a `type: subject` message.

## Phase 9: Final Cleanup And Documentation

- [x] Review public exports and remove accidental internals.
- [x] Review app shell to confirm chrome stays outside `MarkdownDocument`.
- [x] Confirm markdown/document styles are externally configurable.
- [x] Confirm no fixed toolbar/button layout is baked into `MarkdownDocument`.
- [x] Confirm `@legend-desktop/markdown-document` has no `@legendapp/state` dependency.
- [x] Confirm DEV-only diagnostics are not visible in normal UI.
- [x] Update README/API notes if implementation differs from plan.
- [x] Run `bun run typecheck`.
- [ ] Run `bun run markdown run macos`.
- [ ] Validate open, render, edit, split, save, autosave, undo, redo on a real markdown file.
- [ ] Validate a 10k-20k block markdown file renders and scrolls acceptably.
- [ ] Commit with a `type: subject` message.

## Deferred

- [ ] Multi-window document behavior.
- [ ] External file watching.
- [ ] External merge/conflict handling.
- [ ] Whole-block selection UI.
- [ ] Whole-block clipboard.
- [ ] Custom toolbar configuration UI.
- [ ] Full markdown source mode.
- [ ] Web adapter.
- [ ] iOS/Android validation.
