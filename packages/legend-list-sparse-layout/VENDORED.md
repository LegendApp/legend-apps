# Vendored Legend List Sparse Layout Snapshot

This private workspace package supplies the indexed `dataSource` API used by
the apps. JavaScript and declarations are copied directly from the source build.

## Source

- Repository: `https://github.com/LegendApp/legend-list`
- Branch: `jmeistrich/sparse-k14-on-380-merge-20261123`
- Commit: `32c462afa0f7cb4631ca9b0ec82d32d735dda892`
- Base: released Legend List 3.9.0 (`8edc1a6c5778b71d40b78c346efaff70dc7ed604`)
- Built: 2026-11-23
- Runtime marker: `sparse-k14-390r-32c462af` on line 1 of every JavaScript entry
- Tarball SHA-256: `e3d9e1596c73f177bb90e9c960750894a33972be0686512a4bb126c4f6e725b8`

`showImmediately` defaults to false. Sparse item callbacks allow undefined
items when the source has not loaded the corresponding index.

Local regression tests live in `tests/`. Run `bun run test:legend-list` from
the repository root.

## Updating

1. Rebase the source branch onto the intended Legend List release, run the
   source tests, and build the publish-ready package with `bun run build`.
2. Copy the build output here, preserve `tests/`, and update this record.
3. Set `private: true` and use a unique version with the source commit prefix
   to distinguish the workspace snapshot from the npm release.
4. Update the root catalog and run `bun install`. Verify that `bun.lock`
   resolves `@legendapp/list` to this workspace before validating the apps.
