# Vendored Legend List Sparse Layout Snapshot

This package is an internal, unsupported snapshot of Legend List used by the
apps in this repository. It is committed here so builds do not depend on an
unstable npm package, Git branch, or downloadable artifact.

## Source

- Repository: `https://github.com/LegendApp/legend-list`
- Branch at build time: `codex/markdown-scroll-measurements` (based on `sparse-layout`)
- Commit: `a6f5ba139cf494a3b14e7438e2ea4435e7697007`
- Base: Legend List `main` 3.3.10 at `e9f90bcfb4e8cce9111971f31d72d443d5989f0b`
- Built: 2026-09-15
- Architecture: sparse sequence and row layout stores with mutation-aware
  indexed `dataSource` support.
- Includes measurement invalidation guards, positive-size estimation, incremental
  mutation batching, obsolete-source viewability guards, and bounded upward
  viewport scans.
- Includes the latest base's scroll/end-follow fixes and batched total-size
  notifications integrated with sparse layout measurements and estimate updates.
- Measurement corrections retain the item-size adjustment source, so native
  scrollbar drags are not suppressed between row measurements.
- Source validation: 1,871 tests passed; lint, source/public API type checks,
  and `bun run build` passed.

This snapshot replaces the previous `codex/chat-tail-estimates` build and its
local bundle patches. JavaScript and declaration files are copied directly from
the source build, without local bundle edits. The previous snapshot's
`getEstimatedItemSize` API is not part of this branch; current app consumers do
not reference it.

Local regression tests are retained in `tests/`, including viewport-sized
scrollbar jumps, rapid reversals, and recycled container assignments. Run them
with `bun run test:legend-list` from the repository root.

The files in this directory are the publish-ready output produced by running
`bun run build` in the source checkout. The package version includes the source
commit prefix so Bun cannot silently substitute a public npm release.

## Updating

1. Rebase the source branch onto the intended Legend List release.
2. Run its tests and `bun run build`.
3. Replace the generated package files with the new `dist` contents, preserving
   `tests/` and updating this provenance record.
4. Restore `private: true` and set the package version to
   `<base-version>-sparse-layout.<commit-prefix>`.
5. Update the matching root catalog version, run `bun install`, and commit the
   regenerated `bun.lock`.
6. Verify that `bun.lock` resolves `@legendapp/list` to this workspace before
   validating the apps.
