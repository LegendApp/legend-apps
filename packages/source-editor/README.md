# Source editor prototype

Shared single-file editor work for Code and Slides. The document is not
an array of editable inputs: a persistent AppKit input client owns text,
selection, composition, and undo. LegendList owns the recycled visible rows.
CoreText supplies the geometry for wrapping, drawing, hit testing, and the IME.
No NSTextView or Markdown block editor is used.

## Current status

Code opens UTF-8 files directly in this editor. The old read-only viewer and its
separate loading/tokenization path are disabled in Code for now.
In Code, edits are intentionally not saved; switching files or closing the window discards
them. The window displays this limitation. Do not use it to author work that needs
saving. Settings changes and reselecting the same file preserve the edit buffer.

Slides seeds the same editor with `initialSource` and owns its draft/save workflow.
Without that prop, file loading remains native and progressive. An in-memory seed
is loaded once; remount with a different key when replacing it. `onChange` reports
UTF-16 range edits, and `onSelectionChange` reports the selected range and logical
line for preview/navigation integrations. Neither callback writes to disk.

Implemented foundations:

- An indexed UTF-16 native buffer with stable logical-line IDs, exact newline
  preservation, logarithmic line/offset lookup, and range replacement.
- Progressive background UTF-8 loading: the first read is capped at 16 KiB and
  decoding at 128 newline boundaries. Later chunks are decoded/indexed off-main
  and integrated incrementally, with cancellation on file replacement/recycling.
  UTF-8 scalars and CRLF boundaries are preserved; BOMs are supported.
- A compact LegendList ID-run index receiving versioned row transactions, with
  no full-text bridge payload or per-file-line JavaScript object allocation.
  Row objects are created on demand in a bounded cache. The repo's pinned
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
  reparsing when state converges beyond the edited range. Initial tokenization
  defaults to the mounted viewport plus lookahead, and resumes on scrolling.
  Code opts into `syntaxHighlightingMode="background"`: after the first draw,
  bounded worker batches continue through the loaded document and retain tokens
  for future scrolling. Incoming file chunks and edits resume this work.
  Mode changes preserve cached tokens, document contents and undo history.
  Background mode trades CPU/memory for prehighlighted scrolling; jumping ahead
  before it catches up can still briefly show plain text. Other consumers default
  to `"viewport"`; Diff's separate on-demand highlighting path is unchanged.
  Work is batched by line/byte count (a single large logical line is indivisible).
  Grammars/themes are resolved natively from installed or app-bundled assets,
  avoiding synchronous development-file reads on the JavaScript thread.
  Catch-up work uses bounded 2,048-line/256-KiB batches after the initial screen,
  reducing main/worker handoffs on long jumps. A bounded native cache reuses short
  identical lines only when their incoming parser states match. Exact first-pass
  highlighting still needs preceding multiline state; unique, uncached files can
  take time to catch up. No approximate viewport-only colors are substituted.
- Syntax colors and font styles applied before CoreText layout, preserving
  matching rendering, wrapping, selection, and caret geometry. Theme/highlighting
  changes keep the native edit buffer and undo history; asset failures fall back
  to editable plain text with an error message.
- Files with at least 10,000 loaded lines show a top-centered progress banner:
  loaded line count while reading, then percentage during background highlighting.
  It disappears when finished. Native progress is throttled to roughly 10 Hz
  (with immediate phase changes), and updates only the banner, not editor rows.

## Validation

The native scheduler suite includes repeated and unique 100,000-line end jumps.
On the development machine, the repeated-line case improved from about 4.1 s to
0.13 s; the unique-line case takes about 2.9 s after the change. These are native
test timings, not cold-start or live UI guarantees. Row tests cover delayed
Fabric index updates after insertion/undo and preserving unchanged glyph layouts.

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

The native test timings measure isolated buffer/layout work, not frame latency.
An integrated macOS Debug run on September 10 measured native file-open start to
first row draw: a 65 MB / 1,000,001-row fixture improved from 6.36 seconds to
126 ms on the first rebuilt run and 36–48 ms on subsequent warm opens. A 130 MB
fixture drew its prefix in 44 ms on a warm repeat. These are local file-open
measurements, not cold process/Metro launch times or guarantees for all hardware.
The final build uses 1 MiB background batches after the initial prefix: the same
65 MB fixture drew in 120 ms on the first open and 39 ms on a warm repeat,
finishing background loading in 3.9–4.0 seconds. The 6.5 MB fixture drew in 34 ms.
Live edits while the 130 MB fixture was still loading survived completion.
Switching away mid-load cancelled the old job without appending into the new file.

Loading remaining data is still O(file size), and the complete native buffer
eventually occupies memory. The scrollbar grows as rows arrive; Select All and
end-of-document commands cover the currently loaded prefix until loading finishes.
A one-million-character single line showed its prefix in 20 ms, but long-line
layout/retokenization still scales with line length. TextMate must reconstruct
preceding parser state on a distant uncached jump. Truly unbounded files require
a disk-backed/paged buffer and virtualized layout within individual logical lines.

New native code requires `bun run code pods macos` followed by a debug rebuild.
The native test harness also uses the headers installed by that pod step.
In a fresh worktree, initialize the existing TextMateLib submodules first:
`git submodule update --init --recursive`.

## Exact wrapped heights

Wrapped row heights are prepared with the same CoreText layout used for drawing
and hit testing. A serial native worker prioritizes 256 rows around the viewport,
then prepares the remaining heights in batches (up to 64 rows / 16K UTF-16 units;
one oversized logical line may exceed the unit budget). JavaScript retains only
paged scalar heights by stable line ID. The list reads these synchronously;
unknown heights still use native row measurement, never an authoritative guess.
Only nearby drawable layouts occupy the bounded 8 MiB native cache. Width/font/
theme changes invalidate the configuration, and revision checks discard stale
edit results. Unwrapped rows use their exact constant line height without a
whole-file layout pass.

For short, printable ASCII in a monospace font, character count times the font's
advance selects a possible single-line shortcut. CoreText checks the actual
shaped width before skipping line-break calculation. Tabs, Unicode, and longer
lines retain the full wrapping path. This avoids layout jumps from treating a
monospace estimate as exact, but does not make arbitrary long-line layout free.

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
