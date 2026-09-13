# Full-file highlighting investigation — 2026-09-13

## Outcome

Keep the existing bounded native scheduler. Optimize query predicates and compile
the syntax/parser and source-editor native pods with `-O2`, including Debug.
The measured bottleneck was **not** the main-thread handoff. Native debug symbols
remain available, but optimization makes native source-level stepping less exact;
React Native/JS debugging settings are unchanged.

Apple M4, macOS; three fresh-process runs per cell, median times below. The final
matrix alternates reference/optimized ordering between repetitions. No task-owned
build, test suite or sampling profiler overlapped final timed runs. Other desktop
activity was not controlled. Raw records and fixture SHA-256 hashes are in
[highlighting-benchmark-results.json](highlighting-benchmark-results.json).

These are native-stage measurements, **not window-open or frame-paint latency**.
The harness uses the real `SourceTreeSyntax`, native document mirror and queries.
Its `scheduler` mode uses the real `LESourceInputView` scheduler/cache, with a stub
palette and no view rows, file dialogs, downloads or theme-resource I/O. File
reading/UTF-8 decoding occurs before timing. It cannot reproduce the user's
unavailable 10 MB file or their other machine.

## Competing approaches

Real TypeScript compiler JavaScript: 9,111,641 bytes, 200,253 lines, 1,307,203 tokens.
Both native C++ and the Tree-sitter runtime/grammars are optimized here. Parsing
takes about 400 ms and is **excluded** from this table.

| Approach | Complete highlighting | Largest batch (median of run maxima) | Peak process memory |
|---|---:|---:|---:|
| Reference: 512 lines + main-thread publication/rescheduling | 1,011 ms | 19 ms | 362 MB |
| Worker-owned tokens + cooperative 8 ms continuation | 1,008 ms | 19 ms | 366 MB |
| Worker loop, 4,096-line queries | 1,015 ms | 46 ms | 370 MB |
| One whole-file query | 1,036 ms | 1,028 ms | 575 MB |
| Bounded regex-result cache only (earlier isolated trial) | 623 ms | 19 ms | 362 MB |
| Exact predicate fast paths + bounded general-regex cache, existing scheduler model | **437 ms** | 18 ms | 362 MB |

The reference spends about 978 ms inside query/row construction and only 7 ms
publishing/hashing tokens. The remaining ~26 ms includes dispatch waits and
intermediate result copies. Replacing this with a more complicated worker-owned
cache would not explain or fix multi-second highlighting on this workload.

After predicate optimization, the worker and 4,096-line variants
measure 426/419 ms versus 437 ms with round trips. This modest ~3–4% difference
does not justify a new ownership/synchronization architecture in this change.
Whole-file queries remain slower than those worker batches and use much more
memory; they also postpone processing queued edits for the entire query.

## CPU profiles and the retained changes

A separate macOS `sample` capture found 245 of 414 highlighting samples at the
regex-predicate evaluation call (~59%). Allocation-heavy libc++ regex matching
dominated that call. After optimization, the leading site is Tree-sitter query
cursor iteration (194 of 295 highlighting samples); regex no longer dominates.
These are sampling observations, not phase stopwatches, and sampled executions
are excluded from the reported timing matrix.

`QueryRegex` recognizes only exact equivalent forms:

- `^[A-Z]`: constructor/type capitalization.
- `^[A-Z_][A-Z\d_]+$`: uppercase constant names.
- Anchored alternatives of nonempty ASCII words, such as the builtin-name list.

All other patterns retain the existing ECMAScript regex implementation. Pure
general-regex answers use a worker-local, direct-mapped cache: 512 entries, at
most 256 bytes of text per entry; larger inputs bypass it. Keys include the
immutable expression identity and complete predicate input. Collisions replace
entries and cannot return another expression/text's answer. Storage is allocated
only when a general regex actually uses it. Scope/local-binding
predicates are deliberately **not** cached this way.

## Debug explains the multi-second symptom

The generated Debug project inherited `GCC_OPTIMIZATION_LEVEL = 0`. An experiment
kept the C Tree-sitter runtime/grammars optimized and varied the C++ build:

| C++ configuration | Parse | Full highlighting |
|---|---:|---:|
| `-O0`, reference predicates | 443 ms | **7,734 ms** |
| `-O0`, improved predicates | 439 ms | **2,005 ms** |
| `-O2`, improved predicates | 404 ms | **437 ms** |

This reproduces “parsing is fast but highlighting takes many seconds.” It isolates
C++ overhead, not every difference in a full Debug application. Both native podspecs
now request optimization level 2. CocoaPods was refreshed and Xcode's effective
Debug build settings confirm level 2. A native app rebuild is needed to load it;
an existing running process/Metro reload cannot acquire newly compiled native code.

## Other workloads and actual scheduler

| Workload | Reference highlighting | Improved highlighting |
|---|---:|---:|
| Compiler JS, 9.1 MB / 200,253 lines | 1,011 ms | **437 ms** |
| `lib.dom.d.ts`, 2.35 MB / 45,126 lines | 64.5 ms | **50.1 ms** |
| Generated TS, 10 MiB / 218,532 lines | 1,453 ms | **787 ms** |

The real native scheduler's full mirror/parse/highlight/cache completion on the
compiler file improved from **1,474 ms to 897 ms**. Unlike the table above, this
includes parsing and native document setup. This still excludes UI drawing.

Every query/batch variant produced identical complete token hashes for each
fixture. This checks both coverage and row-relative token boundaries/capture IDs,
not merely a similar-looking first screen.

## Validation and reproduction

- Differential predicate tests compare fast/cache answers against `std::regex`
  for 20,000 seeded random inputs plus empty, control-character, long-string and
  malformed-fast-path candidates. Cache collisions/repeated queries are covered.
- Native Tree-sitter suites cover supported fixture grammars, scopes, edits,
  undo, UTF-16/CRLF, cancellation, Markdown/MDX/injections and runtime isolation.
- The source-editor native suite covers prefix/background scheduling, retained
  colors, theme changes, loading edits, replacement and plain-text fallback.
- Typecheck passes. No grammar release or merge was made during this investigation.

Use a temporary directory, build both binaries with identical runtime objects,
then run the matrix **after** compilation finishes:

```sh
highlight_build=$(mktemp -d /tmp/legend-highlight.XXXXXX)
LEGEND_BENCH_PREDICATES=reference bash packages/source-editor/tests/build-highlight-benchmark.sh "$highlight_build"
cp "$highlight_build/highlight-benchmark" "$highlight_build/reference"
bash packages/source-editor/tests/build-highlight-benchmark.sh "$highlight_build" --reuse-grammars
cp "$highlight_build/highlight-benchmark" "$highlight_build/optimized"
node packages/source-editor/tests/benchmark-highlighting.ts "$highlight_build" /absolute/path/typescript.js /absolute/path/lib.dom.d.ts
```

`LEGEND_BENCH_PREDICATES=cache` isolates memoization. `LEGEND_BENCH_OPT=-O0`
isolates unoptimized C++; the C runtime/grammars remain `-O2`. Reference/cache-only
predicate switches are gated by `LEGEND_SYNTAX_TEST_GRAMMARS` and cannot change
production downloaded-grammar behavior. Reuse grammar objects only while their
sources and build flags are unchanged. Native artifacts are not app release builds.

Remaining costs are real query traversal, predicate input access, span sorting
and row-token construction. Faster parsing alone will not remove those costs.
Further query/cursor optimizations need equivalent-token and edit-correctness
benchmarks; do not trade syntax coverage or input responsiveness for a faster bar.
