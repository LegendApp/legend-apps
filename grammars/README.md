# Downloadable Tree-sitter grammars

`catalog.json` is the shared language/source registry. Parser revisions, language
aliases, extensions, exact filenames, query inheritance and runtime dependencies
live here. `queries/` contains our highlighting refinements; `query-patches.json`
contains checked, narrowly scoped upstream query repairs. `PackABI.h` is the
versioned library descriptor shared by the pack builder and the app runtime.

## Current coverage

28 parsers: JavaScript/JSX, TypeScript, TSX, JSON/JSONC/JSONL, CSS, Python,
Markdown block and inline, YAML, MDX, Bash, C, C++, Go, Rust, Java, Ruby,
HTML, TOML, Lua, C#, Swift, Kotlin, Objective-C, XML, Dockerfile, JSON5, SCSS.

No grammars are bundled in apps. All 28 parsers load on demand through the shared
manager/installer in `packages/syntax-parser`; cached packs work offline.
Code, the Slides source editor and code blocks, and Diff use Tree-sitter.
Missing/unavailable packs render plain text with download progress and retry in
source views. Until the first signed grammar release is published, fresh installs
have no syntax highlighting. Theme colors remain compatible with VS Code themes,
without the TextMate or Oniguruma runtimes.

The ten vendored parser sources are test fixtures only, enabled exclusively with
`LEGEND_SYNTAX_TEST_GRAMMARS` in standalone tests. Production builds compile
only the Tree-sitter runtime and use an empty initial registry.

Unsupported languages are not silently identified as a different grammar.
Objective-C++ is not yet covered. Query acceptance does not imply language-server
semantics or a quality audit of every syntactic construct in every language.

## Build and test without publishing

Run from the repo root on macOS:

```sh
bun run grammars:fetch
bun run grammars:release --arch arm64 --dry-run
bun run grammars:test --arch arm64
```

Downloaded source goes into ignored `grammars/.cache/`; generated libraries,
descriptors, licenses and manifests go into ignored `.legend/grammars/local/`.
No compiled download assets are added to Git. Source for the test-fixture
parsers remains under `packages/syntax-parser/vendor/tree-sitter`.

The fetch command verifies pinned revisions and copies upstream licenses. It
generates Swift's missing parser from pinned `grammar.json` with Tree-sitter CLI
0.25.10, ABI 14. Set `LEGEND_TREE_SITTER_CLI` to a local 0.25.10 executable to avoid
installing the CLI through npm. After changing test-fixture pins, also run
`bun packages/syntax-parser/scripts/vendor-tree-sitter-grammars.ts` and regenerate
the embedded queries/symbols with that package's existing scripts.

Each pack is one `.dylib`: parser/scanner plus its matching query and descriptor.
Only `legend_grammar_pack_v1` is public; the app retains its own Tree-sitter runtime.
Every library is signature-checked and dynamically loaded by the test executable;
tests construct queries, parse text, check capture scopes and reject incompatible
pack ABIs. Language dependencies are included in single-language builds too.

`--arch all` (the default) builds and executes tests for **both** architectures.
An Apple Silicon host needs Rosetta to execute the x86_64 tests. Missing execution
support is an error, not a skipped publication check. An Intel host can use
`--arch x86_64` for local testing. Ad-hoc signing is permitted for local tests only;
the app's production installer never accepts ad-hoc downloaded libraries.

## Updating and releasing

```sh
bun run grammars:update                 # preview upstream revisions
bun run grammars:update --write         # update pins for review
bun run grammars:fetch
bun run grammars:release --version 1 --dry-run
```

Review source/query changes and pass the tests before committing/pushing. Use
`LEGEND_GRAMMAR_SIGN_IDENTITY` in the local environment or CI secret store. Never
put a developer's signing identity, certificate, private key or password in Git.
The release version is independent of app versions.

**Publication requires an explicit `--publish` flag.** The script rejects mixed
`--publish --dry-run`, dirty checkouts, unpublished source commits, partial build
matrices, invalid signatures, and failed parser tests. Team signing is mandatory.
Only after verification does it invoke `gh release create`, using a
`grammars-v<version>` tag and `--latest=false` so grammar releases do not displace
the latest app release. It never uploads private keys or signs with a committed
identity. A license file accompanies every grammar.

After a published release passes smoke tests, promote its version in
`channel.json` through a separate reviewed commit/push. Its current null version
means **no grammar release is available**. No release has been published by this
setup. Releases should be immutable; publish a new version for repairs.

## Runtime behavior

The JS manager deduplicates requests and resolves dependencies. The macOS worker
downloads with byte progress/timeouts, validates size/hash and a signature from
the app's signing team **before dlopen**, and atomically installs into
`~/Library/Application Support/Legend/Grammars/v1`. All apps on the same machine
use this binary cache. Manifests are cached through the existing syntax-asset
storage; cached metadata is used immediately offline and refreshed separately.
Hash-addressed files retain older working versions. Rejected cached files are
quarantined so retry can acquire a fresh copy. Active language libraries remain
loaded until process exit; updates take effect on a subsequent launch.

Registry capture IDs are append-only. A worker refreshes its palette only when
the capture catalog changes, not on every highlighting batch. Markdown/MDX scans
syntax only in the requested region and requests missing fence languages through
a native event. The editor remains editable while downloading and retries do
not remount or replace the document. Byte progress subscribes only the small top
banner; readiness changes are the only updates that reach the editor host.

Native pack downloads are macOS-only. iOS cannot use this dylib distribution
path. The app and packs need compatible Apple team signing; having an ad-hoc or
self-signed local identity is not sufficient for production downloads.
