# Slides compiler performance

Implementation commit: `62ba491f3cb277877bf1075c152dbffbbd8f7033`.

Measurements use the two supplied decks, identified here as Main (top-level
`deck.mdx`) and Scene (nested 3D `deck.mdx`). Source decks were read only; all
compiles and edits ran against copies under `/tmp`. No app binary was rebuilt.

## Results

Three paired trials per scenario; medians below are seconds, before → after.

| Deck | Cold | MDX text edit | Pack edit |
| --- | ---: | ---: | ---: |
| Main | 1.21 → 0.96 | 1.01 → 0.80 | 1.10 → 0.79 |
| Scene | 2.16 → 2.60 | 2.06 → 1.21 | 1.91 → 1.45 |

MDX edits improved by 21% for Main and 41% for Scene; the Scene pack edit
improved by 24%. Cold wall times were noisy and no cold speedup is claimed.
Scene cold trials ranged from 2.07–2.63 s before and 2.30–2.61 s after.
A separate three-pair cold diagnostic measured cache lookup plus writing at
17.6–23.1 ms; its total compiles ranged from 2.09–4.12 s as host load changed.
This does not establish that the whole cold wall-time difference is cache cost.

Every invocation starts a fresh Bun 1.3.14 process. Cold means an empty
transform cache, with OS filesystem caches left alone. Baseline disables the
cache with `LEGEND_SLIDES_TRANSFORM_CACHE=`; this preserves the original compiler
pipeline. Before/after calls are adjacent and their order alternates between
trials. An MDX edit changes text; a pack edit appends a comment to the copied
`world/World.tsx` after that MDX edit. Main does not import that pack, so its
pack edit measurement is an unrelated-file control. These are CLI timings,
excluding app IPC, code evaluation and publishing the result.

Phase medians below are milliseconds, before → after. Esbuild includes the
nested parse, plugin and transform phases; columns must not be added together.

| Deck / change | MDX parse | MDX pipeline | MDX transform | Imported TS/JS transform | Pack resolution | Esbuild total | Hermes lowering | Styles | Encode |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Main / cold | 52.6 → 51.0 | 63.0 → 61.4 | 87.8 → 77.8 | 214.3 → 196.9 | 0.0 → 0.0 | 389.2 → 364.1 | 172.6 → 158.9 | 292.1 → 236.3 | 5.5 → 5.2 |
| Main / mdx | 51.3 → 58.9 | 61.8 → 69.8 | 79.2 → 79.6 | 194.8 → 0.6 | 0.0 → 0.0 | 368.0 → 168.2 | 177.5 → 156.9 | 229.5 → 257.5 | 5.1 → 5.2 |
| Main / pack | 50.8 → 56.6 | 64.2 → 67.9 | 87.7 → 0.8 | 176.0 → 0.5 | 0.0 → 0.0 | 403.4 → 89.4 | 154.8 → 214.2 | 297.0 → 242.1 | 5.5 → 5.1 |
| Scene / cold | 81.1 → 88.7 | 106.7 → 393.7 | 105.5 → 111.2 | 820.4 → 1084.2 | 1.0 → 1.0 | 1094.1 → 1402.4 | 470.1 → 514.2 | 235.3 → 293.1 | 76.3 → 75.6 |
| Scene / mdx | 77.7 → 73.4 | 102.3 → 96.5 | 104.6 → 55.3 | 769.3 → 4.3 | 3.6 → 3.5 | 1030.8 → 211.0 | 415.6 → 479.0 | 221.2 → 238.4 | 76.1 → 75.5 |
| Scene / pack | 72.5 → 76.3 | 271.9 → 364.3 | 95.2 → 1.0 | 716.3 → 273.4 | 0.7 → 0.5 | 965.2 → 426.8 | 418.5 → 459.8 | 230.2 → 228.7 | 75.3 → 78.1 |

Fresh-process startup medians ranged from 170–279 ms across these scenarios.
For Scene MDX edits, imported source transforms fell from 769 ms to 4.3 ms;
the remaining bundle-wide Hermes pass and CSS generation still run. MDX
pipeline timers can include another loader’s synchronous work while awaiting
a plugin, which explains some large differences from the parse-only timer.

## Cause and edit behavior

`apps/slides/src/deckLoader.ts` watches deck and dependency directories recursively,
coalesces filesystem events for 120 ms, and calls `loadDeck`. `buildDeck` launches
`compile-slides.ts` through `runCompilerCommand`; there is no resident compiler.
`deckEditorSession.ts` previews source edits after 350 ms through
`previewDeckSource`, which launches the same compiler with `--draft`. Thus each
accepted rebuild previously paid for every source transform again. Autosave and
dependency events can also cause a refresh.
`scripts/lib/slidesCompiler.ts` packages the compiler for distribution; that
helper packaging is not part of the app's edit path.

The expensive repeated work is Babel's React Compiler, TypeGPU and worklet
transforms over unchanged imported sources. Scene includes large static glyph
data; its final JS plus inline source maps is about 6 MB. Pack manifest resolution
is comparatively tiny. Whole-bundle Hermes lowering and stylesheet generation
also recur.

## Change

Cache the existing pre-bundle source transforms, including generated MDX JSX,
by source content, absolute filename, compiler fingerprint, runtime, working
directory, and Babel/worklet environment. The packaged helper fingerprints its
whole bundle; source checkouts include the compiler module and dependency lock.
Only changed inputs run those transforms again. Outputs, dependency lists,
notes, styles and warnings remain identical in the measured scenarios.

Cached code is checksummed; cache writes are atomic and optional. Each source
path has one entry, with at most 256 entries across decks. The default directory is
`os.tmpdir()/legend-slides-transforms`; `LEGEND_SLIDES_TRANSFORM_CACHE` selects a
dedicated cache directory, and an empty value disables caching. Import resolution,
pack integrity checks, MDX parsing, esbuild bundling, Hermes lowering and CSS
generation still run on every compile. A first compile writes the cache; reopening
a deck can reuse transforms from earlier compiler processes.

Use `bun scripts/compile-slides.ts <deck.mdx> --timings` to emit a JSON timing
record on stderr without changing the compressed result on stdout. Milliseconds
are aggregated by phase. `bundle` includes all esbuild loader callbacks;
`mdxParse` is contained in `mdx`, and `transformCacheRead` is contained in the
transform phases. Asynchronous MDX work can overlap other loaders, so those
nested timings must not be added together. `hermes` measures Babel's Hermes
compatibility pass, rather than native bytecode compilation. `startup`, `styles`,
`encode`, and `total` complete the CLI breakdown. `babelTransform` reports
uncached pre-bundle Babel work, while `transformCacheLookup` and
`transformCacheWrite` isolate cache-miss overhead.

## Validation

- All 18 paired full compiler-result hashes match, including code, source maps,
  dependencies, styles, notes and warnings. Initial single-run comparisons also
  matched each field byte for byte.
- `bun test --timeout 30000 --preload ./apps/slides/src/__tests__/nativeMock.ts packages/presentation/src/__tests__/compilerCache.test.ts`:
  1 passed, 49 assertions. Covers fresh processes, MDX drafts, same-size pack edits
  with restored timestamps, new platform-specific imports, environment/toolchain
  keys, damaged/truncated/unavailable caches, bounded entries and changed manifests.
- `bun test scripts/lib/slidesCompiler.test.ts -t 'packaged compiler signs|content-addressed artifact installs'`:
  2 passed, 189 assertions. Verifies Bun/Node helper execution, cached output
  equality, signing, local installation and offline compilation. The other six
  helper checks passed in the preceding broader run. Earlier timeouts occurred
  while the shared gate suspended test processes; the final focused retry passed.
- `bun run test:slides`: 146/149 test files passed. The failures in
  `worldBackgroundPlayback.test.tsx` (typed array versus array),
  `worldPlayback.test.tsx` (missing mock export), and `worldText3D.test.ts`
  (motion expectation) also reproduce with the transform cache disabled.
- `bun run typecheck`: fails in untouched native-markdown APIs and world-pack
  tests/types, including missing `bun:test` declarations. No diagnostics name
  the changed compiler or test paths.
- `git diff --check` and the requested case-insensitive content check pass for
  the task diff and commit messages. No push or native project regeneration.

The broader checks ran before unrelated world-authoring edits arrived in the
same worktree; those edits are excluded from this task’s commits. Raw measurements,
source copies and result comparisons remain in
`/tmp/slides-compile-bench-ree7fimy` (about 196 MiB), outside the repository.

## Follow-up

The next remaining costs are whole-bundle Hermes lowering, CSS compilation and
fresh-process startup. Changing those stages would require separate output and
invalidation checks; this change preserves their existing behavior.
