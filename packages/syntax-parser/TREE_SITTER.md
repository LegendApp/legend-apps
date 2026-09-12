# Tree-sitter backend and editor integration

Follow-up: [phase diagnosis and integration plan](TREE_SITTER_INTEGRATION_PLAN.md)
shows that the expensive local-edit result below is specific to the flat synthetic
structure. Nested/real-code local edits measured below 1 ms in the native backend;
structural changes still require background scheduling. The earlier table is
retained as a reproducible stress case, not a typical typing-latency estimate.

The native backend drives the Code and Slides source editors. It is also the default backend for every `SourceDocumentEditor` consumer.
See [downloadable grammar packs](../../grammars/README.md) for the root catalog,
local pack builds, signing requirements, download progress, and release tooling.
Diff now uses the same engine for native diff rows and merge previews, retaining
on-demand row queries. See [Diff benchmarks](../diff-parser/TREE_SITTER_BENCHMARKS.md).
All syntax consumers now use Tree-sitter; TextMate/Oniguruma and bundled grammar
assets have been removed. The two small theme files use a native rule matcher. The earlier tables below describe the
pre-integration prototype, not the new prefix-first editor startup.

## Native API

`cpp/TreeSitterHighlighter.hpp` exposes a serial-worker-owned parser for
the shared pinned language registry. It starts with no installed grammars and registers downloaded packs on demand,
with case-insensitive aliases from the shared catalog. JSON5 is not treated as
JSON. `supports()` reports actually loaded coverage, not catalog availability.
The backend is independent of React, Fabric, AppKit, LegendList and disk loading.

- `parse(TreeSitterInput)` reads bounded UTF-16 chunks from a caller-owned immutable
  snapshot/worker document. The callback API accepts the existing SourceDocument
  treap without flattening it; the integration is exercised in the native tests.
- `edit(TreeSitterEdit)` updates the existing tree. Supply exact old/new positions
  for every edit, including same-length edits, before parsing the new snapshot.
  All public offsets and columns are UTF-16 code units; the adapter converts to
  Tree-sitter byte coordinates. LF advances rows; CRLF is preserved.
- `parseSlice(input, milliseconds)` preserves continuation across cooperative
  deadlines. Keep the same worker-owned input frozen until completion; edits or
  reset abandon that continuation. Cancellation never publishes partial results.
- `highlight(start, end)` queries a range and returns immutable, sorted,
  non-overlapping spans with theme-independent capture names and compact IDs. Nested captures
  override enclosing captures; later patterns win equal node ranges. Missing
  zero-width nodes do not contribute spans.
- Cancellation, failed reads and unparsed edits invalidate highlighting rather
  than publishing stale/partial results. Retry parsing or reset for a new file.
  The parser and reader are not safe for concurrent UI mutation.

Queries combine each language's pinned upstream highlights with small
TSX/escape refinements. The wrapper evaluates the pinned `match?`, `eq?` and
`is-not? local` predicates. Native rows retain compact token IDs and resolve a
shared-theme palette separately, so theme changes do not reparse. This is syntax
highlighting, not semantic tokens: lexical builtin-shadowing checks are syntactic,
and full TextMate/Zed or language-server validation parity is not claimed.

## Markdown and MDX composition

Markdown uses pinned block and inline grammars. MDX uses the dedicated pinned
`srazzak/tree-sitter-mdx` grammar for Markdown structure, JSX, imports/exports and
JavaScript expressions, plus the shared inline grammar. YAML document frontmatter
and fenced code use the same registered parsers as standalone source files.
Unknown fence languages remain plain text; adding a registry language also makes
it available in fences. GFM table cells receive inline formatting too.

Embedded regions are discovered with a byte-range-constrained syntax query, not
a full-file sibling walk. Each child parser reads the same worker snapshot with
Tree-sitter included ranges, preserving absolute UTF-16 coordinates and excluding
list/blockquote continuation markers. It parses only when its region is queried;
warm child trees receive queued edits before reuse. Caches retain at most 128
regions per parser and 256 edits; nesting is limited to four injection levels.
Cold embedded parsing uses cooperative slices and honours cancellation. Retained
editor row tokens are independent of this bounded parser cache.

Capture IDs and their language root scopes are generated at build time. Visiting
a new fence doesn't grow the palette or initialize every language query; embedded
TSX/YAML can use their own theme scopes inside a Markdown/MDX document. The editor
copies the catalog once per worker, not once per background batch.

Slides accepts `<!-- speaker notes -->`, unlike standard MDX. The small extension
in `scripts/patch-mdx-grammar.ts` adds an HTML-comment token to Markdown inline
content; it does not replace JavaScript/JSX parsing with a custom scanner. The
vendor command regenerates this patch with pinned `tree-sitter-cli@0.25.10` (or
`LEGEND_TREE_SITTER_CLI` pointing to that version). Generated sources are checked
in; normal builds do not download or run a parser generator.

Coverage limits: frontmatter here means document-leading YAML. Slides' per-slide
configuration blocks still follow the host grammar's Markdown structure; a
Slides-specific dialect is not yet implemented. TOML frontmatter and HTML
script/style injections await their grammars. The MDX grammar's error recovery
can insert a missing semicolon before leading JSX after imports; these zero-width
nodes are ignored for highlighting, not presented as diagnostics or validation.

The shared editor uses a separate worker-owned document mirror, a bounded
128-line/16K-unit prefix, ordered edits, indexed LF positions, retained per-line
colors, visible-range priority and optional whole-file background highlighting.
Parse input and predicate text share a bounded read window; query cursors and
scratch storage are reused. Slides journals native edits and materializes drafts
only for preview/save; slide offsets come back from its Bun compiler process.

Pinned C runtime, registered parsers and licenses are vendored. See
`vendor/tree-sitter/README.md` for revisions and regeneration. The CocoaPods target
compiles the runtime amalgamation once and the registered generated parsers/scanners;
there is no new native module or runtime network dependency.

## Validation and benchmarking

```sh
bun run test:syntax-parser:tree-sitter
bun run benchmark:syntax-parser
bun run test:syntax-parser --runInBand
bun run test:source-editor:native
bun run typecheck
bun run code verify macos
```

The standalone native tests cover the compiled grammars and their aliases, explicit
capture assertions, shared theme mapping, builtin-shadowing fixtures, isolated
native symbols coexisting with another runtime, UTF-16 chunks split across surrogate
pairs, CRLF, multiline changes and undo, incomplete code, range clipping,
pre-start/mid-parse cancellation, reader exceptions, a native treap reader and
100 deterministic edits compared against fresh parses. Composition coverage adds
fences/frontmatter/notes/tables, boundary and language edits, clipped-window
consistency, lazy first-window reads, cache eviction, bounded history, cancellation
and retry. The real example decks and talk deck are loaded and checked after edits
at the beginning, middle and end, including undo back to the original spans.

The historical TextMate comparisons can be reproduced from commit `ef9ae4b`,
before removing that dependency. Current scripts benchmark Tree-sitter only.
The historical benchmark required the TextMate static libraries and Code's generated
Pods headers (as the existing source-editor native suite does). It builds native
code with `-O2` and runs each backend in a separate process. Three repetitions
alternate backend order. Inputs are identical synthetic repeated/unique TS/TSX
declarations at 10,000 and 100,000 lines. It prints JSON records to stdout.

Metrics:

- `setup_ms`: parser/query or grammar/theme initialization.
- `parse_ms`: initial whole-document tree parse (zero as a separate phase for
  TextMate, which parses/tokenizes together).
- `first_highlight_ms`: work through the first 128 highlighted lines, excluding
  setup. This prototype waits for a complete Tree-sitter tree; it has no streamed
  first-screen parser scheduling. TextMate only processes its initial batch.
- `full_highlight_ms`: parse plus capture/token extraction for the full document,
  retaining the results; queries use 2,048-line batches. No fonts/layout/drawing.
- `warm_end_query_ms`: mean of 20 end-of-file range requests after complete work.
  TextMate returns cached line tokens; Tree-sitter executes range queries. A future
  Tree-sitter token cache could avoid these queries, so this is not scroll FPS.
- `edit_p50_ms`/`edit_p95_ms`: 20 one-code-unit changes in a middle-of-file comment
  (TS) or JSX attribute string (TSX), followed by parse/token refresh for 80 lines.
  Fixture mutation/coordinate lookup is excluded for both. These are deliberately
  local lexical edits, not a comprehensive structural-edit benchmark.
- `peak_rss_mib`: macOS process peak RSS, including fixture storage, parser state,
  retained results and temporary query work. Not live app memory.

Tree-sitter emits semantic capture spans; TextMate emits themed token runs,
including plain regions. Their token counts and coverage differ. Therefore these
are measurements of the current implementations, **not** an equal-feature contest
or evidence that Zed's performance will follow from changing one dependency.

Loading from disk, worker scheduling, progressive document growth, first paint,
font layout, selection and JS/Fabric overhead are excluded from these historical
benchmark tables. Current integration measurements and rollout gaps are recorded
in the linked integration plan.

## Measured results — September 11, 2026

Apple M4, macOS 26.6.1. Medians across three separate-process runs; the edit column
is the median of each run's p50. All times below are milliseconds. Parser setup
is excluded from the timing columns and is recorded separately in the raw data.
No task-owned builds/tests overlapped the final timed runs; external machine
activity was uncontrolled. Treat these as directional local measurements.

| Language | 100k-line fixture | Backend | First 128 lines | Entire file | Local edit p50 | Peak RSS MiB |
|---|---|---|---:|---:|---:|---:|
| typescript | repeated | textmate | 54.2 | 83.2 | 0.005 | 145.9 |
| typescript | repeated | tree-sitter | 396.0 | 767.8 | 79.989 | 237.9 |
| typescript | unique | textmate | 59.7 | 10187.3 | 0.003 | 281.1 |
| typescript | unique | tree-sitter | 447.5 | 817.9 | 82.097 | 238.8 |
| tsx | repeated | textmate | 55.2 | 94.8 | 0.003 | 235.6 |
| tsx | repeated | tree-sitter | 852.6 | 1814.4 | 111.693 | 398.4 |
| tsx | unique | textmate | 53.2 | 15181.5 | 0.003 | 649.3 |
| tsx | unique | tree-sitter | 660.6 | 1435.5 | 73.804 | 397.2 |

Raw 10k/100k results, setup times, end queries and p95 values are checked into
`tests/tree-sitter-benchmark-results.json` for reruns/comparison.

**Conclusion:** this backend completes the unique TS/TSX initial pass much faster,
but is not a universal upgrade. TextMate's repeated-line cache wins the repeated
fixtures. The whole-file Tree-sitter parse delays first highlighting, and local
edits are substantially slower in this prototype. Tree-sitter uses less memory
on these unique fixtures but more on repeated ones. None of this is a claim about
Zed's complete implementation or equal highlighting coverage.

Before making Tree-sitter the default, finish the live rollout checks in the
integration plan. These synthetic results alone are not rollout acceptance;
the Diff migration has its own real-source benchmarks linked above.
