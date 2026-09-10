# Source editor regression coverage

Run from the repository root:

```sh
bun run test:source-editor
bun run test:source-editor:native
bun run test:code --runInBand
bun run typecheck
bun run code verify macos
```

The native suite requires the Code macOS development Pods and built TextMate
libraries. It tests the real document, CoreText layout, AppKit input and native
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
multi-gigabyte files still need separate coverage. Edits remain unsaved by design.
