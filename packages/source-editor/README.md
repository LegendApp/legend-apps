# Source editor prototype

Shared single-file editor work for Code and, later, Slides. The document is not
an array of editable inputs: a persistent AppKit input client owns text,
selection, composition, and undo. LegendList owns the recycled visible rows.
CoreText supplies the geometry for wrapping, drawing, hit testing, and the IME.
No NSTextView or Markdown block editor is used.

## Current status

Code opens UTF-8 files directly in this editor. The old read-only viewer and its
separate loading/tokenization path are disabled in Code for now.
Edits are intentionally not saved; switching files or closing the window discards
them. The window displays this limitation. Do not use it to author work that needs
saving. Settings changes and reselecting the same file preserve the edit buffer.

Implemented foundations:

- An indexed UTF-16 native buffer with stable logical-line IDs, exact newline
  preservation, logarithmic line/offset lookup, and range replacement.
- A LegendList data-source mirror receiving versioned, bounded row transactions
  rather than whole-document changes on every keystroke. The repo's pinned
  `3.3.5-sparse-layout.67a3cbc9` supports this data-source API.
- Shared native line layout with wrapping, grapheme-aware hit testing, caret
  rectangles, and visible-range drawing. Bounded typesetter chunks avoid the
  observed quadratic behavior when wrapping a single very long line.
- Persistent native text input, composition transactions, undo/redo, clipboard,
  basic mouse selection, visual-line arrow navigation, and accessibility text
  value/selection support. Caret reveal uses native visual-row geometry, including
  logical lines taller than the viewport.
- Document-owned drag tracking and timed edge autoscroll survive recycling the
  mouse-down row. Tracking stops on mouse-up, focus loss, or document replacement.
- Vertical navigation shapes unmounted target lines with the renderer's CoreText
  layout and retains the desired horizontal position across short/wrapped lines.
- Incremental syntax highlighting using the same native TextMate engine,
  grammars, and themes as Code and Diff. A serial background worker retains
  multiline parser states by stable line ID, rejects stale revisions, and stops
  reparsing when state converges beyond the edited range. Work is batched by
  line/byte count (a single large logical line is still indivisible).
- Syntax colors and font styles applied before CoreText layout, preserving
  matching rendering, wrapping, selection, and caret geometry. Theme/highlighting
  changes keep the native edit buffer and undo history; asset failures fall back
  to editable plain text with an error message.

## Validation

From the repository root:

```sh
bun run test:source-editor
bun run test:source-editor:native
bun run test:code --runInBand
bun run typecheck
bun run code verify macos
```

Native tests exercise randomized range replacements (including CRLF boundaries),
100k-line buffers, top-of-file splices, wrapped caret/hit-test round trips,
grapheme boundaries, and composition commit/undo through `NSTextInputClient`.
Real TypeScript/TSX grammar tests cover UTF-16 token ranges, multiline edits and
undo, theme changes, and incremental convergence on 10,000 lines.
Composition protocol tests do not replace live testing with an actual IME.
Offscreen native-window tests also cover stationary-pointer autoscroll, direction
reversal, recycling during a drag, cancellation, and preserving double-click
selection. Navigation tests cover repeated Shift-arrow keys with no mounted rows
and entry into the first/last visual row of a wrapped target.

Runtime verification (macOS Debug, September 9, 2026): typing/newline insertion,
consecutive undo/redo, multiline selection/deletion/restoration, and editing
recycled rows near line 10,000. A 16k-character logical line was also exercised
with visual-row navigation, typing, splitting, and undo beyond the first screen.
Regression coverage includes detached-row drawing, mutable input strings in undo,
retained LegendList row indexes, and preserving measured heights during edits.

The printed timings measure isolated native buffer/layout work, not interactive
frame latency or end-to-end React Native performance. Initial snapshot creation,
React mounting, scrolling, resize reflow, and native/JS synchronization still
need integrated measurement.

New native code requires `bun run code pods macos` followed by a debug rebuild.
The native test harness also uses the headers installed by that pod step.
In a fresh worktree, initialize the existing TextMateLib submodules first:
`git submodule update --init --recursive`.

## Remaining prototype gates

1. Extend runtime coverage to drag-autoscroll and real input-method composition.
2. Implement explicit wrap-off horizontal scrolling and resize anchoring to a
   source position, rather than treating the list's estimated offset as final.
3. Complete IME cancellation/replacement edge cases, bidirectional selection
   geometry, keyboard commands, typing-history grouping, and screen-reader QA.
4. Measure 10k/100k-line scrolling, selection, edits, and reflow. Extremely long
   single lines still lay out all visual rows; viewport-level layout caching or
   fragment items may be needed beyond the bounded shaping implemented here.

Only after these gates: safe explicit saves, external-change protection, search
and replace, indentation, and the shared API for Slides. Folders, tabs, language
servers, Git UI, terminals, and debuggers are outside this milestone.
