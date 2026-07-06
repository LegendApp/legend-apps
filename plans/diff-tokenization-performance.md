# Diff Tokenization Performance Plan

## Goal

Make large diffs open, scroll, and render with the best practical performance by making syntax work viewport-first, bounded, cancellable, and memory-limited.

The key behavior change is: loading a diff must not automatically start tokenizing the whole document. The viewer should render plain rows immediately, tokenize only the visible/near-visible ranges at high priority, and do any broader prewarm only when the document is small enough and the app is idle.

This plan is based on the current Legend Diff behavior and patterns found while inspecting other diff libraries:

- Avoid full syntax highlighting for massive files/diffs.
- Only do arbitrary range rendering in plain-text mode because highlighted ranges can be syntax-incorrect.
- Use async tasks, deduped work, and bounded LRU caches for expensive syntax artifacts.
- Our current native diff document already supports plain row reads, visible row tokenization, background chunks, and tokenized range notifications, but the default mount path still starts whole-document background tokenization.

## Current Problem

The current viewer starts background tokenization after a loaded diff settles:

```ts
document.startBackgroundTokenization(
  diffBackgroundTokenizeChunkRowCount,
  diffBackgroundTokenizeChunkBudgetMs,
);
```

That background path walks rows until completion:

```cpp
while (backgroundTokenizeNextRowIndex_ < rows_.size() && tokenizedCount < chunkRowCount) {
  ...
  auto tokens = tokenizeRowOutsideDocumentLock(row);
  ...
  rows_[rowIndex].tokens = std::move(tokens);
}
```

For huge PRs, this can create unbounded work and memory pressure even if the user only needs the first screen. It also stores token runs on document rows and in source token caches, which risks duplicating syntax memory.

## Target Behavior

### First Paint

1. Parse/load the diff progressively as today.
2. Render initial rows as plain text.
3. Do not load grammars for every file on mount.
4. Do not start whole-document background tokenization on mount.
5. Start syntax only for the current visible range after the first paint has happened.

### Visible Range Syntax

Add a high-priority tokenization request path:

```ts
document.requestTokenizedRows(start, count, options)
document.requestTokenizedSideBySideRows(start, count, collapsedFileIndexes, options)
```

The request should return quickly. Native should enqueue tokenization work and publish completed row ranges through the existing tokenized-range/version mechanism.

Priority order:

1. Visible rows.
2. Buffered/overscan rows.
3. Current file around the viewport.
4. Optional idle prewarm for small documents only.

The JS runtime should continue using `getPlainRows` / `getPlainSideBySideRows` for immediate rendering, then request tokenization for the same range. When token ranges complete, re-read just affected rendered rows.

### Whole-Document Prewarm

Whole-document background tokenization should become opt-in by policy, not automatic.

Proposed default policy:

- If `document.rowCount > diffSyntaxWholeDocumentRowLimit`, never start full-document prewarm.
- If any file/source exceeds `diffSyntaxWholeFileLineLimit`, do not full-tokenize that file.
- If external syntax memory exceeds `diffSyntaxMemoryBudgetBytes`, stop idle prewarm and evict inactive caches.
- If the user is actively scrolling, pause low-priority prewarm.

Initial constants can start conservatively:

```ts
diffSyntaxWholeDocumentRowLimit = 100_000
diffSyntaxWholeFileLineLimit = 100_000
diffSyntaxMemoryBudgetBytes = 64 * 1024 * 1024
diffSyntaxVisibleChunkBudgetMs = 4
diffSyntaxIdleChunkBudgetMs = 2
```

For the largest diffs, the intended steady state is viewport-only syntax, not eventual full syntax.

### File-Level Tokenization

Keep tokenization source/file scoped. A row maps to a file side:

```txt
(fileIndex, side) -> oldSource or newSource -> lineNumber
```

The current prefix model is correct for syntax state, but it is bad for jumping deep into a huge file. Improve it with source checkpoints:

- Store grammar state checkpoints every `N` lines, for example 512 or 1,024.
- To tokenize a requested window, resume from the nearest checkpoint before the first requested line.
- Tokenize through the requested window within a budget.
- Store tokens only for requested/cached lines, not every line from the checkpoint prefix unless memory allows it.

If TextMate state cannot be cheaply cloned or retained, use this fallback:

- Small files: prefix-tokenize as today.
- Massive files: render deep random-access ranges as plain text until a bounded background job reaches them, or disable syntax for that file by default.

The checkpoint implementation is the best-performance path and should be tested first.

### Cache Policy

Separate stable document rows from syntax caches.

Target native memory model:

- `rows_` stores plain row metadata/text only.
- Returned row copies may include tokens for the requested viewport.
- Persistent syntax tokens live in per-source caches.
- Per-source caches are LRU-managed and evictable.
- Evicting a source cache must not invalidate the diff rows themselves.

Cache key:

```txt
documentId:fileIndex:old|new:language:sourceRevision
```

Eviction should prefer:

1. Sources not currently visible.
2. Sources outside the active overscan range.
3. Oldest touched source.
4. Largest source cache if memory remains high.

Cache stats should distinguish:

- loaded source text bytes
- token cache slots
- tokenized line count
- token run count
- grammar checkpoint count
- row token bytes, which should trend toward zero if row tokens stop being persistent

### Grammar Loading

Replace mount-time `ensureSyntaxGrammarsForPaths(state.files.map(...))` with demand-driven grammar loading.

Priority:

1. Load grammars for visible file paths.
2. Load grammars for overscan file paths.
3. Optionally warm remaining grammars only for small documents.

Grammar loading should be deduped by language and cancellable by document generation.

### Scheduler

Add a small JS scheduler around native token requests.

Responsibilities:

- Track the latest visible source rows for unified and side-by-side views.
- Deduplicate overlapping token requests.
- Cancel or deprioritize old requests when the user scrolls.
- Pause idle prewarm while scroll velocity is high.
- Poll `consumeTokenizedRowRanges()` only while work is pending/running, or replace polling with a native completion event if practical.
- Batch `syntaxStyleStore.refresh(document)` to avoid one React update per chunk.

The scheduler should log request reason:

```txt
visible
overscan
current-file-idle
whole-document-idle
manual
```

## Implementation Stages

### Stage 1: Stop The Bad Default

Change mount behavior so large loaded diffs do not automatically call `startBackgroundTokenization`.

- Keep the old method available for experiments and small-document idle prewarm.
- Add a policy gate around full prewarm.
- Remove the misleading unused `diffBackgroundTokenizeMaxRowCount` constant or actually enforce it.
- Confirm huge Bun PR no longer crashes on initial load.

### Stage 2: Viewport Token Request API

Add native APIs for explicit range tokenization:

```ts
requestTokenizedRows(start: number, count: number, reason: string): number;
requestTokenizedSideBySideRows(
  start: number,
  count: number,
  collapsedFileIndexes: number[],
  reason: string,
): number;
cancelTokenizationRequests(reason?: string): number;
```

Native should:

- Queue ranges by priority.
- Deduplicate overlapping ranges.
- Tokenize chunks on the background thread.
- Publish completed row ranges.
- Avoid holding the main document mutex while tokenizing.

### Stage 3: JS Visible-Range Scheduler

Wire the viewer to request tokenization from visible-range callbacks.

Unified mode:

- Render plain rows immediately.
- Request tokenization for `startBuffered/endBuffered`.
- Re-read affected rendered rows when token ranges complete.

Side-by-side mode:

- Map side-by-side visible rows to source row indices.
- Request tokenization for the source rows behind visible side-by-side rows.
- Avoid tokenizing collapsed files.

### Stage 4: Memory-Bounded Source Cache

Move persistent syntax storage out of `rows_` and into source-level caches.

- Stop persisting tokens in `rows_[rowIndex].tokens` for background work.
- Return tokens on row copies for requested rows.
- Add source-cache LRU with memory accounting.
- Add explicit cache eviction and cache stats.
- Re-read source text on demand if an evicted source becomes visible again.

This is the main memory win.

### Stage 5: Checkpointed File Tokenization

Add grammar-state checkpoints for deep file jumps.

- Store checkpoints at fixed intervals.
- Resume from nearest checkpoint for requested visible windows.
- Keep checkpoint count bounded.
- Fall back to plain text for massive files if checkpointing is not viable.

This is the main scroll-to-end win.

### Stage 6: Idle Prewarm For Small Documents

Reintroduce broader prewarm only when it is cheap.

Rules:

- Only after first paint and initial visible syntax have completed.
- Only below row/file/source thresholds.
- Only while scroll is idle.
- Stop when memory budget is reached.
- Stop when the document is hidden or replaced.

## Instrumentation

Add counters that make the behavior obvious:

```txt
syntax.requests.total
syntax.requests.visible
syntax.requests.overscan
syntax.requests.idle
syntax.requests.cancelled
syntax.rows.requested
syntax.rows.tokenized
syntax.rows.renderedWithTokens
syntax.rows.renderedPlain
syntax.sources.loaded
syntax.sources.evicted
syntax.sourceLines.loaded
syntax.sourceLines.tokenized
syntax.sourceCheckpoints.created
syntax.cache.bytes
syntax.cache.evictions
syntax.grammar.loads
syntax.grammar.loadMs
syntax.chunk.totalMs
syntax.chunk.documentLockMs
syntax.chunk.syntaxLockMs
syntax.chunk.reason
syntax.memory.externalBytes
```

For the specific previous question, include:

- number of items/rows looped
- number of positions/rows calculated
- number of tokenization requests
- number of source lines actually tokenized
- number of rendered rows that got tokens

## Validation

Use the Bun PR as the primary regression test.

Measure before/after:

- time to first visible rows
- time to first syntax on visible rows
- peak app RSS
- native external memory
- JS heap if available
- scroll-to-end latency
- scroll-to-end tokenization work
- total rows tokenized after 5 seconds idle
- cache evictions after scrolling through many files
- whether the app survives repeated open/close

Expected outcome for huge diffs:

- no crash on load
- no whole-document tokenization by default
- visible rows render immediately as plain text
- visible syntax fills in progressively
- scrolling to the end does not require tokenizing every earlier file
- scrolling through every file does not retain every tokenized file forever

Automated checks:

- native tests for source range queue dedupe
- native tests for cache eviction
- native tests for large-document policy
- JS tests for scheduler request reasons and cancellation
- existing diff parser and app typecheck gates

Suggested validation commands:

```sh
bun run test:diff --runInBand
bun run test:diff-parser --runInBand
bun run test:syntax-parser --runInBand
bun run test:diff-parser:native
bun run typecheck
bun run diff verify macos
```

Runtime validation should use the app-scoped macOS debug app and explicit Diff Metro port.

## Rollout

1. Land Stage 1 first because it removes the OOM trigger with minimal behavioral risk.
2. Land Stage 2 and Stage 3 together if the JS scheduler needs the new native API.
3. Land Stage 4 separately because it changes memory ownership.
4. Land Stage 5 separately because checkpointing is correctness-sensitive.
5. Land Stage 6 last, after the viewport path and memory caps are proven.

Each stage should include instrumentation before changing heuristics so perf regressions are attributable.

## Open Questions

- Can `TextMateStateStack` be safely copied and retained as a checkpoint?
- Should massive files default to plain text forever, or allow opt-in syntax for the current file?
- What memory budget should apply to syntax caches on macOS debug vs release builds?
- Should token completion be exposed as a native event instead of polling?
- Should source text also be evicted, or only token/checkpoint caches?
