# Real-source highlighting optimization — second pass

## Scope and result

This follows the predicate/build optimization in `HIGHLIGHTING_PERFORMANCE.md`.
The baseline **already includes** that optimization; these are additional gains.
Both variants use the same pinned grammar objects and `-O2` native code on an
Apple M4. No grammar/query definitions or scheduling policy changed in this pass.

Three changes were retained:

1. Consume complete query matches instead of requesting globally ordered captures.
   The existing overlap sweep already sorts the captures. Predicates run once per
   complete match, rather than potentially again for interleaved captures.
2. Reuse the last predicate input's ASCII representation when multiple rules inspect
   the same node range. The cache is local to one immutable highlight call, never
   reused across edits or trees. Lexical binding names still own their strings.
3. Visit consecutive document lines in one bounded tree traversal when constructing
   row tokens, instead of two root-to-line searches per row. Reserve the result's
   known row count. This changes neither virtualization nor the document model.

## Final corpus: five interleaved fresh-process repetitions

All inputs are real, unmodified source files. Compiler JS is distributed compiler
implementation code, not generated benchmark loops; the two TSX inputs are this
repository's actual app components. The corpus also includes a one-line minified
library, one-line JSON, and embedded Markdown/MDX.

Times below are median milliseconds. **Work** is Tree-sitter queries, predicate
evaluation, embedded parsing, span resolution and row-token construction. **Elapsed**
also includes the modeled worker/main-thread handoff, result publication and harness
completion detection. Both exclude initial parsing, file reading/decoding, grammar
downloads and UI drawing.

| Real file | Bytes | Work before → after | Elapsed before → after |
|---|---:|---:|---:|
| TypeScript compiler JS | 9,111,641 | 403.33 → **334.73** | 436.65 → **366.01** |
| React compiler JS | 3,826,059 | 200.13 → **172.12** | 217.66 → **189.26** |
| DOM declarations | 2,349,483 | 44.36 → **39.12** | 49.97 → **45.56** |
| CSS type declarations | 894,969 | 11.27 → **9.44** | 14.62 → **11.93** |
| Diff viewer TSX | 201,263 | 12.06 → **10.07** | 13.67 → **11.07** |
| Markdown editor TSX | 138,868 | 6.40 → **5.12** | 7.63 → **5.62** |
| CPython `ast.py` | 56,179 | 2.68 → 2.39 | 3.68 → 3.89 |
| Tailwind CSS | 29,557 | 1.07 → 0.97 | 2.64 → 1.11 |
| DevTools messages JSON | 614,704 | 7.47 → 7.67 | 8.83 → 8.67 |
| TypeBox Markdown documentation | 125,309 | 57.47 → 56.72 | 57.75 → 57.12 |
| Desktop talk MDX | 47,723 | 5.53 → 5.45 | 6.93 → 5.64 |
| Joi minified JS | 149,224 | 14.14 → **12.71** | 14.67 → **13.14** |

The main loop uses `runUntilDate` with 1 ms intervals. This makes elapsed results
especially noisy for small workloads. Do not interpret Tailwind's elapsed change
as a 58% query speedup, or the Python elapsed increase as a query regression. JSON
varied appreciably between runs and its small change is inconclusive. Markdown/MDX
work is essentially unchanged; their embedded-language costs remain a separate
optimization opportunity, not a claimed win here.

The large-file wins exceed observed run-to-run variation. For the compiler JS,
baseline elapsed was 434.45–442.41 ms and optimized was 363.50–367.45 ms. Peak
process memory stayed around 362 MB in both. Initial parse time was approximately
406/403 ms: this change primarily speeds **highlighting**, not parsing. These are
native harness measurements, not measured window-open/frame-paint latency on the
user's other machine.

All fixture hashes and individual records, including parse times, batch maxima
and peak memory, are in [highlighting-corpus-results.json](highlighting-corpus-results.json).
No task-owned build, test suite or sampling profiler overlapped the final matrix.
Other desktop activity was not controlled.

## Experiments rejected or retained

The same real-file corpus was used throughout, with three interleaved repetitions
per exploratory comparison. These figures are stage-specific trials, not directly
interchangeable with the final five-pass measurements above.

- Match iteration alone: compiler JS 437 → 404 ms; Markdown-editor TSX 7.68 →
  6.88 ms. Retained after reference/viewport correctness checks.
- Pre-sized predicate strings: compiler JS 405 → 412 ms compared with match
  iteration, without consistent gains elsewhere. Removed.
- Sequential row traversal: compiler JS 419 → 395 ms and CSS declarations
  14.58 → 11.95 ms in that experiment. Retained.
- Last-node predicate-text reuse: compiler JS 396 → 364 ms and Markdown-editor
  TSX 7.00 → 5.61 ms compared with the row traversal experiment. Retained; this
  variant also removes the unsuccessful pre-sized-string implementation.
- `-O3` C++/runtime, keeping grammar objects identical: compiler JS 366 → 354 ms,
  but parsing and other workloads did not consistently improve. Not retained;
  existing native build settings are unchanged.
- Reusing evicted embedded highlighters: TypeBox Markdown 57.29 → 57.93 ms.
  No benefit demonstrated; removed rather than adding parser-lifecycle complexity.

## Correctness and reproduction

- Every final run verifies the same full row-token hash as the baseline, including
  capture IDs and UTF-16 boundaries. All 12 files / 8 languages matched.
- `QueryTraversal.test.cpp` checks overlapping and multi-capture patterns,
  multiple names on one node, quantified captures, chained predicates, 3-code-unit
  input reads, malformed input and viewport/full-result consistency. Compiled
  against both original and final highlighters, all 484 source cases produced the
  identical aggregate digest `10123162523422325411`.
- Document traversal tests cover empty/partial/whole ranges, EOF, overflowing
  requested counts, CR/LF/CRLF, Unicode, and 10,000 randomized editing transactions.
- Complete native source-editor and syntax suites pass: incremental edits/undo,
  prefix loading, background scheduling, retained colors, selection, injections,
  cancellation and runtime isolation. Typecheck and `git diff --check` pass.

Build baseline and candidate binaries before timing, with identical grammar
objects and flags, using `build-highlight-benchmark.sh`. Preserve each binary
outside its build output before rebuilding the next variant. Then run:

```sh
node packages/source-editor/tests/benchmark-corpus.ts \
  packages/source-editor/tests/highlighting-corpus.json 5 \
  /absolute/path/baseline /absolute/path/candidate
```

Run from the repository root. The manifest pins the installed dependency paths
used here; adjust it for other dependency versions or a different Python stdlib
location. The runner emits the actual input hashes, so comparisons stay auditable.
Do not overlap builds/profiling/test suites with timed runs. Native app rebuilds
are required to use these C++ changes; Metro reload alone is insufficient.
