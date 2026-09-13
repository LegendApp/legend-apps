# Native highlighting follow-up

Apple M4; optimized native C++ (`-O2`), pinned fixture grammars. These are native
engine measurements, not file I/O, grammar downloads, or app painting timings.

## Reuse validated pack queries

`PackStartupBenchmark.cpp` registers actual pinned queries under a distinct dynamic
language ID. Five fresh processes per language/variant, interleaved order:

| Language | Registration before / after (ms) | First worker before / after (ms) |
| --- | ---: | ---: |
| JavaScript | 3.30 / 3.31 | 3.17 / 0.006 |
| TypeScript | 9.02 / 9.01 | 8.65 / 0.006 |
| TSX | 9.68 / 9.71 | 9.27 / 0.007 |
| YAML | 2.23 / 2.19 | 1.99 / 0.005 |

Registration still validates the complete query and predicates. Workers retain that
immutable artifact instead of compiling it again. QueryTraversal regression tests
assert one compilation across registration and eight concurrent constructors, and
continue checking lexical predicates, overlapping captures, malformed sources and
viewport/full-output parity. The full native syntax suite passes.

To build the benchmark, use the same fixture objects produced by
`scripts/compile-tree-sitter.ts`, `-DLEGEND_SYNTAX_TEST_GRAMMARS -std=c++20 -O2`,
this benchmark source and `cpp/TreeSitterHighlighter.cpp`. Run with a fixture
language ID, e.g. `tsx`. The benchmark emits JSON; do not overlap builds with timing.

## Protect embedded code trees

Inline Markdown now has its own 128-entry / 128 KiB source cache. Embedded code
has 64 entries / 2 MiB source. These are source-byte budgets, not precise heap
limits; oversized regions are parsed normally but not retained. Both caches use
constant-time LRU rather than scanning all entries to find the oldest.

Three interleaved fresh-process comparisons with `EmbeddedCacheBenchmark.cpp`:

| Source | Initial highlight before / after (ms) | Repeat before / after (ms) | Peak RSS before / after (MB) |
| --- | ---: | ---: | ---: |
| TypeBox Markdown | 48.65 / 48.51 | 38.36 / 10.10 | 17.97 / 19.50 |
| Desktop MDX | 5.33 / 5.38 | 1.116 / 1.102 | 8.39 / 8.47 |
| Property Information Markdown | 24.22 / 23.81 | 10.90 / 10.36 | 14.25 / 14.47 |
| Syntax parser Markdown | 2.64 / 2.65 | 0.483 / 0.503 | 5.91 / 6.03 |
| Showcase MDX | 13.22 / 13.27 | 0.252 / 0.253 | 11.17 / 11.22 |

Every token hash matches across the full 15-file corpus. Initial full loading is
essentially unchanged: this prevents repeated work, not initial parsing. Peak
memory rises where expensive trees are now retained. A 64-slot inline tier was
rejected because it regressed small decks; blindly increasing the shared cache
to 512 had previously regressed the large Property Information document.

Tests cover LRU recency, reweighting, oversized admission, resource bounds, and
code-tree reuse despite 400 inline paragraphs; Markdown edit/reset, cancellation,
viewport and full-output parity remain covered. Actual editor row caching can
avoid queries altogether; these repeat timings do not claim equivalent UI gains.

## Index query patterns by symbol

The retained runtime change replaces the query executor's per-node binary search
with a compiled symbol-to-first-pattern table. All matching, predicate, precedence,
wildcard, and capture machinery is unchanged. It costs four bytes per grammar
symbol per compiled query. Pattern mutation invalidates the table and falls back
to the original lookup. ERROR symbols outside the table also use that lookup.

A separate C++ traversal for simple captures was rejected: although hashes matched,
walking the tree twice made large JavaScript ~15–20% slower. No such path remains.

Five fresh-process, interleaved runs per variant on all 15 real sources using the
existing AppKit roundtrip benchmark. All 150 full-output hashes match. No task-owned
builds, tests or profilers overlapped timings; desktop activity was uncontrolled.
Medians, milliseconds from starting highlighting to final token publication:

| Source | Before | After |
| --- | ---: | ---: |
| TypeScript compiler JavaScript, 9.11 MB | 365.96 | 320.44 |
| React compiler JavaScript, 3.83 MB | 187.29 | 164.96 |
| DOM declarations, 2.35 MB | 44.34 | 39.52 |
| CSS type declarations | 11.77 | 10.29 |
| Diff viewer TSX | 11.00 | 9.94 |
| Markdown editor TSX | 5.68 | 5.04 |
| Python AST | 2.61 | 2.38 |
| Tailwind CSS | 1.10 | 0.98 |
| DevTools JSON | 7.31 | 6.87 |
| TypeBox Markdown | 50.46 | 49.71 |
| Desktop MDX | 5.56 | 5.49 |
| Joi minified JavaScript | 13.00 | 10.91 |
| Property Information Markdown | 24.81 | 24.49 |
| Syntax parser Markdown | 2.73 | 2.72 |
| Showcase MDX | 13.75 | 13.78 |

Large JavaScript gains are ~12%; minified JavaScript ~16%. Cold Markdown/MDX is
largely unchanged because compilation/embedded parsing dominates there. Median
peak RSS for the largest source changes from 362.10 to 362.35 MB.

Raw observations, input SHA-256 identities and output hashes are in
`../../source-editor/tests/highlighting-dispatch-results.json`. Fixture paths and
the runner live alongside it in `highlighting-corpus.json` / `benchmark-corpus.ts`.
The baseline already includes the compiled-query and embedded-cache fixes.

Validation: complete native syntax and source-editor suites; query dispatch tests
for hits/misses, ERROR, wildcard, empty queries and disabled patterns/captures;
TypeScript typecheck; production (non-fixture) highlighter compilation. The vendored
runtime patch is reapplied by the vendor script and checked by the syntax suite.
Code/macOS verification was attempted but Bun startup timed out after 45 seconds.
No new running-app binary, screenshot, or UI latency measurement is claimed.
