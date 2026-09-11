# Diff Tree-sitter migration

## Architecture

Diff's native unified/side-by-side rows now use Tree-sitter, as do merge preview
strings. No Diff tokenization path calls a TextMate grammar. Existing theme scope
matching is retained, so themes need not change. Other syntax-package consumers
still use TextMate; this is not removal of that dependency from the whole repo.

Each visited file side owns a worker-local immutable UTF-16 snapshot and tree.
Source conversion yields after bounded UTF-8 chunks, and parsing requests 2 ms
cooperative slices. Queries cover requested rows plus a 32-line neighborhood,
not every source line preceding a hunk. Cached rows retain their scope tokens.
Trees live until the existing file-window eviction/cancellation/disposal removes
them, allowing later hunks in the same file to reuse parsing work.

For requests in the first 128 lines of a larger file, a bounded (64 KiB maximum)
prefix parse publishes provisional colors. A lower-priority completion job always
parses the full source, invalidates those prefix tokens, and queues their refresh.
The prefix is not assumed to have final lexical context. Synchronous row getters
enqueue work rather than parsing while holding the document mutex. Cached-token
reads still synchronize with the source worker; this is not a lock-free renderer.

Primary languages and missing Markdown/MDX fence parsers use the shared grammar
manager. An unavailable parser renders plain text without spinning a native job.
Download progress/retry is a separate leaf component. Installation invalidates
only requested files that needed that grammar; it does not highlight every file
in the diff. Closing a document removes its polling/subscriptions. No grammar
release was published; the extra downloadable languages still await that release.

## Measurements, 2026-09-11

Apple M4, macOS 26.6.1, native arm64 C++20 `-O2`, bundled pinned grammars.
Three fresh processes per engine/scenario, alternating engine order; medians
below. Final runs were made after native builds finished. Inputs are real source
files, not repeated synthetic lines.

These are **native highlighting-stage measurements**, not total window-open,
Git diff generation, bridge, React, or frame-paint timings. Reading/splitting the
input is excluded for both engines. Grammar setup, native scope-token publication,
and Tree-sitter UTF-16 preparation are included. The old-engine baseline reproduces
Diff's previous 256-line sequential scope-tokenization/cache loop. The new engine
uses the production `TreeSitterLineHighlighter` adapter. The worker's 1 ms sleeps
between scheduled batches are not included, so actual UI completion can be later.

| Real source | Lines | Old first 80 lines | New first-screen preview | New full parse + first 80 | Old cold final 80 | New cold final 80 |
|---|---:|---:|---:|---:|---:|---:|
| TypeScript `lib.dom.d.ts` | 45,126 | 39.0 ms | 10.8 ms | 64.8 ms | 1,096 ms | 64.8 ms |
| TypeScript compiler `typescript.js` | 200,253 | 82.5 ms | 4.8 ms | 475.1 ms | 14,168 ms | 465.7 ms |
| `DiffViewerWindow.tsx` | 5,619 | 30.1 ms | 12.1 ms | 24.0 ms | 367.9 ms | 22.7 ms |

Cold tail highlighting is about **17×, 30×, and 16× faster**, respectively.
The new tail query touches 80 lines; the old loop tokenizes 45,126 / 200,253 /
5,619 lines to reach those rows. Capture/token counts differ between grammars;
these figures do not establish identical syntax coverage.

Median per-run maximum preparation/parse slice on cold tail requests was
2.02 / 2.71 / 2.03 ms. These are cooperative budgets, not hard real-time limits:
grammar/query construction, allocations, external scanners, and a large captured
construct can take longer. Cached 80-row copies measured roughly 0.002–0.006 ms
for either engine; that is not a measurement of painting those rows.

Peak RSS in cold-tail processes (includes fixture, cache, runtime, and tree):

| Source | Old | New |
|---|---:|---:|
| `lib.dom.d.ts` | 83.1 MiB | 52.0 MiB |
| `typescript.js` | 421.5 MiB | 286.4 MiB |
| `DiffViewerWindow.tsx` | 79.3 MiB | 18.4 MiB |

Tradeoff: first-screen-only RSS is higher for the large files because the new
engine builds a full tree in the background (DOM: 34.7 → 52.0 MiB; compiler:
88.8 → 286.8 MiB). Each old/new file side needs its own tree. Prefix colors are
fast, but fully correct whole-file context still takes about 65 / 475 / 24 ms
of native work here. This is not a claim of instant parsing for arbitrary files.

## Reproduction

```sh
bun run test:diff-parser:syntax
bun run benchmark:diff:syntax \
  typescript node_modules/.bun/@typescript+typescript-darwin-arm64@7.0.2/node_modules/@typescript/typescript-darwin-arm64/lib/lib.dom.d.ts \
  javascript node_modules/.bun/@ts-morph+common@0.28.1/node_modules/@ts-morph/common/dist/typescript.js \
  tsx apps/diff/src/DiffViewerWindow.tsx
```

Pass different explicit language/file pairs if installed dependency versions
change. The script downloads nothing and builds into a temporary directory.
The legacy engine is compiled into the benchmark only, not into Diff's tokenization
path. Raw JSON goes to stdout; keep machine-specific timing logs out of Git.

Fixture SHA-256 values for this run:

- DOM: `d6b1eba8496bdd0eed6fc8a685768fe01b2da4a0388b5fe7df558290bffcf32f`
- Compiler: `9b15fee10d00493ef19be4c7b04aaadd7dc88e78e57c6e372a90b13560126510`
- TSX: `88b18a7168ecd6a7fefb8f591b60f9c18cffd9cb27a487b1b5147b4a55e5f07b`

Native adapter regressions cover UTF-16 astral characters, multiline comments,
independent file sides, sparse/tail queries, empty rows, invalid UTF-8, a 1 MiB
logical line, missing MDX fence grammars, and prefix/full parsing. JS demand tests
cover deduplication, unknown fences, offline failure/retry, and document disposal.

Debug app verification: built and ran current Diff, then visually checked both
side-by-side and unified views against `tests/create-tree-smoke.ts`'s temporary
repository (first and later hunks, Unicode, multiline comments). Restored
side-by-side afterward. Opening the source worktree itself stalled in libgit2's
`git_repository_open_ext` filesystem read before tokenization; that separate
environment/repository-open issue was not changed or counted as a parser timing.
