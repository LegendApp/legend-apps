# Pinned Tree-sitter sources

- Runtime: tree-sitter/tree-sitter v0.25.10,
  `208c6cac1453315e979f05ab34b6d4f7cd0340be` (`runtime/LICENSE`, MIT).
- Grammars: `../../tree-sitter-grammars.json` is the canonical inventory of
  repositories, exact revisions, aliases and query inheritance. Each grammar
  directory retains its upstream `LICENSE`, `UPSTREAM.json` and `highlights.scm`.

Generated parser C files, runtime sources, headers and licenses are checked in;
normal builds need no network or Tree-sitter CLI. Refresh explicitly with
`bash packages/syntax-parser/scripts/vendor-tree-sitter.sh`. The script retrieves
these exact commits and reports its temporary download directory.

Compile only `runtime/src/lib.c` (the amalgamation), not its included `.c` files
individually, plus each registered language's `src/parser.c` and optional scanner.
The podspec and standalone test builder both use the manifest. All our native
sources must compile with `Symbols.h` force-included: it prefixes runtime and
grammar exports to coexist with enriched-markdown's independent Tree-sitter copy.
The C++ wrapper includes the same header before calling the runtime.

The vendor script regenerates the symbol header by compiling and inspecting
exports, then recompiles and rejects any unprefixed exports. This inspection is
also part of every standalone test build. The isolation test links and exercises
an unprefixed runtime/JavaScript grammar alongside ours.

Upstream queries stay unmodified; app refinements live in `../../queries/`.
The MDX parser has one documented grammar extension for Slides' HTML-style note
comments. `scripts/patch-mdx-grammar.ts` regenerates it with CLI 0.25.10/ABI 14
during explicit vendoring; `mdx/UPSTREAM.json` records the upstream pin and patch.
Set `LEGEND_TREE_SITTER_CLI` to that executable, or vendoring obtains the pinned
CLI through npx. No generator is used during ordinary app builds or tests.
`scripts/embed-tree-sitter-queries.ts --check` verifies the generated registry and
query header without downloading anything. Adding a grammar requires a pinned
manifest entry, vendoring, query/alias/edit fixtures, symbol regeneration, then
`bun run code pods macos` and a debug rebuild—not just a Metro reload.
