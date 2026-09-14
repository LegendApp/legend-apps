# Syntax scheduling optimizations — September 13, 2026

Native macOS `clang++ -O2` measurements, using the real files in
`highlighting-corpus.json`. These are worker/query measurements, not app
edit-to-paint latency. No release build was used.

| Workload | Previous behavior | Updated behavior |
| --- | --- | --- |
| One-character edits at three positions in the 9 MB TypeScript compiler | 200,237 invalidated lines; ~290 ms background query | 5, 24, or 35 lines; ~0.02–0.06 ms background query |
| Two broad invalidations in the React compiler | 108,749 lines; ~150 ms | 1,565 or 14 lines; ~1.0 or ~0.02 ms |
| Control task queued behind initial compiler parsing | ~391 ms wait | 1.27, 1.34, and 3.02 ms in three fresh processes |
| Joi minified JS, visible highlighting | ~10.3 ms whole logical line | ~0.5–0.6 ms warm 8,192-unit query plus row-cache merge |
| DevTools one-line JSON, visible highlighting | ~6.5 ms whole logical line | ~0.06–0.11 ms warm 8,192-unit query plus row-cache merge |

The window measurements intentionally process less text: that is the scheduling
change, not a claim that the parser itself became faster. Total initial compiler
parse time remained about 395–406 ms. Full background highlighting still visits
the whole document; it uses at most 512 lines and 32,768 UTF-16 units per job.
Visible queries use an 8,192-unit budget and continue if the viewport needs more.

## Correctness and scope

- JavaScript/TypeScript/TSX edits strictly inside matching, error-free function
  bodies invalidate their enclosing function. Headers, outer bindings, malformed
  trees and other languages retain conservative invalidation. This is not a
  blanket dirty-line optimization.
- Parse slices return to the serial executor; edits abandon suspended snapshots.
  In-flight queries have cancellation checks, including native cursor traversal.
  Stale completions do not publish tokens for a newer revision.
- Partial row results replace only their queried interval, including plain gaps.
  Adjacent matching captures are coalesced. Zero-length tokens on empty lines are
  omitted; they never represented drawable content.
- The 15-file corpus matched full-row versus merged-window tokens, including
  Markdown/MDX injections. Three additional fresh processes per long-line file
  tested 15 visible queries each, comparing retained tokens after every merge.
- The edit harness exercised 123 edit/undo observations over 15 files, comparing
  visible results to fresh parses and whole-file results after undo.

## Regression tests

Run `bash packages/source-editor/tests/run-native.sh` and
`bash packages/syntax-parser/scripts/test-tree-sitter.sh`.

The permanent tests cover scope-limited cache invalidation, local binding edits,
same-length edits between suspended parse slices, cancellation/recovery, shuffled
character windows, Unicode/CRLF, plain gaps, multiline captures, and empty rows.
The AppKit scheduler tests exercise wrapped and horizontal long-line viewports
with background highlighting disabled, then background completion, edits and
undo. They use the actual native editor and layout classes with deterministic
viewport geometry, not a running Code app UI.
