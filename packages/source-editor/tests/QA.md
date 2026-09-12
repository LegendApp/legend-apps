# Source editor regression coverage

Run from the repository root:

```sh
bun run test:source-editor
bun run test:source-editor:native
bun run test:code --runInBand
bun run typecheck
bun run code verify macos
```

The native suite requires the Code macOS development Pods and local Tree-sitter
test grammars. It tests the real document, CoreText layout, AppKit input and native
syntax scheduler, not mocked equivalents.

## Additional regression cases

- Twenty deterministic seeds, 200 load/edit/undo cycles each: compare exact
  UTF-16 text, line endings, offsets and unique row IDs to a fresh document.
- Forty variable-budget UTF-8 streams, including emoji, combining marks and
  CRLF; verify EOF and malformed input after a successfully loaded prefix.
- Reject malformed edit/append transactions without changing revision, rows,
  cached identity or notifying subscribers. Partial-line appends notify without
  structural splices; unsubscribed listeners stay silent.
- Forward-delete emoji, ZWJ sequences, combining marks, flags and CRLF, with
  undo/redo. Reload clears history. CRLF movement and selection stay atomic,
  including a caret supplied by accessibility inside the newline pair.
- Replace a document twelve times while background syntax is queued; ensure
  old multiline-comment state cannot color the replacement document.

## Manual macOS pass (2026-09-10)

Used the Code worktree's Debug app, connected to its Metro instance. Exercised
10,000- and 100,000-line files, beginning/end navigation, scrolling, Unicode
multiline paste, cross-line deletion, EOF insertion and undo. Inspected syntax
colors at the beginning and end. Switched documents, opened invalid UTF-8
(visible error), then recovered by opening and editing an empty file.

Found and fixed forward-delete leaving LF behind when removing CRLF. Rebuilt
the app and verified joining the lines, undo restoring them, and redo joining
them again. All fixture edits were scratch edits; original files were untouched.

This is not exhaustive IME, accessibility or performance certification. Real
input-method candidate UI, prolonged editing sessions and memory pressure with
multi-gigabyte files still need separate coverage. This historical pass predates
the explicit save commands below.

## Document commands regression coverage (2026-09-12)

- Atomic UTF-8 saves preserve BOM, CRLF and Unicode; external changes are
  refused, failed writes preserve the document path, and Save As changes it only
  after success. Edits made during a save remain dirty; undo returns to the saved
  state. Snapshots reject replacement documents even with the same revision.
- Opening, closing and quitting use a shared asynchronous transition guard.
  Tests cover cancellation, failed saves and overlapping requests. Save As
  updates the title/language without remounting; reopening the original file
  does mount a fresh document.
- Background literal/regex search covers Unicode offsets, whole words, capture
  replacements, zero-width matches, invalid patterns, cancellation and a
  100,000-match retention limit. Replace All is unavailable for truncated results.
- Indent/outdent, newline indentation, comments, line moves and duplication
  preserve line boundaries and undo. Tests include reversed selections, mixed
  CRLF/LF, missing final newlines and caret preservation when commenting.
- Optional bracket/quote pairing covers wrapping selections, skipping generated
  closers, paired deletion, comments, undo/redo and literal explicit replacement.
  Pairing conservatively stays literal past column 2048; ordinary typing does
  not scan the line. Languages without a supported line-comment marker report
  that limitation instead of inserting an incorrect marker.

The macOS Debug build and native suite pass. Interactive verification on
2026-09-12 used the worktree's Debug Code app through app-scoped CUA (the
agent-device session was blocked by an existing device lock):

- Save and Save As wrote disposable fixture files; filename updates retained
  the buffer and undo history. Saving after a file dialog remained enabled.
- An external disk edit was preserved and Save displayed the specific conflict
  warning. Cancelling Open, Close and Quit retained unsaved content and filename.
- Indent, comments, duplicate/move lines, undo, bracket deletion, newline
  indentation and disabling automatic pairs were exercised in the editor.
- Literal/whole-word Replace All and regex capture replacement worked, with
  undo restoring the previous content in one step.
- A 100,000-line file supported Go to Line 100000, 100,000 search matches,
  Previous/Next and wraparound. Accessibility-driven query changes reproduced
  a stuck debounce; main-queue debounce delivery fixed it in the rebuilt app.
  A native panel regression also covers rapid query changes and 100,000 matches.

Runtime testing found and fixed native menu shortcut binding, menu validation
after dialogs, close interception after refocusing, and conflict error propagation.
The remote grammar release still returns HTTP 404, so this run does not certify
downloaded syntax colors; no grammar release was published. Real IME candidate
UI and prolonged memory-pressure testing remain outside this manual pass.
