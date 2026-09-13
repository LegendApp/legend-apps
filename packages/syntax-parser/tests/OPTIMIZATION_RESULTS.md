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
