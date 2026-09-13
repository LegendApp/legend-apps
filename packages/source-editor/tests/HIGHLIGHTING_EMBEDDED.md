# Embedded-language highlighting — third optimization pass

The previous pass is committed as `c96c039`. This pass keeps that implementation
as the baseline and focuses on costs the broader real-source corpus exposed.

## Findings and retained fixes

A separate macOS CPU sample of 80 repeated TypeBox-document loads found 1,349
of 1,945 highlighting samples inside embedded parsing (~69%). This profile warms
the process-wide query cache; it is for attribution, not cold-start timing.

Region-level instrumentation then found a 32,340-code-unit TypeScript block split
into 330 included ranges. All 330 excluded `block_continuation` children were
zero-width: they removed **no text**. The implementation also ran a highlighting
query for every included range.

Two fixes are retained:

- Ignore zero-width excluded children when constructing included ranges. Real
  quote/list markers remain excluded.
- Query each visible embedded region once, then clip its sorted spans to the
  included ranges in a linear walk. Do not run the same query hundreds of times.

The output remains identical to the original implementation on all corpus files.
This does not introduce a new parser cache, change grammars, skip invalid code,
increase batch sizes, or change background scheduling.

## Five-pass final comparison

Apple M4; `-O2` native code and identical grammar objects. Each observation is a
fresh process; baseline/candidate order alternates. No task-owned builds, tests
or profilers overlapped the timed matrix. Other desktop activity was uncontrolled.

Median milliseconds, from starting highlighting to final token publication:

| Real source | Bytes | Before | After |
|---|---:|---:|---:|
| TypeScript compiler JS | 9,111,641 | 364.85 | 365.20 |
| React compiler JS | 3,826,059 | 187.79 | 189.13 |
| DOM declarations | 2,349,483 | 44.20 | 44.57 |
| CSS type declarations | 894,969 | 11.85 | 11.88 |
| Diff viewer TSX | 201,263 | 10.83 | 10.99 |
| Markdown editor TSX | 138,868 | 5.50 | 5.64 |
| Python AST | 56,179 | 2.59 | 2.60 |
| Tailwind CSS | 29,557 | 1.12 | 1.09 |
| DevTools JSON | 614,704 | 7.26 | 7.18 |
| **TypeBox Markdown** | **125,309** | **57.69** | **49.54** |
| Desktop talk MDX | 47,723 | 5.49 | 5.50 |
| Joi minified JS | 149,224 | 12.83 | 12.84 |
| Property Information Markdown | 69,906 | 24.92 | 24.72 |
| Syntax parser Markdown | 12,008 | 2.75 | 2.72 |
| Slides showcase MDX | 4,751 | 13.49 | 13.47 |

The TypeBox win is approximately **14% additional**, with all candidate runs
49.29–50.42 ms versus baseline 56.37–77.32 ms. Two baseline runs were outliers;
even the fastest baseline is slower than every candidate. Earlier exploratory
runs showed the same direction. Its query/row work changed from 57.41 to 49.27 ms,
and median peak process memory remained about 44 MB.

The other inputs are effectively unchanged at this scale; some small sources
measure a few percent slower. This is **not** another general JS/TS speedup.
Initial parsing, file decoding, grammar downloading and UI drawing are excluded.
No new app binary or other-machine UI timing is claimed.

Full fixture hashes, every observation, parsing times, batch maxima and memory
are in [highlighting-embedded-results.json](highlighting-embedded-results.json).

## Benchmark correction

The previous harness waited for its next 1 ms main-loop wakeup before taking the
completion timestamp. The updated harness timestamps the final publication inside
the completion callback and reports that extra wakeup delay separately as
`completion_wait_ms`. Both binaries in the table use this same corrected harness.
This explains differences from earlier reports' small-file elapsed times; it is
not an app speedup. `query_rows_ms` retains its previous definition.

The build helper now accepts `LEGEND_BENCH_HIGHLIGHTER=/absolute/path/baseline.cpp`
to rebuild a saved baseline source against the same current harness and headers.
Freeze the working highlighter before editing it, keep grammar/query inputs fixed,
build both variants before timing, then use `benchmark-corpus.ts` with the expanded
`highlighting-corpus.json` manifest. Reuse object files only when their inputs and
flags are unchanged.

## Rejected experiments and remaining cost

- Integer/radix event sorting: no repeatable corpus improvement; extra scratch
  storage increased memory. Removed.
- `-O3` for generated JavaScript/TypeScript/TSX/Markdown-inline parser C (keeping
  runtime and native C++ at `-O2`): no consistent parsing or highlighting benefit.
  Not retained; grammar build flags and releases are unchanged.
- The single-query change alone measured about 57 → 51 ms on TypeBox; eliminating
  empty range splits improved it further to about 50 ms.

Inspection showed the expensive fenced blocks contain large Unicode box-drawing
tables labelled `typescript`, rather than ordinary compilable TypeScript. Their
error recovery remains costly. Reprofiling the same repeated-load scenario after
the fixes found embedded parsing at 1,491 of 1,882 highlighting samples (~79%):
it is now a larger fraction of a smaller total workload. Sample fractions are not
absolute timers. Both profiling runs produced the same 1,060,720 aggregate tokens.
Changing that remaining cost substantially would require deeper grammar/runtime
work or a change in syntax behavior; no such change is included here.

## Validation

- Fifteen real files across eight languages, five interleaved repetitions per
  variant, with identical complete token hashes and validated completion times.
- Added plain/quoted 330-line fenced blocks, CRLF, Unicode, multiline emphasis
  and comments, viewport/full-result equivalence, excluded-marker checks and
  incremental edits against fresh parses for both Markdown and MDX.
- Complete native syntax and source-editor suites pass, including cache eviction,
  cancellation, runtime isolation, prefix loading, retained colors, selection,
  undo/IME and syntax scheduling. Typecheck and whitespace checks pass.
- Native app rebuild required to use these C++ changes; Metro reload is insufficient.
