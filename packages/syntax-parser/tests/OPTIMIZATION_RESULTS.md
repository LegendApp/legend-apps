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
