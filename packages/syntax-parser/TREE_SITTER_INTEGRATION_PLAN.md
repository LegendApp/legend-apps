# Tree-sitter diagnosis and integration plan

Status: implementation in progress; the user has approved a complete shared
Tree-sitter replacement across languages and consumers. There are no legacy
users to preserve. TextMate is still present while coverage is built, but a
permanent dual-backend/fallback product is explicitly NOT the target.

implementation_status: in-progress

# Run Log

- Started: 2026-09-11. User approved: “Ok, do the full integration plan.”
- Start state: branch `codex/code-editor`, commit `341819c23eddc1927272b2ee3c57ced7246ee23a`; existing evaluation, any-text-file, and startup diagnostic changes preserved.
- Implementation follows the five ordered acceptance gates below; no commits requested.
- Implemented: worker-owned mirror, indexed LF coordinates, prefix-first loading, revision validation, cancellation/resumable parsing, compact retained row tokens, theme palette and selectable backend.
- Queries: vendored pinned upstream JS/TS highlights; added predicate handling, TSX refinements, scratch reuse and conservative lexical-dependency invalidation.
- Slides: added a shared native-edit snapshot journal, isolated editor/preview subscriptions, and moved slide-index scanning into the Bun compiler process. Save/conflict/stale-preview coverage added.
- Runtime: built Code Debug after refreshing pods. Exercised generated 10k/100k/1m-line files, first screen, EOF jumps, multiline/template edits, undo and scrolling. Repository-file reading hit a confirmed macOS Documents permission prompt; asked the user to approve, without changing permissions.
- Performance follow-up: fixed identical mirror-chunk treap seeds and repeated predicate-reader copies; a three-run paired native comparison reduced median complete query time from 3713.8 to 547.4 ms on the same 102,400-line chunked fixture.
- Validation: Code/Slides verification, typecheck, 112 Slides tests, 41 source-editor JS tests, 14 Code tests, 11 syntax-parser JS tests, query embedding check, standalone Tree-sitter tests and all eight native source-editor executables passed. Native tests cover load/edit/undo/cancellation/replacement, UTF-16/CRLF, themes and fallback.
- Review: audited all parser input lifetimes and preview callers; added event ownership/stale revision tests and exported/function declaration rename invalidation tests. Preserved pre-existing diagnostics and unrelated any-text-file changes; no signing identity or permission changes.
- Final confidence check: added native Tree-sitter IME commit/undo and explicit MDX fallback-selection coverage; corrected the standalone harness's explicit undo grouping and reran all native executables successfully. The latest Code Debug build was reopened on the 10k fixture after the million-line tests.
- Scope update, 2026-09-11: user requested closing other-language gaps and removing parallel approaches; existing opt-in rollout advice below is superseded by the replacement target immediately below.
- First language-coverage batch: added a pinned manifest shared by vendoring, embedded registry/queries, native test builds and the podspec; JavaScript/JSX, JSON/JSONC/JSONL, CSS and Python now use the existing TS/TSX worker path.
- Correctness: fixed import-alias/destructuring-key confusion, catch/single-arrow bindings, class names and var hoisting; inspect old and new trees when invalidating removed program bindings. Replaced TS-only native theme mapping with shared capture categories and per-language root scopes.
- Native isolation: enriched-markdown embeds its own Tree-sitter. Prefixed all runtime/grammar exports, added export auditing and a passing test linking and running both prefixed and unprefixed copies.
- Validation this batch: standalone multi-language and isolation tests passed; all eight native source-editor executables passed, including new language-switch and themed-row assertions. Podspec Ruby syntax and query-registry freshness checks passed. Bun typecheck and pod refresh stalled in startup filesystem open before executing their scripts; native app rebuild is not yet verified for this batch. Asked about an OS access prompt without changing permissions.
- Markdown/MDX follow-up: added pinned Markdown block/inline, YAML and native MDX grammars. Embedded syntax uses range-constrained queries, included ranges, lazy incremental child trees, stable scoped capture IDs, bounded caches/history and cancellation. No second highlighting engine was added.
- Existing-deck compatibility: the upstream MDX grammar rejects Slides' HTML-style notes; added a reproducible two-rule grammar extension with pinned CLI 0.25.10/ABI 14. All four example decks now parse without syntax errors; the real talk deck uses recovery for a missing semicolon before initial JSX, with no emitted zero-width highlighting span.
- Validation: composition/alias/theme/boundary/cancellation/cache tests, 100 randomized edit/undo cycles per Markdown/MDX native worker, native AppKit language switching, and real example/talk-file first/middle/end edit comparisons passed. All eight native editor executables and the syntax/isolation suite passed again. Bun typecheck/pod-refresh retries still stalled before script execution and were stopped; no app rebuild claim.

## Approved replacement target and remaining sequence

This is one migration, not two products. Keep the existing engine only as a
temporary implementation dependency until the coverage/consumer work is ready;
do not add compatibility settings or promise to maintain both engines.

- [x] Shared pinned grammar registry, query inheritance, aliases and reproducible native compilation.
- [x] Initial additional-language batch: JS/JSX, JSON/JSONC/JSONL, CSS and Python, alongside TS/TSX. Grammars/queries initialize lazily, not all at editor startup.
- [x] Native symbol isolation; common lexical-binding and theme mapping fixes; incremental/fresh-parse and viewport consistency fixtures.
- [x] Markdown block/inline, document-leading YAML frontmatter, registered fenced languages and MDX JSX/expressions/imports; HTML-style notes, GFM table cells and absolute UTF-16 edit/capture coordinates. YAML is also a standalone grammar.
- [ ] Remaining catalog grammars: C, C++, Objective-C, Objective-C++, Go, Rust, Swift, Kotlin, Java, Ruby, shell, TOML, Dockerfile, HTML, XML and SCSS. Evaluate each grammar/query and required predicate semantics with real-file, edit and malformed-input fixtures. Do not map dialects to an incompatible grammar merely to tick a box.
- [ ] Remaining composition/dialect work: HTML script/style, TOML frontmatter and Slides-specific per-slide YAML blocks. Standard Markdown/MDX frontmatter is implemented; arbitrary `---` sections are not assumed to be YAML.
- [ ] Shared consumer migration: replace TextMate state-stack tokenization in `HybridSyntaxDocument` and `HybridDiffDocument`; preserve consumer scheduling choices (background Code/Slides, on-demand Diff) on this single engine.
- [ ] Theme/assets cleanup: retain standard VS Code theme-file compatibility, decouple its scope resolver from TextMate grammar construction, and remove TextMate grammar-download/installation UI and settings.
- [ ] Performance/correctness acceptance on representative real files, embedded syntax, long logical lines and structural edits. Verify Code, Slides, Diff and Markdown consuming paths. Do not promise universal sub-millisecond full parses.
- [ ] Final cutover: remove the backend selector, TextMate tokenizers, TextMate/Oniguruma native dependency/build plumbing, bundled grammar JSON and obsolete comparison tests/settings. Plain text for genuinely unknown file formats is not a second highlighting engine.

Ten of the existing 26 catalog entries are now covered by ten compiled grammars
(JS and JSX share one grammar; Markdown inline is an auxiliary grammar). This is coverage progress, not
completion of the replacement. The rest of this document retains the earlier
measurements and implementation history; references to opt-in/fallback describe
that historical or interim state, not the approved end state.

## What the measurements actually say

The previous 74–82 ms figure combined multiple phases and used 100,000 independent
top-level declarations. It should not be treated as typical typing latency or as
evidence that our incremental reuse is broken.

New measurements separate `edit`, `parse`, and visible-range `highlight`. Apple M4,
macOS 26.6.1, optimized native code, three processes per local-edit case, each with
20 edits. Table values are medians of per-process medians, milliseconds. Source
mutation, coordinate lookup, worker dispatch and drawing are excluded. The new
synthetic declarations omit the previous fixture's `export`; this is diagnosis,
not a claimed before/after optimization. Raw data: `tests/tree-sitter-edit-diagnosis.json`.

| Document | Edit location | Adjust tree | Incremental parse | Query/construct visible spans |
|---|---|---:|---:|---:|
| 100k flat declarations | Start | 0.0020 | 38.20 | 0.175 |
| 100k flat declarations | Middle | 0.0033 | 39.82 | 0.177 |
| 100k flat declarations | End | 0.0011 | 38.25 | 0.013 |
| Same declarations, functions of 100 each (102k lines) | Start | 0.0008 | 0.227 | 0.132 |
| Same nested fixture | Middle | 0.0008 | 0.220 | 0.127 |
| Same nested fixture | End | 0.0005 | 0.235 | 0.002 |
| Real DiffViewerWindow.tsx, 5,616 lines | Start | 0.0008 | 0.038 | 0.090 |
| Same real file | Middle | 0.0010 | 0.037 | 0.102 |
| Same real file | End | 0.0011 | 0.057 | 0.006 |

End-of-file queries contain fewer than 80 remaining lines; they should not be
compared as equal-size query workloads. Local synthetic edits change a comment
character; real-file edits replace an ASCII letter near the selected location.
Every final edit/undo state is checked against a fresh full parse and highlight.
Real fixture SHA-256: `2b53bedaa1d4ced6fbb5cf501dece099f69097fe884da230d54725f91cae118a`.

### Cause of the pathological case

Only **one 4,096-code-unit reader chunk** is requested per synthetic local edit.
Tree-sitter is reusing syntax; it is not reading/relexing the entire file.
A separate 3-second CPU sample found 2,033 of 2,320 samples inside
`ts_parser_parse_with_options`. Of the total, 740 were in the tree-compression
branch (`ts_subtree_compress` / `ts_subtree_summarize_children`) and 668 in the
parser-reduction branch, including allocation and stack work.

The evidence points to rebuilding/balancing long flat repetition structures in
the grammar/runtime, not our UTF-16 reader, query color work, `ts_tree_edit`, or
failure to supply the previous tree. Grouping the same declarations into functions
reduces this cost by roughly two orders of magnitude. Do not arbitrarily split a
real file into independent syntax trees to mask the problem: that can lose scope,
cross-boundary syntax and injection correctness.

I also tested Zed's current Tree-sitter revision
`43623ec9bf0eaaf7113285c46e8a09018f181b18` against our v0.25.10, with both runtimes
compiled at `-O3`, retaining our same TS grammar. Three alternating runs measured
about 36–39 ms versus 39–42 ms on the flat middle-edit fixture. A runtime upgrade
alone is not a demonstrated fix. This does not compare Zed's grammars or app.
[Zed dependency configuration](https://github.com/zed-industries/zed/blob/main/Cargo.toml)

### Worst cases still matter

Opening a block comment before code can invalidate a large suffix. A separate
20-operation insert/undo test measured ~19.6 ms parsing in the large nested file
and ~2.27 ms near the beginning of the real file. Newline insertion in the nested
fixture remained ~0.22 ms. A universal sub-millisecond parse guarantee is not
realistic. The input path must not depend on parsing finishing.

An isolated 128-line prefix parsed in ~0.28 ms, excluding parser/query construction,
highlight extraction and drawing. Existing setup measurements are several ms:
cache immutable grammar/query setup off the UI thread instead of paying it for
every prefix or file. The prefix experiment supports a startup strategy, not an
end-to-end first-paint guarantee.

## Recommended architecture

### 1. Separate document, parser and rendering ownership

- Keep the existing native input client, undo, UTF-16 coordinates, stable logical
  line IDs and LegendList. Do not replace them to adopt Tree-sitter.
- No parsing, whole-document string conversion, or worker waits in native input
  event handling. Send ordered revisioned edits/appends to one parser owner.
  Build edit coordinates from SourceDocument's indexed position lookup; the
  diagnostic harness's linear coordinate scan is explicitly outside its timers
  and must not be copied into the integration.
- Start with a worker-owned mirror fed by bounded immutable load chunks and edit
  transactions. Our SourceDocument is a mutable unique-owner treap, not a cheap
  immutable snapshot: never hand its live pointer to a concurrent parser. Share
  immutable text storage where practical; measure the mirror's memory overhead.
  Consider a persistent/COW document representation only if those measurements
  justify that broader buffer change. Never copy the whole document per keystroke.
- Keep one active parse per document; coalesce scheduling, not edit semantics.
  Preserve the ordered edits needed to map old trees/results into new versions.

### 2. Prefix-first startup

- Show editable text independently of syntax. Parse visible lines plus lookahead
  from the beginning, with both byte and line caps, on a high-priority worker.
- Use a separate prefix parse followed by a full-file parse; duplicating this
  small amount of work is fine. Query setup can be shared; mutable parsers cannot.
- Publish prefix colors as provisional. A truncated construct may change colors
  after full parsing. Do not split surrogate pairs at the byte cap.
- Prioritize prefix completion before starting heavy full-file work. During
  streaming, aggregate tail arrivals instead of repeatedly parsing every larger
  prefix. Full work must not starve initial paint or foreground range queries.
- Opening at an arbitrary middle-file offset is different: isolated parsing has
  no reliable preceding context. Keep that provisional or plain until the full
  tree is available, rather than claiming exact colors.

### 3. Incremental worker scheduling

- Apply edits and reparse against the previous tree. Start fully asynchronous;
  the measured normal cases are fast enough to target same-frame publication
  without introducing a main-thread wait.
- Add an optional tiny synchronous fast path only if UI measurements show a real
  benefit and prove a bounded input cost. Zed's default 1 ms parsing budget is not
  a hard limit on every operation surrounding parsing.
- Use deadline/progress checks for costly work, and cancellation for closed or
  replaced documents. Parser callbacks are cooperative, not hard preemption.
- Our current wrapper discards continuation state after cancellation. A resumable
  ParseJob must own its immutable input and parser state until completion. Resume
  only with the same input snapshot; reset/apply ordered edits before switching
  to a newer snapshot. Avoid endlessly restarting on every keystroke.
- Cache immutable grammars/queries and reuse per-worker parsers. Do not add a
  fixed debounce to ordinary syntax edits; prioritize typing/visible-range work
  over bulk highlighting and MDX preview compilation.
[Zed buffer scheduling](https://github.com/zed-industries/zed/blob/main/crates/language/src/buffer.rs)

### 4. Preserve colors and publish only affected results

- Replace the current global `_syntaxNextLine` rendering gate with per-line/range
  validity. Currently `applySyntaxToText` hides every line beyond that frontier,
  even when `_highlightedRows` still contains useful cached tokens.
- Preserve/reposition unaffected spans immediately. Keep provisional styling in
  the edited region where safe; never clear the whole downstream file while a
  worker catches up. Stable line IDs must survive range edits and undo.
- Invalidate the union of actual edited ranges and Tree-sitter changed ranges,
  expanded for query/ancestor/local-scope/injection dependencies. Structural tree
  changes alone do not cover every text-sensitive highlighting change.
- Validate document generation, revision and touched-line versions when publishing.
  Rebase only results whose validity is provable; discard conflicting regions.
- Query visible affected ranges first; prehighlight the rest in bounded background
  batches as Code requested. Keep this policy optional for other consumers.
- Store compact capture/style IDs, not a color string per token. Resolve theme
  styles once; a color-theme change should not require reparsing syntax. Retain
  glyph layout unless text, metrics or font traits actually change.
  Reuse worker-owned query cursors/scratch capacity and measure allocations: for
  normal real-file edits, the ~0.10 ms span-query stage exceeds parsing itself.
- Notify/invalidate only mounted rows whose runs changed. No full token arrays
  over the JS bridge, global editor state churn, or whole-list refresh per batch.

### 5. Close coverage and consumer gaps before changing defaults

- Complete the shared grammar registry for the entire supported language catalog,
  validating queries, predicates, themes and dialects rather than treating TS/TSX
  as the product boundary. The developer backend switch is temporary scaffolding.
- Implement and validate Markdown/frontmatter/JSX injections, migrate all shared
  consumers, then remove TextMate and the switch. Unknown formats may remain plain
  text; no permanent alternate syntax engine or legacy settings migration is needed.
- Slides constructs a full JS draft on every change and derives slide boundaries
  from that draft during render. These are source-inspection risks, not measured
  bottlenecks in this investigation. React Compiler is enabled and may cache work
  for selection-only updates; changed drafts still need attention. Profile these
  paths, keep the native text authoritative, materialize revisioned snapshots for
  save/debounced preview, and derive a slide index by document revision rather than
  caret motion. Isolate selection/preview subscriptions from the source editor.
- Leave Diff's on-demand policy unchanged. Share native infrastructure without
  forcing every consumer to retain a fully highlighted document.

## Implementation order and acceptance gates

1. Add opt-in native worker/mirror and revision protocol; test edits during load,
   cancellation, undo, IME, file replacement and native view recycling.
2. Add preserved per-line tokens and affected-range publication; test same-shape
   renames, newline shifts, multiline comments, JSX, template strings and themes.
3. Add bounded prefix startup and cached grammar/query setup; test incomplete
   cutoff constructs and edits while full parsing is underway.
4. Complete TS/TSX query/theme coverage and run the live Code comparison; address
   measured glyph/layout, reader, token allocation or scheduler bottlenecks.
5. Profile/fix Slides' draft/preview overhead and validate its fallback; expand
   language coverage and consider default selection only after validation.

Targets, not guarantees: no syntax waits on the input thread; p95 syntax-related
input-handler overhead below 1 ms on the reference machine; no regression in
editable first paint; ordinary edit-to-correct-highlight p95 within one display
frame on representative files; stable colors during slower structural parses.
Record p50/p95/p99, missed frames, time to correct colors, memory, CPU and queued
revisions—not just average parser time. Test rapid typing/undo and starvation,
start/middle/end edits, 10k/100k/1m lines, flat/nested/real code, giant lines,
incomplete source, UTF-16/CRLF boundaries, resizing/wrapping and far scrolling.

Do not hide a regression behind background scheduling, and do not promise every
file or every edit will parse in 1 ms. Keep the pathological flat fixture as an
upstream optimization target, not the sole proxy for an editor's typing latency.

## Reproduce

`bun run benchmark:syntax-parser:edits` builds the pinned backend, runs native
correctness tests, then the phase/structural benchmarks. The emitted native
artifact directory contains `edit-benchmark`. A focused CPU profile can run
`edit-benchmark flat 100000 middle profile`; it prints its PID for an app-scoped
`sample <pid> 3 1 -file <output>` capture. Sampling runs are separate from timings.
The diagnosis originally changed only benchmarks/tests/reports. The following
sections record the now-implemented native and consumer integration.

# Diagnosis

- Composition gap: Markdown inline formatting and fenced languages need separate grammar regions; simply treating MDX as Markdown loses JSX/JavaScript boundaries. The dedicated MDX grammar supplies those boundaries, with Markdown-inline and YAML/fenced parsers sharing the existing worker and native snapshot.
- Viewport cost risk: manually traversing all section siblings would make a viewport query proportional to file length. Embedded-region discovery now uses a range-constrained TSQuery; a 5,000-paragraph fixture verifies first-window highlighting does not read or parse the tail fence.
- Replacement gap: the implementation hardcoded TS/TSX in three places and mapped all capture palettes to `source.ts`; other catalog entries and shared Diff consumers still tokenize with TextMate. A manifest-driven registry and per-language scopes remove that structural restriction; remaining grammars/injections and consumer migration are now required, not optional fallback coverage.
- Native linking risk: enriched-markdown embeds unprefixed Tree-sitter exports too. The build now isolates ours at the C-symbol boundary and tests coexistence, rather than relying on static archive link order.
- Query bugs: imported source names/destructuring keys were mistaken for local bindings, while catches, single-arrow parameters, class names and block-nested var declarations were missed. Binding-pattern traversal now distinguishes declarations from expressions and hoists var only across non-function scopes.
- Problem: large-file syntax work could delay initial colors or temporarily hide already-highlighted offscreen content; Slides also reconstructed its draft and scanned slide boundaries on frequent editor updates.
- Cause: syntax visibility depended on a single global frontier, the evaluator had no editor worker/publication protocol, and Slides treated every native transaction as a new whole-source string. Initial integration profiling also exposed repeated chunk seeds and 4K predicate reads for adjacent tiny identifiers.
- Solution: keep input ownership native, publish version-checked per-line results from an independent worker, preserve provisional colors, reuse bounded input/query scratch, and defer Slides snapshots and indexing to preview/save and the compiler process respectively.

# Changes

## Markdown/MDX grammar composition

Added dedicated grammars, lazy included-range parsing and stable per-language capture scopes without putting text parsing on the UI thread.

File: `packages/syntax-parser/tree-sitter-grammars.json:40`

```diff
+ "name": "markdown"
+ "name": "markdown-inline"
+ "name": "yaml"
+ "name": "mdx"
```

`TreeSitterHighlighter::highlight` queries intersecting embedded regions and caches up to 128 child trees, applying pending native edits before reuse. A generated capture catalog prevents newly visited fences from changing IDs; native palette setup resolves each capture's language scope and copies the catalog only once per worker. The vendor extension for HTML notes changes grammar rules, not generated C by hand. Full generated parser and implementation diffs are omitted here.

## Shared language registry and native isolation (replacement follow-up)

Removed the hardcoded two-language branch; native builds and query generation now use the same pinned inventory.

File: `packages/syntax-parser/cpp/TreeSitterHighlighter.cpp:109`

```diff
- return language == "typescript" || language == "tsx";
+ return findLanguage(language) != nullptr;
```

File: `packages/syntax-parser/RNSyntaxParser.podspec:62`

```diff
+ "OTHER_CFLAGS" => '$(inherited) -include "$(PODS_TARGET_SRCROOT)/vendor/tree-sitter/Symbols.h"',
```

The manifest also supplies aliases, root scopes and query inheritance. The generated symbol header covers the runtime and every grammar/scanner, with export auditing and an independent coexistence-link test. Full vendor/generated diffs are omitted here.

## Language-aware palette and query regression coverage

Removed the TypeScript-only root scope and fixed common JS/TS lexical binding cases, including invalidation after removing a declaration.

File: `packages/source-editor/macos/SourceInputView.mm:322`

```diff
- scopes.push_back({"source.ts", scope});
+ auto scope = syntax::TreeSitterHighlighter::themeScope(capture);
+ scopes.push_back({worker->rootScope()});
+ if (!scope.empty()) scopes.back().push_back(std::move(scope));
```

The native tests now assert captures/aliases, first/middle/end edits and undo, clipped viewport consistency and 54 JS/TS/TSX binding cases. The AppKit scheduler tests switch among the added grammars and assert colored rows without constructing a TextMate highlighter.

## Worker ownership and prefix-first startup

Added the shared opt-in worker without replacing native input, undo or LegendList.

File: `packages/source-editor/cpp/SourceTreeSyntax.hpp:22`

```diff
+ class SourceTreeSyntax {
+   SourceDocument document_;
+   std::unique_ptr<tree::TreeSitterHighlighter> parser_;
```

File: `packages/source-editor/macos/SourceInputView.mm:364`

```diff
+ const BOOL prefix = !_treePrefixDone;
+ if (!prefix && !_startupDrawn) return;
+ size_t count = MIN(prefix ? 16384 : 262144, _document->length() - offset);
+ if (prefix && _document->lineCount() > 128) count = MIN(count, _document->lineOffset(128));
```

The UI copies bounded immutable chunks; a serial worker owns the mirror, read
window and parser. Indexed LF positions avoid scanning the prefix on edits.
Cooperative 4 ms parse slices retain progress while the mirror stays frozen;
queued transactions run in order after that job, not concurrently with its reads.
There is no synchronous parser wait in input handling. Tail arrivals aggregate
until loading completes rather than triggering a full parse per arrival.

## Retained tokens, queries and themes

Removed the global TextMate rendering frontier and added compact Tree-sitter
row tokens with visible-range priority and optional bounded background batches.

File: `packages/source-editor/macos/SourceInputView.mm:427`

```diff
+ if (revision == self->_treeRevision && parse) {
+   if (invalidated.second > invalidated.first) {
+     self->_treeNextLine = MIN(self->_treeNextLine, invalidated.first);
+     self->_treeDirtyEnd = MAX(self->_treeDirtyEnd, invalidated.second);
+   }
```

File: `packages/syntax-parser/cpp/TreeSitterHighlighter.cpp:101`

```diff
+ std::vector<Capture> captureScratch;
+ std::vector<Event> eventScratch;
+ std::vector<ActiveCapture> activeScratch;
```

Pinned JS/TS query sources, compiled predicates and immutable queries are shared;
mutable parsers/cursors stay worker-local. Changed ranges include text-sensitive
edits and conservative ancestor/binding dependencies. Existing colors remain
visible during reparsing. Theme changes resolve a palette, not a new syntax tree.
Unsupported formats (including MDX) retain TextMate; unknown formats stay plain.

## Slides editor snapshots and index

The reusable journal accepts ordered UTF-16 edits without copying the whole file;
save/preview materializes one derived snapshot and protects in-flight edits.

File: `apps/slides/src/DeckEditor.tsx:25`

```diff
- const source = session.getSnapshot().source;
- session.edit(source.slice(0, edit.offset) + edit.insertedText + source.slice(edit.offset + edit.removedLength), edit.revision);
+ session.applyEdit(edit);
```

File: `packages/source-editor/src/SourceSnapshot.ts:7`

```diff
+ export class SourceSnapshot {
+   private source: string;
+   private edits: Edit[] = [];
+   private length: number;
+   private revision = 0;
```

File: `scripts/compile-slides.ts:12`

```diff
+ let sourceSlideEnds: number[] | undefined;
+ if (source !== undefined) {
+   try { sourceSlideEnds = getDeckSourceStructure(source).slides.map((slide) => slide.end); }
+   catch { /* Keep the last useful index while frontmatter is incomplete. */ }
+ }
```

Source, toolbar, preview and status subscribe independently. Caret selection uses
a binary search over the cached slide index, never a source parse. Ordinary edits
rebase the index provisionally; a matching compiler result replaces it. A stale
result or incomplete frontmatter cannot overwrite the current useful index.

Other implementation details and test additions are omitted from these focused
snippets. The live launch check also fixed Code selecting its own macOS executable
as a document after broadening accepted text filenames.

# Result

The original opt-in path is implemented and ran in Code. Replacement follow-ups
now include Markdown/MDX composition and ten compiled grammars covering ten catalog
entries, shared scope mapping and isolated native linkage; native tests pass. Full migration is NOT complete:
remaining languages/dialects, shared Diff consumers and TextMate deletion are
tracked above. No commits were made. This follow-up has not been rebuilt in the
app: Bun pod refresh/typecheck are stalled before their scripts start.

## Native input-to-layout measurement

Optimized AppKit harness, 10k distinct flat TS declarations, 50 insert/undo pairs
at each location. These include native input and updated row layout, **not actual
screen-presented frames, React scheduling, or a universal latency guarantee**.

| Location | Input p50 / p95 / p99 (ms) | Edit-to-layout p50 / p95 / p99 (ms) |
|---|---:|---:|
| Start | 0.045 / 0.071 / 0.080 | 3.560 / 4.275 / 4.583 |
| Middle | 0.044 / 0.055 / 0.094 | 3.819 / 4.578 / 4.838 |
| End | 0.042 / 0.052 / 0.094 | 3.541 / 3.854 / 4.234 |

Reproduce: `bun run test:source-editor:native --measure`.
Transient raw log: `/tmp/legend-tree-native-final2.log`.

## Markdown/MDX verification

`/tmp/legend-markdown-syntax-final.log` and `/tmp/legend-markdown-native-final.log`
record the passing standalone/composition/isolation and all-eight-executable native
suites. Real decks are loaded from their actual repo files; start/middle/end edits
and undo are compared with fresh complete highlighting. Four example decks plus
the 47,345-UTF-16-unit talk deck passed. One warmed native test run parsed/queried
the complete talk in ~4.46 ms; example decks took ~0.20–0.85 ms. These are single-run
backend timings excluding I/O, AppKit, JS and display—not startup/frame claims.

Additional coverage: 7-unit UTF-16 reads across surrogate pairs and CRLF, literal
code versus JSX, document YAML, known/unknown fence languages, note comments,
table formatting, language-label/boundary edits, cached/evicted regions, 256-edit
history rollover, cancellation midway through a cold fence and retry. Native
AppKit tests assert Markdown/MDX tokens without creating a TextMate highlighter.

## Worker query and memory check

Same native `-O2` 102,400-line fixture, 800 independently appended 128-line chunks,
512-line query batches; three alternating before/after processes, 1,433,600 tokens
in both. Median query pass: **3713.8 → 547.4 ms**. Parse: 416.5 → 389.1 ms (no
claimed parser algorithm improvement). This compares integration variants, not
Tree-sitter against TextMate or production frame times.

An isolated post-fix process peaked at ~34.1 MiB after constructing the mirror,
~232.6 MiB after parsing, ~234.2 MiB after querying without retaining all rows.
The syntax tree dominates that case; COW text storage would not eliminate most of
the memory cost. Live Debug Code with one million repeated 65-byte lines settled
around 3.0 GiB RSS and eventually idle CPU. This remains a stress limitation.

Transient raw logs: `/tmp/legend-tree-chunk-comparison.log` and
`/tmp/legend-tree-chunk-memory.log`; the benchmark is in
`packages/source-editor/tests/SourceTreeSyntax.test.cpp` and runs with `--measure`.

## Live and Slides checks

- Live Code: generated 10k, 100k and 1m lines; colored first screen and EOF, edits
  with template substitutions/multiline comments, undo and scrolling. Existing
  colors remained visible while background work continued.
- Million-line Debug load: native prefix ready in ~1.2 ms, first native row draw
  in ~127 ms, stream/index complete in ~4.04 s. Timed from native load request,
  not process launch; not a frame-presented or fully-highlighted-file metric.
- Slides microprobe (Bun, not Hermes/UI): 100 native journal events in a 20,001-line
  synthetic deck took ~0.082 ms; one materialization ~0.627 ms. The ~62 ms slide
  scan in that probe now runs in the compiler process, not on the editor thread.
- Automated Slides coverage verifies compiler-returned offsets, stale previews,
  edits during saves, conflicts, draft-only compilation and caret-motion behavior.
  Native TextMate tests cover actual MDX/frontmatter grammar and edits.

# Remaining Risks

- Current batch: all native source-editor executables and standalone query/isolation tests passed (`/tmp/legend-tree-multilang-native-final.log`, `/tmp/legend-tree-multilang-syntax-final.log`); podspec syntax, C++17 compilation and registry freshness passed. Typecheck, pod regeneration and a native app rebuild still need to run after the Bun startup file-open stall is resolved. The two stalled task-owned Bun processes were stopped after sampling, not left running. The already-built Code app does not yet contain the new grammars.
- Single-engine replacement remains in progress: 16 catalog entries, remaining dialect/composition work, non-editor consumers and removal of TextMate/native asset plumbing remain. Unknown formats may remain plain text; unsupported known languages must not be silently claimed as covered.
- Rollout gate remains open: no actual presented-frame/missed-frame distribution
  or same-workload live TextMate-vs-Tree-sitter comparison has been recorded. The
  native harness proves a fast input path, not Zed-equivalent UI latency. Keep
  the backend opt-in until that comparison is measured on representative files.
- Repository-file live checking stopped at a confirmed macOS Documents permission
  request (`fopen` blocked before any parser work). The user was asked to approve;
  no permissions or signing identity were changed. Retry the repository-file run
  after approval; generated `/tmp` fixtures were tested independently.
- A million-line flat file remains expensive in memory and full background work;
  a global declaration rename can conservatively rehighlight the entire program.
  Preserved colors and viewport priority keep input usable, but new exact colors
  can lag during costly structural edits. Do not promise every edit under 1 ms.
- Builtin-shadowing predicates are syntactic, not a semantic resolver. Common
  hoisting/import-alias/catch/class cases now have fixtures; broader language and
  dialect query coverage remains. Markdown/MDX now work on the Tree-sitter path;
  the default backend remains unchanged until the complete consumer migration.
- Giant logical lines still use the existing full-line AppKit layout (~19–21 ms
  for 100k UTF-16 units in the native stress test); visual-row virtualization of
  one line is a separate buffer/layout project, not fixed by changing parsers.
- Slides' changed compiler/session paths passed automated tests, but this turn
  did not rebuild and interact with the Slides app from this worktree. Its MDX
  backend is unchanged; native fallback selection and real grammar are tested.
- Existing temporary startup instrumentation was deliberately preserved. Remove
  it separately after the remaining UI measurements; it logs metadata, not text.

# Self Review

- Markdown/MDX: reviewed included-range clipping, cache/history bounds, edit replay, reader lifetimes, stable capture IDs, lazy traversal and cancelled retry. Real source files and native edit/undo/style paths pass. The grammar extension is explicit and reproducible. Remaining caveats are app rebuild/typecheck (Bun stall), per-slide YAML dialect support and upstream MDX recovery; this is syntax highlighting, not a validator.
- Replacement batch: high confidence in compiled grammar/query/worker coverage, not whole migration readiness. Reviewed aliases, query inheritance, stale binding invalidation, native symbol exports and root-scope mapping. Re-ran native scheduling/color tests; no changes to input ownership, Diff scheduling, signing or permissions. Build/typecheck validation is explicitly incomplete because the Bun launcher stalls before running scripts.
- Confidence: 90% in the opt-in integration and snapshot fixes, not full rollout closure | Good: native input never waits for syntax; stale results cannot replace current tokens or previews. | Caveat: exact colors may lag in pathological files and the live frame-latency/default-switch gate is still open.
- Scope: implements the approved native worker, prefix, retained-token, query/theme and Slides consumer work without changing LegendList, Diff policy, signing or the default backend.
- Tests: native randomized edit/fresh-parse comparisons, load/undo/IME/replacement/fallback coverage, JS/compiler suites, typecheck, verification and Code Debug runtime checks; no release build.
- Follow-up: resolve the host validation stall, finish the replacement checklist above, validate representative live files, then remove TextMate and the backend selector. The user has already chosen a single-engine end state; this is no longer an open product decision.
