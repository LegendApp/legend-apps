# Vendored Legend List Sparse Layout Snapshot

This package is an internal, unsupported snapshot of Legend List used by the
apps in this repository. It is committed here so builds do not depend on an
unstable npm package, Git branch, or downloadable artifact.

## Source

- Repository: `https://github.com/LegendApp/legend-list`
- Branch at build time: `codex/sparse-layout`
- Commit: `94dfeeda7ef4037faee459e8113436dc6855ea4a`
- Base: Legend List `main` 3.3.5 at `80193ceda8f54b31e26b53f8a0ebb8cc07aa9bf0`
- Built: 2026-08-10

The files in this directory are the publish-ready output produced by running
`bun run build` in the source checkout. The package version includes the source
commit prefix so Bun cannot silently substitute a public npm release.

## Updating

1. Rebase the source branch onto the intended Legend List release.
2. Run its tests and `bun run build`.
3. Replace this directory with the generated `dist` contents.
4. Restore `private: true` and set the package version to
   `<base-version>-sparse-layout.<commit-prefix>`.
5. Update the matching root catalog version, run `bun install`, and commit the
   regenerated `bun.lock`.
6. Verify that `bun.lock` resolves `@legendapp/list` to this workspace before
   validating the apps.
